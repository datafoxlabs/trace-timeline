// 状态容器（AD-5）——组合移植的 children/viewRange/hover hook + 列宽 + focusedSpanId，
// 提供「非受控默认 / 逐字段受控 / 全量受控逃生舱」三态，互斥并 dev 警告。
// detailStates/search 为槽（Epic 3/4 接入）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Trace, TraceSpan, TraceLog, TraceSpanReference } from '../model';
import type { ViewRange, ViewRangeTimeUpdate } from '../core';

import spanAncestorIds from '../model/span-ancestor-ids';

import DetailState from './DetailState';
import { useChildrenState } from './useChildrenState';
import { useDetailState } from './useDetailState';
import { useHoverIndentGuide } from './useHoverIndentGuide';
import { useSearch, type SearchState } from './useSearch';
import { useViewRange } from './useViewRange';

const DEFAULT_COLUMN_WIDTH = 0.32;

/** 全量受控逃生舱的状态形状。 */
export interface ControlledTraceState {
  childrenHiddenIDs: Set<string>;
  viewRange: ViewRange;
  spanNameColumnWidth: number;
  hoverIndentGuideIds: Set<string>;
  focusedSpanId?: string;
  /** 详情态（可选，缺省视为空——向后兼容既有构造）。 */
  detailStates?: Map<string, DetailState>;
}

export interface UseTraceTimelineStateOptions {
  searchSpans?: TraceSpan[];
  /** undefined keeps local selection; null is controlled deselection. */
  selectedSpanId?: string | null;
  onSelectedSpanIdChange?: (id: string | null) => void;
  // —— 逐字段受控（传值+回调=受控；传值无回调=只读冻结+warn；未传=非受控）——
  focusedSpanId?: string;
  onFocusedSpanIdChange?: (id: string | undefined) => void;
  initialColumnWidth?: number;
  // —— 全量受控逃生舱（与逐字段互斥，优先）——
  state?: ControlledTraceState;
  onStateChange?: (next: ControlledTraceState) => void;
}

export interface TraceTimelineState {
  childrenHiddenIDs: Set<string>;
  childrenToggle: (spanID: string) => void;
  expandAll: () => void;
  collapseAll: (spans: TraceSpan[]) => void;
  expandOne: (spans: TraceSpan[]) => void;
  collapseOne: (spans: TraceSpan[]) => void;

  viewRange: ViewRange;
  updateViewRangeTime: (start: number, end: number) => void;
  updateNextViewRangeTime: (update: ViewRangeTimeUpdate) => void;

  spanNameColumnWidth: number;
  setSpanNameColumnWidth: (width: number) => void;

  hoverIndentGuideIds: Set<string>;
  addHoverIndentGuideId: (spanID: string) => void;
  removeHoverIndentGuideId: (spanID: string) => void;

  focusedSpanId: string | undefined;
  setFocusedSpanId: (spanID: string | undefined) => void;

  // —— 详情（Story 5.5：点 span 单选 → 底部抽屉；3.2 detailToggles 子分组折叠）——
  detailStates: ReadonlyMap<string, DetailState>;
  detailToggle: (spanID: string) => void;
  detailToggles: DetailToggles;
  /** 当前选中 span（底部详情抽屉，Story 5.5）。 */
  selectedSpanId: string | undefined;
  /** Select a span; repeated selection keeps its detail open. */
  selectSpan: (spanID: string) => void;
  clearSelection: () => void;

  // —— 搜索（Story 4.1；本地视图态，受控/非受控一致）——
  search: SearchState;
}

/** 详情子分组 toggle 集合（Story 3.2）——源自 useDetailState，供皮肤 DdSpanDetail 消费。 */
export interface DetailToggles {
  tags: (spanID: string) => void;
  process: (spanID: string) => void;
  logs: (spanID: string) => void;
  references: (spanID: string) => void;
  warnings: (spanID: string) => void;
  stackTraces: (spanID: string) => void;
  logItem: (spanID: string, log: TraceLog) => void;
  referenceItem: (spanID: string, reference: TraceSpanReference) => void;
  /** 语义分组折叠（Story 3.4）。 */
  section: (spanID: string, name: string) => void;
}

const warned = new Set<string>();
function warnOnce(msg: string) {
  if (!warned.has(msg)) {
    warned.add(msg);
    // eslint-disable-next-line no-console
    console.warn(`[trace-timeline] ${msg}`);
  }
}

export function useTraceTimelineState(
  trace: Trace | null | undefined,
  options: UseTraceTimelineStateOptions = {}
): TraceTimelineState {
  // hooks 必须无条件调用（即便全量受控也调，规则所限）
  const children = useChildrenState();
  const viewRangeHook = useViewRange();
  const hover = useHoverIndentGuide();
  const detail = useDetailState(trace);
  const [selectedUC, setSelectedUC] = useState<string | undefined>(undefined);
  const selectionControlled = options.selectedSpanId !== undefined;
  const selectedSpanId = selectionControlled ? options.selectedSpanId ?? undefined : selectedUC;
  const ensureDetail = detail.ensureDetail;
  useEffect(() => {
    if (selectedSpanId && trace?.spans.some((span) => span.spanID === selectedSpanId)) ensureDetail(selectedSpanId);
  }, [selectedSpanId, trace, ensureDetail]);
  const onSelectedSpanIdChange = options.onSelectedSpanIdChange;
  const selectSpan = useCallback((spanID: string) => {
    if (selectedSpanId === spanID) return;
    if (!selectionControlled) setSelectedUC(spanID);
    onSelectedSpanIdChange?.(spanID);
  }, [selectedSpanId, selectionControlled, onSelectedSpanIdChange]);
  const clearSelection = useCallback(() => {
    if (!selectionControlled) setSelectedUC(undefined);
    onSelectedSpanIdChange?.(null);
  }, [selectionControlled, onSelectedSpanIdChange]);
  const search = useSearch(trace, { selectedSpanId, onNavigate: selectSpan, spans: options.searchSpans });
  const [columnWidthUC, setColumnWidthUC] = useState(options.initialColumnWidth ?? DEFAULT_COLUMN_WIDTH);
  const [focusedUC, setFocusedUC] = useState<string | undefined>(undefined);

  const isFullyControlled = options.state != null;
  const hasPerField = options.focusedSpanId !== undefined;

  if (isFullyControlled && hasPerField) {
    warnOnce('同时传入全量受控 `state` 与逐字段受控 `focusedSpanId`：逐字段被忽略（全量优先）。');
  }

  // —— focusedSpanId 三态 ——
  const focusedControlled = !isFullyControlled && options.focusedSpanId !== undefined;
  if (focusedControlled && !options.onFocusedSpanIdChange) {
    warnOnce('`focusedSpanId` 受控但未提供 `onFocusedSpanIdChange`：只读冻结，库不内部改写。');
  }

  const emitState = useCallback(
    (patch: Partial<ControlledTraceState>) => {
      if (options.state && options.onStateChange) {
        options.onStateChange({ ...options.state, ...patch });
      }
    },
    [options]
  );

  const focusedSpanId = isFullyControlled
    ? options.state!.focusedSpanId
    : focusedControlled
      ? options.focusedSpanId
      : focusedUC;

  const previousReveal = useRef<{ trace: typeof trace; targets: (string | undefined)[] }>({ trace: undefined, targets: [] });
  const expandAncestors = children.expandAncestors;
  const focusedMatchId = search.focusedMatchId;
  const previousMatches = useRef(search.matches);
  const matches = search.matches;
  useEffect(() => {
    const targets = [selectedSpanId, focusedSpanId, focusedMatchId];
    const previous = previousReveal.current;
    previousReveal.current = { trace, targets };
    const matchesChanged = matches !== previousMatches.current;
    previousMatches.current = matches;
    // Reveal matching branches once on commit; later manual collapse remains authoritative.
    const changed = targets.filter((id, index) => id && (trace !== previous.trace || id !== previous.targets[index]));
    if (matchesChanged && matches) changed.push(...matches);
    if (!trace || !changed.length) return;
    const ancestorIds = changed.flatMap((id) => spanAncestorIds(trace.spans.find((span) => span.spanID === id)));
    if (!isFullyControlled) {
      expandAncestors(ancestorIds);
      return;
    }
    const hidden = options.state!.childrenHiddenIDs;
    if (!ancestorIds.some((id) => hidden.has(id))) return;
    const next = new Set(hidden);
    ancestorIds.forEach((id) => next.delete(id));
    emitState({ childrenHiddenIDs: next });
  }, [trace, selectedSpanId, focusedSpanId, focusedMatchId, matches, isFullyControlled, options.state, emitState, expandAncestors]);

  const setFocusedSpanId = useCallback(
    (id: string | undefined) => {
      if (isFullyControlled) {
        emitState({ focusedSpanId: id });
        return;
      }
      if (focusedControlled) {
        options.onFocusedSpanIdChange?.(id);
        return;
      }
      setFocusedUC(id);
    },
    [isFullyControlled, focusedControlled, emitState, options]
  );

  // 全量受控下的 detailToggle：emit 新 Map（add/remove DetailState）。
  const detailToggleControlled = useCallback(
    (spanID: string) => {
      const cur = options.state?.detailStates ?? new Map<string, DetailState>();
      const next = new Map(cur);
      if (next.has(spanID)) {
        next.delete(spanID);
      } else {
        next.set(spanID, new DetailState());
      }
      emitState({ detailStates: next });
    },
    [options.state, emitState]
  );

  // 非受控：子分组 toggles 直接来自 useDetailState。
  const detailTogglesUC = useMemo<DetailToggles>(
    () => ({
      tags: detail.detailTagsToggle,
      process: detail.detailProcessToggle,
      logs: detail.detailLogsToggle,
      references: detail.detailReferencesToggle,
      warnings: detail.detailWarningsToggle,
      stackTraces: detail.detailStackTracesToggle,
      logItem: detail.detailLogItemToggle,
      referenceItem: detail.detailReferenceItemToggle,
      section: detail.detailSectionToggle,
    }),
    [detail]
  );

  // 全量受控：子分组折叠请宿主侧处理（与 expandOne 一致 warn-once）。
  const detailTogglesControlled = useMemo<DetailToggles>(() => {
    const warn = () => warnOnce('全量受控下详情子分组折叠未实现：请在宿主侧处理。');
    return {
      tags: warn,
      process: warn,
      logs: warn,
      references: warn,
      warnings: warn,
      stackTraces: warn,
      logItem: warn,
      referenceItem: warn,
      section: warn,
    };
  }, []);

  return useMemo<TraceTimelineState>(() => {
    if (isFullyControlled) {
      const s = options.state!;
      return {
        childrenHiddenIDs: s.childrenHiddenIDs,
        childrenToggle: (spanID) => {
          const next = new Set(s.childrenHiddenIDs);
          if (next.has(spanID)) {
            next.delete(spanID);
          } else {
            next.add(spanID);
          }
          emitState({ childrenHiddenIDs: next });
        },
        expandAll: () => emitState({ childrenHiddenIDs: new Set() }),
        collapseAll: (spans) =>
          emitState({ childrenHiddenIDs: new Set(spans.filter((sp) => sp.hasChildren).map((sp) => sp.spanID)) }),
        expandOne: () => warnOnce('全量受控下 expandOne 未实现：请在宿主侧处理。'),
        collapseOne: () => warnOnce('全量受控下 collapseOne 未实现：请在宿主侧处理。'),
        viewRange: s.viewRange,
        updateViewRangeTime: (start, end) =>
          emitState({ viewRange: { ...s.viewRange, time: { current: [start, end] } } }),
        updateNextViewRangeTime: (update) =>
          emitState({ viewRange: { ...s.viewRange, time: { ...s.viewRange.time, ...update } } }),
        spanNameColumnWidth: s.spanNameColumnWidth,
        setSpanNameColumnWidth: (width) => emitState({ spanNameColumnWidth: width }),
        hoverIndentGuideIds: s.hoverIndentGuideIds,
        addHoverIndentGuideId: (spanID) => {
          const next = new Set(s.hoverIndentGuideIds);
          next.add(spanID);
          emitState({ hoverIndentGuideIds: next });
        },
        removeHoverIndentGuideId: (spanID) => {
          const next = new Set(s.hoverIndentGuideIds);
          next.delete(spanID);
          emitState({ hoverIndentGuideIds: next });
        },
        focusedSpanId,
        setFocusedSpanId,
        detailStates: detail.detailStates,
        detailToggle: selectSpan,
        detailToggles: detailTogglesUC,
        selectedSpanId,
        selectSpan,
        clearSelection,
        search,
      };
    }

    return {
      childrenHiddenIDs: children.childrenHiddenIDs,
      childrenToggle: children.childrenToggle,
      expandAll: children.expandAll,
      collapseAll: children.collapseAll,
      expandOne: children.expandOne,
      collapseOne: children.collapseOne,
      viewRange: viewRangeHook.viewRange,
      updateViewRangeTime: viewRangeHook.updateViewRangeTime,
      updateNextViewRangeTime: viewRangeHook.updateNextViewRangeTime,
      spanNameColumnWidth: columnWidthUC,
      setSpanNameColumnWidth: setColumnWidthUC,
      hoverIndentGuideIds: hover.hoverIndentGuideIds,
      addHoverIndentGuideId: hover.addHoverIndentGuideId,
      removeHoverIndentGuideId: hover.removeHoverIndentGuideId,
      focusedSpanId,
      setFocusedSpanId,
      detailStates: detail.detailStates,
      detailToggle: selectSpan,
      detailToggles: detailTogglesUC,
      selectedSpanId,
      selectSpan,
      clearSelection,
      search,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isFullyControlled,
    options.state,
    children,
    viewRangeHook,
    hover,
    detail,
    search,
    columnWidthUC,
    focusedSpanId,
    setFocusedSpanId,
    emitState,
    detailToggleControlled,
    detailTogglesControlled,
    detailTogglesUC,
    selectedSpanId,
    selectSpan,
    clearSelection,
  ]);
}

// 仅测试用：重置 dev 警告去重。
export function __resetWarnings() {
  warned.clear();
}

// 给上层组合 collapse/zoom 时引用的常量。
export { DEFAULT_COLUMN_WIDTH };
