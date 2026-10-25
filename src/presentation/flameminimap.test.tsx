import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { mockTrace } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { DdFlameMinimap } from './DdFlameMinimap';

const theme = createTheme({ colorMode: 'light' });

function mount(props: Parameters<typeof DdFlameMinimap>[0]) {
  // Story 10.6（code-review 修）：**不**外套 TooltipProvider——DdFlameMinimap/DdFlameControls 已自带 Provider
  // （公开导出可独立挂载），此处正好验证自带生效（缺 Provider 会 Radix 抛错）。
  return render(createElement(ThemeProvider, { theme, children: <DdFlameMinimap {...props} /> }));
}

describe('DdFlameMinimap', () => {
  const base = {
    trace: mockTrace,
    viewStart: 0.25,
    viewEnd: 0.5,
    onViewRangeChange: () => {},
    onZoomFull: () => {},
    onZoomSelected: () => {},
    onFocusSelected: () => {},
    hasSelection: false,
  };

  it('渲染微缩矩形（=spans 数）+ 视口框', () => {
    const { getAllByTestId, getByTestId } = mount({ ...base });
    expect(getAllByTestId('FlameMiniRect').length).toBe(mockTrace.spans.length);
    const vp = getByTestId('FlameMinimapViewport') as HTMLElement;
    expect(vp.style.left).toBe('25%');
    expect(vp.style.width).toBe('25%');
  });

  it('点击 minimap → onViewRangeChange（窗口宽度不变）', () => {
    const onViewRangeChange = vi.fn();
    const { getByTestId } = mount({ ...base, onViewRangeChange });
    fireEvent.mouseDown(getByTestId('DdFlameMinimap').querySelector('[class$="MinimapCanvas"]')!, {
      button: 0,
      clientX: 30,
    });
    expect(onViewRangeChange).toHaveBeenCalled();
    const [vs, ve] = onViewRangeChange.mock.calls[0];
    expect(ve - vs).toBeCloseTo(0.25, 5); // 宽度保持
  });

  // Story 10.6：真页 viewport `cursor:grab`/`pointer-events:auto` → 抓住视口内相对拖拽平移（非点哪居中）。
  it('抓视口内拖拽 → 相对平移（宽度不变、按位移量平移）', () => {
    const onViewRangeChange = vi.fn();
    const { getByTestId } = mount({ ...base, viewStart: 0.25, viewEnd: 0.5, onViewRangeChange });
    const canvas = getByTestId('DdFlameMinimap').querySelector('[class$="MinimapCanvas"]') as HTMLElement;
    // 视口 = [25px, 50px]（100px 宽）。抓视口内 35px（frac 0.35 ∈ [0.25,0.5]），拖到 55px（+0.2）。
    canvas.getBoundingClientRect = () =>
      ({ left: 0, width: 100, top: 0, right: 100, bottom: 60, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.mouseDown(canvas, { button: 0, clientX: 35 });
    expect(onViewRangeChange).not.toHaveBeenCalled(); // 抓取时不立即跳转
    fireEvent.mouseMove(canvas, { clientX: 55 });
    const calls = onViewRangeChange.mock.calls;
    const [vs, ve] = calls[calls.length - 1];
    expect(ve - vs).toBeCloseTo(0.25, 5); // 宽度不变
    expect(vs).toBeCloseTo(0.45, 5); // 0.25 + 0.2 位移
  });

  it('toggle 收起/展开', () => {
    const { getByTestId, queryByTestId } = mount({ ...base });
    expect(queryByTestId('FlameMinimapViewport')).toBeTruthy();
    fireEvent.click(getByTestId('FlameMinimapToggle')); // 收起
    expect(queryByTestId('FlameMinimapViewport')).toBeNull();
    fireEvent.click(getByTestId('FlameMinimapToggle')); // 展开
    expect(queryByTestId('FlameMinimapViewport')).toBeTruthy();
  });

  it('控件停靠 minimap 内（Story 6.6）+ 视口框透明蓝边无填充', () => {
    const onZoomFull = vi.fn();
    const { getByTestId, container } = mount({ ...base, onZoomFull });
    // DdFlameControls 三按钮在 minimap 内
    const mm = getByTestId('DdFlameMinimap');
    expect(mm.querySelector('[data-action="zoom-full"]')).toBeTruthy();
    expect(mm.querySelector('[data-action="zoom-selected"]')).toBeTruthy();
    fireEvent.click(mm.querySelector('[data-action="zoom-full"]')!);
    expect(onZoomFull).toHaveBeenCalled();
    // 遮罩层存在
    expect(container.querySelector('[class$="DdFlameMiniMask"]')).toBeTruthy();
    // 视口框：透明背景
    const vp = getByTestId('FlameMinimapViewport') as HTMLElement;
    expect(getComputedStyle(vp).backgroundColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  });
});
