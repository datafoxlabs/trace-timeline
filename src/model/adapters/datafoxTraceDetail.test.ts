import { describe, expect, it } from 'vitest';
import { detailFixture } from './datafox-detail-fixture';
import { parseDataFoxEventTime, parseDataFoxTraceDetail } from './datafoxTraceDetail';

const parse = (value: unknown) => parseDataFoxTraceDetail(value, 'trace-1');
describe('DataFox GET detail parser', () => {
  it('preserves the resource column separately from operation and keeps an explicit resource tag', () => {
    const span = parse(detailFixture([{ resource_name: 'GET /orders', operation_name: 'http.server.request' }])).trace!.spans[0];
    expect(span.operationName).toBe('http.server.request');
    expect(span.tags).toContainEqual({ key: 'resource.name', value: 'GET /orders' });
    const explicit = parse(detailFixture([{ resource_name: 'column fallback', span_attributes_raw: { 'resource.name': 'explicit resource' } }])).trace!.spans[0];
    expect(explicit.tags.filter((tag) => tag.key === 'resource.name')).toEqual([{ key: 'resource.name', value: 'explicit resource' }]);
    const empty = parse(detailFixture([{ resource_name: '' }])).trace!.spans[0];
    expect(empty.tags.some((tag) => tag.key === 'resource.name')).toBe(false);
  });
  it('preserves raw attribute provenance separately from derived tags, including empty inputs', () => {
    const span = parse(detailFixture([{ span_attributes_raw: { 'db.system': 'mysql' }, resource_attributes_raw: { 'service.name': 'source' }, resource_name: 'SELECT' }])).trace!.spans[0];
    expect(span.rawSpanAttributes).toEqual([{ key: 'db.system', value: 'mysql' }]);
    expect(span.rawResourceAttributes).toEqual([{ key: 'service.name', value: 'source' }]);
    expect(span.tags).toContainEqual({ key: 'resource.name', value: 'SELECT' });
    const empty = parse(detailFixture([{ span_attributes_raw: {}, resource_attributes_raw: {} }])).trace!.spans[0];
    expect(empty.rawSpanAttributes).toEqual([]);
    expect(empty.rawResourceAttributes).toEqual([]);
  });
  it('maps hierarchy, units, events and inferred peer metadata without replacing the owning service', () => {
    const result = parse(detailFixture());
    const child = result.trace!.spans.find((span) => span.spanID === 'child')!;
    expect(child).toMatchObject({ depth: 1, duration: 10000, startTime: 1789690000000000, process: { serviceName: 'orders' } });
    expect(child.logs).toEqual([{ name: 'exception', timestamp: 1789694642599967, fields: [{ key: 'exception.message', value: 'test failure' }] }]);
    expect(child.tags).toContainEqual({ key: 'datafox.entity.inferred', value: true });
    expect(result).toMatchObject({ truncated: false, missingParents: 0, eventsAvailable: true, spanToEntityId: { child: 'database' } });
  });
  it('preserves server truncation and missing ancestry, including zero roots', () => {
    const fixture = detailFixture([{ parent_span_id: 'missing' }]); fixture.data.isTruncated = true;
    expect(parse(fixture)).toMatchObject({ truncated: true, missingParents: 1 });
    expect(parse(detailFixture([{ parent_span_id: '0000000000000000' }])).missingParents).toBe(0);
    expect(parse(detailFixture([])).trace).toBeNull();
  });
  it.each([
    [{ trace_id: 'other' }], [{ span_id: '' }], [{ parent_span_id: null }], [{ duration: -1 }], [{ status_code: 'unknown' }],
    [{ parent_span_id: 'root' }], [{ 'events.name': ['exception'] }], [{ span_attributes_raw: 'secret' }],
  ])('rejects invalid spans: %j', (row) => { expect(() => parse(detailFixture([row]))).toThrow(); });
  it('rejects foreign envelopes, unresolved entities, cycles and deep trees', () => {
    const foreign = detailFixture(); foreign.data.traceId = 'foreign'; expect(() => parse(foreign)).toThrow('traceId');
    const entity = detailFixture(); entity.data.spanToEntityId.child = 'missing'; expect(() => parse(entity)).toThrow('spanToEntityId');
    expect(() => parse(detailFixture([{}, {}]))).toThrow('duplicate');
    expect(() => parse(detailFixture([{ parent_span_id: 'child' }, { span_id: 'child', parent_span_id: 'root' }]))).toThrow('cycle');
    expect(() => parse(detailFixture(Array.from({ length: 513 }, (_, i) => ({ span_id: `s${i}`, parent_span_id: i ? `s${i - 1}` : '' }))))).toThrow('512');
  });
  it('distinguishes absent event columns from malformed parallel arrays', () => {
    const fixture = detailFixture(); const frame = fixture.data.results.A.frames[0];
    frame.schema.fields.splice(-3); frame.data.values.splice(-3);
    expect(parse(fixture).eventsAvailable).toBe(false);
    frame.schema.fields.push({ name: 'events.name' }); frame.data.values.push([[], []]);
    expect(() => parse(fixture)).toThrow('events');
  });
  it('keeps microseconds and rejects invalid timestamps without echoing values', () => {
    expect(parseDataFoxEventTime('2026-09-18T01:24:02.599967609Z')).toBe(1789694642599967);
    expect(() => parseDataFoxEventTime('Bearer secret')).toThrow('expected RFC3339');
  });
});
