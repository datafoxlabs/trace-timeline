import { getSqlQueries } from '../presentation/sqlQueries';
import { isErrorSpan } from '../core';
// 对外组件（AR-1/AD-1/AD-2）——把 Datadog 皮肤注入 core 引擎，渲染静态瀑布。
// 空/加载/无效态归此层（AD-12）。交互（折叠/缩放/列宽/详情/受控）留 Epic 2–4。
import { css } from '@emotion/css';
import { DraggablePane, TooltipProvider } from '@datafox/ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import {
  computeLegendGroups,
  computeTraceCriticalPath,
  DEFAULT_HEIGHTS,
  dimensionKeyFor,
  VirtualizedTraceView,
  type LegendDimension,
  type LegendMetric,
} from '../core';
import { type Trace, type TraceSpan } from '../model';
import { traceSubtree } from '../model/traceSubtree';
import {
  colorAccessorForDimension,
  createDatadogRowRenderer,
  DdFlameGraphView,
  DdFlameLegend,
  DdFlameMinimap,
  DdFlameRuler,
  DdSearchBar,
  DdSpanDetail,
  DdTimeCursorLayer,
  DdTimelineHeader,
  DdViewTabs,
  defaultColorAccessor,
  HEADER_HEIGHT,
  type ColorAccessor,
  type DetailStubs,
  type TraceViewMode,
} from '../presentation';
import {
  DetailState,
  useHighlightGroup,
  useTraceTimelineState,
  type ControlledTraceState,
} from '../state';
import { useStyles2, type Theme } from '../theme';

const EMPTY_DETAIL_STATES = new Map<string, DetailState>();

export interface TraceTimelineProps {
  /** 内部派生 Trace（DataFox 适配见 Epic 5）。null/undefined → 空态。 */
  trace: Trace | null | undefined;
  /** Host content immediately below view tabs; omitted content occupies no space. */
  afterViewTabs?: ReactNode;
  /** Host detail content when no returned span is selected. */
  emptySelectionContent?: ReactNode;
  /** 自定义着色（默认 service 维度）。 */
  colorAccessor?: ColorAccessor;
  /** 名称列初始占比 [0,1]，默认 0.32（列宽拖拽见 Epic 2.4）。 */
  columnWidth?: number;
  /**
   * 刻度密度。未传时：瀑布表头轴用 hint 10（整步长取值，对齐真页），火焰图网格/尺用 5（等分）。
   * 显式传入则同时覆盖两者。
   */
  numTicks?: number;
  /** 覆盖 core 行高常量（AD-12）。 */
  rowHeights?: typeof DEFAULT_HEIGHTS;
  /** 加载中 → 占位。 */
  loading?: boolean;
  /** 列表区高度（默认 400）。 */
  height?: number;
  /** Fill a bounded parent, with a resizable detail pane. Legacy pixel heights remain the default. */
  fitContainer?: boolean;
  /** Initial label column width in fill mode; stays in pixels across container resizes. */
  defaultColumnWidthPixels?: number;
  /** 高亮关键路径（默认 true）。 */
  showCriticalPath?: boolean;
  /** 深耦合功能注入回调（火焰图/分享/链接；Story 5.4）。不传 → 相应按钮隐藏 / 火焰图区不显示。 */
  detailStubs?: DetailStubs;
  /**
   * 点击行内准星（Story 9.4 / B）。不传 → 用内置行为：选中该 span + 以它为火焰图聚焦根 + 重置缩放。
   * 注意：真页的「瀑布子树 re-root」在本仓尚未实现（见 story 9.4 的 D5）。
   */
  onFocusSpan?: (span: TraceSpan) => void;
  /** 底部详情抽屉高度（默认 340，Story 5.5）。 */
  drawerHeight?: number;
  /** 视图模式（Story 6.2）：非受控默认 'waterfall'；传 viewMode+onViewModeChange 受控。 */
  viewMode?: TraceViewMode;
  onViewModeChange?: (mode: TraceViewMode) => void;
  /** 非受控初始视图（默认 'waterfall'）。 */
  defaultViewMode?: TraceViewMode;
  // —— 火焰图服务图例（Story 7.1；受控/非受控）——
  /** 受控持久高亮分组 key（图例点击）。不传 → 非受控。 */
  highlightedGroupKey?: string | null;
  onHighlightGroupChange?: (key: string | null) => void;
  /** 受控图例显隐。不传 → 非受控（默认显示）。 */
  showLegend?: boolean;
  onShowLegendChange?: (show: boolean) => void;
  /** Color by 维度（Story 7.3：service/host/entity）。受控/非受控。 */
  colorBy?: LegendDimension;
  onColorByChange?: (dimension: LegendDimension) => void;
  defaultColorBy?: LegendDimension;
  /** 图例指标（Story 7.2：execTime/spans）。受控/非受控。 */
  legendMetric?: LegendMetric;
  onLegendMetricChange?: (metric: LegendMetric) => void;
  defaultLegendMetric?: LegendMetric;
  // —— 受控（AD-5；三态见 useTraceTimelineState）——
  /** Controlled detail selection; null clears, undefined uses local state. */
  selectedSpanId?: string | null;
  onSelectedSpanIdChange?: (id: string | null) => void;
  focusedSpanId?: string;
  onFocusedSpanIdChange?: (id: string | undefined) => void;
  /** 全量受控逃生舱（与逐字段受控互斥）。 */
  state?: ControlledTraceState;
  onStateChange?: (next: ControlledTraceState) => void;
  className?: string;
  style?: CSSProperties;
}

const getStyles = (theme: Theme) => ({
  root: css({
    label: 'TraceTimeline',
    border: `1px solid ${theme.colors.border.weak}`,
    background: theme.colors.background.primary,
    fontFamily: theme.trace.fontFamily,
    boxSizing: 'border-box',
  }),
  fill: css({
    label: 'TraceTimelineFill', height: '100%', minHeight: 0, border: 0,
    display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-background)',
  }),
  pane: css({ label: 'TraceTimelinePane', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }),
  scroll: css({ label: 'TraceTimelineScroll', overflow: 'auto', minHeight: 0, flex: 1 }),
  // 火焰图相对容器（Story 6.6）——承载 minimap 浮层 overlay。
  flameWrap: css({ label: 'TraceTimelineFlameWrap', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }),
  // Story 10.10：火焰体列（真页 flex 切分）——ruler + canvas 同列、左右各 8px 内缩（真页 `padding:0 8px`，
  // 故刻度尺不顶格）；flex:1 与图例列并排。关键：ruler 与 canvas 同宽 → 刻度逐列对齐帧
  //（原 ruler 是全宽 sibling、横跨到图例上，与 flex:1 的 canvas 差一个图例宽度而错位）。
  flameBody: css({
    label: 'TraceTimelineFlameBody',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    // Story 10.11 修正：左内缩 8px（不顶格），**右不留白**——令 ruler 底线（+canvas）一直铺到图例左缘，
    // 不再留 8px 白缝（用户「底线没有填充满」）。ruler 与 canvas 同宽不变，刻度仍逐列对齐帧。
    padding: '0 0 0 8px',
    boxSizing: 'border-box',
  }),
  // 刻度游标的定位祖先（Story 9.4 / D1）——须同时罩住表头与滚动区，真页 overlay 亦覆盖整表。
  waterfallWrap: css({ label: 'TraceTimelineWaterfallWrap', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }),
  // 底部详情抽屉（Story 5.5）——固定在瀑布下方，显示选中 span 详情，内部滚动。
  drawer: css({
    label: 'TraceTimelineDrawer',
    overflow: 'hidden',
    background: 'var(--ui-background)',
    minHeight: 0,
  }),
  state: css({
    label: 'TraceTimelineState',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.text.secondary,
    fontSize: 13,
    padding: theme.spacing(4),
  }),
});

const DEFAULT_COLUMN_WIDTH = 0.32;
// 火焰图背景网格 / 火焰尺：精确刻度数（等分）。Epic 6/7 既有密度，不动。
const DEFAULT_NUM_TICKS = 5;
// 瀑布表头轴（Story 9.3 复审）：d3 count hint，非精确刻度数。
// 真页 796px 轴上是 11 根整 5ms 刻度（54.1ms trace）—— hint=10 恰好复现该取值与密度。
const DEFAULT_AXIS_TICK_HINT = 10;

/**
 * 选中 span 的时间边界 → [startFrac, endFrac] ∈[0,1]，相对当前坐标系。
 * focusRootSpanId 给定（Story 6.7）时坐标系 = 该 focus 根的时间区间，否则整 trace。
 * 无选中/找不到 → null。
 */
function selectedSpanBounds(
  trace: Trace,
  selectedSpanId: string | undefined,
  focusRootSpanId?: string
): [number, number] | null {
  if (!selectedSpanId) {
    return null;
  }
  const span = trace.spans.find((s) => s.spanID === selectedSpanId);
  if (!span) {
    return null;
  }
  const root = focusRootSpanId ? trace.spans.find((s) => s.spanID === focusRootSpanId) : undefined;
  const baseStart = root ? root.startTime : trace.startTime;
  const baseDuration = root ? root.duration : trace.duration;
  if (!baseDuration) {
    return null;
  }
  const start = Math.max((span.startTime - baseStart) / baseDuration, 0);
  const end = Math.min((span.startTime + span.duration - baseStart) / baseDuration, 1);
  // 反转/空区间（聚焦态下选中子树外 span，或 clamp 后 end<=start）→ 无效，返回 null（M4）。
  if (end <= start) {
    return null;
  }
  return [start, end];
}

const MIN_FLAME_WINDOW = 0.01;
/** 把 [s,e] 钳到至少 MIN_FLAME_WINDOW 宽（避免缩到极窄/零宽产生 NaN，M2）。 */
function clampZoomWindow([s, e]: [number, number]): [number, number] {
  if (e - s >= MIN_FLAME_WINDOW) {
    return [s, e];
  }
  let ne = Math.min(s + MIN_FLAME_WINDOW, 1);
  const ns = ne - MIN_FLAME_WINDOW;
  return [Math.max(ns, 0), ne];
}

export function TraceTimeline({
  trace,
  afterViewTabs,
  emptySelectionContent,
  colorAccessor,
  columnWidth = DEFAULT_COLUMN_WIDTH,
  numTicks,
  rowHeights,
  loading = false,
  height = 400,
  fitContainer = false,
  defaultColumnWidthPixels = 444,
  showCriticalPath = true,
  detailStubs,
  drawerHeight = 340,
  viewMode,
  onViewModeChange,
  defaultViewMode = 'waterfall',
  highlightedGroupKey,
  onHighlightGroupChange,
  showLegend,
  onShowLegendChange,
  colorBy,
  onColorByChange,
  defaultColorBy = 'service',
  legendMetric,
  onLegendMetricChange,
  defaultLegendMetric = 'execTime',
  selectedSpanId,
  onSelectedSpanIdChange,
  focusedSpanId,
  onFocusedSpanIdChange,
  onFocusSpan,
  state,
  onStateChange,
  className,
  style,
}: TraceTimelineProps) {
  const styles = useStyles2(getStyles);
  const theme = useStyles2((t) => t);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  // 游标 overlay 的定位/测量宿主（Story 9.4）。
  const waterfallRef = useRef<HTMLDivElement>(null);
  const [columnPixels, setColumnPixels] = useState(defaultColumnWidthPixels);
  const [waterfallWidth, setWaterfallWidth] = useState(0);
  const [waterfallHeight, setWaterfallHeight] = useState(height + HEADER_HEIGHT);
  useEffect(() => {
    const element = waterfallRef.current;
    if (!fitContainer || !element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWaterfallHeight(entry.contentRect.height);
      setWaterfallWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitContainer, trace, loading]);

  // 视图模式（Story 6.2）——受控（viewMode+onViewModeChange）/ 非受控（defaultViewMode）。
  const [viewModeUC, setViewModeUC] = useState<TraceViewMode>(defaultViewMode);
  const currentViewMode = viewMode ?? viewModeUC;
  const setViewMode = (m: TraceViewMode) => {
    const root = trace?.spans.find(span => span.spanID === focusedRootSpanId);
    if (m === 'waterfall' && root && trace && trace.duration > 0 && root.duration > 0) {
      tt.updateViewRangeTime((root.startTime - trace.startTime) / trace.duration, (root.startTime + root.duration - trace.startTime) / trace.duration);
    } else tt.updateViewRangeTime(0, 1);
    if (viewMode === undefined) {
      setViewModeUC(m);
    }
    onViewModeChange?.(m);
  };
  // 聚焦根 span（Story 6.7 Focus=re-root）。
  const [focusedRootSpanId, setFocusedRootSpanId] = useState<string | undefined>(undefined);

  const scopedTrace = useMemo(() => traceSubtree(trace, focusedRootSpanId), [trace, focusedRootSpanId]);
  useEffect(() => { setFocusedRootSpanId(undefined); }, [trace?.traceID]);

  // 火焰图图例高亮（Story 7.1）——hover 临时 + click 持久 toggle + 显隐，受控/非受控。
  const hl = useHighlightGroup({
    highlightedKey: highlightedGroupKey,
    onHighlightChange: onHighlightGroupChange,
    showLegend,
    onShowLegendChange,
  });
  // Flame rect hover should light the matching legend row only. It must not feed back into
  // DdFlameGraphView.highlightedGroupKey, otherwise selecting a span leaves the pointer over
  // that rect and makes unrelated spans turn gray.
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailSize, setDetailSize] = useState<number | string>('50%');
  const [previewSpanId, setPreviewSpanId] = useState<string | null>(null);
  useEffect(() => { setPreviewSpanId(null); }, [trace?.traceID, currentViewMode, focusedRootSpanId]);
  const [spanHoverGroupKey, setSpanHoverGroupKey] = useState<string | null>(null);

  // Color by 维度（Story 7.3）+ 图例指标（Story 7.2）——受控/非受控。
  // 读写都以 `!== undefined` 判定受控（与 useHighlightGroup 一致；避免传 null 时读 `??` 回落 UC、
  // 写 `=== undefined` 当受控而冻结控件，CR-F2）。
  const [colorByUC, setColorByUC] = useState<LegendDimension>(defaultColorBy);
  const currentColorBy = colorBy !== undefined ? colorBy : colorByUC;
  const setColorBy = (d: LegendDimension) => {
    if (colorBy === undefined) {
      setColorByUC(d);
    }
    onColorByChange?.(d);
    // 切维度清临时 + 持久高亮，避免旧维度 key 在新维度变孤儿致整图全灰（CR-F1）。
    hl.setHovered(null);
    hl.clearPinned();
    setSpanHoverGroupKey(null);
  };
  const [legendMetricUC, setLegendMetricUC] = useState<LegendMetric>(defaultLegendMetric);
  const currentLegendMetric = legendMetric !== undefined ? legendMetric : legendMetricUC;
  const setLegendMetric = (m: LegendMetric) => {
    if (legendMetric === undefined) {
      setLegendMetricUC(m);
    }
    onLegendMetricChange?.(m);
  };

  // 当前维度下合法的分组 key 集（CR-F1 守卫）——effectiveKey 若不在其中（切维度/换 trace 后的孤儿
  // 受控 key），视为无高亮，避免「所有帧都不匹配 → 整图全灰且无行可点恢复」。
  const legendGroupKeys = useMemo(
    () => (scopedTrace ? new Set(computeLegendGroups(scopedTrace, { dimension: currentColorBy }).map((g) => g.key)) : new Set<string>()),
    [scopedTrace, currentColorBy]
  );
  const safeHighlightKey =
    hl.effectiveKey != null && legendGroupKeys.has(hl.effectiveKey) ? hl.effectiveKey : null;
  const safeSpanHoverKey =
    spanHoverGroupKey != null && legendGroupKeys.has(spanHoverGroupKey) ? spanHoverGroupKey : null;
  const legendHighlightKey = safeSpanHoverKey ?? safeHighlightKey;
  // 持久选中（点击 pinned）——图例行整行粉底用它（Story 10.9）；同守 CR-F1 孤儿 key。
  const safePinnedKey =
    hl.pinnedKey != null && legendGroupKeys.has(hl.pinnedKey) ? hl.pinnedKey : null;

  // 有效着色（Story 7.3）：service 维度用用户自定义/默认；host/entity 维度按维度散列。
  // 流向瀑布 rowRenderer + 火焰图 + 图例 + minimap，使 Color by 在两视图都生效。
  const effectiveColorAccessor = useMemo<ColorAccessor>(
    () =>
      currentColorBy === 'service'
        ? colorAccessor ?? defaultColorAccessor(theme)
        : colorAccessorForDimension(currentColorBy, theme),
    [currentColorBy, colorAccessor, theme]
  );

  // 状态容器（AD-5）——非受控自管 / 逐字段受控 / 全量逃生舱。
  const tt = useTraceTimelineState(trace, {
    searchSpans: scopedTrace?.spans,
    selectedSpanId,
    onSelectedSpanIdChange,
    focusedSpanId,
    onFocusedSpanIdChange,
    initialColumnWidth: columnWidth,
    state,
    onStateChange,
  });

  useEffect(() => setDetailCollapsed(false), [tt.selectedSpanId, trace?.traceID]);
  const graphRoot = useRef<HTMLDivElement>(null);
  const restoreFocusControl = useRef(false);
  useLayoutEffect(() => {
    if (!restoreFocusControl.current) return;
    const id = focusedRootSpanId ?? tt.selectedSpanId;
    const row = Array.from(graphRoot.current?.querySelectorAll<HTMLElement>('[data-span-id]') ?? []).find(row => row.dataset.spanId === id);
    row?.querySelector<HTMLButtonElement>(`button[aria-label="${focusedRootSpanId ? 'Unfocus span' : 'Focus on this span'}"]`)?.focus({ preventScroll: true });
    restoreFocusControl.current = false;
  }, [focusedRootSpanId, tt.selectedSpanId]);

  const resetFocus = useCallback(() => {
    restoreFocusControl.current = document.activeElement?.matches(':focus-visible') ?? false;
    setFocusedRootSpanId(undefined);
    tt.updateViewRangeTime(0, 1);
  }, [tt.updateViewRangeTime]);

  const handleFocusSpan = useCallback((spanID: string) => {
    const span = trace?.spans.find(s => s.spanID === spanID);
    if (!span || !trace) return;
    if (onFocusSpan) { onFocusSpan(span); return; }
    restoreFocusControl.current = document.activeElement?.matches(':focus-visible') ?? false;
    tt.selectSpan(spanID);
    setFocusedRootSpanId(spanID);
    // Waterfall keeps the original trace-relative axis; Flame Graph uses a local axis.
    if (currentViewMode === 'waterfall' && trace.duration > 0 && span.duration > 0) {
      tt.updateViewRangeTime((span.startTime - trace.startTime) / trace.duration,
        (span.startTime + span.duration - trace.startTime) / trace.duration);
    } else tt.updateViewRangeTime(0, 1);
  }, [trace, onFocusSpan, currentViewMode, tt.selectSpan, tt.updateViewRangeTime]);

  const rowRenderer = useMemo(
    () =>
      trace
        ? createDatadogRowRenderer({
            theme,
            trace,
            colorAccessor: effectiveColorAccessor,
            detailToggles: tt.detailToggles,
            detailStubs,
            selectedSpanId: tt.selectedSpanId,
            onFocusSpan: handleFocusSpan,
            focusedRootSpanId,
            onUnfocusSpan: resetFocus,
          })
        : null,
    [theme, trace, effectiveColorAccessor, tt.detailToggles, detailStubs, tt.selectedSpanId, handleFocusSpan, focusedRootSpanId, resetFocus]
  );

  const criticalPath = useMemo(
    () => (trace && showCriticalPath ? computeTraceCriticalPath(trace) : []),
    [trace, showCriticalPath]
  );

  const nameColumnWidth = fitContainer && waterfallWidth > 0
    ? Math.min(0.85, Math.max(0.2, columnPixels / waterfallWidth))
    : tt.spanNameColumnWidth;
  const resizeNameColumn = (ratio: number) => {
    if (fitContainer) setColumnPixels(ratio * waterfallWidth);
    tt.setSpanNameColumnWidth(ratio);
  };

  // Story 9.1：暗色时给组件根挂作用域 `.dark`（datafox styles.css 的 `.dark {}` 重定义 --ui-*），
  // 使区域 emotion 的 var(--ui-*) 靠 CSS 级联切暗。仅作用于本组件子树，不碰 documentElement（避免抢 ThemeProvider）。
  const rootClass = [styles.root, fitContainer ? styles.fill : '', theme.isDark ? 'dark' : '', className]
    .filter(Boolean)
    .join(' ');

  const sqlQueries = useMemo(() => getSqlQueries(trace?.spans ?? []), [trace?.spans]);
  const errorSpans = useMemo(() => trace?.spans.filter(isErrorSpan) ?? [], [trace?.spans]);

  if (loading) {
    return (
      <div className={rootClass} style={style}>
        <div className={styles.state}>加载中…</div>
      </div>
    );
  }

  if (!trace || !rowRenderer) {
    return (
      <div className={rootClass} style={style}>
        <div className={styles.state}>无追踪数据</div>
      </div>
    );
  }

  const isFlame = currentViewMode === 'flamegraph';
  // 聚焦根（Story 6.7）——ruler/zoom 时间基于其时长。
  const focusRootSpan = focusedRootSpanId ? trace.spans.find((s) => s.spanID === focusedRootSpanId) : undefined;
  const flameViewDuration = focusRootSpan ? focusRootSpan.duration : trace.duration;
  const focusSelected = () => {
    if (tt.selectedSpanId) {
      setFocusedRootSpanId(tt.selectedSpanId);
      tt.updateViewRangeTime(0, 1);
    }
  };

  const hasSelection = trace.spans.some((span) => span.spanID === tt.selectedSpanId);
  const hasDetail = hasSelection || (isFlame && previewSpanId != null) || Boolean(emptySelectionContent);
  const graph = <div ref={graphRoot} className={fitContainer ? styles.pane : undefined}>
      <DdSearchBar
        key={trace.traceID}
        spans={scopedTrace!.spans}
        search={tt.search}
        colorBy={currentColorBy}
        onColorByChange={setColorBy}
        legendToggle={isFlame ? { show: hl.showLegend, onToggle: hl.setShowLegend } : undefined}
      />
      <div className={styles.waterfallWrap} ref={waterfallRef}>
      {!isFlame && (
        <DdTimelineHeader
          columnWidth={nameColumnWidth}
          numTicks={numTicks ?? DEFAULT_AXIS_TICK_HINT}
          viewDuration={trace.duration}
          onExpandAll={tt.expandAll}
          onCollapseAll={() => tt.collapseAll(scopedTrace!.spans)}
          onExpandOne={() => tt.expandOne(scopedTrace!.spans)}
          onCollapseOne={() => tt.collapseOne(scopedTrace!.spans)}
          viewRangeTime={tt.viewRange.time}
          updateViewRangeTime={tt.updateViewRangeTime}
          updateNextViewRangeTime={tt.updateNextViewRangeTime}
          onColumnResize={resizeNameColumn}
          columnResizeHandleHeight={fitContainer ? waterfallHeight : height + HEADER_HEIGHT}
        />
      )}
      <div className={styles.flameWrap} style={isFlame ? { flexDirection: 'row' } : undefined}>
        {isFlame ? (
          // Story 10.10：火焰体（ruler + canvas）同列、8px 内缩，与图例列 flex 并排（真页架构）。
          <div className={styles.flameBody}>
            <DdFlameRuler
              numTicks={numTicks ?? DEFAULT_NUM_TICKS}
              viewDuration={flameViewDuration}
              viewStart={tt.viewRange.time.current[0]}
              viewEnd={tt.viewRange.time.current[1]}
            />
            <div ref={setScrollEl} className={styles.scroll} style={fitContainer ? undefined : { height }}>
              <DdFlameGraphView
                trace={trace}
                colorAccessor={effectiveColorAccessor}
                selectedSpanId={tt.selectedSpanId}
                onSelectSpan={tt.selectSpan}
                onViewRangeChange={tt.updateViewRangeTime}
                focusRootSpanId={focusedRootSpanId}
                highlightedGroupKey={safeHighlightKey}
                groupKeyForSpan={(s) => dimensionKeyFor(s, currentColorBy)}
                onSpanHover={setSpanHoverGroupKey}
                onPreviewSpan={setPreviewSpanId}
                numTicks={numTicks ?? DEFAULT_NUM_TICKS}
                viewRange={{ viewStart: tt.viewRange.time.current[0], viewEnd: tt.viewRange.time.current[1] }}
              />
            </div>
          </div>
        ) : (
          <div ref={setScrollEl} className={styles.scroll} style={fitContainer ? undefined : { height }}>
            {scrollEl && (
              <VirtualizedTraceView
                trace={scopedTrace!}
                currentViewRangeTime={tt.viewRange.time.current}
                childrenHiddenIDs={tt.childrenHiddenIDs}
                detailStates={EMPTY_DETAIL_STATES}
                findMatchesIDs={tt.search.matches ?? null}
                showSpanFilterMatchesOnly={tt.search.showMatchesOnly}
                criticalPath={criticalPath}
                spanNameColumnWidth={nameColumnWidth}
                hoverIndentGuideIds={tt.hoverIndentGuideIds}
                focusedSpanId={tt.focusedSpanId ?? tt.selectedSpanId}
                focusedSpanIdForSearch={tt.search.focusedMatchId}
                headerHeight={HEADER_HEIGHT}
                rowHeights={rowHeights}
                scrollElement={scrollEl}
                rowRenderer={rowRenderer}
                childrenToggle={tt.childrenToggle}
                detailToggle={tt.detailToggle}
                addHoverIndentGuideId={tt.addHoverIndentGuideId}
                removeHoverIndentGuideId={tt.removeHoverIndentGuideId}
              />
            )}
          </div>
        )}
        {/* Story 10.9：显隐由工具条（DdSearchBar.legendToggle）控制——隐藏即不渲染面板、火焰图铺满；
            故不再向 DdFlameLegend 传 showLegend/onShowLegendChange（其表头只剩右对齐指标 Select，与真页一致）。 */}
        {isFlame && hl.showLegend && (
          <DdFlameLegend
            trace={scopedTrace!}
            colorAccessor={effectiveColorAccessor}
            dimension={currentColorBy}
            metric={currentLegendMetric}
            onMetricChange={setLegendMetric}
            highlightedKey={legendHighlightKey}
            pinnedKey={safePinnedKey}
            onHoverChange={hl.setHovered}
            onToggle={hl.togglePinned}
          />
        )}
        {isFlame && (
          <DdFlameMinimap
            trace={trace}
            colorAccessor={effectiveColorAccessor}
            viewStart={tt.viewRange.time.current[0]}
            viewEnd={tt.viewRange.time.current[1]}
            onViewRangeChange={tt.updateViewRangeTime}
            focusRootSpanId={focusedRootSpanId}
            hasSelection={tt.selectedSpanId != null}
            canZoomFull={tt.viewRange.time.current[0] !== 0 || tt.viewRange.time.current[1] !== 1}
            canZoomSelected={(() => {
              const bounds = selectedSpanBounds(trace, tt.selectedSpanId, focusedRootSpanId);
              return bounds != null && (Math.abs(bounds[0] - tt.viewRange.time.current[0]) > 0.000001 || Math.abs(bounds[1] - tt.viewRange.time.current[1]) > 0.000001);
            })()}
            isFocused={focusedRootSpanId != null}
            onResetFocus={resetFocus}
            onZoomFull={() => tt.updateViewRangeTime(0, 1)}
            onZoomSelected={() => {
              const b = selectedSpanBounds(trace, tt.selectedSpanId, focusedRootSpanId);
              if (b) {
                const [s, e] = clampZoomWindow(b);
                tt.updateViewRangeTime(s, e);
              }
            }}
            onFocusSelected={focusSelected}
            style={{ bottom: 16, left: 24 }}
          />
        )}
        </div>
        {/* Story 9.4（A）：游标覆盖表头 + 滚动区，pointer-events:none 不劫持既有交互。
            列宽按 waterfallWrap 全宽换算 —— 与表头刻度同一基准。 */}
        {!isFlame && (
          <DdTimeCursorLayer
            container={waterfallRef}
            columnWidth={nameColumnWidth}
            viewDuration={trace.duration}
            viewStart={tt.viewRange.time.current[0]}
            viewEnd={tt.viewRange.time.current[1]}
          />
        )}
      </div>
  </div>;
  const detail = <>
      {(() => {
        const detailSpanId = isFlame ? previewSpanId ?? tt.selectedSpanId : tt.selectedSpanId;
        const selectedSpan = detailSpanId
          ? trace.spans.find((s) => s.spanID === detailSpanId)
          : undefined;
        if (!selectedSpan) {
          return emptySelectionContent ?? null;
        }
        const resolveColor = effectiveColorAccessor;
        return (
          <div className={styles.drawer} style={{ height: fitContainer ? '100%' : drawerHeight, overflow: fitContainer ? 'hidden' : 'auto' }} data-testid="TraceTimelineDrawer">
            <DdSpanDetail
              span={selectedSpan}
              traceDuration={trace.duration}
              errorSpans={errorSpans}
              sqlQueries={sqlQueries}
              onSelectDetailSpan={id => { setPreviewSpanId(null); tt.selectSpan(id); }}
              detailColor={resolveColor}
              fillContainer={fitContainer}
              detailState={tt.detailStates.get(selectedSpan.spanID) ?? new DetailState()}
              detailToggles={tt.detailToggles}
              detailStubs={detailStubs}
              color={resolveColor(selectedSpan)}
              onClose={tt.clearSelection}
              isCollapsed={fitContainer && detailCollapsed}
              onToggleCollapsed={fitContainer ? () => setDetailCollapsed(value => !value) : undefined}
            />
          </div>
        );
      })()}  </>;
  return (
    <TooltipProvider>
      <div className={rootClass} style={{ background: 'var(--ui-background)', ...style }}>
        <DdViewTabs value={currentViewMode} onChange={setViewMode} />
        {afterViewTabs}
        {fitContainer ? (
          <DraggablePane placement="bottom" primary="second" size={detailCollapsed ? 74 : detailSize}
            onChange={size => { if (!detailCollapsed) setDetailSize(size); }}
            firstPaneMinSize={160} secondPaneMinSize={detailCollapsed ? 74 : 160} secondPaneMaxSize={detailCollapsed ? 74 : undefined}
            pane1Style={hasDetail ? undefined : { flex: '1 1 0%' }}
            pane2Style={hasDetail ? undefined : { display: 'none' }}
            step={1} style={{ flex: 1, minHeight: 0 }} paneStyle={{ minHeight: 0, overflow: 'hidden' }}
            resizerClassName={hasDetail ? undefined : css({ display: 'none' })}>
            {graph}
            {detail}
          </DraggablePane>
        ) : <>{graph}{detail}</>}
      </div>
    </TooltipProvider>
  );
}
