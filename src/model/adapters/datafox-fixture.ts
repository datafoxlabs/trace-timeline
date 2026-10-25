// Synthetic DataFrame fixture: 96 spans, 12 services and maximum depth 17.
// IDs, services, operations, hosts, timestamps and topology are generated here;
// no production trace data is used. Units: timestamp in ms, duration in ns.
import type { DataFoxResponse } from './fromDataFox';

const FIELDS = [
  'trace_id', 'span_id', 'parent_span_id', 'timestamp', 'duration',
  'service_name', 'operation_name', 'span_name', 'resource_name', 'span_kind',
  'status_code', 'status_message', 'exception_type', 'exception_message',
  'resource_attributes_raw', 'span_attributes_raw', 'events', 'scope_name', 'scope_version',
] as const;

type Row = Record<(typeof FIELDS)[number], unknown>;
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const START_MS = 1_700_000_000_000;
const spanId = (index: number) => `demo-span-${String(index + 1).padStart(3, '0')}`;
const rows: Row[] = [];

for (let index = 0; index < 96; index++) {
  const parent = index < 18 ? index - 1 : (index - 18) % 17;
  const parentStart = parent < 0 ? 0 : parent * 2_125;
  const offsetUs = index < 18 ? index * 2_125 : parentStart + 100 + (index % 8) * 250;
  const durationUs = index < 18 ? 80_000 - index * 4_000 : 25 + (index % 12) * 100;
  const kind = index === 18 ? 'redis' : index === 0 ? 'http.server' : 'internal';
  rows.push({
    trace_id: TRACE_ID,
    span_id: spanId(index),
    parent_span_id: index === 0 ? 'demo-missing-parent' : spanId(parent),
    timestamp: START_MS + offsetUs / 1_000,
    duration: durationUs * 1_000,
    service_name: `demo-service-${String(index % 12 + 1).padStart(2, '0')}`,
    operation_name: index === 0 ? 'GET /orders/{orderId}' : index === 18 ? 'GET' : `process.step.${index}`,
    span_name: '',
    resource_name: '',
    span_kind: kind,
    status_code: 'Ok',
    status_message: '',
    exception_type: '',
    exception_message: '',
    resource_attributes_raw: '{}',
    span_attributes_raw: index === 0 ? JSON.stringify({ requestHost: 'api.example.com' }) : '{}',
    events: '[]',
    scope_name: 'demo.instrumentation',
    scope_version: '1.0.0',
  });
}

// Include sub-millisecond precision and an async span extending beyond the root.
rows[18].duration = 25_000;
rows[95].parent_span_id = spanId(0);
rows[95].timestamp = START_MS + 70;
rows[95].duration = 70_000_000;

export const dataFoxFixture: DataFoxResponse = {
  data: {
    A: {
      frames: [{
        schema: { fields: FIELDS.map((name) => ({ name })) },
        data: { values: FIELDS.map((field) => rows.map((row) => row[field])) },
      }],
    },
  },
};
