// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// 移植自 TraceTimelineViewer/VirtualizedTraceView.tsx（660 行，引擎调度中枢）。
// 解耦动作（AD-2/AD-3/AD-6）：
//   1) 去全部 @grafana（withTheme2/stylesFactory/ToolbarButton/config/reportInteraction/t/类型）；
//   2) renderRow 不再 import SpanBarRow/SpanDetailRow，改建 RenderableRow 调注入的 rowRenderer；
//   3) 颜色全部移除（getColorByKey/rpc.color/...），只传 process/serviceName 数据；
//   4) getRowHeight 常量住 core（DEFAULT_HEIGHTS），api 可经 rowHeights 覆盖；
//   5) 保留 class + 4×memoizeOne + 手写 shouldComponentUpdate（逐行对照，逻辑不改）。

import { isEqual } from 'lodash';
import memoizeOne from 'memoize-one';
import * as React from 'react';

import {
  getServiceDisplayName,
  spanAncestorIds,
  type CriticalPathSection,
  type Trace,
  type TraceSpan,
} from '../model';

import ListView from './ListView';
import type { RenderableRow, RowRenderer } from './rowRenderer.types';
import type { TNil } from './types';
import {
  createViewedBoundsFunc,
  findServerChildSpan,
  getHttpStatusCode,
  isErrorSpan,
  isKindClient,
  PEER_SERVICE,
  spanContainsErredSpan,
  ViewedBoundsFunctionType,
} from './utils';

type RowState = {
  isDetail: boolean;
  span: TraceSpan;
  spanIndex: number;
};

/** 行高常量，由 core 唯一拥有（AD-12）；api 可经 rowHeights 覆盖。 */
export const DEFAULT_HEIGHTS = {
  // Story 9.3（D2）：行高按真页 DRUIDS Table 实测 `grid-auto-rows: 23px`（原 28）。
  // 配合 DdSpanRow 去掉 1px 下边框后，heightGetter(23) 与 clientHeight(23) 恰好一致
  // （此前 28 - 1px border = 27，估算与 _scanItemHeights 实测差 1px）。
  bar: 23,
  // detail 行为初始估值——皮肤详情卡为自然高度，ListView _scanItemHeights 测量真实高后修正（AD-12）。
  // Datadog 结构详情卡（header+tabs+pinned+语义分组）较高，估值取大以减少首帧跳动。
  detail: 320,
  detailWithLogs: 360,
};

const BUFFER_SIZE = 33;

export type VirtualizedTraceViewProps = {
  /** 已派生的内部 Trace（时间微秒）。 */
  trace: Trace;
  /** 当前缩放窗 [start,end]∈[0,1]。 */
  currentViewRangeTime: [number, number];
  childrenHiddenIDs: Set<string>;
  /** core 仅用 .has/.get；不引 DetailState 形状（AD-2）。 */
  detailStates: ReadonlyMap<string, unknown>;
  findMatchesIDs: Set<string> | TNil;
  showSpanFilterMatchesOnly: boolean;
  criticalPath: CriticalPathSection[];
  spanNameColumnWidth: number;
  hoverIndentGuideIds: Set<string>;
  scrollElement?: Element;
  focusedSpanId?: string;
  focusedSpanIdForSearch?: string;
  headerHeight: number;
  /** 注入的皮肤行渲染器（依赖反转，AD-2）。 */
  rowRenderer: RowRenderer;
  /** 可选覆盖行高常量（AD-12）。 */
  rowHeights?: typeof DEFAULT_HEIGHTS;
  redrawListView?: {};
  // —— 交互回调（透传进 RenderableRow）——
  childrenToggle: (spanID: string) => void;
  detailToggle: (spanID: string) => void;
  addHoverIndentGuideId: (spanID: string) => void;
  removeHoverIndentGuideId: (spanID: string) => void;
};

function generateRowStates(
  spans: TraceSpan[] | TNil,
  childrenHiddenIDs: Set<string>,
  detailStates: ReadonlyMap<string, unknown>,
  findMatchesIDs: Set<string> | TNil,
  showSpanFilterMatchesOnly: boolean
): RowState[] {
  if (!spans) {
    return [];
  }
  // Apply filtering when matchesOnly is enabled
  // Critical path filtering is now integrated into findMatchesIDs
  if (showSpanFilterMatchesOnly && findMatchesIDs) {
    spans = spans.filter((span) => findMatchesIDs.has(span.spanID));
  }

  let collapseDepth = null;
  const rowStates = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const { spanID, depth } = span;
    let hidden = false;
    if (collapseDepth != null) {
      if (depth >= collapseDepth) {
        hidden = true;
      } else {
        collapseDepth = null;
      }
    }
    if (hidden) {
      continue;
    }
    if (childrenHiddenIDs.has(spanID)) {
      collapseDepth = depth + 1;
    }
    rowStates.push({
      span,
      isDetail: false,
      spanIndex: i,
    });
    if (detailStates.has(spanID)) {
      rowStates.push({
        span,
        isDetail: true,
        spanIndex: i,
      });
    }
  }
  return rowStates;
}

function getClipping(currentViewRange: [number, number]) {
  const [zoomStart, zoomEnd] = currentViewRange;
  return {
    left: zoomStart > 0,
    right: zoomEnd < 1,
  };
}

function generateRowStatesFromTrace(
  trace: Trace | TNil,
  childrenHiddenIDs: Set<string>,
  detailStates: ReadonlyMap<string, unknown>,
  findMatchesIDs: Set<string> | TNil,
  showSpanFilterMatchesOnly: boolean
): RowState[] {
  return trace
    ? generateRowStates(trace.spans, childrenHiddenIDs, detailStates, findMatchesIDs, showSpanFilterMatchesOnly)
    : [];
}

function childSpansMap(trace: Trace | TNil) {
  const map = new Map<string, string[]>();
  if (!trace) {
    return map;
  }
  trace.spans.forEach((span) => {
    if (span.childSpanIds.length) {
      map.set(span.spanID, span.childSpanIds);
    }
  });
  return map;
}

const memoizedGenerateRowStates = memoizeOne(generateRowStatesFromTrace);
const memoizedViewBoundsFunc = memoizeOne(createViewedBoundsFunc, isEqual);
const memoizedGetClipping = memoizeOne(getClipping, isEqual);
const memoizedChildSpansMap = memoizeOne(childSpansMap);

export default class VirtualizedTraceView extends React.Component<VirtualizedTraceViewProps> {
  listView: ListView | TNil;
  pendingScrollSpanId: string | undefined;

  componentDidMount() {
    this.pendingScrollSpanId = this.props.focusedSpanIdForSearch ?? this.props.focusedSpanId;
    this.flushPendingScroll();
  }

  flushPendingScroll() {
    if (this.scrollToSpan(this.props.headerHeight, this.pendingScrollSpanId)) this.pendingScrollSpanId = undefined;
  }

  shouldComponentUpdate(nextProps: VirtualizedTraceViewProps) {
    // If any prop updates, VirtualizedTraceView should update.
    let key: keyof VirtualizedTraceViewProps;
    for (key in nextProps) {
      if (nextProps[key] !== this.props[key]) {
        return true;
      }
    }
    return false;
  }

  componentDidUpdate(prevProps: Readonly<VirtualizedTraceViewProps>) {
    const { focusedSpanId, focusedSpanIdForSearch, trace } = this.props;
    if (focusedSpanId !== prevProps.focusedSpanId || trace !== prevProps.trace) this.pendingScrollSpanId = focusedSpanId;
    if (focusedSpanIdForSearch !== prevProps.focusedSpanIdForSearch) this.pendingScrollSpanId = focusedSpanIdForSearch ?? focusedSpanId;
    // A navigation target may become visible only after its ancestors expand.
    this.flushPendingScroll();
  }

  getRowStates(): RowState[] {
    const { childrenHiddenIDs, detailStates, trace, findMatchesIDs, showSpanFilterMatchesOnly } = this.props;
    return memoizedGenerateRowStates(trace, childrenHiddenIDs, detailStates, findMatchesIDs, showSpanFilterMatchesOnly);
  }

  getClipping(): { left: boolean; right: boolean } {
    const { currentViewRangeTime } = this.props;
    return memoizedGetClipping(currentViewRangeTime);
  }

  getViewedBounds(): ViewedBoundsFunctionType {
    const { currentViewRangeTime, trace } = this.props;
    const [zoomStart, zoomEnd] = currentViewRangeTime;

    return memoizedViewBoundsFunc({
      min: trace.startTime,
      max: trace.endTime,
      viewStart: zoomStart,
      viewEnd: zoomEnd,
    });
  }

  getChildSpansMap() {
    return memoizedChildSpansMap(this.props.trace);
  }

  mapRowIndexToSpanIndex = (index: number) => this.getRowStates()[index].spanIndex;

  mapSpanIndexToRowIndex = (index: number) => {
    const max = this.getRowStates().length;
    for (let i = 0; i < max; i++) {
      const { spanIndex } = this.getRowStates()[i];
      if (spanIndex === index) {
        return i;
      }
    }
    throw new Error(`unable to find row for span index: ${index}`);
  };

  setListView = (listView: ListView | TNil) => {
    this.listView = listView;
  };

  getKeyFromIndex = (index: number) => {
    const { isDetail, span } = this.getRowStates()[index];
    return `${span.traceID}--${span.spanID}--${isDetail ? 'detail' : 'bar'}`;
  };

  getIndexFromKey = (key: string) => {
    const parts = key.split('--');
    const _traceID = parts[0];
    const _spanID = parts[1];
    const _isDetail = parts[2] === 'detail';
    const max = this.getRowStates().length;
    for (let i = 0; i < max; i++) {
      const { span, isDetail } = this.getRowStates()[i];
      if (span.spanID === _spanID && span.traceID === _traceID && isDetail === _isDetail) {
        return i;
      }
    }
    return -1;
  };

  getRowHeight = (index: number) => {
    const { span, isDetail } = this.getRowStates()[index];
    const heights = this.props.rowHeights ?? DEFAULT_HEIGHTS;
    if (!isDetail) {
      return heights.bar;
    }
    if (Array.isArray(span.logs) && span.logs.length) {
      return heights.detailWithLogs;
    }
    return heights.detail;
  };

  scrollToSpan = (headerHeight: number, spanID?: string) => {
    if (spanID == null) {
      return;
    }
    const i = this.getRowStates().findIndex((row) => row.span.spanID === spanID);
    if (i >= 0) {
      if (!this.listView) return false;
      this.listView.scrollToIndex(i, headerHeight);
      return true;
    }
  };

  /**
   * 把第 index 行编译成 RenderableRow（AD-2，唯一接缝，无颜色/主题）。
   * 替换上游 renderSpanBarRow/renderSpanDetailRow 中除「着色」外的全部数据计算。
   */
  buildRenderableRow(index: number): RenderableRow {
    const rowStates = this.getRowStates();
    const { span, isDetail, spanIndex } = rowStates[index];
    const { spanID, depth, childSpanIds } = span;

    // 相邻可见 span 行（Story 9.4d）。detail 行不是 span 行——它夹在两个 span 行之间，
    // 于是把服务连段截断，上下两行各自收口。真页无内联 detail 行，此为本仓的等价推论。
    const prevRow = rowStates[index - 1];
    const nextRow = rowStates[index + 1];
    const prevSpan = prevRow && !prevRow.isDetail ? prevRow.span : undefined;
    const nextSpan = nextRow && !nextRow.isDetail ? nextRow.span : undefined;
    const {
      childrenHiddenIDs,
      detailStates,
      findMatchesIDs,
      focusedSpanId,
      focusedSpanIdForSearch,
      spanNameColumnWidth,
      trace,
      criticalPath,
      hoverIndentGuideIds,
      childrenToggle,
      detailToggle,
      addHoverIndentGuideId,
      removeHoverIndentGuideId,
    } = this.props;

    const isCollapsed = childrenHiddenIDs.has(spanID);
    const isMatchingFilter = findMatchesIDs ? findMatchesIDs.has(spanID) : false;
    const isFocused = spanID === focusedSpanId || spanID === focusedSpanIdForSearch;
    const isError = isErrorSpan(span);
    const descendantHasError = isCollapsed && spanContainsErredSpan(trace.spans, spanIndex);

    const viewBoundsFn = this.getViewedBounds();
    const bounds = viewBoundsFn(span.startTime, span.startTime + span.duration);
    const clipping = this.getClipping();

    // 根→父有序，length === depth（AD-2）；model 的 spanAncestorIds 返回近→远，reverse 得根→父。
    const ancestorSpanIds = spanAncestorIds(span).slice(0, depth).reverse();

    // 折叠 client 时取直接 server 子（RPC 合并，无颜色，AD-6）。
    let rpc: RenderableRow['rpc'];
    if (isCollapsed) {
      const rpcSpan = findServerChildSpan(trace.spans.slice(spanIndex));
      if (rpcSpan) {
        const rpcBounds = viewBoundsFn(rpcSpan.startTime, rpcSpan.startTime + rpcSpan.duration);
        rpc = {
          serviceName: getServiceDisplayName(rpcSpan.process),
          operationName: rpcSpan.operationName,
          process: rpcSpan.process,
          viewStart: rpcBounds.start,
          viewEnd: rpcBounds.end,
        };
      }
    }

    // 叶子 client + peer.service：疑似未插桩外部服务（FR-17，无颜色）。
    let noInstrumentedServer: RenderableRow['noInstrumentedServer'];
    const peerServiceKV = span.tags.find((kv) => kv.key === PEER_SERVICE);
    if (!span.hasChildren && peerServiceKV && isKindClient(span)) {
      noInstrumentedServer = { serviceName: String(peerServiceKV.value) };
    }

    // criticalPathSections：折叠时并入全部后代，否则仅本 span。
    const allChildSpanIds = [spanID, ...childSpanIds];
    const findAllDescendants = (currentChildSpanIds: string[]) => {
      currentChildSpanIds.forEach((eachId) => {
        const childrenOfCurrent = this.getChildSpansMap().get(eachId);
        if (childrenOfCurrent?.length) {
          allChildSpanIds.push(...childrenOfCurrent);
          findAllDescendants(childrenOfCurrent);
        }
      });
    };
    findAllDescendants(childSpanIds);
    const criticalPathSections = (criticalPath ?? []).filter((each) => {
      if (isCollapsed) {
        return allChildSpanIds.includes(each.spanId);
      }
      return each.spanId === spanID;
    });

    return {
      span,
      spanIndex,
      isDetail,
      depth,
      ancestorSpanIds,
      prevSpan,
      nextSpan,
      viewBounds: {
        start: bounds.start,
        end: bounds.end,
        clippingLeft: clipping.left,
        clippingRight: clipping.right,
      },
      isCollapsed,
      isMatchingFilter,
      isFocused,
      isError,
      descendantHasError,
      httpStatus: getHttpStatusCode(span),
      rpc,
      noInstrumentedServer,
      criticalPathSections,
      columnWidth: spanNameColumnWidth,
      detailState: detailStates.get(spanID),
      hoverIndentGuideIds,
      onChildrenToggle: childrenToggle,
      onDetailToggle: detailToggle,
      addHoverIndentGuideId,
      removeHoverIndentGuideId,
    };
  }

  renderRow = (key: string, style: React.CSSProperties, index: number, attrs: {}) => {
    const row = this.buildRenderableRow(index);
    // 行包裹（原 styles.row 仅 width:100%；core 内联，不引 theme/ui，保 AD-2）。
    return (
      <div key={key} style={{ width: '100%', ...style }} {...attrs}>
        {this.props.rowRenderer(row)}
      </div>
    );
  };

  render() {
    const { scrollElement, redrawListView } = this.props;

    return (
      <ListView
        ref={this.setListView}
        dataLength={this.getRowStates().length}
        itemHeightGetter={this.getRowHeight}
        itemRenderer={this.renderRow}
        viewBuffer={BUFFER_SIZE}
        viewBufferMin={BUFFER_SIZE}
        getKeyFromIndex={this.getKeyFromIndex}
        getIndexFromKey={this.getIndexFromKey}
        windowScroller={false}
        scrollElement={scrollElement}
        redraw={redrawListView ?? EMPTY_REDRAW}
      />
    );
  }
}

// 稳定空对象，避免每次 render 触发 ListView redraw prop 变化。
const EMPTY_REDRAW = {};
