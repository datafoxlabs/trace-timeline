import { describe, expect, it } from 'vitest';

import { niceTickValues, tickStep } from './ticks';

// Story 9.3 复审（AC #12）：刻度取整步长，对齐真页 `trace_svg_x-axis` 实测。
describe('tickStep（d3 tickIncrement 同构）', () => {
  it('54.1ms / hint 10 → 步长 5ms（真页实测：0,5ms,…,50ms 共 11 刻度）', () => {
    expect(tickStep(0, 54_100, 10)).toBe(5_000);
  });

  it('按 error 落在 1/2/5/10 档', () => {
    expect(tickStep(0, 100, 10)).toBe(10); // error 1.0  → ×1
    expect(tickStep(0, 150, 10)).toBe(20); // error 1.5  → ×2
    expect(tickStep(0, 400, 10)).toBe(50); // error 4.0  → ×5
    expect(tickStep(0, 800, 10)).toBe(100); // error 8.0 → ×10
  });
});

describe('niceTickValues', () => {
  it('真页复现：0..54.1ms / hint 10 → 11 个整 5ms 刻度', () => {
    const v = niceTickValues(0, 54_100, 10);
    expect(v).toEqual([0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000, 50_000]);
  });

  it('demo trace（102ms / hint 10）→ 0..100ms 整 10ms 步长（不再出现 25.5ms 这类脏值）', () => {
    expect(niceTickValues(0, 102_000, 10)).toEqual([
      0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000,
    ]);
  });

  it('缩放子区间：只在可见时间窗内取整刻度', () => {
    // 视窗 [20ms, 60ms]，hint 4 → 步长 10ms
    expect(niceTickValues(20_000, 60_000, 4)).toEqual([20_000, 30_000, 40_000, 50_000, 60_000]);
  });

  it('起点非整步长时向上取整（不越出窗左）', () => {
    const v = niceTickValues(23_000, 61_000, 4);
    expect(v[0]).toBeGreaterThanOrEqual(23_000);
    expect(v[v.length - 1]).toBeLessThanOrEqual(61_000);
    expect(v).toEqual([30_000, 40_000, 50_000, 60_000]);
  });

  it('退化输入不抛：stop <= start 时返回单点', () => {
    expect(niceTickValues(5, 5, 10)).toEqual([5]);
    expect(niceTickValues(10, 5, 10)).toEqual([10]);
  });

  it('窗口极窄导致区间内无整刻度时，兜底返回两端', () => {
    const v = niceTickValues(1.0000001, 1.0000002, 10);
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(v[0])).toBe(true);
  });

  it('刻度恒落在 [start, stop] 闭区间内', () => {
    for (const [a, b] of [
      [0, 1],
      [0, 7],
      [3, 999],
      [0, 54_100],
      [12_345, 98_765],
    ]) {
      for (const t of niceTickValues(a, b, 10)) {
        expect(t).toBeGreaterThanOrEqual(a);
        expect(t).toBeLessThanOrEqual(b);
      }
    }
  });
});
