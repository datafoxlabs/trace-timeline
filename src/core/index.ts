// core 层公共导出（Story 1.5）——引擎：虚拟滚动 + 行状态 + 时间映射 + rowRenderer 契约。
// 约束（AD-2）：core 仅 import model + React + memoize-one/lodash；零 presentation/theme/ui。
export { default as VirtualizedTraceView, DEFAULT_HEIGHTS } from './VirtualizedTraceView';
export type { VirtualizedTraceViewProps } from './VirtualizedTraceView';
export { default as ListView } from './ListView';
export type { TListViewProps } from './ListView';
export { default as Positions } from './ListView/Positions';
export {
  createViewedBoundsFunc,
  findServerChildSpan,
  getHttpStatusCode,
  isClientSpan,
  isErrorSpan,
  isKindClient,
  isServerSpan,
  spanContainsErredSpan,
  spanHasTag,
  PEER_SERVICE,
  type ViewedBoundsFunctionType,
} from './utils';
export { default as computeTraceCriticalPath } from './criticalPath';
export { computeFlameLayout, getFlameSubtreeIds } from './flameLayout';
export type { FlameLayout, FlameLayoutRow, FlameViewRange } from './flameLayout';
export { computeLegendGroups, dimensionKeyFor, dimensionLabelFor, isInferredEntity } from './legendGroups';
export type { LegendGroup, LegendDimension, LegendMetric, LegendOptions } from './legendGroups';
export type { RenderableRow, RowRenderer, RpcInfo, ViewBounds } from './rowRenderer.types';
export type { TNil, ViewRange, ViewRangeTime, ViewRangeTimeUpdate, TUpdateViewRangeTimeFunction } from './types';
