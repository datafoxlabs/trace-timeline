/** Synthetic detail response: millisecond spans, nanosecond durations, RFC3339 events. */
export function detailFixture(rows?: Record<string, unknown>[]) {
  const base = { timestamp: 1789690000000, trace_id: 'trace-1', span_id: 'root', parent_span_id: '', service_name: 'gateway', resource_name: '/orders', operation_name: 'request', duration: 10000000, status_code: 'Ok', span_attributes_raw: {}, resource_attributes_raw: {}, 'events.timestamp': [], 'events.name': [], 'events.attributes': [] };
  const spans = rows ?? [{}, { span_id: 'child', parent_span_id: 'root', service_name: 'orders', 'events.timestamp': ['2026-09-18T09:24:02.599967609+08:00'], 'events.name': ['exception'], 'events.attributes': [{ 'exception.message': 'test failure' }] }];
  const names = Object.keys(base);
  return { dataset: 'ingestedSpans', data: { traceId: 'trace-1', isTruncated: false,
    results: { A: { status: 200, frames: [{ schema: { fields: names.map((name) => ({ name })) }, data: { values: names.map((name) => spans.map((row) => ({ ...base, ...row })[name])) } }] } },
    entities: { database: { id: 'database', name: 'postgres', nameTagKey: 'peer.service', entityType: 'database', technology: 'postgresql', inferred: true, identityTags: { 'peer.service': 'postgres' } } },
    spanToEntityId: spans.some((row) => row.span_id === 'child') ? { child: 'database' } : {} } };
}
