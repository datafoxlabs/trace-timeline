import transformTraceData from '../transform-trace-data';
import type { Trace, TraceLog } from '../types';
import { decodeDataFox } from './fromDataFox';

export interface DataFoxEntity {
  id: string;
  name: string;
  nameTagKey: string;
  identityTags: Record<string, string>;
  entityType: string;
  technology: string;
  inferred: boolean;
}

export interface DataFoxTraceDetail {
  trace: Trace | null;
  truncated: boolean;
  missingParents: number;
  eventsAvailable: boolean;
  entities: Record<string, DataFoxEntity>;
  spanToEntityId: Record<string, string>;
}

export class DataFoxTraceError extends Error {
  constructor(readonly field: string, expectation: string) {
    super(`Trace ${field}: ${expectation}`);
    this.name = 'DataFoxTraceError';
  }
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DataFoxTraceError(field, 'expected object');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new DataFoxTraceError(field, 'expected string');
  return value;
}
function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new DataFoxTraceError(field, 'expected nonnegative safe integer');
  return value;
}

/** Detail event timestamps are RFC3339 strings with up to nanosecond precision. */
export function parseDataFoxEventTime(value: unknown): number {
  const timestamp = text(value, 'events.timestamp');
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(timestamp);
  const milliseconds = Date.parse(timestamp);
  if (!match || !Number.isFinite(milliseconds)) throw new DataFoxTraceError('events.timestamp', 'expected RFC3339 timestamp');
  const microseconds = milliseconds * 1000 + Number((match[1] ?? '').padEnd(6, '0').slice(3, 6));
  if (!Number.isSafeInteger(microseconds) || microseconds < 0) throw new DataFoxTraceError('events.timestamp', 'outside supported microsecond range');
  return microseconds;
}

function parseEntities(value: unknown): Record<string, DataFoxEntity> {
  const entries = Object.entries(object(value, 'data.entities')).map(([id, raw]) => {
    const entity = object(raw, 'entities[]');
    if (entity.id !== id || !id) throw new DataFoxTraceError('entities.id', 'must match entity map key');
    if (typeof entity.inferred !== 'boolean') throw new DataFoxTraceError('entities.inferred', 'expected boolean');
    const identityTags = Object.fromEntries(Object.entries(object(entity.identityTags, 'entities.identityTags')).map(([key, v]) => [key, text(v, 'entities.identityTags[]')]));
    return [id, { id, name: text(entity.name, 'entities.name'), nameTagKey: text(entity.nameTagKey, 'entities.nameTagKey'),
      entityType: text(entity.entityType, 'entities.entityType'), technology: text(entity.technology, 'entities.technology'), inferred: entity.inferred, identityTags }] as const;
  });
  return Object.fromEntries(entries);
}

function countMissingParents(parents: Map<string, string>): number {
  const depths = new Map<string, number>();
  let missing = 0;
  for (const [id, parent] of parents) {
    if (parent && !/^0+$/.test(parent) && !parents.has(parent)) missing++;
    const visiting = new Set<string>();
    let current: string | undefined = id;
    while (current && parents.has(current) && !depths.has(current)) {
      if (visiting.has(current)) throw new DataFoxTraceError('parent_span_id', 'cycle in parent links');
      visiting.add(current);
      if (visiting.size > 512) throw new DataFoxTraceError('parent_span_id', 'depth exceeds 512');
      current = parents.get(current);
    }
    let depth = current ? depths.get(current) ?? 0 : 0;
    for (const spanId of [...visiting].reverse()) {
      if (++depth > 512) throw new DataFoxTraceError('parent_span_id', 'depth exceeds 512');
      depths.set(spanId, depth);
    }
  }
  return missing;
}

/** Validated GET /api/v3/traces/{id} envelope; legacy Search adaptation stays separate. */
export function parseDataFoxTraceDetail(payload: unknown, expectedTraceId: string): DataFoxTraceDetail {
  const response = object(payload, 'response');
  if (response.dataset !== 'ingestedSpans') throw new DataFoxTraceError('dataset', 'expected ingestedSpans');
  const data = object(response.data, 'data');
  if (data.traceId !== expectedTraceId || !expectedTraceId) throw new DataFoxTraceError('data.traceId', 'does not match requested trace');
  if (typeof data.isTruncated !== 'boolean') throw new DataFoxTraceError('data.isTruncated', 'expected boolean');
  const result = object(object(data.results, 'data.results').A, 'data.results.A');
  if (result.status !== 200) throw new DataFoxTraceError('data.results.A.status', 'query failed');
  if (!Array.isArray(result.frames) || result.frames.length !== 1) throw new DataFoxTraceError('frames', 'expected one frame');
  const frame = object(result.frames[0], 'frames[0]');
  const fields = object(frame.schema, 'schema').fields;
  const values = object(frame.data, 'frame.data').values;
  if (!Array.isArray(fields) || !Array.isArray(values) || fields.length !== values.length) throw new DataFoxTraceError('schema.fields/data.values', 'column count mismatch');
  const names = fields.map((field) => text(object(field, 'fields[]').name, 'fields[].name'));
  if (new Set(names).size !== names.length) throw new DataFoxTraceError('fields', 'duplicate column');
  const length = Array.isArray(values[0]) ? values[0].length : 0;
  if (values.some((column) => !Array.isArray(column) || column.length !== length)) throw new DataFoxTraceError('data.values', 'columns must be equal-length arrays');
  const columns = new Map<string, unknown[]>(names.map((name, index) => [name, values[index]]));
  for (const name of ['timestamp', 'trace_id', 'span_id', 'parent_span_id', 'service_name', 'resource_name', 'operation_name', 'duration', 'status_code', 'span_attributes_raw', 'resource_attributes_raw']) {
    if (names.length && !columns.has(name)) throw new DataFoxTraceError(name, 'missing required column');
  }
  const eventColumns = ['events.timestamp', 'events.name', 'events.attributes'];
  const eventsAvailable = eventColumns.every((name) => columns.has(name));
  if (!eventsAvailable && eventColumns.some((name) => columns.has(name))) throw new DataFoxTraceError('events', 'all three event columns are required');
  const logs = new Map<string, TraceLog[]>();
  const parents = new Map<string, string>();
  for (let index = 0; index < length; index++) {
    const get = (name: string) => columns.get(name)?.[index];
    if (get('trace_id') !== expectedTraceId) throw new DataFoxTraceError('trace_id', 'contains another trace');
    const id = text(get('span_id'), 'span_id');
    if (!id || parents.has(id)) throw new DataFoxTraceError('span_id', 'empty or duplicate ID');
    parents.set(id, text(get('parent_span_id'), 'parent_span_id'));
    const start = integer(get('timestamp'), 'timestamp') * 1000;
    if (!Number.isSafeInteger(start)) throw new DataFoxTraceError('timestamp', 'outside microsecond range');
    integer(get('duration'), 'duration');
    for (const name of ['service_name', 'resource_name', 'operation_name']) text(get(name), name);
    if (!['Unset', 'Ok', 'Error'].includes(text(get('status_code'), 'status_code'))) throw new DataFoxTraceError('status_code', 'unknown status');
    for (const name of ['span_kind', 'status_message', 'scope_name', 'scope_version', 'exception_type', 'exception_message']) {
      if (columns.has(name)) text(get(name), name);
    }
    for (const name of ['span_attributes_raw', 'resource_attributes_raw']) object(get(name), name);
    if (!eventsAvailable) continue;
    const [times, eventNames, attributes] = eventColumns.map(get);
    if (!Array.isArray(times) || !Array.isArray(eventNames) || !Array.isArray(attributes) || times.length !== eventNames.length || times.length !== attributes.length) throw new DataFoxTraceError('events', 'parallel arrays must have equal length');
    logs.set(id, times.map((time, eventIndex) => ({ timestamp: parseDataFoxEventTime(time), name: text(eventNames[eventIndex], 'events.name'),
      fields: Object.entries(object(attributes[eventIndex], 'events.attributes')).map(([key, value]) => ({ key, value: value as TraceLog['fields'][number]['value'] })) })));
  }
  const missingParents = countMissingParents(parents);
  const entities = parseEntities(data.entities);
  const spanToEntityId = Object.fromEntries(Object.entries(object(data.spanToEntityId, 'data.spanToEntityId')).map(([spanId, value]) => {
    const entityId = text(value, 'spanToEntityId[]');
    if (!parents.has(spanId) || !Object.prototype.hasOwnProperty.call(entities, entityId)) throw new DataFoxTraceError('spanToEntityId', 'unresolved span or entity');
    return [spanId, entityId];
  }));
  const decoded = decodeDataFox({ data: { A: { frames: [{ schema: { fields: names.map((name) => ({ name })) }, data: { values } }] } } });
  for (const span of decoded?.spans ?? []) {
    span.logs = logs.get(span.spanID) ?? [];
    const entity = entities[spanToEntityId[span.spanID]];
    if (!entity) continue;
    // A mapping may describe the peer of a client span; never replace its owning service.
    span.tags = [...(span.tags ?? []), ...Object.entries({
      'datafox.entity.id': entity.id, 'datafox.entity.name': entity.name,
      'datafox.entity.type': entity.entityType, 'datafox.entity.technology': entity.technology,
      'datafox.entity.inferred': entity.inferred,
      ...Object.fromEntries(Object.entries(entity.identityTags).map(([key, value]) => [`datafox.entity.identity.${key}`, value])),
    }).map(([key, value]) => ({ key, value }))];
  }
  return { trace: decoded ? transformTraceData(decoded) : null, truncated: data.isTruncated, missingParents, eventsAvailable, entities, spanToEntityId };
}
