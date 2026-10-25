import { PopoverRoot, PopoverAnchor, PopoverContent } from '@datafox/ui';
// Trace 火焰图视图（Epic 6）——按调用深度堆叠 + 横轴线性时间，对齐 Datadog Flame Graph。
// 渲染方式：绝对定位 div 矩形（非 canvas），复用既有 emotion 皮肤/配色/选中样式，且可被 RTL 测试。
// 布局几何来自 core computeFlameLayout（零皮肤）；颜色在本层算（AD-6）；行高走 theme.trace.flame（AD-7）。
// 6.1 静态渲染 · 6.2 点击联动（onSelectSpan）· 6.3 gridline + hover 竖线游标 + tooltip。
// Story 9.4b：自研 FlameCursor（半透明细线 + 贴边小标签）→ 与瀑布图共用 `DdTimeCursor`（datafox Tooltip 药丸）。
import { css, cx } from '@emotion/css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { computeFlameLayout, isErrorSpan, isInferredEntity, type FlameViewRange } from '../core';
import { type Trace, type TraceSpan } from '../model';
import { useStyles2, type Theme } from '../theme';
import { formatSpanDuration } from '../utils';

import { defaultColorAccessor, readableTextColor, type ColorAccessor } from './colorAccessor';
import { DdSpanHoverCard } from './DdSpanHoverCard';
import { spanPresentation } from './spanPresentation';
import { flameRegularFont, flameNameFont } from './flameTypography';
import { DdTimeCursor, flameGeometry } from './DdTimeCursor';

const getStyles = (theme: Theme) => ({
  root: css({
    label: 'DdFlameGraphView',
    position: 'relative',
    width: '100%',
    minHeight: '100%',
    fontFamily: theme.trace.fontFamily,
    overflow: 'hidden',
    boxSizing: 'border-box',
  }),
  grid: css({ label: 'DdFlameGrid', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }),
  rect: css({
    label: 'DdFlameRect',
    position: 'absolute',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${theme.trace.flame.labelPadding}px`,
    // Story 10.7：真页 canvas 实测——帧内 op 名 `bold 12px`，时长 `9px` 常规；帧文色随条底明暗二选一
    // （见下 readableTextColor）。原来一律 12px/白字（≈瀑布字体）被用户指出「和瀑布一致、非 1:1」。
    fontSize: 12,
    borderRadius: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    cursor: 'default',
    border: 'none',
    textAlign: 'left',
    fontFamily: 'inherit',
  }),
  clickable: css({ label: 'DdFlameRectClickable', cursor: 'pointer' }),
  selected: css({
    label: 'DdFlameRectSelected',
    boxShadow: `inset 0 0 0 2px ${theme.trace.flame.selectedOutline}`,
  }),
  op: css({
    label: 'DdFlameOp',
    flex: '1 1 auto',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: flameNameFont,
    fontWeight: 700,
  }),
  // 真页时长 `9px NotoSans` 常规字重，与 op 同色（色 alpha 已含 .9，故不再叠 opacity）。
  dur: css({ label: 'DdFlameDur', flex: 'none', marginLeft: 8, fontSize: 9, fontFamily: flameRegularFont, fontWeight: 400 }),
  // Story 10.7：error span 帧左缘 `!` 徽标（真页 canvas 直接采像素）——19px 宽、满条高、白色 `!` 居中、
  // 底色错误红 `status.error.fg`(#EB364B)。`marginLeft:-labelPadding` escape 帧内左 padding 贴到条左缘、
  // `marginRight:labelPadding` 让 op 文本落在 badge 右侧（真页 op x≈25 = 徽标 19 + 间距 6）。
  errBadge: css({
    label: 'DdFlameErrBadge',
    flex: 'none',
    alignSelf: 'stretch',
    marginLeft: -theme.trace.flame.labelPadding,
    marginRight: theme.trace.flame.labelPadding,
    width: 19,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    // Official canvas glyph is ~13px tall inside the 24px frame.
    fontSize: 18,
    lineHeight: 1,
    pointerEvents: 'none',
  }),
  // 游标 overlay 需盖住矩形（zIndex 1）与 tooltip（4）之间；`DdTimeCursor` 自身只声明 inset:0。
  cursorLayer: css({ label: 'DdFlameCursorLayer', position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }),
  tooltip: css({ label: 'DdFlameTooltip', padding: 0, border: 0, borderRadius: 4, overflow: 'hidden', width: 'max-content', maxWidth: 'min(400px, calc(100vw - 16px))', pointerEvents: 'none' }),
  anchor: css({ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }),
});

export interface DdFlameGraphViewProps {
  trace: Trace;
  /** 自定义着色（默认按 service）。 */
  colorAccessor?: ColorAccessor;
  /** 当前选中 span（描边高亮）。 */
  selectedSpanId?: string;
  /** 点矩形回调（Story 6.2：→ selectSpan → 共享底部抽屉）。 */
  onSelectSpan?: (spanID: string) => void;
  /** 缩放视口 [0,1]（默认全 trace）。 */
  viewRange?: FlameViewRange;
  /** 聚焦根 span（Story 6.7 re-root）：只渲子树 + depth 重基 + 时间映射到 root 区间。 */
  focusRootSpanId?: string;
  /** 缩放/平移回调（Story 6.4）：滚轮缩放 + 拖拽平移 → 新 viewRange。不传 → 无 pan/zoom。 */
  onViewRangeChange?: (viewStart: number, viewEnd: number) => void;
  /** 当前高亮分组 key（Story 7.1）：非匹配帧灰显为 theme.trace.flame.dimmedFill。null/undefined → 无灰显。 */
  highlightedGroupKey?: string | null;
  /** span → 分组 key（须与图例 LegendGroup.key 同口径，默认 service）。不传 → 不灰显。 */
  groupKeyForSpan?: (span: TraceSpan) => string;
  /** 悬停某帧 → 其分组 key（离开传 null）。驱动图例反向高亮（Story 7.1 AC4）。 */
  onSpanHover?: (key: string | null) => void;
  /** Transient details preview; does not change the selected span or URL. */
  onPreviewSpan?: (spanID: string | null) => void;
  /** gridline 刻度数（Story 6.3），默认 5。 */
  numTicks?: number;
  className?: string;
  style?: CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const MIN_WINDOW = 0.01;

/** 火焰图无标签列：轴盒 = 整个画布，故只需记 x 与当帧画布宽度（`DdTimeCursor` 自己算时刻）。 */
interface CursorState {
  x: number;
  width: number;
}
interface TooltipState {
  spanID: string;
  x: number;
  y: number;
}

export function DdFlameGraphView({
  trace,
  colorAccessor,
  selectedSpanId,
  onSelectSpan,
  viewRange,
  focusRootSpanId,
  onViewRangeChange,
  highlightedGroupKey,
  groupKeyForSpan,
  onSpanHover,
  onPreviewSpan,
  className,
  style,
}: DdFlameGraphViewProps) {
  const styles = useStyles2(getStyles);
  const theme = useStyles2((t) => t);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<CursorState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const dragRef = useRef<{ startX: number; startVS: number; startVE: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  // 依赖原始数值而非 viewRange 对象（父级每渲染换新对象会废掉 memo，M3 修复）。
  const viewStart = viewRange?.viewStart ?? 0;
  const viewEnd = viewRange?.viewEnd ?? 1;
  const layout = useMemo(
    () => computeFlameLayout(trace, { viewStart, viewEnd }, focusRootSpanId),
    [trace, viewStart, viewEnd, focusRootSpanId]
  );
  const spanById = useMemo(() => new Map(trace.spans.map((s) => [s.spanID, s])), [trace]);

  const resolveColor = colorAccessor ?? defaultColorAccessor(theme);
  const { rowHeight, rowGap } = theme.trace.flame;
  const containerHeight = (layout.maxDepth + 1) * rowHeight;
  // 聚焦时游标时间相对 focus 根时长（Story 6.7）。
  const focusRoot = focusRootSpanId ? trace.spans.find((s) => s.spanID === focusRootSpanId) : undefined;
  const effectiveDuration = focusRoot ? focusRoot.duration : trace.duration;

  // 滚轮缩放（Story 6.4）——须原生非被动监听才能 preventDefault（React onWheel 默认 passive）。
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onViewRangeChange) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const frac = r.width > 0 ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0.5;
      const w = viewEnd - viewStart;
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
      const nw = clamp(w * factor, MIN_WINDOW, 1);
      const anchor = viewStart + frac * w;
      let ns = anchor - frac * nw;
      let ne = ns + nw;
      if (ns < 0) {
        ns = 0;
        ne = nw;
      }
      if (ne > 1) {
        ne = 1;
        ns = 1 - nw;
      }
      onViewRangeChange(ns, ne);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onViewRangeChange, viewStart, viewEnd]);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // 新一次按下序列：清掉上一轮可能残留的 click 抑制（拖拽在背景/跨 rect 松开时 rect.onClick 不触发、
    // suppressClickRef 不会被消费，否则会吞掉下一次正常选中点击）。H1 修复。
    suppressClickRef.current = false;
    if (!onViewRangeChange || e.button !== 0) {
      return;
    }
    dragRef.current = { startX: e.clientX, startVS: viewStart, startVE: viewEnd, moved: false };
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    // 夹到画布内：鼠标压在边缘 1px 外时（拖拽中仍收到事件）游标不该消失。
    const x = clamp(e.clientX - r.left, 0, r.width);
    setCursor({ x, width: r.width });

    const drag = dragRef.current;
    if (drag && onViewRangeChange) {
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 3) {
        drag.moved = true;
      }
      if (r.width > 0) {
        const w = drag.startVE - drag.startVS;
        const shift = -(dx / r.width) * w;
        const ns = clamp(drag.startVS + shift, 0, 1 - w);
        onViewRangeChange(ns, ns + w);
      }
    } else {
      setTooltip((cur) => (cur ? { ...cur, x, y: e.clientY - r.top } : cur));
    }
  };

  const endDrag = () => {
    if (dragRef.current?.moved) {
      suppressClickRef.current = true;
    }
    dragRef.current = null;
  };

  const clearHover = () => {
    setCursor(null);
    setTooltip(null);
    onSpanHover?.(null);
    onPreviewSpan?.(null);
    endDrag();
  };

  const hoveredSpan = tooltip ? spanById.get(tooltip.spanID) : undefined;

  return (
    <div
      ref={rootRef}
      className={className ? cx(styles.root, className) : styles.root}
      style={{ height: containerHeight, ...style }}
      data-testid="DdFlameGraphView"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={clearHover}
    >
      {layout.rows.map((row) => {
        const span = spanById.get(row.spanID);
        if (!span) {
          return null;
        }
        const isSelected = selectedSpanId === row.spanID;
        const dur = formatSpanDuration(span.duration);
        const { resourceName } = spanPresentation(span);
        const clickable = onSelectSpan != null;
        // Story 10.3：推断/未插桩下游依赖 span（db/peer/消息/rpc 客户端）= 空心 + 服务色虚线边（真页实测）。
        // 判定复用 core `isInferredEntity`，与图例 `(inferred)` 后缀同源。
        const inferred = isInferredEntity(span);
        // 灰显（Story 7.1）：有高亮分组且本帧不属于该组 → 定值灰填充（非降透明/去饱和，实测对齐 Datadog）。
        const dimmed =
          highlightedGroupKey != null && groupKeyForSpan != null && groupKeyForSpan(span) !== highlightedGroupKey;
        // 灰显行只用 dimmedFill/secondary，不用服务色 → 惰性算，省去每帧灰显行的一次 resolveColor。
        const barColor = dimmed ? '' : resolveColor(span);
        // Story 10.7：error span 帧左缘 `!` 徽标（真页 errors 视图实测）。灰显时随帧一起淡出、不加徽标。
        // 徽标底色：真页 getImageData 实测**选中的 error 帧用纯黑 `#000`（= 选中描边同色）**、其余 error 帧用错误红
        // `status.error.fg`(#EB364B，实测逐位一致)。暗态选中徽标底色未采，沿用纯黑（+ 白 `!` 暗态仍可读）。
        const showErrBadge = !dimmed && isErrorSpan(span);
        const errBadgeBg = isSelected ? '#000' : theme.trace.status.error.fg;
        const classes = [styles.rect];
        if (isSelected) {
          classes.push(styles.selected);
        }
        if (clickable) {
          classes.push(styles.clickable);
        }
        return (
          <div
            key={row.spanID}
            data-testid="FlameRect"
            data-span-id={row.spanID}
            data-inferred={inferred ? 'true' : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={clickable ? isSelected : undefined}
            aria-label={`${resourceName} ${dur}`}
            className={cx(...classes)}
            data-dimmed={dimmed ? 'true' : undefined}
            style={{
              top: row.depth * rowHeight,
              height: rowHeight - rowGap,
              left: `${row.left * 100}%`,
              width: `${Math.max(row.width * 100, 0)}%`,
              // 灰显优先于 inferred（真页高亮时非匹配帧一律定值灰，不再画虚线）。
              background: dimmed ? theme.trace.flame.dimmedFill : inferred ? 'transparent' : barColor,
              // Story 10.7：填充帧的字色随条底明暗（真页做法）；灰显帧走次文本、空心帧用服务色描字。
              color: dimmed ? theme.colors.text.secondary : inferred ? barColor : readableTextColor(barColor),
              border: !dimmed && inferred ? `1px dashed ${barColor}` : undefined,
              outline: showErrBadge && !isSelected ? `2px solid ${theme.trace.status.error.fg}` : undefined,
              outlineOffset: -2,
            }}
            onMouseEnter={(e) => {
              // 拖拽平移进行中：抑制 rect 的 hover 副作用（否则 tooltip 卡在 enter 点、
              // 且 onSpanHover 让高亮分组在平移途中乱闪，CR-F6）。
              if (dragRef.current) {
                return;
              }
              const r = rootRef.current?.getBoundingClientRect();
              setTooltip({
                spanID: row.spanID,
                x: r ? e.clientX - r.left : 0,
                y: r ? e.clientY - r.top : 0,
              });
              onSpanHover?.(groupKeyForSpan ? groupKeyForSpan(span) : null);
              onPreviewSpan?.(row.spanID);
            }}
            onMouseLeave={() => { setTooltip(null); onSpanHover?.(null); onPreviewSpan?.(null); }}
            onFocus={(e) => {
              if (!e.currentTarget.matches(':focus-visible')) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const root = rootRef.current!.getBoundingClientRect();
              setTooltip({ spanID: row.spanID, x: rect.left - root.left, y: rect.bottom - root.top });
              onPreviewSpan?.(row.spanID);
            }}
            onBlur={clearHover}
            onClick={
              clickable
                ? () => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    onSelectSpan!(row.spanID);
                  }
                : undefined
            }
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Escape') { e.stopPropagation(); clearHover(); }
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSpan!(row.spanID);
                    }
                  }
                : undefined
            }
          >
            {showErrBadge && (
              <span className={styles.errBadge} style={{ background: errBadgeBg }} data-testid="FlameErrBadge" aria-hidden="true">
                !
              </span>
            )}
            <span className={styles.op}>{resourceName}</span>
            <span className={styles.dur}>{dur}</span>
          </div>
        );
      })}

      {cursor && (
        <div className={styles.cursorLayer}>
          {/* anchorY=0：药丸浮到画布之上（盖住 DdFlameRuler 的刻度文字），与瀑布图药丸压住表头刻度的观感一致。 */}
          <DdTimeCursor
            cursorX={cursor.x}
            geo={flameGeometry(cursor.width, effectiveDuration, viewStart, viewEnd)}
            anchorY={0}
          />
        </div>
      )}

      <PopoverRoot open={tooltip != null && hoveredSpan != null} onOpenChange={(open) => { if (!open) clearHover(); }}>
        <PopoverAnchor asChild><span className={styles.anchor} style={{ left: tooltip?.x ?? 0, top: (tooltip?.y ?? 0) - 12 }} /></PopoverAnchor>
        <PopoverContent placement="right-end" sideOffset={24} collisionPadding={8}
          isPadded={false} isArrowHidden className={styles.tooltip} data-testid="FlameTooltip"
          role="tooltip" aria-label="Span summary"
          onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); clearHover(); }}
          onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
          {hoveredSpan && <DdSpanHoverCard span={hoveredSpan} color={resolveColor(hoveredSpan)} traceDuration={trace.duration} isError={isErrorSpan(hoveredSpan)} />}
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
