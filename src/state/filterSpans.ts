import type { TraceSpan } from '../model';
import { createSpanSearchRecords, parseSpanSearch } from './spanSearchQuery';

/** Empty queries leave the trace unfiltered. Invalid queries never match a span. */
export function filterSpans(query: string, spans: TraceSpan[] | null | undefined): Set<string> | undefined {
  if (!spans || !query.trim()) return undefined;
  const parsed = parseSpanSearch(query);
  return new Set(createSpanSearchRecords(spans).filter(parsed.matches).map(record => record.span.spanID));
}
