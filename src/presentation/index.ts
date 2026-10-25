// presentation 层公共导出（Story 1.6）——Datadog 皮肤：行/条/标签/缩进竖线/刻度表头 + rowRenderer 工厂。
export { createDatadogRowRenderer, type DatadogSkinOptions } from './rowRenderer';
export { defaultColorAccessor, colorAccessorForDimension, httpStatusToken, type ColorAccessor } from './colorAccessor';
export { DdSpanRow } from './DdSpanRow';
export { DdSpanBar } from './DdSpanBar';
export { DdLabelCell } from './DdLabelCell';
export { DdIndentGuides } from './DdIndentGuides';
export { DdTicks } from './DdTicks';
export { DdViewingLayer, type DdViewingLayerProps } from './DdViewingLayer';
// Story 9.4c：拖拽态对齐真页 DRUIDS Table resizer。**行为破坏性变更**：`onChange` 由「松手提交一次」
// 改为「拖拽中持续提交 + 松手提交终值」（真页/datafox 语义）。消费方若在 onChange 里做重活需自行节流。
export { DdColumnResizer, RESIZER, type DdColumnResizerProps } from './DdColumnResizer';
export { DdSpanDetail } from './DdSpanDetail';
export { DdSpanDetailHeader } from './DdSpanDetailHeader';
export { DdSpanDetailTabs } from './DdSpanDetailTabs';
export { DdAccordian } from './DdAccordian';
export { DdHttpRequestBar } from './DdHttpRequestBar';
export { DdKeyValuesTable } from './DdKeyValuesTable';
export { buildAttributeGroups, type AttrGroup, type AttrRow } from './attributeGroups';
export { DdSearchBar } from './DdSearchBar';
export { DdColorByDropdown, type ColorByDimension } from './DdColorByDropdown';
export { DdShareButton, DdSpanLinks, DdFlameGraph, type DetailStubs } from './detailStubs';
export { DdTimelineHeader, HEADER_HEIGHT } from './DdTimelineHeader';
// Story 9.4：hover 交互态。9.4b：药丸改用 datafox Tooltip，火焰图共用同一游标。
// **公共 API 破坏性变更**：`DdTimeCursor` 的 props 由 `{cursorX, width, columnWidth, viewDuration, viewStart, viewEnd}`
// 改为 `{cursorX, geo, anchorY?}`；`CURSOR` 的成员由 `pillW/pillH/pillRadius/triangleW/triangleH/trianglePath`
// 改为 `pillH/arrowW/arrowH`（药丸尺寸现由 datafox TooltipContent 决定）。
export {
  DdTimeCursor,
  DdTimeCursorLayer,
  axisGeometry,
  flameGeometry,
  timeAtCursor,
  CURSOR,
  CURSOR_ANCHOR_Y,
  type AxisGeometry,
} from './DdTimeCursor';
export { DdTimelineCollapser, type DdTimelineCollapserProps } from './DdTimelineCollapser';
export { DdFlameGraphView, type DdFlameGraphViewProps } from './DdFlameGraphView';
export { DdViewTabs, type DdViewTabsProps, type TraceViewMode } from './DdViewTabs';
export { DdFlameRuler, type DdFlameRulerProps } from './DdFlameRuler';
export { DdFlameControls, type DdFlameControlsProps } from './DdFlameControls';
export { DdFlameMinimap, type DdFlameMinimapProps } from './DdFlameMinimap';
export { DdFlameLegend, type DdFlameLegendProps } from './DdFlameLegend';
