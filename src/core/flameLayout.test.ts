import { describe, expect, it } from 'vitest';

import { mockTrace } from '../model';

import { computeFlameLayout } from './flameLayout';

describe('computeFlameLayout', () => {
  it('keeps every span visible with children below parents', () => {
    const { rows } = computeFlameLayout(mockTrace);
    expect(rows).toHaveLength(mockTrace.spans.length);
    const byId = new Map(rows.map(row => [row.spanID, row]));
    for (const span of mockTrace.spans) {
      for (const child of span.childSpanIds) {
        expect(byId.get(child)!.depth).toBeGreaterThan(byId.get(span.spanID)!.depth);
      }
    }
    for (const [index, row] of rows.entries()) {
      for (const other of rows.slice(index + 1)) {
        if (row.depth !== other.depth) continue;
        expect(row.left + row.width <= other.left + 1e-9 || other.left + other.width <= row.left + 1e-9).toBe(true);
      }
    }
  });

  it('全视图：width ≈ duration/trace.duration，root left≈0', () => {
    const { rows } = computeFlameLayout(mockTrace);
    rows.forEach((row, i) => {
      const span = mockTrace.spans[i];
      const expectedWidth = span.duration / mockTrace.duration;
      expect(row.width).toBeCloseTo(expectedWidth, 5);
      const expectedLeft = (span.startTime - mockTrace.startTime) / mockTrace.duration;
      expect(row.left).toBeCloseTo(expectedLeft, 5);
    });
    // root（depth 0，startTime = trace.startTime）left≈0、width≈1
    const root = rows.find((_, i) => mockTrace.spans[i].depth === 0)!;
    expect(root.left).toBeCloseTo(0, 5);
    expect(root.width).toBeCloseTo(1, 5);
  });

  it('缩放视口 [0.25,0.75]：位置按窗口重映射', () => {
    const full = computeFlameLayout(mockTrace, { viewStart: 0, viewEnd: 1 });
    const zoom = computeFlameLayout(mockTrace, { viewStart: 0.25, viewEnd: 0.75 });
    // 窗口缩到一半 → 同一 span 宽度翻倍
    zoom.rows.forEach((row, i) => {
      expect(row.width).toBeCloseTo(full.rows[i].width * 2, 5);
    });
    // root 左缘从 0 移到 -0.5（视口起点在 root 内部）
    const rootIdx = mockTrace.spans.findIndex((s) => s.depth === 0);
    expect(zoom.rows[rootIdx].left).toBeCloseTo(-0.5, 5);
  });

  it('memoize：相同入参返回同一引用', () => {
    const a = computeFlameLayout(mockTrace);
    const b = computeFlameLayout(mockTrace);
    expect(a).toBe(b);
  });

  it('separates concurrent siblings without changing time positions', () => {
    const { rows } = computeFlameLayout(mockTrace);
    const s2 = rows.find(row => row.spanID === 's2')!;
    const s7 = rows.find(row => row.spanID === 's7')!;
    expect(s7.depth).toBeGreaterThan(s2.depth);
    expect(s7.left).toBeLessThan(s2.left + s2.width);
    expect(rows.find(row => row.spanID === 's8')!.depth).toBeGreaterThan(s7.depth);
  });

  it('separates overlapping missing-parent roots, including out-of-order start times', () => {
    const a = { ...mockTrace.spans[0], spanID: 'a', depth: 0, startTime: 50, duration: 40, childSpanIds: [] };
    const b = { ...a, spanID: 'b', startTime: 20 };
    const { rows } = computeFlameLayout({ ...mockTrace, spans: [a, b], startTime: 0, duration: 100 });
    expect(rows[0].depth).not.toBe(rows[1].depth);
    expect(rows[1].left).toBe(0.2);
  });

  it('退化区间（trace.duration=0）不产 NaN（M1 修复）', () => {
    const degen = { ...mockTrace, duration: 0 };
    const { rows } = computeFlameLayout(degen);
    expect(rows.length).toBe(mockTrace.spans.length);
    rows.forEach((r) => {
      expect(Number.isFinite(r.left)).toBe(true);
      expect(Number.isFinite(r.width)).toBe(true);
    });
  });

  it('focusRootSpanId（re-root，Story 6.7）：只取子树 + depth 重基 + root 铺满', () => {
    // s7 = GET /order（depth1），子树 = {s7,s8,s9}
    const { rows } = computeFlameLayout(mockTrace, undefined, 's7');
    const ids = rows.map((r) => r.spanID).sort();
    expect(ids).toEqual(['s7', 's8', 's9']);
    // 祖先 s1/s2 不在
    expect(rows.find((r) => r.spanID === 's1')).toBeUndefined();
    // root s7 depth 重基为 0、铺满
    const root = rows.find((r) => r.spanID === 's7')!;
    expect(root.depth).toBe(0);
    expect(root.left).toBeCloseTo(0, 5);
    expect(root.width).toBeCloseTo(1, 5);
    // 子孙 depth 重基（s8=1, s9=2）
    expect(rows.find((r) => r.spanID === 's8')!.depth).toBe(1);
    expect(rows.find((r) => r.spanID === 's9')!.depth).toBe(2);
  });
});
