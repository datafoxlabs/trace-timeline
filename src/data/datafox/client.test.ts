import { describe, expect, it, vi } from 'vitest';
import { detailFixture } from '../../model/adapters/datafox-detail-fixture';
import { createDataFoxTraceUrl, fetchTrace, fetchTraceDetail } from './client';

const options = { baseUrl: 'https://datafox.test/proxy/' };
const mockFetch = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => detailFixture() }));
describe('DataFox detail client', () => {
  it('uses a single GET with bracketed filters, no body or ambient credentials', async () => {
    const fetch = mockFetch(); const signal = new AbortController().signal;
    const result = await fetchTraceDetail('trace-1', { ...options, environment: 'test', from: 'now-24h', to: 'now', fetch, signal });
    expect(result.trace?.spans).toHaveLength(2);
    expect(fetch).toHaveBeenCalledOnce();
    const [raw, init] = (fetch.mock.calls as unknown as [string, RequestInit][])[0]; const url = new URL(raw);
    expect(url.pathname).toBe('/proxy/api/v3/traces/trace-1');
    expect(Object.fromEntries(url.searchParams)).toEqual({ env: 'test', dataset: 'ingestedSpans', 'filter[from]': 'now-24h', 'filter[to]': 'now' });
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', signal }); expect(init.body).toBeUndefined();
  });
  it('preserves fetchTrace return type and explicitly provided headers', async () => {
    const fetch = mockFetch(); expect((await fetchTrace('trace-1', { ...options, fetch, headers: { authorization: 'Bearer test' } }))?.spans).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { Accept: 'application/json', authorization: 'Bearer test' } }));
  });
  it('rejects invalid requests before effects', async () => {
    const fetch = mockFetch();
    for (const invalid of [{ baseUrl: 'invalid' }, { environment: '*' }, { limit: 500 }, { from: 'secret' }, { baseUrl: 'https://x/?secret=1' }]) {
      await expect(fetchTraceDetail('trace-1', { ...options, ...invalid, fetch })).rejects.toThrow();
    }
    await expect(fetchTraceDetail('../secret', { ...options, fetch })).rejects.toThrow('traceId'); expect(fetch).not.toHaveBeenCalled();
    expect(() => createDataFoxTraceUrl('trace-1', { ...options, from: '2026-09-19T00:00:00Z', to: '2026-09-18T00:00:00Z' })).toThrow('precede');
  });
  it('cancels before I/O and translates server/transport failures without secrets', async () => {
    const fetch = mockFetch(); const controller = new AbortController(); controller.abort();
    await expect(fetchTraceDetail('trace-1', { ...options, fetch, signal: controller.signal })).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    await expect(fetchTraceDetail('trace-1', { ...options, fetch: async () => { throw Error('secret'); } })).rejects.toThrow('Trace network: request failed');
    await expect(fetchTraceDetail('trace-1', { ...options, fetch: async () => ({ ok: false, status: 503, json: async () => 'secret' }) })).rejects.toThrow('503');
    await expect(fetchTraceDetail('trace-1', { ...options, fetch: async () => ({ ok: true, status: 200, json: async () => { throw Error('secret'); } }) })).rejects.toThrow('expected JSON');
  });
});
