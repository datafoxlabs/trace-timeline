// 手写 3-span DataFox fixture——只服务单测，覆盖 `dataFoxFixture`（大型合成 trace）
// 天然没有的解码分支：错误 span / exception → statusCode 2、events → logs、
// {resource,span}_attributes_raw → tags。使用 DataFrame 列式结构。
// 不从 `datasources/datafox` 子路径导出：宿主用不到，demo 用大型合成 fixture。
import type { DataFoxResponse } from './fromDataFox';

const FIELDS = [
  'trace_id',
  'span_id',
  'parent_span_id',
  'timestamp', // epoch ms
  'duration', // ns
  'service_name',
  'operation_name',
  'span_name',
  'resource_name',
  'span_kind',
  'status_code',
  'status_message',
  'exception_type',
  'exception_message',
  'resource_attributes_raw',
  'span_attributes_raw',
  'events',
  'scope_name',
  'scope_version',
] as const;

// 3 span：root server(GET /user) → client(GET /order，跨服务) → 孤儿父子(parent 不在结果集→按 root)
const TID = 'aabbccddeeff00112233445566778899';
const T0_MS = 1_700_000_000_000; // epoch ms

type Row = Record<(typeof FIELDS)[number], unknown>;

const rows: Row[] = [
  {
    trace_id: TID,
    span_id: 'sp-root',
    parent_span_id: '',
    timestamp: T0_MS,
    duration: 102_000_000, // 102ms in ns
    service_name: 'mall-order-api',
    operation_name: 'GET /user',
    span_name: 'servlet.request',
    resource_name: 'GET /user',
    span_kind: 'server',
    status_code: 'Ok',
    status_message: '',
    exception_type: '',
    exception_message: '',
    resource_attributes_raw: JSON.stringify({ 'telemetry.sdk.language': 'java' }),
    span_attributes_raw: JSON.stringify({ 'http.method': 'GET', 'http.status_code': 200, 'http.url': 'http://localhost:9001/user' }),
    events: JSON.stringify([]),
    scope_name: 'io.opentelemetry.servlet',
    scope_version: '1.0',
  },
  {
    trace_id: TID,
    span_id: 'sp-order',
    parent_span_id: 'sp-root',
    timestamp: T0_MS + 40, // +40ms
    duration: 18_500_000, // 18.5ms
    service_name: 'user-service',
    operation_name: 'GET /order',
    span_name: 'GET /order',
    resource_name: 'GET /order',
    span_kind: 'client',
    status_code: 'Ok',
    status_message: '',
    exception_type: '',
    exception_message: '',
    resource_attributes_raw: JSON.stringify({}),
    span_attributes_raw: JSON.stringify({ 'http.status_code': 200, 'peer.service': 'user-service' }),
    events: JSON.stringify([{ timestamp: (T0_MS + 45) * 1_000_000, name: 'rpc.start', attributes: { rpc: 'grpc' } }]),
    scope_name: '',
    scope_version: '',
  },
  {
    trace_id: TID,
    span_id: 'sp-err',
    parent_span_id: 'sp-root',
    timestamp: T0_MS + 60,
    duration: 34_900_000, // 34.9ms
    service_name: 'mall-order-api',
    operation_name: 'GET /error',
    span_name: 'GET /error',
    resource_name: 'GET /error',
    span_kind: 'server',
    status_code: 'Error',
    status_message: 'internal error',
    exception_type: 'NullPointerException',
    exception_message: 'npe at line 42',
    resource_attributes_raw: JSON.stringify({ 'telemetry.sdk.language': 'java' }),
    span_attributes_raw: JSON.stringify({ 'http.method': 'GET', 'http.status_code': 500 }),
    events: JSON.stringify([]),
    scope_name: '',
    scope_version: '',
  },
];

// 行式 → 列式（DataFrame data.values 按字段列存）。
const values = FIELDS.map((f) => rows.map((r) => r[f]));

export const dataFoxSyntheticFixture: DataFoxResponse = {
  data: {
    A: {
      frames: [
        {
          schema: { fields: FIELDS.map((name) => ({ name })) },
          data: { values },
        },
      ],
    },
  },
};
