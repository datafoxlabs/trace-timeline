import { DataFoxTraceError, parseDataFoxTraceDetail } from '../../model/adapters/datafoxTraceDetail';

export type FetchLike = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface FetchTraceOptions {
  baseUrl: string;
  environment?: string;
  dataset?: 'ingestedSpans';
  from?: string;
  to?: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** @deprecated The detail endpoint owns truncation; specifying limit is rejected. */
  limit?: number;
}

export function createDataFoxTraceUrl(traceId: string, options: FetchTraceOptions): string {
  if (typeof traceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(traceId)) throw new DataFoxTraceError('traceId', 'invalid identifier');
  if (!options?.baseUrl) throw new DataFoxTraceError('baseUrl', 'required');
  let url: URL;
  try { url = new URL(options.baseUrl); } catch { throw new DataFoxTraceError('baseUrl', 'expected HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new DataFoxTraceError('baseUrl', 'expected HTTP(S) origin and optional path');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v3/traces/${encodeURIComponent(traceId)}`;
  const environment = options.environment ?? 'test';
  if (typeof environment !== 'string' || !environment || environment.trim() !== environment || environment === '*' || /[\u0000-\u001f\u007f]/.test(environment)) throw new DataFoxTraceError('environment', 'expected specific environment');
  if (options.dataset !== undefined && options.dataset !== 'ingestedSpans') throw new DataFoxTraceError('dataset', 'expected ingestedSpans');
  if (options.limit !== undefined) throw new DataFoxTraceError('limit', 'detail endpoint uses isTruncated, not a client page limit');
  url.searchParams.set('env', environment);
  url.searchParams.set('dataset', 'ingestedSpans');
  const from = options.from ?? 'now-24h';
  const to = options.to ?? 'now';
  for (const [name, value] of [['from', from], ['to', to]]) {
    if (typeof value !== 'string' || !(/^now(?:[-+]\d+[smhdw])?$/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)))) throw new DataFoxTraceError(`filter[${name}]`, 'expected relative or ISO time');
    url.searchParams.set(`filter[${name}]`, value);
  }
  if (!from.startsWith('now') && !to.startsWith('now') && Date.parse(from) >= Date.parse(to)) throw new DataFoxTraceError('filter[from/to]', 'start must precede end');
  return url.href;
}

/** GET detail including truncation, events and entity metadata. */
export async function fetchTraceDetail(traceId: string, options: FetchTraceOptions) {
  const url = createDataFoxTraceUrl(traceId, options);
  options.signal?.throwIfAborted();
  const doFetch = options.fetch ?? globalThis.fetch;
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await doFetch(url, { method: 'GET', headers: { Accept: 'application/json', ...options.headers }, signal: options.signal,
      credentials: 'omit', redirect: 'error', cache: 'no-store' });
  } catch {
    options.signal?.throwIfAborted();
    throw new DataFoxTraceError('network', 'request failed');
  }
  if (!response.ok) throw new DataFoxTraceError('HTTP', `request failed (${response.status})`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new DataFoxTraceError('response', 'expected JSON'); }
  options.signal?.throwIfAborted();
  return parseDataFoxTraceDetail(payload, traceId);
}

/** Compatibility convenience: callers needing completeness metadata use fetchTraceDetail. */
export async function fetchTrace(traceId: string, options: FetchTraceOptions) {
  return (await fetchTraceDetail(traceId, options)).trace;
}
