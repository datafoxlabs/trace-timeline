import type { Trace } from './types';

/** A view projection: keep original timestamps and span references for details. */
export function traceSubtree(trace: Trace | null | undefined, rootId?: string) {
  if (!trace || !rootId) return trace;
  const rootIndex = trace.spans.findIndex(span => span.spanID === rootId);
  if (rootIndex < 0) return trace;
  const root = trace.spans[rootIndex];
  let end = rootIndex + 1;
  // Trace spans are in tree preorder; the next peer/ancestor ends this subtree.
  while (end < trace.spans.length && trace.spans[end].depth > root.depth) end++;
  return { ...trace, spans: trace.spans.slice(rootIndex, end).map(span => ({ ...span, depth: span.depth - root.depth })) };
}
