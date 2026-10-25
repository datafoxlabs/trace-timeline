import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_HEIGHTS, type RenderableRow } from '../core';
import { mockTrace } from '../model';
import type { TraceSpan } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { defaultColorAccessor, httpStatusToken } from './colorAccessor';
import { createDatadogRowRenderer } from './rowRenderer';

const theme = createTheme({ colorMode: 'light' });

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

function renderRow(row: RenderableRow, selectedSpanId?: string) {
  const renderer = createDatadogRowRenderer({ theme, trace: mockTrace, selectedSpanId });
  return render(createElement(ThemeProvider, { theme, children: renderer(row) }));
}

describe('httpStatusToken', () => {
  it('按状态码段映射到 status 令牌', () => {
    expect(httpStatusToken(200, theme)).toBe(theme.trace.status.ok);
    expect(httpStatusToken(301, theme)).toBe(theme.trace.status.info);
    expect(httpStatusToken(404, theme)).toBe(theme.trace.status.warn);
    expect(httpStatusToken(500, theme)).toBe(theme.trace.status.error);
  });
});

describe('defaultColorAccessor', () => {
  it('同服务稳定取色、落在分类色板内', () => {
    const accessor = defaultColorAccessor(theme);
    const s1 = mockTrace.spans[0];
    expect(accessor(s1)).toBe(accessor(s1));
    expect(theme.trace.categoricalPalette).toContain(accessor(s1));
  });
});

describe('DdSpanRow（经 rowRenderer 工厂）', () => {
  it('瀑布条按 viewBounds 定位、仅顶圆角、服务色', () => {
    const s1 = mockTrace.spans.find((s) => s.spanID === 's1')!;
    const { container } = renderRow(makeRow(s1, { viewBounds: { start: 0, end: 1, clippingLeft: false, clippingRight: false } }));
    const bar = container.querySelector('[class$="DdSpanBar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.left).toBe('0%');
    expect(bar.style.width).toBe('100%');
    expect(bar.style.background).toBeTruthy();
  });

  it('渲染服务名/操作名 + HTTP 状态 pill', () => {
    const s4 = mockTrace.spans.find((s) => s.spanID === 's4')!; // statusCode 2 + http 500
    const { getByText } = renderRow(makeRow(s4, { isError: true, httpStatus: 500 }));
    expect(getByText('GET /error')).toBeTruthy();
    expect(getByText('500')).toBeTruthy();
  });

  it.each([200, 403, 404, 500])('HTTP %s 优先显示，不重复渲染 OTel 错误图标', (httpStatus) => {
    const s4 = mockTrace.spans.find((s) => s.spanID === 's4')!;
    const { queryByRole, getByText } = renderRow(makeRow(s4, { isError: true, httpStatus }));
    expect(getByText(String(httpStatus))).toBeTruthy();
    expect(queryByRole('img', { name: 'error' })).toBeNull();
  });

  it('选中命中的错误行仍只显示 HTTP 徽标', () => {
    const s4 = mockTrace.spans.find((s) => s.spanID === 's4')!;
    const { container, queryByRole, getByText } = renderRow(makeRow(s4, { isError: true, httpStatus: 403, isMatchingFilter: true }), s4.spanID);
    expect(container.querySelector('[class*="DdSpanRowSelected"]')).toBeTruthy();
    expect(getByText('403')).toBeTruthy();
    expect(queryByRole('img', { name: 'error' })).toBeNull();
  });

  it('仅 HTTP 403 不渲染自身错误标识', () => {
    const { getByText, queryByRole } = renderRow(makeRow(mockTrace.spans[0], { httpStatus: 403 }));
    expect(getByText('403')).toBeTruthy();
    expect(queryByRole('img', { name: 'error' })).toBeNull();
  });

  it('无 httpStatus 的错误行渲染错误图标', () => {
    const s4 = mockTrace.spans.find((s) => s.spanID === 's4')!;
    const { container } = renderRow(makeRow(s4, { isError: true, httpStatus: undefined }));
    expect(container.querySelector('[class*="DdHttpStatusPillWrap"]')).toBeNull();
    expect(container.querySelector('[class*="DdLabelError"]')).toBeTruthy();
  });

  // Story 9.3i：计数槽显示 **descendantSpanCount（子孙总数）**，不是 childSpanCount（直接子节点数）。
  // 真页实测：`6a505e15…`（21 span）根行显示 `20`；`TraceScenarioController.complex` 直接子节点 8 个、显示 `16`。
  // 本例的 `s1` 恰好两者不等（直接子 3 / 子孙 8），是这条断言的价值所在——渲染错字段不会报错，只会静默显示小得多的数。
  it('计数槽显示 descendantSpanCount（子孙总数），而非 childSpanCount（直接子节点数）', () => {
    const s1 = mockTrace.spans.find((s) => s.spanID === 's1')!;
    expect(s1.descendantSpanCount).toBeGreaterThan(s1.childSpanCount);
    const { container } = renderRow(makeRow(s1));
    const slot = container.querySelector('[class*="DdLabelCount"]');
    expect(slot).toBeTruthy();
    expect(slot!.textContent).toBe(String(s1.descendantSpanCount));
    expect(slot!.textContent).not.toBe(String(s1.childSpanCount));
  });

  // Story 9.3f（D1）——同级兄弟行文本对齐的唯一机制。真页叶行也渲染这个 20px 槽（内容为空串）；
  // 一旦退回条件渲染，叶行与枝行的文本起点就会差一个徽标宽（真页实测 27px）。
  it('叶行也渲染 20px 计数槽（内容为空），使叶/枝行文本起点对齐', () => {
    const leaf = mockTrace.spans.find((s) => s.descendantSpanCount === 0)!;
    expect(leaf).toBeTruthy();
    const { container } = renderRow(makeRow(leaf));
    const slot = container.querySelector('[class*="DdLabelCount"]');
    expect(slot).toBeTruthy();
    expect(slot!.textContent).toBe('');
  });

  // Story 9.3g 复审：计数走 datafox `<FormattedNumber type="integer">`（真页该 span 带 formatted-number 类）。
  // `integer` 而非默认 `human`——真页 5 个子节点显示 `5`，`human` 会给 `5.00`。
  // 四位数若不缩写会向左溢出 20px 槽、压到折叠箭头上。
  it.each([
    [1, '1'],
    [999, '999'],
    [1000, '1.00k'],
    [1234, '1.23k'],
    [1234567, '1.23M'],
  ])('计数 %i → 渲染 %s（integer 格式：<1000 取整，≥1000 三位有效数字 SI 缩写）', (count, expected) => {
    const s1 = mockTrace.spans.find((s) => s.spanID === 's1')!;
    const span = { ...s1, descendantSpanCount: count } as typeof s1;
    const { container } = renderRow(makeRow(span));
    expect(container.querySelector('[class*="DdLabelCount"]')!.textContent).toBe(expected);
  });

  // Story 9.3：表格样式对齐——密度与标签列布局按真页 DRUIDS Table 实测值固化。
  it('行高 = 23px（真页 grid-auto-rows 实测值，Story 9.3 D2）', () => {
    expect(DEFAULT_HEIGHTS.bar).toBe(23);
  });

  it('标签列顺序：子代计数在服务名之前（Hyp.2 结案），HTTP pill 经 spacer 右推到末端', () => {
    const s1 = mockTrace.spans.find((s) => s.spanID === 's1')!;
    expect(s1.childSpanCount).toBeGreaterThan(0);
    const { container } = renderRow(makeRow(s1, { httpStatus: 200 }));
    const cell = container.querySelector('[class*="DdLabelCell"]')!;
    const kids = Array.from(cell.children);
    const idx = (sel: string) => kids.findIndex((el) => el.matches(sel));

    const count = idx('[class*="DdLabelCount"]');
    const text = idx('[class*="DdLabelText"]');
    const spacer = idx('[class*="DdLabelSpacer"]');
    const pill = idx('[class*="DdHttpStatusPillWrap"]');

    expect(count).toBeGreaterThanOrEqual(0);
    expect(pill).toBeGreaterThanOrEqual(0);
    // 计数居左：在服务/资源名文本之前
    expect(count).toBeLessThan(text);
    // spacer 紧接在 pill 之前，且 pill 是最后一个子节点（右对齐到标签列末端）
    expect(spacer).toBe(pill - 1);
    expect(pill).toBe(kids.length - 1);
  });

  // Story 9.3d：树线改为「三层 background 画 level 0..d-2」+「connector 画 level d-1」，
  // 不再是每级一个 border-left 的 <span>。
  // Story 9.3g：hover 命中列一并移除——真页导线**没有任何 `:hover` 规则**。
  it('不渲染 hover 命中列（真页导线无 hover 态）', () => {
    const s3 = mockTrace.spans.find((s) => s.spanID === 's3')!;
    const { container } = renderRow(makeRow(s3, { depth: 2, ancestorSpanIds: ['s1', 's2'] }));
    expect(container.querySelectorAll('[class$="DdIndentHit"]').length).toBe(0);
  });

  it('父级导线（level d-1）由 connector 承担，恰一条', () => {
    const s3 = mockTrace.spans.find((s) => s.spanID === 's3')!;
    const { container } = renderRow(makeRow(s3, { depth: 2, ancestorSpanIds: ['s1', 's2'] }));
    expect(container.querySelectorAll('[data-testid="indent-connector"]').length).toBe(1);
  });

  it('树 span 宽 = 30 + 16 × depth（真页 depth=2 实测 62px）', () => {
    const s3 = mockTrace.spans.find((s) => s.spanID === 's3')!;
    const { container } = renderRow(makeRow(s3, { depth: 2, ancestorSpanIds: ['s1', 's2'] }));
    const tree = container.querySelector('[class*="DdIndentGuides"]') as HTMLElement;
    expect(tree.style.width).toBe('62px');
  });
});
