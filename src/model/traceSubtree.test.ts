import { describe, expect, it } from 'vitest';
import { mockTrace } from './mock-trace';
import { traceSubtree } from './traceSubtree';

describe('traceSubtree', () => {
  it('keeps only the branch, rebases its depth, and preserves trace time and source objects', () => {
    const root = mockTrace.spans.find(s => s.hasChildren && s.depth > 0)!;
    const view = traceSubtree(mockTrace, root.spanID)!;
    expect(view.spans[0].depth).toBe(0);
    expect(view.spans).toHaveLength(root.descendantSpanCount + 1);
    expect(view.startTime).toBe(mockTrace.startTime);
    expect(view.duration).toBe(mockTrace.duration);
    expect(view.spans[0].startTime).toBe(root.startTime);
    expect(root.depth).toBeGreaterThan(0);
    expect(traceSubtree(mockTrace, 'absent')).toBe(mockTrace);
  });
});
