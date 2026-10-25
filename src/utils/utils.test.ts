import { describe, expect, it } from 'vitest';

import { formatDuration, formatSpanDuration } from './date';
import { toFloatPrecision } from './number';

describe('formatDuration', () => {
  it('µs/ms/s 小数单位', () => {
    expect(formatDuration(500)).toBe('500μs');
    expect(formatDuration(1500)).toBe('1.5ms');
    expect(formatDuration(2_000_000)).toBe('2s');
  });
  it('复合单位 d/h', () => {
    const us = (2 * 86400 + 3 * 3600) * 1_000_000;
    expect(formatDuration(us)).toBe('2d 3h');
  });
});

// 行内 span 时长走 datafox `formatNumber(type:'duration')`（DRUIDS 3 位有效数字），
// 与轴刻度的 formatDuration（干净整数）刻意分流——真页本就是两套格式。
describe('formatSpanDuration（DRUIDS 3 位有效数字）', () => {
  it('2 位小数脏值 → 3 位有效数字', () => {
    expect(formatSpanDuration(28885)).toBe('28.9ms'); // formatDuration 会给 28.89ms
    expect(formatSpanDuration(8260)).toBe('8.26ms');
    expect(formatSpanDuration(54100)).toBe('54.1ms');
  });
  it('整值补零到 3 位有效数字，与轴的 formatDuration 干净整数不同', () => {
    expect(formatSpanDuration(5000)).toBe('5.00ms'); // 行内：补零
    expect(formatDuration(5000)).toBe('5ms'); // 轴：干净
  });
  it('μs→ns 换算 + 进位到 s', () => {
    expect(formatSpanDuration(500)).toBe('500μs');
    expect(formatSpanDuration(1_234_000)).toBe('1.23s');
  });
  it('非有限值 → 空串（不吐 NaNd NaNh 垃圾）', () => {
    expect(formatSpanDuration(NaN)).toBe('');
    expect(formatSpanDuration(Infinity)).toBe('');
    expect(formatSpanDuration(-Infinity)).toBe('');
  });
});

describe('toFloatPrecision', () => {
  it('按精度截断', () => {
    expect(toFloatPrecision(3.55, 1)).toBe(3.5);
    expect(toFloatPrecision(0.04422, 2)).toBe(0.04);
  });
});
