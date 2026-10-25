# @datafox/trace-timeline

[![CI](https://github.com/datafoxlabs/trace-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/datafoxlabs/trace-timeline/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

## 开发与运行

需要 Node.js 20+。克隆本仓库后运行：

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

`@datafox/ui` 尚未发布到公共 npm。本仓库使用从固定公开源码版本构建的依赖包，
`npm ci` 会自动安装；来源、校验和与重建方式见 [vendor/README.md](vendor/README.md)。
所有示例 Trace 均为合成数据，不需要后端或访问凭据。

## 用法

```tsx
import '@datafox/ui/styles.css';
import { TraceTimeline, loadTrace } from '@datafox/trace-timeline';
import { otlpDataSource } from '@datafox/trace-timeline/datasources/otlp';

const trace = loadTrace(otlpDataSource, otlpResponse);
<TraceTimeline trace={trace} />;
```

在其他项目消费本库时，需要同时安装 `@datafox/ui`（可使用本仓库 `vendor/` 下的包），
并引入其样式表。适配器扩展见 [数据源开发指南](docs/writing-a-trace-data-source.md)。

Datadog 风格的 Trace Timeline React 组件库。

- **视觉**：对标 Datadog APM Waterfall（仅顶圆角条、服务色缩进竖线、行内 HTTP 状态 pill、Color-by、DRUIDS 令牌）
- **引擎**：移植自 Grafana TraceTimeline（虚拟滚动 / span 树 / 时间映射 / 交互）
- **数据**：DataFox（`fromDataFox` 适配 + 可选 `fetchTrace` 助手），内部统一 Trace 模型
- **打包**：ESM-only + d.ts；`react`/`react-dom` 作 peer；零 `@grafana/*` 依赖

## 脚本

| 命令 | 作用 |
|------|------|
| `npm run build` | tsup 构建 ESM + d.ts → `dist/` |
| `npm run typecheck` | `tsc --noEmit` 严格类型检查 |
| `npm test` | vitest 单测（jsdom） |
| `npm run dev` | vite 启动 demo 占位页 |

## Foundation：`@datafox/ui`

waterfall 区域（工具条 / 表头 / span 行）的 emotion 颜色吃 `@datafox/ui` 的 `--ui-*` CSS 变量（`src/presentation/uiTokens.ts` 为桥接层）。**消费方须引入 datafox styles.css**，否则 `var(--ui-*)` 无定义：

```ts
import '@datafox/ui/styles.css'; // 提供 --ui-* 变量 + .dark {} 明暗块
```

明暗由组件根**作用域 `.dark`** class 驱动（`<TraceTimeline>` 按 `colorMode` 挂在自身子树，不碰 `document.documentElement`），颜色靠 CSS 级联切换、几何仍走 theme。服务分类色（Datadog 20 色）为 Foundation 唯一例外，不桥接 datafox dataviz。

## 目录（七层架构）

```
src/
  api/          对外 <TraceTimeline> + 导出（注入皮肤）
  presentation/ Datadog 皮肤（行/条/标签/缩进/详情/工具条）
  core/         引擎（虚拟滚动、rowRenderer 契约，零 Datadog import）
  state/        useTraceTimelineState（受控/非受控）
  model/        Trace 类型 + transform + dataSource 契约 + adapters/{fromDataFox,fromOtlp} 解码器
  datasources/  数据源子路径导出（datafox / otlp）
  theme/        createTheme(DRUIDS) + useStyles2 + colorGenerator
  ui/           Tooltip 原语（图标一律取自 @datafox/ui 的 DRUIDS icon set）
  data/datafox/ 可选 fetchTrace 助手
```


## 宿主详情选择

`selectedSpanId` / `onSelectedSpanIdChange` 支持 URL 驱动的详情选择。`undefined` 使用原有非受控行为，`null` 表示受控取消选中。选择与 `focusedSpanId` 的滚动定位独立；完整 state 逃生舱不接管详情选择。

### 宿主提示与空选择内容（0.1.7）

`afterViewTabs?: ReactNode` 在 Trace Tabs 下方、搜索栏上方渲染宿主内容，不传时不添加占位元素。
`emptySelectionContent?: ReactNode` 仅在没有有效选中 Span 时渲染；在 `fitContainer` 模式下保留可拖拽的下方详情区域。
这两个插槽均可选，原有消费者行为不变。数据缺失判断与提示文案由宿主负责，组件不推断缺失原因或自动选择替代 Span。

### DataFox Trace 详情接口（0.1.2）

```ts
import { fetchTraceDetail } from '@datafox/trace-timeline/datasources/datafox';
const detail = await fetchTraceDetail(traceId, {
  baseUrl: 'https://datafox.example.com',
  environment: 'test', from: 'now-24h', to: 'now', signal,
});
// detail.trace 传给时间线；truncated / missingParents 用于不完整提示。
```

请求为 `GET /api/v3/traces/{traceId}`，query 使用 `env`、`dataset=ingestedSpans`、
`filter[from]`、`filter[to]`，无 body。默认时间范围为 `now-24h` 至 `now`，默认环境为 `test`。
`parseDataFoxTraceDetail(payload, traceId)` 解析 `data.results.A.frames`，保留
`isTruncated`（返回名 `truncated`）、`entities`、`spanToEntityId`。
三列 `events.timestamp/name/attributes` 转为日志；RFC3339 纳秒时间截取到微秒，
Span 的 timestamp 毫秒及 duration 纳秒转为内部微秒。
`eventsAvailable` 区分事件列缺失与空事件；返回的空帧对应 `trace: null`。
实体映射同时作为 `datafox.entity.*` 标签展示，推断出的远端实体不会替换 Span 所属服务或生成虚构 Span。

`fetchTrace` 保留 `Trace | null` 返回形式，但迁移为上述 GET 接口；原 `limit` 参数不再支持，
传入会报错，由后端 `isTruncated` 描述截断。需要完整性信息的调用方应使用 `fetchTraceDetail`。
旧 Search 响应的 `fromDataFox` / `decodeDataFox` 保持兼容。请求省略环境凭据；需要认证时由调用方显式传入 headers。

### Span 定位（0.1.3）

选中 Span、外部焦点或搜索命中变化时，仅展开目标的祖先链，并在行可见后滚动定位。
后续手动折叠与滚动不会被自动定位反复覆盖。全量受控模式通过 `onStateChange`
请求折叠集合更新，宿主仍拥有最终状态；搜索导航从 0.1.8 起会请求同步更新详情选择（受控时通过 onSelectedSpanIdChange）。

### Bounded split layout (0.1.4)

Pass `fitContainer` inside a parent with a bounded height to fill its space. The trace toolbar stays above a resizable waterfall/detail split; detail headers stay fixed while attributes scroll. `defaultColumnWidthPixels` initializes the name column to 444 CSS pixels and preserves its width when the parent resizes. Existing `height` / `drawerHeight` layout remains the default.


### Trace-local RichSearchBar (0.1.8)

The search toolbar consumes the public Datafox RichSearchBar, with the same editor,
Pill, suggestions, caret anchoring and keyboard contracts across host applications.
The local adapter indexes only returned spans; suggestion counts deduplicate values
per span. It never queries the backend or suggests values from other traces.

Draft text applies on Enter; choosing a complete value/history applies immediately.
Invalid syntax keeps the previous results and displays a recoverable error. Recent
queries stay in this mounted trace only. Clear removes the query, preserving Errors
and the current detail. Errors is hidden when its count is zero.

Supported local syntax: free text, field:value, quoted values, field:(a OR b),
-field:value, field:*, wildcard values, numeric comparisons and inclusive [a TO b].
Space-separated clauses intersect. duration accepts ns/us/µs/ms/s/m; bare numbers
use nanoseconds, converted from the trace model's microseconds. service,
operation_name, resource_name, span_id and duration are aliases; env and host use
available OTel attributes. Other span/resource attributes accept an optional @.
This local subset is not a backend OQL parser; unsupported boolean syntax is rejected.

Search and Errors highlight matches while retaining the tree. A new search reveals
matching branches once; subsequent manual collapse remains authoritative. Existing
selected matches are preserved. Previous/next wraps and selects the target detail;
no matches or clearing the query leaves detail selection intact. Programmatic
showMatchesOnly remains available for compatibility; the toolbar does not offer it.

### 0.1.9 — OTel error status

Errors count, search filtering and row/descendant error indicators use only OTel `statusCode === 2` (DataFox `status_code: "Error"`). Legacy `error=true` / `"true"` attributes no longer classify a span as an error. HTTP status and exception attributes remain descriptive and do not override Span Status.

### 0.1.10 — Persistent error marker

Waterfall rows show the OTel error icon alongside the HTTP status badge. Search matches remain yellow and selection remains blue; the error icon remains visible in both states. Collapsed descendant errors retain their distinct accessible name. This intentionally differs from Datadog's mutually exclusive status slot.

### 0.1.11 — Waterfall selection

Clicking row whitespace or the timeline selects the span, as does the keyboard-accessible name. Repeated selection keeps details open; use the detail close button (or state `clearSelection`) to clear selection. Expand/collapse and focus controls keep their own actions. With search active, selecting a non-match shows `0/N` and leaves no stale blue search cursor. Previous/next from `0/N` selects the last/first match. Search matching remains yellow, while selected and hovered rows are blue; scroll focus no longer paints a second selected-looking row in the integrated renderer.

### 0.1.12 — Span hover summary and subtree focus

Hovering a Waterfall name cell shows a Datafox Popover with service, operation,
optional resource, duration and percentage of the full trace. Only OTel Error
spans show the error footer. Hovering the timeline does not open this summary.
The focus action selects the target and shows only its subtree with rebased tree
indentation. Waterfall zooms to its duration while retaining the original trace
clock. Search suggestions, matches and Errors count use the focused subtree;
detail percentages continue to use the full trace. Unfocus restores the full
trace and range without clearing selection. Keyboard focus follows the replaced
Focus/Unfocus control. The existing onFocusSpan host override remains supported.

### 0.1.13 — Entity-driven icons

Waterfall rows, hover summaries and detail headers use the same entity icon
resolver. Datafox `entity_type` / `technology` columns now reach presentation;
an associated entity from `spanToEntityId` takes precedence over the columns.
Web/http uses GlobeIcon, database/db/sql uses DatabaseIcon (Redis/Memcached uses
CacheIcon), cache uses CacheIcon, queue uses QueueIcon, and service/custom uses
CogMultiIcon. Unknown explicit entity types use a generic icon labeled Other.
Only spans without an entity type fall back to the existing OTel attribute/name
heuristics. Entity mapping never replaces the owning service or its color.

## 许可证

移植的 Grafana TraceView / Jaeger UI 引擎保留上游 Apache-2.0 版权头。
详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。随包提供的 Noto Sans 字体使用
[SIL OFL 1.1](licenses/NotoSans-OFL.txt)。
