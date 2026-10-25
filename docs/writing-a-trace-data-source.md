# 写一个 Trace 数据源（data source）

`@datafox/trace-timeline` 的核心包是**后端中立**的:渲染层（`<TraceTimeline>` / 火焰图）只认内部派生的 `Trace`,从不关心数据来自哪个后端。要接一个新 trace 后端(Jaeger / Tempo / Zipkin / 你自研的网关…),你只需实现一个**数据源**:把后端的 wire 格式解码成规范的 `TraceResponse`。

## 唯一接缝:`TraceDataSource`

```ts
import type { TraceDataSource } from '@datafox/trace-timeline';

interface TraceDataSource<Raw = unknown> {
  readonly id: string;                       // 'jaeger' | 'tempo' | ...
  decode(raw: Raw): TraceResponse | null;    // 后端原始响应 → 规范 TraceResponse
}
```

适配器**只做解码**,三件事在 `decode` 内完成:

1. **结构归一**:列式 / 嵌套树 → 行式 `spans[]`。
2. **时间归一**:所有时间统一到**微秒(µs)**(`startTime` / `duration` / `logs[].timestamp`)。
3. **父子关系**:由后端的 parent 字段建 `references: [{ refType:'CHILD_OF', spanID, traceID }]`;**孤儿父**(parent 不在结果集)→ 不挂 reference(按 root)。

适配器**不做**:取数(归宿主)、派生(depth / relativeStartTime / services —— 交 `loadTrace`)。

## 渲染:`loadTrace`

```ts
import { loadTrace } from '@datafox/trace-timeline';

const trace = loadTrace(myAdapter, rawResponse);   // TraceResponse → 派生 Trace
// <TraceTimeline trace={trace} />
```

`loadTrace = adapter.decode(raw)` + 复用引擎的 `transformTraceData` 派生。`decode` 返回 `null` → `loadTrace` 返回 `null`(组件走空态)。

## `TraceResponse` 形状(你要产出的东西)

```ts
type TraceResponse = {
  traceID: string;
  processes: Record<string, { serviceName: string; tags: KeyValuePair[] }>;  // 按 service 聚合
  spans: Array<{
    spanID: string; traceID: string; processID: string;   // processID 指向上面 processes 的 key
    operationName: string;
    startTime: number;   // µs
    duration: number;    // µs
    tags?: KeyValuePair[];          // span 属性;错误状态使用 statusCode: 2
    logs: Array<{ timestamp: number; fields: KeyValuePair[]; name?: string }>;  // µs
    kind?: string;                  // 'server' | 'client' | ...
    statusCode?: number;            // 2 = error（引擎据此判错）
    references?: Array<{ refType:'CHILD_OF'; spanID:string; traceID:string }>;
    flags: number;                  // 没有就给 0
  }>;
};
```

## 打包约定

具体数据源**不进主入口**(保持核心后端中立),走**子路径导出**:

```ts
import { datafoxDataSource } from '@datafox/trace-timeline/datasources/datafox';
import { otlpDataSource }    from '@datafox/trace-timeline/datasources/otlp';
```

新增数据源时:在 `src/model/adapters/from<Backend>.ts` 写 `decode<Backend>` + `<backend>Adapter`,在 `src/datasources/<backend>/index.ts` 建子路径 barrel,并在 `tsup.config.ts` 的 `entry` 与 `package.json` 的 `exports` 各加一条。

## 两个参考实现

| 适配器 | wire 形态 | 子路径 | 源码 |
|---|---|---|---|
| **DataFox** | Grafana DataFrame 列式 | `datasources/datafox` | `src/model/adapters/fromDataFox.ts` |
| **OTLP/JSON** | OTel resourceSpans 嵌套树 + AnyValue 属性 + ns 时间 | `datasources/otlp` | `src/model/adapters/fromOtlp.ts` |

两者经**同一个** `loadTrace` 渲染,证明契约对异构后端成立。照着 OTLP 那个写你自己的最省事。
