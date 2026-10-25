import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TraceSpan } from '../model';
import { getSpanErrors, SpanErrors } from './SpanErrors';

const stack = 'java.lang.IllegalStateException: failed\n\tat example.Order.run(Order.java:42)';
const makeSpan = (overrides: Partial<TraceSpan> = {}) => ({
  spanID: 's1', statusCode: 2, tags: [], rawSpanAttributes: [], statusMessage: '',
  logs: [{ name: 'exception', timestamp: 123, fields: [
    { key: 'exception.type', value: 'java.lang.IllegalStateException' },
    { key: 'exception.message', value: 'failed' },
    { key: 'exception.stacktrace', value: stack },
  ] }], ...overrides,
} as TraceSpan);

describe('Span errors', () => {
  it('reads event details with empty status description without merging raw attributes or duplicate metadata', () => {
    const span = makeSpan({ tags: [{ key: 'exception.message', value: 'derived duplicate' }] });
    expect(getSpanErrors(span)).toEqual([{ type: 'java.lang.IllegalStateException', message: 'failed', stack }]);
    expect(span.rawSpanAttributes).toEqual([]);
  });
  it('preserves separate exceptions including type-only records and does not rewrite OK status', () => {
    const span = makeSpan({ statusCode: 1 });
    span.logs.push({ name: 'exception', timestamp: 124, fields: [{ key: 'exception.type', value: 'OtherException' }] });
    expect(getSpanErrors(span)).toHaveLength(2);
    expect(getSpanErrors(span)[1]).toEqual({ type: 'OtherException' });
    expect(span.statusCode).toBe(1);
  });
  it('uses raw DD aliases and then error status description, ignoring unrelated event messages', () => {
    expect(getSpanErrors(makeSpan({ logs: [], rawSpanAttributes: [{ key: 'error.msg', value: 'DD error' }] }))[0].message).toBe('DD error');
    expect(getSpanErrors(makeSpan({ logs: [{ name: 'request', timestamp: 1, fields: [{ key: 'exception.message', value: 'ignore' }] }], statusMessage: 'timeout' }))[0].message).toBe('timeout');
    expect(getSpanErrors(makeSpan({ logs: [], rawSpanAttributes: [], tags: [{ key: 'error.message', value: 'derived' }] }))).toEqual([]);
  });
  it('opens the complete stack, copies it and closes the dialog', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const view = render(<SpanErrors span={makeSpan()} />);
    fireEvent.click(view.getByRole('button', { name: '查看堆栈' }));
    expect(view.getByRole('dialog')).toHaveTextContent('Order.java:42');
    fireEvent.click(view.getByRole('button', { name: '复制完整堆栈' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(stack));
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  });
  it('shows missing details for ERROR and hides the section for a normal span', () => {
    const view = render(<SpanErrors span={makeSpan({ logs: [] })} />);
    expect(view.getByText('当前 Span 已标记为错误，但未提供错误信息或堆栈。')).toBeVisible();
    expect(view.queryByRole('button', { name: '查看堆栈' })).toBeNull();
    view.rerender(<SpanErrors span={makeSpan({ logs: [], statusCode: 0 })} />);
    expect(view.queryByText('Error Message')).toBeNull();
  });
});
