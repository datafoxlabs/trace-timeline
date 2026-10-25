import { describe, expect, it } from 'vitest';

import { getColorByKey, getFilteredColors } from './colorGenerator';
import { createTheme } from './createTheme';

describe('getColorByKey', () => {
  const theme = createTheme({ colorMode: 'light' });
  const palette = theme.trace.categoricalPalette;

  it('同 serviceName 多次取色稳定一致', () => {
    expect(getColorByKey('svc-a', theme)).toBe(getColorByKey('svc-a', theme));
  });

  it('返回的是调色板内的颜色', () => {
    expect(palette).toContain(getColorByKey('svc-a', theme));
  });

  it('不同 key 多数得到不同颜色', () => {
    const colors = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((k) => getColorByKey(k, theme));
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  // Story 10.12：纯哈希定色——同名恒同色、与顺序/集合无关。此处以「重复取色恒等」佐证确定性（无 prevColorIndex 顺序依赖）。
  it('取色与请求顺序无关（纯哈希，无 prevColorIndex 副作用）', () => {
    const first = getColorByKey('order-probe', theme);
    // 中间穿插一堆别的 key（旧算法此举会经 prevColorIndex 改变后续首次分配）
    ['x1', 'x2', 'x3', 'x4', 'x5'].forEach((k) => getColorByKey(k, theme));
    expect(getColorByKey('order-probe', theme)).toBe(first);
  });

  // Story 10.12：不再按「与背景对比度」过滤——满 20 色可用（含亮色），是颜色更稀疏的关键。
  it('getFilteredColors 保留满色板（不再删亮色）', () => {
    const filtered = getFilteredColors(palette);
    expect(filtered.length).toBe(palette.length);
    expect(filtered).toContain('#FFCC00'); // 亮黄——旧对比度过滤会删掉它（连同橙/青/浅紫/浅绿）
  });

  // Story 10.12：合成服务集（共前缀 demo-service-*）颜色应铺开覆盖多色，不再挤在紫一隅（旧：12 服务只落 6 色）。
  it('合成服务集颜色稀疏（≥9 种不同色）', () => {
    const services = Array.from({ length: 12 }, (_, i) => `demo-service-${String(i + 1).padStart(2, '0')}`);
    const distinct = new Set(services.map((s) => getColorByKey(s, theme)));
    expect(distinct.size).toBeGreaterThanOrEqual(9);
  });
});
