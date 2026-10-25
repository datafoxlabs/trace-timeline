import { createElement } from 'react';
import { ErrorMessage } from '@datafox/ui';
import { fireEvent, render, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { mockTrace, type TraceSpan } from '../model';
import { TraceErrors } from './TraceErrors';
vi.mock('@datafox/ui', async importOriginal => {
  const ui = await importOriginal<typeof import('@datafox/ui')>();
  return { ...ui, ErrorMessage: vi.fn((props: React.ComponentProps<typeof ui.ErrorMessage>) => createElement(ui.ErrorMessage, props)) };
});

const stack = 'ExampleError: failed\n\tat app.Order.run(Order.java:42)';
const span = (id: string, hasDetails = true): TraceSpan => ({ ...mockTrace.spans[0], spanID: id, operationName: id, statusCode: 2, tags: [], rawSpanAttributes: [], statusMessage: '',
  logs: hasDetails ? [{ name: 'exception', timestamp: 1, fields: [
    { key: 'exception.type', value: 'ExampleError' }, { key: 'exception.message', value: 'failed' }, { key: 'exception.stacktrace', value: stack },
  ] }] : [] });

describe('Trace-wide errors', () => {
  it('keeps multiple cards open while selection changes, and retains summaries when collapsed', () => {
    const spans = [span('first'), span('second'), span('missing', false)];
    const onSelectSpan = vi.fn();
    const props = { spans, selectedSpanId: 'none', onSelectSpan, colorForSpan: () => 'var(--ui-status-danger)' };
    const view = render(<TraceErrors {...props} />);
    const card = (id: string) => within(view.container.querySelector(`[data-error-span-id="${id}"]`)! as HTMLElement);
    const first = card('first').getByRole('button');
    const second = card('second').getByRole('button');
    expect(view.getAllByText('failed')).toHaveLength(2);
    expect(view.getByText('未提供错误信息和堆栈')).toBeVisible();
    fireEvent.click(first);
    fireEvent.click(second);
    expect(onSelectSpan.mock.calls.map(c => c[0])).toEqual(['first', 'second']);
    view.rerender(<TraceErrors {...props} selectedSpanId="second" />);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(first);
    expect(card('first').getByText('failed')).toBeVisible();
    expect(card('first').queryByRole('button', { name: '放大错误堆栈' })).toBeNull();
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });
  it('switches raw mode, opens the complete stack dialog, and retains unavailable actions disabled', async () => {
    const view = render(<TraceErrors spans={[span('selected')]} selectedSpanId="selected" onSelectSpan={vi.fn()} colorForSpan={() => 'var(--ui-status-danger)'} />);
    expect(view.getByRole('button', { name: '错误追踪' })).toBeDisabled();
    expect(view.getByRole('button', { name: '智能运维助手' })).toBeDisabled();
    fireEvent.click(view.getByRole('radio', { name: '原始' }));
    expect(view.getByLabelText('原始堆栈').textContent).toBe(stack);
    fireEvent.click(view.getByRole('button', { name: '放大错误堆栈' }));
    expect(view.getByRole('dialog')).toHaveTextContent('Order.java:42');
    fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  });
  it('does not render unchanged error summaries when another card toggles or selection callbacks change', () => {
    const spans = Array.from({ length: 100 }, (_, i) => ({ ...span(`span-${i}`), logs: [], statusMessage: `message-${i}` }));
    const colorForSpan = () => 'var(--ui-status-danger)';
    const view = render(<TraceErrors spans={spans} selectedSpanId="none" onSelectSpan={vi.fn()} colorForSpan={colorForSpan} />);
    const callsForUnchanged = () => vi.mocked(ErrorMessage).mock.calls.filter(([props]) => props.message === 'message-99').length;
    const before = callsForUnchanged();
    fireEvent.click(within(view.container.querySelector('[data-error-span-id="span-0"]')! as HTMLElement).getByRole('button'));
    view.rerender(<TraceErrors spans={spans} selectedSpanId="span-0" onSelectSpan={vi.fn()} colorForSpan={colorForSpan} />);
    expect(callsForUnchanged()).toBe(before);
    expect(view.getByText('message-99')).toBeVisible();
  });
  it('selects and opens a card from its summary, without toggling selected cards or hijacking controls', () => {
    const spans = [span('first'), span('second')];
    const onSelectSpan = vi.fn();
    const props = { spans, selectedSpanId: 'first', onSelectSpan, colorForSpan: () => 'var(--ui-status-danger)' };
    const view = render(<TraceErrors {...props} />);
    const element = view.container.querySelector('[data-error-span-id="second"]')! as HTMLElement;
    const second = within(element);
    const header = second.getByRole('button');
    fireEvent.click(second.getByText('failed'));
    expect(onSelectSpan).toHaveBeenCalledTimes(1);
    expect(onSelectSpan).toHaveBeenCalledWith('second');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    view.rerender(<TraceErrors {...props} selectedSpanId="second" />);
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    onSelectSpan.mockClear();
    fireEvent.click(second.getByText('failed'));
    fireEvent.mouseLeave(element);
    fireEvent.blur(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(element).toHaveAttribute('data-selected', 'true');
    expect(onSelectSpan).not.toHaveBeenCalled();
    fireEvent.click(header);
    view.rerender(<TraceErrors {...props} />);
    onSelectSpan.mockClear();
    fireEvent.click(second.getByRole('radio', { name: '原始' }));
    fireEvent.click(second.getByRole('button', { name: '放大错误堆栈' }));
    expect(view.getByRole('dialog')).toBeVisible();
    expect(onSelectSpan).not.toHaveBeenCalled();
  });
  it('shows an empty state without fabricating errors', () => {
    const view = render(<TraceErrors spans={[]} selectedSpanId="none" onSelectSpan={vi.fn()} colorForSpan={() => ''} />);
    expect(view.getByRole('status')).toHaveTextContent('当前 Trace 没有错误 Span。');
  });
});
