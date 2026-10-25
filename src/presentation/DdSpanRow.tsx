// 一整行（UX-DR9）：左标签列（columnWidth）| 右时间线（瀑布条）。
// 行须有内在高度供 core/ListView 测量（AD-12，= DEFAULT_HEIGHTS.bar）。
import { ActionTray, Button, FocusIcon, PopoverRoot, PopoverAnchor, PopoverContent, Tooltip } from '@datafox/ui';
import { css } from '@emotion/css';
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from 'react';

import { DEFAULT_HEIGHTS, type RenderableRow } from '../core';
import { getServiceColorKey, type TraceSpan } from '../model';
import { DetailState, type DetailToggles } from '../state';
import { useStyles2, useTheme2, type Theme } from '../theme';

import type { ColorAccessor } from './colorAccessor';
import { DdSpanHoverCard } from './DdSpanHoverCard';
import { DdLabelCell } from './DdLabelCell';
import type { DetailStubs } from './detailStubs';
import { DdSpanBar } from './DdSpanBar';
import { DdSpanDetail } from './DdSpanDetail';
import { AXIS_LEFT_INSET, AXIS_RIGHT_GUTTER } from './layout';
import { ui } from './uiTokens';

const getStyles = (theme: Theme) => ({
  // Story 9.3（D3）：真页所有 cell 的 border-*-width 皆为 0 —— 去掉每行下边框。
  // 去边框后 clientHeight 恰等于 heightGetter(23)，消除此前 28-1px=27 的估算/实测偏差。
  // Story 9.3g：`--dd-row-bg` 复刻真页的 `--table-row-background` —— 折叠箭头拿它当不透明底板，
  // 把穿过箭头的树线遮住（见 DdIndentGuides.chevron）。行态一变，底板随之跟色。
  row: css({
    label: 'DdSpanRow',
    display: 'flex',
    alignItems: 'stretch',
    height: DEFAULT_HEIGHTS.bar,
    boxSizing: 'border-box',
    background: ui.bg,
    cursor: 'pointer',
    '--dd-row-bg': ui.bg,
    '&:hover': { background: ui.selectedRowBg, '--dd-row-bg': ui.selectedRowBg },
  }),
  focused: css({ background: ui.selectedRowBg, '--dd-row-bg': ui.selectedRowBg }),
  // 选中行高亮（Story 5.5）——底色对齐 Datadog 选中态。
  // Story 9.3（D4）：真页选中行**仅整行 --ui-interaction-secondary，无左侧 3px 竖条**
  // （原 inset boxShadow 来自 trace-timeline 自身实现，从未在真页核实过）。
  selected: css({
    label: 'DdSpanRowSelected',
    background: ui.selectedRowBg,
    '--dd-row-bg': ui.selectedRowBg,
  }),
  // 搜索命中高亮（Story 4.1）——琥珀色，区别于 focus 蓝（Story 9.1 → --ui-status-warning-soft）。
  matched: css({ label: 'DdSpanRowMatched', background: ui.matchBg, '--dd-row-bg': ui.matchBg }),
  // Story 9.3（D3）：真页 cell border-right-width = 0 —— 去掉标签列右分隔线。
  labelCol: css({
    label: 'DdSpanRowLabelCol',
    // Story 9.4（B）：准星 clip 盒的定位祖先。`right: 0` 落在标签列右缘（padding 不影响绝对定位）。
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    // Story 9.3f（D8）：真页标签 cell-content `padding: 0 7px 0 0` —— 树列无左 padding，树 span 贴列左缘起画。
    // 准星 clip 盒用 `right: 0` 绝对定位，落点是 padding 盒外缘，不受此改动影响（Story 9.4 B）。
    paddingLeft: 0,
    paddingRight: 7,
    boxSizing: 'border-box',
  }),
  timelineCol: css({
    label: 'DdSpanRowTimelineCol',
    position: 'relative',
    flex: 1,
    minWidth: 0,
  }),
  // 缩放裁剪提示（FR-8）——时间线列两端 6px 渐隐带；缩放态下逐行连成一条竖向暗带，
  // 暗示内容延伸到视窗之外（移植自上游 rowClippingLeft/Right 的边缘 ::before 渐变）。
  // Story 9.1 文档化例外：明/暗端的 22% 白/黑 alpha 渐隐，非语义主题色，datafox 无对应 alpha token；保留原值。
  clipEdge: css({
    label: 'DdSpanRowClipEdge',
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 6,
    pointerEvents: 'none',
    zIndex: 1,
  }),
  // Story 9.3（D10）+ 复审（D11）：裁剪指示器贴「轴」两缘，而非列两缘（轴左缩 AXIS_LEFT_INSET、右缩 AXIS_RIGHT_GUTTER）。
  clipLeft: css({
    label: 'DdSpanRowClipLeft',
    left: AXIS_LEFT_INSET,
    backgroundImage: `linear-gradient(to right, ${theme.isDark ? 'rgba(255,255,255,0.22)' : 'rgba(25,25,25,0.22)'}, rgba(0,0,0,0))`,
  }),
  // Story 9.3（D10）：裁剪指示器贴「轴」右缘，而非列右缘（右侧 AXIS_RIGHT_GUTTER 是时长预留区）。
  clipRight: css({
    label: 'DdSpanRowClipRight',
    right: AXIS_RIGHT_GUTTER,
    backgroundImage: `linear-gradient(to left, ${theme.isDark ? 'rgba(255,255,255,0.22)' : 'rgba(25,25,25,0.22)'}, rgba(0,0,0,0))`,
  }),
  // 时间线列左缘的 3px 服务色竖脊（真页 `timeline-cell__span-separator`；Story 9.3 的 D9 移交，9.4d 落地）。
  // `left:-1` 让它骑在标签列/时间线列的分界线上——真页同为 `left:-1px`，相对 `.cell-content`（= 本列）。
  // 无 z-index：它是列的第一个子元素，条与 clipEdge 都晚于它绘制（二者起点 ≥ AXIS_LEFT_INSET，实际不重叠）。
  separator: css({
    label: 'DdSpanSeparator',
    position: 'absolute',
    left: -1,
    width: 3,
    pointerEvents: 'none',
  }),
  hoverCard: css({ label: 'DdSpanHoverPopover', padding: 0, border: 0, borderRadius: 4, overflow: 'hidden', width: 'max-content', maxWidth: 'min(400px, calc(100vw - 16px))' }),
  hoverAnchor: css({ position: 'absolute', right: 0, top: 0, height: '100%', width: 0, pointerEvents: 'none' }),
  focusTray: css({
    // Official normal Focus glyph is 16px; Unfocus keeps its xs 14px glyph.
    '& button svg': { width: 16, height: 16 },
  }),
  unfocus: css({ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', '& svg': { width: 14, height: 14 } }),
  // 详情行容器——自然高度（ListView 测量真实内容高，AD-12）。
  detail: css({
    label: 'DdSpanDetailRow',
    boxSizing: 'border-box',
    borderBottom: `1px solid ${ui.border}`,
    background: ui.bg,
  }),
});

/**
 * `span-separator` 的四态几何。真页实测（us5 waterfall，2026-07-10，`getComputedStyle`）：
 *
 * | 修饰符 | top | bottom | height | border-radius |
 * | --- | --- | --- | --- | --- |
 * | `--top-gap` | 4 | 0 | 19 | `2px 2px 0 0` |
 * | `--bottom-gap` | 0 | 4 | 19 | `0 0 2px 2px` |
 * | 两者兼有 | 4 | 4 | **15** | `2px` |
 * | 两者皆无 | 0 | 0 | 23 | `0` |
 *
 * 15 恰是瀑布条高，4 恰是 `(行高 23 - 条高 15) / 2`：**竖脊上下缘与本行条齐平**，
 * 朝同服务的邻行各多探一个 gap 把两段接起来，于是整列连成一条按服务分段的脊。
 *
 * 导出供单测直接断言：emotion class 读不回具体值，且这是四个分支的唯一真源。
 */
export function separatorGeometry(hasTopGap: boolean, hasBottomGap: boolean, theme: Theme): CSSProperties {
  const gap = (DEFAULT_HEIGHTS.bar - theme.trace.barHeight) / 2;
  const r = theme.trace.barRadius;
  // 零值写成 `0px` 而非 `0`：真页 computed 值即 `2px 2px 0px 0px`，且 jsdom 会把 `0` 归一成 `0px`，
  // 写死单位后单测能直接比字面量，不必再过一次归一化。
  const borderRadius = hasTopGap
    ? hasBottomGap
      ? r
      : `${r} ${r} 0px 0px`
    : hasBottomGap
      ? `0px 0px ${r} ${r}`
      : '0px';
  return { top: hasTopGap ? gap : 0, bottom: hasBottomGap ? gap : 0, borderRadius };
}

/**
 * 竖脊在何处断开。真页实测排除了两个更省事的假设：
 *
 * 1. **键在 service，不在渲染色。** 把 `Color by` 从 Service 切到 Entity Type 后，相邻两行填充变成同一个色值，
 *    但 `--bottom-gap` / `--top-gap` 原样留着——它们服务不同。
 *    ⇒ 填充跟 `colorAccessor` 走（会随 colorBy 变），断口跟服务走（不随 colorBy 变）。
 * 2. **按可见行序算，不是静态树。** 折叠一个父节点后，它与被折叠掉的同服务子节点之间的连接消失，
 *    该行当场从 `--top-gap`（h=19）变成 `--top-gap --bottom-gap`（h=15）。
 *    ⇒ 邻行必须由引擎按折叠后的行序给出（`RenderableRow.prevSpan` / `nextSpan`）。
 *
 * 兄弟行同样相连（不止父子）：实测 `my-order-service` 的两个兄弟叶子之间无断口。
 */
function connectsTo(neighbor: TraceSpan | undefined, self: TraceSpan): boolean {
  return neighbor != null && getServiceColorKey(neighbor.process) === getServiceColorKey(self.process);
}

interface Props {
  row: RenderableRow;
  colorAccessor: ColorAccessor;
  /**
   * 服务色解析器。Story 9.3d 起**标签列不再消费它**（树线改为真页的 `--ui-border` 灰导线）。
   * 保留契约：9.4 的 `span-separator`（3px 服务色竖连接条）需要它。
   */
  colorForSpanId: (id: string) => string;
  /** 详情子分组 toggle（详情行需要；缺省 no-op）。 */
  detailToggles?: DetailToggles;
  /** 深耦合注入回调（火焰图/分享/链接；Story 5.4）。 */
  detailStubs?: DetailStubs;
  /** 该行 span 是否为当前选中（底部抽屉，Story 5.5）。 */
  isSelected?: boolean;
  /**
   * 点击行内准星（Story 9.4 / B）。**不传则整个准星不渲染**——不发死按钮。
   * 选中目标并进入该 span 的子树视图。
   */
  onFocusSpan?: (spanID: string) => void;
  isFocusRoot?: boolean;
  onUnfocusSpan?: () => void;
  traceDuration?: number;
}

const NOOP = () => {};
const NOOP_DETAIL_TOGGLES: DetailToggles = {
  tags: NOOP,
  process: NOOP,
  logs: NOOP,
  references: NOOP,
  warnings: NOOP,
  stackTraces: NOOP,
  logItem: NOOP,
  referenceItem: NOOP,
  section: NOOP,
};

export function DdSpanRow({ row, colorAccessor, detailToggles, detailStubs, isSelected, onFocusSpan, isFocusRoot, onUnfocusSpan, traceDuration = row.span.duration }: Props) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  // 行内 ActionTray 的开合（Story 9.4e 起改用 datafox `ActionTray`，slider theme）。
  //
  // 与 Story 9.4/D4 的取舍：9.4 原用纯 CSS `&:hover [slider]` 滑入，为的是**不引入行级 state**。
  // datafox `ActionTray` 是 `isOpen` prop 驱动的（无 CSS-only 路径），故这里必须上 state。
  // 但 hover/focus 是**行内 state**：enter/leave 各触发一次、只重渲染本行——这不是 D4 真正忌讳的
  // 「把 hover id 提到共享/引擎态、每次 mousemove 重渲整列」。datafox 自家 Table 亦如此驱动（且是表级，
  // 本仓行级更省）。真指针实测：hover 某行只有该行的 tray 展开、其余行不动，足迹 = 1 行/次。
  const [focused, setFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [labelHovered, setLabelHovered] = useState(false);
  const [cardDismissed, setCardDismissed] = useState(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout>>();
  const keepHoverOpen = () => {
    clearTimeout(hoverCloseTimer.current);
    setLabelHovered(true);
  };
  const leaveHover = () => {
    clearTimeout(hoverCloseTimer.current);
    // Bridge the 6px portal gap, including a card flipped over its label.
    hoverCloseTimer.current = setTimeout(() => setLabelHovered(false), 100);
  };
  useEffect(() => () => clearTimeout(hoverCloseTimer.current), []);

  if (row.isDetail) {
    // 详情行——渲染完整 SpanDetail 卡（Story 3.4 重绘）。自然高度：ListView _scanItemHeights
    // 测量真实内容高并修正定位（AD-12；勿固定高/height:100%，否则测量坍塌）。getRowHeight 仅初始估值。
    const { span } = row;
    const detailState = (row.detailState as DetailState | undefined) ?? new DetailState();
    return (
      <div className={styles.detail}>
        <DdSpanDetail
          span={span}
          detailState={detailState}
          detailToggles={detailToggles ?? NOOP_DETAIL_TOGGLES}
          detailStubs={detailStubs}
          color={colorAccessor(span)}
          onClose={() => row.onDetailToggle(span.spanID)}
        />
      </div>
    );
  }

  const color = colorAccessor(row.span);
  // 键盘 focus 移出本行才收起（focus 落在 tray 按钮上时 relatedTarget 仍在行内）——对齐 datafox Table。
  const onBlurCapture = (e: FocusEvent<HTMLDivElement>) => {
    setNameFocused(false);
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };
  return (
    <div
      data-span-id={row.span.spanID}
      data-focus-root={isFocusRoot || undefined}
      className={`${styles.row}${
        isSelected ? ` ${styles.selected}` : isSelected === undefined && row.isFocused ? ` ${styles.focused}` : row.isMatchingFilter ? ` ${styles.matched}` : ''
      }`}
      onClick={(event) => {
        // Named controls own their action; the remaining row surface selects.
        if ((event.target as Element).closest('button, a, input, [role="button"]')) return;
        row.onDetailToggle(row.span.spanID);
      }}
      onPointerDownCapture={() => { setFocused(false); setNameFocused(false); }}
      onFocusCapture={(event) => {
        const keyboardFocused = event.target.matches(':focus-visible');
        setFocused(keyboardFocused);
        setNameFocused(keyboardFocused && event.target.matches('span[role="button"]'));
      }}
      onBlurCapture={onBlurCapture}
    >
      <PopoverRoot open={(labelHovered || nameFocused) && !cardDismissed} onOpenChange={(open) => { if (!open) setCardDismissed(true); }}>
      <div className={styles.labelCol}
        onMouseEnter={() => { keepHoverOpen(); setCardDismissed(false); }}
        onMouseLeave={leaveHover}
        onFocus={() => setCardDismissed(false)}
        style={{ flexBasis: `${row.columnWidth * 100}%`, maxWidth: `${row.columnWidth * 100}%`, paddingRight: isFocusRoot ? 36 : undefined }}>
        <PopoverAnchor asChild><span className={styles.hoverAnchor} /></PopoverAnchor>
        <DdLabelCell row={row} color={color} />
        {isFocusRoot && onUnfocusSpan ? (
          <Tooltip content="Unfocus span"><Button className={styles.unfocus} size="xs" isPrimary icon={FocusIcon}
            aria-label="Unfocus span" onClick={() => { setCardDismissed(true); onUnfocusSpan(); }} /></Tooltip>
        ) : onFocusSpan && (
          <ActionTray className={styles.focusTray}
            isOpen={labelHovered || focused}
            actions={[{ label: 'Focus on this span', icon: FocusIcon, onClick: () => { setCardDismissed(true); onFocusSpan(row.span.spanID); } }]}
          />
        )}
      </div>
      <PopoverContent placement="right" sideOffset={6} isPadded={false} isArrowHidden collisionPadding={8}
        onMouseEnter={keepHoverOpen} onMouseLeave={leaveHover}
        onClick={event => event.stopPropagation()} className={styles.hoverCard} role="tooltip" aria-label="Span summary"
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
        <DdSpanHoverCard span={row.span} color={color} traceDuration={traceDuration} isError={row.isError} />
      </PopoverContent>
      </PopoverRoot>
      <div className={styles.timelineCol}>
        <div
          className={styles.separator}
          style={{
            ...separatorGeometry(!connectsTo(row.prevSpan, row.span), !connectsTo(row.nextSpan, row.span), theme),
            backgroundColor: color,
          }}
          data-testid="span-separator"
        />
        {row.viewBounds.clippingLeft && (
          <div className={`${styles.clipEdge} ${styles.clipLeft}`} data-testid="clip-left" />
        )}
        <DdSpanBar row={row} color={color} />
        {row.viewBounds.clippingRight && (
          <div className={`${styles.clipEdge} ${styles.clipRight}`} data-testid="clip-right" />
        )}
      </div>
    </div>
  );
}
