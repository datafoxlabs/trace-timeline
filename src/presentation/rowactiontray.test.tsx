// 行内准星（Story 9.4 / B，9.4e 改用 datafox `ActionTray`）。
//
// 9.4 原是手搓 `DdRowActionTray` + 纯 CSS `:hover` 滑入；9.4e 按用户「这里可以使用 ActionTray」
// 换成 datafox `ActionTray`（slider theme）。datafox 组件是 `isOpen` prop 驱动，无 CSS-only 路径，
// 故 `DdSpanRow` 改用**行级** hover/focus state（enter/leave 各一次、只重渲本行——非 D4 忌讳的
// 「共享 hover id + mousemove 重渲整列」）。
//
// jsdom 不加载 Tailwind，故 translate/pointer-events 的**观感**断不了；改断 slider 内层的
// `translate-x-full`（收起）↔`translate-x-0`（展开）**类切换**，与 datafox 自身测试同口径。
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type RenderableRow } from '../core';
import { mockTrace } from '../model';
import type { TraceSpan } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { createDatadogRowRenderer } from './rowRenderer';
import DdSpanRowSrc from './DdSpanRow.tsx?raw';

const theme = createTheme({ colorMode: 'light' });
const SPAN = mockTrace.spans[0];

function makeRow(span: TraceSpan, over: Partial<RenderableRow> = {}): RenderableRow {
  return {
    span,
    spanIndex: 0,
    isDetail: false,
    depth: span.depth,
    ancestorSpanIds: [],
    viewBounds: { start: 0, end: 1, clippingLeft: false, clippingRight: false },
    isCollapsed: false,
    isMatchingFilter: false,
    isFocused: false,
    isError: false,
    descendantHasError: false,
    criticalPathSections: [],
    columnWidth: 0.3,
    hoverIndentGuideIds: new Set(),
    onChildrenToggle: () => {},
    onDetailToggle: () => {},
    addHoverIndentGuideId: () => {},
    removeHoverIndentGuideId: () => {},
    ...over,
  };
}

function renderRow(onFocusSpan?: (id: string) => void, over: Partial<RenderableRow> = {}) {
  const renderer = createDatadogRowRenderer({ theme, trace: mockTrace, onFocusSpan });
  const utils = render(createElement(ThemeProvider, { theme, children: renderer(makeRow(SPAN, over)) }));
  return {
    ...utils,
    rowEl: utils.container.firstElementChild as HTMLElement,
    tray: () => utils.container.querySelector<HTMLElement>('[data-component-name="action-tray"]'),
    // slider 内层：带 translate-x-* 的那个绝对定位 div。
    sliderInner: () =>
      utils.container.querySelector<HTMLElement>('[data-component-name="action-tray"] .overflow-hidden > div'),
  };
}

describe('行内 ActionTray：渲染与开合（Story 9.4 / AC #5 #6）', () => {
  it('row whitespace and timeline bar select, while controls dispatch only their own action', () => {
    const select = vi.fn();
    const collapse = vi.fn();
    const focus = vi.fn();
    const { rowEl, getByRole, container } = renderRow(focus, { onDetailToggle: select, onChildrenToggle: collapse });
    fireEvent.click(rowEl);
    fireEvent.click(container.querySelector('[class$="-DdSpanBar"]')!);
    fireEvent.click(container.querySelector('[class$="-DdSpanRowTimelineCol"]')!);
    expect(select).toHaveBeenCalledTimes(3);
    fireEvent.click(getByRole('button', { name: 'collapse' }));
    expect(collapse).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: 'Focus on this span' }));
    expect(focus).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledTimes(3);
    fireEvent.click(container.querySelector('[role="button"]')!);
    expect(select).toHaveBeenCalledTimes(4);
  });
  it('提供 onFocusSpan → 渲染 datafox ActionTray（data-component-name=action-tray）', () => {
    const { tray } = renderRow(vi.fn());
    expect(tray()).toBeTruthy();
  });

  it('未提供 onFocusSpan → 不渲染死按钮', () => {
    const { tray } = renderRow(undefined);
    expect(tray()).toBeNull();
  });

  it('详情行不渲染准星', () => {
    const { tray } = renderRow(vi.fn(), { isDetail: true });
    expect(tray()).toBeNull();
  });

  it('默认收起：slider 内层带 translate-x-full', () => {
    const { sliderInner } = renderRow(vi.fn());
    expect(sliderInner()!.className).toContain('translate-x-full');
    expect(sliderInner()!.className).not.toContain('translate-x-0');
  });

  it('hover 行 → 展开（translate-x-0）；离开 → 收起', async () => {
    const { rowEl, sliderInner } = renderRow(vi.fn());
    fireEvent.mouseEnter(rowEl.querySelector('[class$="-DdSpanRowLabelCol"]')!);
    expect(sliderInner()!.className).toContain('translate-x-0');
    fireEvent.mouseLeave(rowEl.querySelector('[class$="-DdSpanRowLabelCol"]')!);
    await waitFor(() => expect(sliderInner()!.className).toContain('translate-x-full'));
  });

  it('keeps the portal open when the pointer crosses from label into the card', async () => {
    const { rowEl, getByRole, queryByRole } = renderRow(vi.fn());
    const label = rowEl.querySelector('[class$="-DdSpanRowLabelCol"]')!;
    fireEvent.mouseEnter(label);
    const card = getByRole('tooltip', { name: 'Span summary' });
    fireEvent.mouseLeave(label);
    fireEvent.mouseEnter(card);
    await act(() => new Promise(resolve => setTimeout(resolve, 150)));
    expect(card.getAttribute('data-state')).toBe('open');
    fireEvent.mouseLeave(card);
    await waitFor(() => expect(queryByRole('tooltip', { name: 'Span summary' })).toBeNull());
  });

  it('键盘 focus 进入行 → 展开；focus 移出 → 收起（对齐 datafox Table 的 focus-within）', () => {
    const { rowEl, sliderInner } = renderRow(vi.fn());
    vi.spyOn(rowEl, 'matches').mockImplementation(selector => selector === ':focus-visible');
    fireEvent.focus(rowEl); // onFocusCapture 冒泡
    expect(sliderInner()!.className).toContain('translate-x-0');
    // blur 到行外（relatedTarget=null）→ 收起
    fireEvent.blur(rowEl);
    expect(sliderInner()!.className).toContain('translate-x-full');
  });

  it('鼠标点击留下的焦点不会保持操作栏展开', () => {
    const { rowEl, sliderInner } = renderRow(vi.fn());
    vi.spyOn(rowEl, 'matches').mockReturnValue(false);
    fireEvent.pointerDown(rowEl);
    fireEvent.focus(rowEl);
    expect(sliderInner()!.className).toContain('translate-x-full');
  });

  it('hover 与 focus 互不误伤：focus 态下鼠标离开仍保持展开', () => {
    const { rowEl, sliderInner } = renderRow(vi.fn());
    fireEvent.mouseEnter(rowEl.querySelector('[class$="-DdSpanRowLabelCol"]')!);
    vi.spyOn(rowEl, 'matches').mockImplementation(selector => selector === ':focus-visible');
    fireEvent.focus(rowEl);
    fireEvent.mouseLeave(rowEl.querySelector('[class$="-DdSpanRowLabelCol"]')!); // 只清 hovered，focused 仍在
    expect(sliderInner()!.className).toContain('translate-x-0');
  });
});

describe('行内 ActionTray：按钮与 a11y', () => {
  it('按钮 aria-label="Focus on this span"、原生 button、图标取自 datafox FocusIcon', () => {
    const { getByRole, container } = renderRow(vi.fn());
    const btn = getByRole('button', { name: 'Focus on this span' }) as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor'); // DRUIDS 填充式图标
    expect(svg.getAttribute('stroke')).toBeNull();
  });

  it('点击准星 → onFocusSpan(spanID)', () => {
    const onFocusSpan = vi.fn();
    const { getByRole } = renderRow(onFocusSpan);
    fireEvent.click(getByRole('button', { name: 'Focus on this span' }));
    expect(onFocusSpan).toHaveBeenCalledWith(SPAN.spanID);
  });
});

describe('DdSpanRow 源级契约（Story 9.4e 的取舍留痕）', () => {
  it('用 datafox ActionTray，不再自绘 slider', () => {
    expect(DdSpanRowSrc).toContain("import { ActionTray, Button, FocusIcon, PopoverRoot, PopoverAnchor, PopoverContent, Tooltip } from '@datafox/ui'");
    expect(DdSpanRowSrc).not.toContain('DdRowActionTray');
    expect(DdSpanRowSrc).not.toContain('data-row-action-slider');
  });

  it('行级 state 驱动 isOpen：hover/focus 两态，onBlurCapture 判 relatedTarget', () => {
    // D4 忌讳的是共享/引擎级 hover id + mousemove；行级 enter/leave state 不在其列。
    expect(DdSpanRowSrc).toMatch(/const \[labelHovered, setLabelHovered\] = useState\(false\)/);
    expect(DdSpanRowSrc).toMatch(/const \[focused, setFocused\] = useState\(false\)/);
    expect(DdSpanRowSrc).toContain('isOpen={labelHovered || focused}');
    expect(DdSpanRowSrc).toContain('e.currentTarget.contains(e.relatedTarget)');
  });

  it('labelCol 仍是 position:relative（ActionTray 的 absolute 定位祖先）', () => {
    expect(DdSpanRowSrc).toMatch(/labelCol: css\(\{[\s\S]*?position: 'relative'/);
  });
});
