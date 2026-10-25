import { fireEvent, render, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { mockTrace } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { TraceTimeline } from './TraceTimeline';

const theme = createTheme({ colorMode: 'light' });

function renderApp(node: React.ReactNode) {
  return render(createElement(ThemeProvider, { theme, children: node }));
}

describe('TraceTimeline', () => {
  it('keeps SQL count and active tab stable when filtering and selecting a query', () => {
    const scroll = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const spans = mockTrace.spans.slice(0, 3).map((span, i) => ({ ...span, rawSpanAttributes: i ? [{ key: 'db.statement', value: `SELECT ${i}` }] : [] }));
    const trace = { ...mockTrace, spans };
    const onSelectedSpanIdChange = vi.fn();
    const view = renderApp(<TraceTimeline trace={trace} fitContainer selectedSpanId={spans[0].spanID} onSelectedSpanIdChange={onSelectedSpanIdChange} />);
    fireEvent.click(view.getByRole('tab', { name: 'SQL Queries 2' }));
    const list = within(view.getByTestId('TraceSqlQueries'));
    fireEvent.change(list.getByRole('textbox'), { target: { value: 'SELECT 2' } });
    expect(view.container.querySelectorAll('[data-sql-span-id]')).toHaveLength(1);
    fireEvent.click(view.container.querySelector('[data-sql-span-id] code')!);
    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith(spans[2].spanID);
    view.rerender(createElement(ThemeProvider, { theme, children: <TraceTimeline trace={trace} fitContainer selectedSpanId={spans[2].spanID} onSelectedSpanIdChange={onSelectedSpanIdChange} /> }));
    expect(view.getByRole('tab', { name: 'SQL Queries 2' })).toHaveAttribute('aria-selected', 'true');
    expect(list.getByRole('textbox')).toHaveValue('SELECT 2');
    Element.prototype.scrollTo = scroll;
  });

  it('keeps the Errors tab active and its count stable while selecting another error span', () => {
    const originalScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const spans = mockTrace.spans.slice(0, 3).map((span, i) => ({ ...span, spanID: `error-${i}`, operationName: `error-operation-${i}`, tags: [], rawSpanAttributes: [], logs: [], statusCode: i < 2 ? 2 : 0, statusMessage: i < 2 ? `failure-${i}` : '' }));
    const onSelectedSpanIdChange = vi.fn();
    const view = renderApp(<TraceTimeline trace={{ ...mockTrace, spans }} fitContainer onSelectedSpanIdChange={onSelectedSpanIdChange} selectedSpanId={spans[0].spanID} />);
    fireEvent.click(view.getByRole('tab', { name: 'Errors 2' }));
    const errors = within(view.getByTestId('TraceErrors'));
    fireEvent.click(errors.getByRole('button', { name: /error-operation-1/ }));
    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith('error-1');
    view.rerender(createElement(ThemeProvider, { theme, children: <TraceTimeline trace={{ ...mockTrace, spans }} fitContainer onSelectedSpanIdChange={onSelectedSpanIdChange} selectedSpanId="error-1" /> }));
    expect(view.getByTestId('DdSpanDetailHeader')).toHaveTextContent('error-operation-1');
    expect(view.getByRole('tab', { name: 'Errors 2' })).toHaveAttribute('aria-selected', 'true');
    expect(errors.getByText('failure-0')).toBeVisible();
    expect(errors.getByText('failure-1')).toBeVisible();
    Element.prototype.scrollTo = originalScrollTo;
  });

  it('focuses a subtree, selects its root, scopes errors, and restores the complete tree', () => {
    const scroll = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const root = mockTrace.spans.find(s => s.hasChildren && s.depth > 0)!;
    const { container, getByRole } = renderApp(<TraceTimeline trace={mockTrace} height={600} />);
    const rows = () => container.querySelectorAll('[data-span-id]');
    const before = rows().length;
    fireEvent.click(within(container.querySelector(`[data-span-id="${root.spanID}"]`)! as HTMLElement).getByRole('button', { name: 'Focus on this span' }));
    expect(rows()).toHaveLength(root.descendantSpanCount + 1);
    const focused = container.querySelector('[data-focus-root="true"]')!;
    expect(focused.getAttribute('data-span-id')).toBe(root.spanID);
    expect(focused.className).toContain('DdSpanRowSelected');
    expect(container.querySelector('[data-testid="TraceTimelineDrawer"]')).toBeTruthy();
    expect(focused.querySelector('[class$="-DdSpanBar"]')).toHaveStyle({ left: '0%', width: '100%' });
    fireEvent.click(getByRole('button', { name: 'Unfocus span' }));
    expect(rows()).toHaveLength(before);
    expect(container.querySelector('[data-focus-root="true"]')).toBeNull();
    expect(container.querySelector('[class*="DdSpanRowSelected"]')?.getAttribute('data-span-id')).toBe(root.spanID);
    Element.prototype.scrollTo = scroll;
  });

  it('selects from the timeline surface, keeps repeated clicks selected, and closes explicitly', () => {
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const { container, getByRole, queryByTestId } = renderApp(<TraceTimeline trace={mockTrace} height={600} />);
    const bar = container.querySelector('[class$="-DdSpanBar"]')!;
    fireEvent.click(bar);
    expect(queryByTestId('TraceTimelineDrawer')).toBeTruthy();
    expect(container.querySelectorAll('[class*="DdSpanRowSelected"]')).toHaveLength(1);
    fireEvent.click(bar);
    expect(queryByTestId('TraceTimelineDrawer')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: '关闭详情' }));
    expect(queryByTestId('TraceTimelineDrawer')).toBeNull();
    expect(container.querySelectorAll('[class*="DdSpanRowSelected"]')).toHaveLength(0);
    Element.prototype.scrollTo = scrollTo;
  });
  it('places host notices between view tabs and search, and removes them without a placeholder', () => {
    const app = (notice?: React.ReactNode) => createElement(ThemeProvider, { theme, children:
      <TraceTimeline trace={mockTrace} afterViewTabs={notice} /> });
    const { getByTestId, getByRole, queryByRole, rerender } = render(app(<div role="status">Partial trace</div>));
    const notice = queryByRole('status')!;
    expect(getByTestId('DdViewTabs').compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(getByRole('textbox', { name: '搜索 span' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(app());
    expect(queryByRole('status')).toBeNull();
  });

  it('shows the host empty selection pane without selecting a substitute, and replaces it on selection', () => {
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const app = (selectedSpanId: string | null) => createElement(ThemeProvider, { theme, children:
      <TraceTimeline trace={mockTrace} fitContainer selectedSpanId={selectedSpanId}
        emptySelectionContent={<div role="status">Requested span missing</div>} /> });
    const { getByText, queryByTestId, queryByText, getByLabelText, rerender } = render(app(null));
    expect(getByText('Requested span missing')).toBeVisible();
    expect(queryByTestId('TraceTimelineDrawer')).toBeNull();
    expect(getByLabelText('Resize pane')).toBeVisible();
    rerender(app(mockTrace.spans[0].spanID));
    expect(queryByText('Requested span missing')).toBeNull();
    expect(queryByTestId('TraceTimelineDrawer')).toBeTruthy();
    Element.prototype.scrollTo = scrollTo;
  });

  it('collapses without clearing selection and restores the mounted detail state', () => {
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const onSelectedSpanIdChange = vi.fn();
    const view = renderApp(<TraceTimeline trace={mockTrace} fitContainer selectedSpanId={mockTrace.spans[0].spanID} onSelectedSpanIdChange={onSelectedSpanIdChange} />);
    const body = view.getByTestId('DdSpanDetailBody');
    fireEvent.change(within(body).getByRole('textbox', { name: '搜索 Span 属性' }), { target: { value: 'persist' } });
    fireEvent.click(view.getByRole('button', { name: '收起 Span 详情' }));
    expect(body).not.toBeVisible();
    expect(onSelectedSpanIdChange).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '展开 Span 详情' }));
    expect(body).toBeVisible();
    expect(within(body).getByRole('textbox', { name: '搜索 Span 属性' })).toHaveValue('persist');
    Element.prototype.scrollTo = scrollTo;
  });

  it('shows only raw Span and Resource attributes, retaining pin actions and hiding internal attributes', () => {
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const rawSpanAttributes = [
      { key: 'http.request.method', value: 'GET' },
      { key: '_df.flattened.peer.tags', value: 'internal-only' },
    ];
    const span = { ...mockTrace.spans[0], statusCode: 2, statusMessage: 'Request failed',
      tags: [...rawSpanAttributes, { key: 'datafox.entity.type', value: 'db' }], rawSpanAttributes,
      rawResourceAttributes: [{ key: 'service.name', value: 'raw-service' }, { key: '_private', value: 'secret' }],
      warnings: ['Duplicate tag "datafox.entity.type:db"'],
    };
    const view = renderApp(<TraceTimeline trace={{ ...mockTrace, spans: [span, ...mockTrace.spans.slice(1)] }} fitContainer selectedSpanId={span.spanID} />);
    const body = within(view.getByTestId('DdSpanDetailBody'));
    expect(body.getByRole('button', { name: 'Resource Attributes' })).toHaveAttribute('aria-expanded', 'true');
    expect(body.getByText('raw-service')).toBeVisible();
    expect(body.getByText('Request failed')).toBeVisible();
    expect(body.getByText('http.request.method')).toBeVisible();
    for (const hidden of ['datafox.entity.type', '_df.flattened.peer.tags', 'internal-only', '_private', 'secret', 'Duplicate tag "datafox.entity.type:db"']) expect(body.queryByText(hidden)).toBeNull();
    expect(body.queryByRole('button', { name: 'HTTP Requests' })).toBeNull();
    expect(span.tags).toHaveLength(3);
    fireEvent.click(body.getByRole('button', { name: '固定 http.request.method' }));
    expect(body.getAllByText('http.request.method')).toHaveLength(2);
    fireEvent.click(body.getAllByRole('button', { name: '取消固定 http.request.method' })[0]);
    expect(body.getAllByText('http.request.method')).toHaveLength(1);
    Element.prototype.scrollTo = scrollTo;
  });

  it('fill layout computes a selected span percentage and separates scrolling', () => {
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = () => {};
    const span = mockTrace.spans.find(span => span.duration < mockTrace.duration)!;
    const { getByTestId, getByLabelText } = renderApp(<TraceTimeline trace={mockTrace} fitContainer selectedSpanId={span.spanID} />);
    expect(getByTestId('DdSpanDetailHeader').textContent).toContain(`${Number((span.duration / mockTrace.duration * 100).toFixed(2))}% total exec time`);
    expect(getByTestId('DdSpanDetailBody').style.overflow).toBe('hidden');
    expect(getByLabelText('Resize pane').getAttribute('aria-orientation')).toBe('horizontal');
    Element.prototype.scrollTo = scrollTo;
  });

  it('渲染 mockTrace：出刻度表头 + 服务名 + 瀑布条', () => {
    const { container, getAllByText } = renderApp(<TraceTimeline trace={mockTrace} height={600} />);
    // 表头标签
    expect(container.querySelector('[class$="DdTimelineHeader"]')).toBeTruthy();
    // 服务名（多次出现）
    expect(getAllByText('mall-order-api').length).toBeGreaterThan(0);
    // 至少一条瀑布条
    expect(container.querySelector('[class$="DdSpanBar"]')).toBeTruthy();
  });

  it('trace=null → 空态文案，不崩溃', () => {
    const { getByText, container } = renderApp(<TraceTimeline trace={null} />);
    expect(getByText('无追踪数据')).toBeTruthy();
    expect(container.querySelector('[data-testid="ListView"]')).toBeNull();
  });

  it('loading → 占位文案', () => {
    const { getByText } = renderApp(<TraceTimeline trace={mockTrace} loading />);
    expect(getByText('加载中…')).toBeTruthy();
  });

  it('切到火焰图视图：出 DdFlameGraphView，隐藏 DdTimelineHeader（Story 6.2）', () => {
    const { container, getByTestId } = renderApp(<TraceTimeline trace={mockTrace} height={400} />);
    // 默认瀑布：有表头
    expect(container.querySelector('[class$="DdTimelineHeader"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="DdFlameGraphView"]')).toBeNull();
    // 点「火焰图」tab
    fireEvent.click(within(getByTestId('DdViewTabs')).getByRole('tab', { name: 'Flame Graph' }));
    expect(container.querySelector('[data-testid="DdFlameGraphView"]')).toBeTruthy();
    expect(container.querySelector('[class$="DdTimelineHeader"]')).toBeNull();
  });

  it('火焰图点 span → 底部抽屉显示（共享 selectedSpanId，Story 6.2/5.5）', () => {
    const { container, getByTestId } = renderApp(<TraceTimeline trace={mockTrace} height={400} />);
    fireEvent.click(within(getByTestId('DdViewTabs')).getByRole('tab', { name: 'Flame Graph' }));
    expect(container.querySelector('[data-testid="TraceTimelineDrawer"]')).toBeNull();
    const rect = container.querySelector('[data-testid="FlameRect"]')!;
    fireEvent.click(rect);
    expect(container.querySelector('[data-testid="TraceTimelineDrawer"]')).toBeTruthy();
  });

  it('previews hover details without committing selection, restores on leave, and commits on click', () => {
    const onSelectedSpanIdChange = vi.fn();
    const { container, getByTestId } = renderApp(<TraceTimeline trace={mockTrace} defaultViewMode="flamegraph" selectedSpanId="s1" onSelectedSpanIdChange={onSelectedSpanIdChange} />);
    const drawer = () => getByTestId('TraceTimelineDrawer');
    const original = drawer().textContent;
    const target = container.querySelector('[data-testid="FlameRect"][data-span-id="s3"]')!;
    fireEvent.mouseEnter(target);
    expect(drawer().textContent).not.toBe(original);
    expect(onSelectedSpanIdChange).not.toHaveBeenCalled();
    fireEvent.mouseLeave(target);
    expect(drawer().textContent).toBe(original);
    fireEvent.click(target);
    expect(onSelectedSpanIdChange).toHaveBeenCalledWith('s3');
  });

  it('火焰图 minimap 停靠左下角', () => {
    const { getByTestId } = renderApp(<TraceTimeline trace={mockTrace} height={400} />);
    fireEvent.click(within(getByTestId('DdViewTabs')).getByRole('tab', { name: 'Flame Graph' }));
    const minimap = getByTestId('DdFlameMinimap') as HTMLElement;
    expect(minimap.style.left).toBe('24px');
    expect(minimap.style.bottom).toBe('16px');
    expect(minimap.style.top).toBe('');
  });

  it('hover/选中火焰图 span 只高亮图例行，不触发主图灰显', () => {
    const { container, getByTestId } = renderApp(<TraceTimeline trace={mockTrace} height={400} />);
    fireEvent.click(within(getByTestId('DdViewTabs')).getByRole('tab', { name: 'Flame Graph' }));
    const flame = container.querySelector('[data-testid="DdFlameGraphView"]')!;
    const redisRect = flame.querySelector('[data-span-id="s3"]')!;

    fireEvent.mouseEnter(redisRect);
    expect(container.querySelector('[data-group-key="redis"]')?.getAttribute('data-state')).toBe('highlighted');
    expect(flame.querySelectorAll('[data-testid="FlameRect"][data-dimmed="true"]').length).toBe(0);

    fireEvent.click(redisRect);
    expect(container.querySelector('[data-testid="TraceTimelineDrawer"]')).toBeTruthy();
    expect(flame.querySelectorAll('[data-testid="FlameRect"][data-dimmed="true"]').length).toBe(0);
  });

  it('聚焦选中 → re-root（祖先隐藏），重置聚焦恢复（Story 6.7）', () => {
    const { container, getByTestId } = renderApp(<TraceTimeline trace={mockTrace} height={400} />);
    fireEvent.click(within(getByTestId('DdViewTabs')).getByRole('tab', { name: 'Flame Graph' }));
    // 选中 s7（GET /order），再聚焦
    fireEvent.click(container.querySelector('[data-testid="DdFlameGraphView"] [data-span-id="s7"]')!);
    fireEvent.click(container.querySelector('[data-action="focus-selected"]')!);
    // re-root：祖先 s1 不再在火焰图，s7 仍在
    const flame = () => container.querySelector('[data-testid="DdFlameGraphView"]')!;
    expect(flame().querySelector('[data-span-id="s1"]')).toBeNull();
    expect(flame().querySelector('[data-span-id="s7"]')).toBeTruthy();
    expect(container.querySelector('[data-group-key="redis"]')).toBeNull();
    expect(container.querySelector('[data-action="focus-selected"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="DdFlameControls"] button')).toHaveLength(3);
    // 重置聚焦 → s1 回来
    fireEvent.click(container.querySelector('[data-action="reset-focus"]')!);
    expect(flame().querySelector('[data-span-id="s1"]')).toBeTruthy();
  });

  it('CR-F1：pin 高亮后切 Color by 维度，不致整图全灰（孤儿 key 守卫）', () => {
    // Story 9.2：Color by 已换 datafox Radix <Select>（Portal 交互在 jsdom 不可靠，见 colorby.test）。
    // 此处走 TraceTimeline 的**受控 colorBy** 属性来切维度，等价触发同一 currentColorBy 变更 + 孤儿守卫。
    const { container, getByTestId, rerender } = renderApp(
      <TraceTimeline trace={mockTrace} height={400} colorBy="service" />
    );
    fireEvent.click(within(getByTestId('DdViewTabs')).getByRole('tab', { name: 'Flame Graph' }));
    const flame = () => container.querySelector('[data-testid="DdFlameGraphView"]')!;
    const mainDimmed = () =>
      Array.from(flame().querySelectorAll('[data-testid="FlameRect"][data-dimmed="true"]')).length;
    // pin 一个 service 组 → 其余帧灰显（正常）
    fireEvent.click(container.querySelector('[data-testid="DdFlameLegendRow"]')!);
    expect(mainDimmed()).toBeGreaterThan(0);
    // 切 Color by → Host：旧 service key 在 host 维度变孤儿，守卫应清高亮 → 无帧灰显
    rerender(
      createElement(ThemeProvider, {
        theme,
        children: <TraceTimeline trace={mockTrace} height={400} colorBy="host" />,
      })
    );
    expect(mainDimmed()).toBe(0);
  });
});
