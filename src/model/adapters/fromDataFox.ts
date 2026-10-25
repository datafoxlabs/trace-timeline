// DataFox 适配器（Story 5.1；FR-22 / AD-8/AD-14）——把 DataFox `/api/v3/spans/search`
// 响应（Grafana DataFrame 列式 / OTLP 字段）转成内部 Trace。自写列式解析 + 复用 transformTraceData 派生。
// 单位归一化：timestamp(ms)→µs、duration(ns)→µs，均在此边界完成。
// Story 8.1（AD-15）：解码部分抽成 `decodeDataFox(resp): TraceResponse`，并以 `datafoxDataSource`
// 实现通用 `TraceDataSource` 契约；`fromDataFox` 保留为 decode+派生的便捷包装（行为不变，向后兼容）。
import type { TraceDataSource } from '../dataSource';
import transformTraceData from '../transform-trace-data';
import type { Trace, TraceKeyValuePair, TraceLog, TraceProcess, TraceResponse, TraceSpanData } from '../types';

// ——— DataFox DataFrame 形状（实测，addendum E2）———
interface DataFrameField {
  name: string;
}
interface DataFrame {
  schema?: { fields: DataFrameField[] };
  data?: { values: unknown[][] };
}
export interface DataFoxResponse {
  data?: { A?: { frames?: DataFrame[] } };
}

const OK_STATUS = /ok/i;
const ERROR_STATUS = /error/i;

/** OTLP status_code 字符串 → 数值（Unset=0 / Ok=1 / Error=2，引擎 isErrorSpan 用 2）。 */
function mapStatusCode(raw: unknown): number | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  const s = String(raw);
  if (ERROR_STATUS.test(s)) {
    return 2;
  }
  if (OK_STATUS.test(s)) {
    return 1;
  }
  return 0;
}

/** 解析 *_attributes_raw（JSON 串/对象/KV 数组）为 KV 列表。 */
function parseAttrs(raw: unknown): TraceKeyValuePair[] {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) {
      return [];
    }
    try {
      obj = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(obj)) {
    // 已是 [{key,value}] 或 [{k,v}]
    return obj
      .map((it) => {
        const o = it as Record<string, unknown>;
        const key = (o.key ?? o.k) as string | undefined;
        return key != null ? { key, value: (o.value ?? o.v) as TraceKeyValuePair['value'] } : null;
      })
      .filter((x): x is TraceKeyValuePair => x != null);
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: value as TraceKeyValuePair['value'],
    }));
  }
  return [];
}

/** 解析 events 列（JSON 串/数组）为 TraceLog[]（timestamp 归一化到 µs）。 */
function parseEvents(raw: unknown): TraceLog[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) {
      return [];
    }
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr.map((ev) => {
    const e = ev as Record<string, unknown>;
    // event timestamp 多为 ns（与 duration 同源）；> 1e15 视为 ns→µs，否则视为 ms→µs。
    const tsRaw = Number(e.timestamp ?? 0);
    const timestamp = tsRaw > 1e15 ? Math.round(tsRaw / 1000) : Math.round(tsRaw * 1000);
    const fields = parseAttrs(e.attributes);
    const name = e.name != null ? String(e.name) : undefined;
    return { timestamp, fields, name };
  });
}

/**
 * DataFox 响应 → 规范 `TraceResponse`（解码层，AD-15 契约的 `decode`）。
 * 列式→行式；parent_span_id→references[CHILD_OF]（孤儿父按 root，不挂 reference）；
 * {resource,span}_attributes_raw→process.tags/span.tags；events→logs；ms/ns→µs。
 * 派生（depth/services…）不在此——交 transformTraceData（见 fromDataFox / loadTrace）。
 */
export function decodeDataFox(resp: DataFoxResponse): TraceResponse | null {
  const frame = resp?.data?.A?.frames?.[0];
  const fields = frame?.schema?.fields;
  const values = frame?.data?.values;
  if (!frame || !fields || !values || fields.length === 0) {
    return null;
  }

  const idx = new Map<string, number>();
  fields.forEach((f, i) => idx.set(f.name, i));
  const col = (name: string): unknown[] => {
    const i = idx.get(name);
    return i != null && Array.isArray(values[i]) ? values[i] : [];
  };

  const rowCount = (values[0]?.length as number) ?? 0;
  if (rowCount === 0) {
    return null;
  }

  const traceIds = col('trace_id');
  const spanIds = col('span_id');
  const parentIds = col('parent_span_id');
  const timestamps = col('timestamp'); // ms
  const durations = col('duration'); // ns
  const serviceNames = col('service_name');
  const operationNames = col('operation_name');
  const spanNames = col('span_name');
  const resourceNames = col('resource_name');
  const entityTypes = col('entity_type');
  const technologies = col('technology');
  const kinds = col('span_kind');
  const statusCodes = col('status_code');
  const statusMessages = col('status_message');
  const exceptionTypes = col('exception_type');
  const exceptionMessages = col('exception_message');
  const resAttrsRaw = col('resource_attributes_raw');
  const spanAttrsRaw = col('span_attributes_raw');
  const eventsCol = col('events');
  const scopeNames = col('scope_name');
  const scopeVersions = col('scope_version');

  // 已知 spanID 集——用于「孤儿父按 root」判定。
  const knownSpanIds = new Set<string>();
  for (let i = 0; i < rowCount; i++) {
    if (spanIds[i] != null) {
      knownSpanIds.add(String(spanIds[i]));
    }
  }

  // 服务名 → processID。
  const serviceToProcessId = new Map<string, string>();
  const processes: Record<string, TraceProcess> = {};
  let pCounter = 0;
  const processIdFor = (serviceName: string, resAttrs: TraceKeyValuePair[]): string => {
    let pid = serviceToProcessId.get(serviceName);
    if (!pid) {
      pid = `p${++pCounter}`;
      serviceToProcessId.set(serviceName, pid);
      processes[pid] = { serviceName, tags: resAttrs };
    }
    return pid;
  };

  const traceID = traceIds[0] != null ? String(traceIds[0]) : 'unknown-trace';
  const spans: TraceSpanData[] = [];

  for (let i = 0; i < rowCount; i++) {
    const spanID = String(spanIds[i] ?? '');
    if (!spanID) {
      continue;
    }
    const serviceName = String(serviceNames[i] ?? 'unknown');
    const resAttrs = parseAttrs(resAttrsRaw[i]);
    const processID = processIdFor(serviceName, resAttrs);

    // span tags：span_attributes_raw + 派生（kind/status/exception/scope）。
    const rawSpanAttributes = parseAttrs(spanAttrsRaw[i]);
    const tags: TraceKeyValuePair[] = [...rawSpanAttributes];
    // Backend classification is presentation metadata, independent of the owning service.
    for (const [key, value] of [['datafox.entity.type', entityTypes[i]], ['datafox.entity.technology', technologies[i]]] as const) {
      if (typeof value === 'string' && value.trim()) tags.push({ key, value });
    }
    const resourceName = resourceNames[i];
    if (typeof resourceName === 'string' && resourceName && !tags.some((tag) => tag.key === 'resource.name')) {
      tags.push({ key: 'resource.name', value: resourceName });
    }
    const kind = kinds[i] != null ? String(kinds[i]) : undefined;
    if (kind) {
      tags.push({ key: 'span.kind', value: kind });
    }
    const statusCode = mapStatusCode(statusCodes[i]);
    const exType = exceptionTypes[i] != null ? String(exceptionTypes[i]) : '';
    const exMsg = exceptionMessages[i] != null ? String(exceptionMessages[i]) : '';
    if (exType || exMsg) {
      tags.push({ key: 'error', value: true });
      if (exType) {
        tags.push({ key: 'exception.type', value: exType });
      }
      if (exMsg) {
        tags.push({ key: 'exception.message', value: exMsg });
      }
    }

    // 孤儿父按 root：parent 不在结果集 → 无 reference。
    const parentId = parentIds[i] != null ? String(parentIds[i]) : '';
    const references =
      parentId && knownSpanIds.has(parentId)
        ? [{ refType: 'CHILD_OF' as const, spanID: parentId, traceID }]
        : [];

    const startTime = Math.round(Number(timestamps[i] ?? 0) * 1000); // ms → µs
    const duration = Math.round(Number(durations[i] ?? 0) / 1000); // ns → µs

    const operationName = String(
      operationNames[i] || spanNames[i] || resourceNames[i] || 'span'
    );

    spans.push({
      spanID,
      traceID,
      processID,
      operationName,
      startTime,
      duration,
      logs: parseEvents(eventsCol[i]),
      tags,
      rawSpanAttributes,
      rawResourceAttributes: resAttrs,
      kind,
      statusCode: exType || exMsg ? 2 : statusCode,
      statusMessage: statusMessages[i] != null ? String(statusMessages[i]) : undefined,
      instrumentationLibraryName: scopeNames[i] != null ? String(scopeNames[i]) : undefined,
      instrumentationLibraryVersion: scopeVersions[i] != null ? String(scopeVersions[i]) : undefined,
      references,
      flags: 0,
    });
  }

  return { traceID, processes, spans };
}

/**
 * DataFox 响应 → 内部派生 `Trace`（便捷包装；向后兼容 Story 5.1 签名）。
 * = `decodeDataFox` + `transformTraceData`。
 */
export function fromDataFox(resp: DataFoxResponse): Trace | null {
  const response = decodeDataFox(resp);
  return response ? transformTraceData(response) : null;
}

/** DataFox 数据源适配器（AD-15 契约实例）。供 `loadTrace(datafoxDataSource, resp)` 使用。 */
export const datafoxDataSource: TraceDataSource<DataFoxResponse> = {
  id: 'datafox',
  decode: decodeDataFox,
};
