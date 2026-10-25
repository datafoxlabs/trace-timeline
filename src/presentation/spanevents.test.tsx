import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TraceSpan } from '../model';
import { SpanEvents } from './SpanEvents';

const span = { startTime: 1000, logs: [
  { name: 'exception', timestamp: 1500, fields: [{ key: 'exception.message', value: 'failure' }, { key: '_internal', value: 'hidden' }] },
  { name: 'retry', timestamp: 900, fields: [{ key: 'attempt', value: 0 }] },
] } as TraceSpan;

describe('Span events', () => {
  it('keeps event boundaries, signed offsets and raw exception attributes without error cards', () => {
    const view = render(<SpanEvents span={span} />);
    expect(view.getByText('+500μs')).toBeVisible();
    expect(view.getByText('−100μs')).toBeVisible();
    fireEvent.click(view.getByRole('button', { name: /500μs exception/ }));
    expect(view.getByText('exception.message')).toBeVisible();
    expect(view.getByText('failure')).toBeVisible();
    expect(view.queryByText('_internal')).toBeNull();
    expect(view.queryByText('attempt')).toBeNull();
    expect(view.queryByText('Error Message')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: /100μs retry/ }));
    expect(view.getByText('0')).toBeVisible();
  });
  it('omits an empty section and handles unnamed events with no public attributes', () => {
    const view = render(<SpanEvents span={{ ...span, logs: [] }} />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<SpanEvents span={{ ...span, logs: [{ timestamp: 1000, fields: [{key: '_hidden', value: true}] }] }} />);
    fireEvent.click(view.getByRole('button', { name: /未命名事件/ }));
    expect(view.getByText('暂无可展示的事件属性')).toBeVisible();
  });
});
