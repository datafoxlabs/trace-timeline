import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockTrace, type TraceSpan } from '../model';
import { TraceSqlQueries } from './TraceSqlQueries';
import { TraceErrors } from './TraceErrors';
import { ErrorStackContent } from './ErrorStackContent';
import { getSqlQueries } from './sqlQueries';

const spans: TraceSpan[] = Array.from({ length: 2500 }, (_, index) => ({
  ...mockTrace.spans[0], spanID: `span-${index}`, duration: 2500 - index, statusCode: 2,
  rawSpanAttributes: [{ key: 'db.system', value: 'mysql' }, { key: 'db.statement', value: `select ${index} from orders` }],
}));
const queries = getSqlQueries(spans.slice(0, 503));
const common = { selectedSpanId: 'none', onSelectSpan: vi.fn(), colorForSpan: () => 'red', virtualized: true };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return (this as HTMLElement).hasAttribute('data-index') ? 150 : 400;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const element = this as HTMLElement;
    const scroll = element.closest('[data-testid="TraceSqlQueries"], [data-testid="TraceErrors"]');
    return new DOMRect(0, element === scroll ? 0 : -(scroll?.scrollTop ?? 0), 1000, 150);
  });
  Element.prototype.scrollTo = function (options) {
    this.scrollTop = typeof options === 'object' ? options.top ?? 0 : 0;
    this.dispatchEvent(new Event('scroll'));
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('virtual detail cards', () => {
  it('bounds a 503-query list and retains expansion/formatting across recycling and inactive tabs', async () => {
    const view = render(<TraceSqlQueries {...common} queries={queries} />);
    const count = () => view.container.querySelectorAll('[data-sql-span-id]').length;
    await waitFor(() => expect(count()).toBeGreaterThan(0));
    expect(count()).toBeLessThan(20);
    const card = () => view.container.querySelector('[data-sql-span-id="span-0"]')! as HTMLElement;
    fireEvent.click(within(card()).getByRole('button', { expanded: false }));
    fireEvent.click(within(card()).getByRole('button', { name: '格式化查询' }));
    const scroll = view.getByTestId('TraceSqlQueries');
    fireEvent.scroll(scroll, { target: { scrollTop: 10000 } });
    await waitFor(() => expect(card()).toBeNull());
    expect(count()).toBeLessThan(20);
    fireEvent.scroll(scroll, { target: { scrollTop: 0 } });
    await waitFor(() => expect(card()).not.toBeNull());
    expect(within(card()).getByRole('button', { name: '还原查询' })).toBeVisible();
    view.rerender(<TraceSqlQueries {...common} queries={queries} active={false} />);
    expect(count()).toBe(0);
    view.rerender(<TraceSqlQueries {...common} queries={queries} active />);
    await waitFor(() => expect(card()).not.toBeNull());
    expect(within(card()).getByRole('button', { expanded: true })).toBeVisible();
    expect(within(card()).getByRole('button', { name: '还原查询' })).toBeVisible();
    fireEvent.scroll(scroll, { target: { scrollTop: 10000 } });
    fireEvent.change(view.getByRole('textbox', { name: '搜索 SQL 查询' }), { target: { value: 'select 502 ' } });
    expect(scroll.scrollTop).toBe(0);
    expect(view.container.querySelector('[data-sql-span-id="span-502"]')).not.toBeNull();
  });

  it('retains stack mode and frame disclosure when a card is remounted', () => {
    const state = new Map<string, unknown>();
    const error = { type: 'ExampleError', message: 'failed', stack: Array.from({ length: 12 }, (_, i) => `at app.Frame${i}.run(Frame${i}.java:${i + 1})`).join('\n') };
    const view = render(<ErrorStackContent key="first" error={error} state={state} />);
    fireEvent.click(view.getByRole('button', { name: '展开全部栈帧' }));
    view.rerender(<ErrorStackContent key="second" error={error} state={state} />);
    expect(view.getByRole('button', { name: '收起栈帧' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(view.getByRole('radio', { name: '原始' }));
    view.rerender(<ErrorStackContent key="third" error={error} state={state} />);
    expect(view.getByLabelText('原始堆栈')).toBeVisible();
  });

  it('bounds 2500 error cards and unmounts all card DOM while inactive', async () => {
    const view = render(<TraceErrors {...common} spans={spans} />);
    const count = () => view.container.querySelectorAll('[data-error-span-id]').length;
    await waitFor(() => expect(count()).toBeGreaterThan(0));
    expect(count()).toBeLessThan(20);
    fireEvent.scroll(view.getByTestId('TraceErrors'), { target: { scrollTop: 6000 } });
    await waitFor(() => expect(view.container.querySelector('[data-error-span-id="span-0"]')).toBeNull());
    expect(count()).toBeLessThan(20);
    view.rerender(<TraceErrors {...common} spans={spans} active={false} />);
    expect(count()).toBe(0);
    view.rerender(<TraceErrors {...common} spans={spans} active />);
    await waitFor(() => expect(count()).toBeGreaterThan(0));
    expect(view.getByTestId('TraceErrors').scrollTop).toBe(6000);
    expect(view.container.querySelector('[data-error-span-id="span-0"]')).toBeNull();
  });
});
