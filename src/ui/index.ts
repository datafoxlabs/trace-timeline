// ui 原语层导出（Story 1.4）。
// Story 9.3e：Icon（lucide 包装）已删除——图标一律取自 datafox `@datafox/ui` 的 DRUIDS icon set（441 个）。
// 这是对公共 API 的破坏性变更：`Icon` / `IconProps` 不再导出。
export { Tooltip, type TooltipProps } from './Tooltip';
