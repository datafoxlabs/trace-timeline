import { describe, expect, it } from 'vitest';
import { mockTrace } from '../model';
import { spanPresentation } from './spanPresentation';
import { CacheIcon, CogMultiIcon, DatabaseIcon, GlobeIcon, QueueIcon } from '@datafox/ui';
import { detailFixture } from '../model/adapters/datafox-detail-fixture';
import { parseDataFoxTraceDetail } from '../model/adapters/datafoxTraceDetail';

describe('span presentation', () => {
  it.each([
    ['web', 'http', GlobeIcon, 'Web'],
    ['http', 'http', GlobeIcon, 'Web'],
    ['database', 'postgresql', DatabaseIcon, 'Database'],
    ['db', 'mysql', DatabaseIcon, 'Database'],
    ['sql', 'mysql', DatabaseIcon, 'Database'],
    ['database', 'redis', CacheIcon, 'Cache'],
    ['cache', 'redis', CacheIcon, 'Cache'],
    ['queue', 'kafka', QueueIcon, 'Queue'],
    ['service', '', CogMultiIcon, 'Service'],
    ['custom', '', CogMultiIcon, 'Custom'],
    ['future-type', '', CogMultiIcon, 'Other'],
  ])('uses entity %s/%s even when OTel hints disagree', (entityType, technology, Icon, type) => {
    const span = { ...mockTrace.spans[0], operationName: 'http.client.request', tags: [
      { key: 'datafox.entity.type', value: entityType },
      { key: 'datafox.entity.technology', value: technology },
      { key: 'db.system', value: 'redis' },
      { key: 'http.method', value: 'GET' },
    ] };
    expect(spanPresentation(span)).toMatchObject({ Icon, type });
  });
  it('carries entity columns through the detail adapter and honors mapped entities', () => {
    const fixture = detailFixture();
    const frame = fixture.data.results.A.frames[0];
    frame.schema.fields.push({ name: 'entity_type' }, { name: 'technology' });
    frame.data.values.push(['queue', 'custom'], ['kafka', '']);
    const { trace } = parseDataFoxTraceDetail(fixture, 'trace-1');
    expect(spanPresentation(trace!.spans.find(s => s.spanID === 'root')!)).toMatchObject({ Icon: QueueIcon, type: 'Queue' });
    expect(spanPresentation(trace!.spans.find(s => s.spanID === 'child')!)).toMatchObject({ Icon: DatabaseIcon, type: 'Database' });
    expect(trace!.spans.find(s => s.spanID === 'child')!.process.serviceName).toBe('orders');
  });
  it('keeps the operation identity while presenting the concrete HTTP route', () => {
    const span = { ...mockTrace.spans[0], operationName: 'http.server.request', tags: [{ key: 'http.route', value: '/orders/:id' }] };
    expect(spanPresentation(span)).toMatchObject({ resourceName: '/orders/:id', type: 'Web' });
    expect(span.operationName).toBe('http.server.request');
  });
  it('recognizes cache commands and falls back without inventing a resource', () => {
    const span = { ...mockTrace.spans[0], operationName: 'redis.query', tags: [{ key: 'db.operation', value: 'SET' }] };
    expect(spanPresentation(span)).toMatchObject({ resourceName: 'SET', type: 'Cache' });
    expect(spanPresentation({ ...span, tags: [] }).resourceName).toBe('redis.query');
  });
});
