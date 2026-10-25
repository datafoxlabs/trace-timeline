import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTheme, ThemeProvider } from '../theme';
import { flattenAttributes, SpanAttributeList } from './SpanAttributeList';

const entries = flattenAttributes([
  { key: 'http.method', value: 'GET' },
  { key: 'payload', value: { user: { name: 'Ada' }, tags: ['a', 'b'], empty: {}, nil: null, ok: false } },
]);

describe('Span attribute list', () => {
  it('preserves dotted names, flattens nested objects and array indices, and retains empty and scalar values', () => {
    expect(entries).toEqual([
      { key: 'http.method', value: 'GET' }, { key: 'payload.user.name', value: 'Ada' },
      { key: 'payload.tags[0]', value: 'a' }, { key: 'payload.tags[1]', value: 'b' },
      { key: 'payload.empty', value: {} }, { key: 'payload.nil', value: null }, { key: 'payload.ok', value: false },
    ]);
  });
  it('searches names and values, pins, and reports unmatched searches', () => {
    const pin = vi.fn();
    const view = render(<ThemeProvider theme={createTheme({ colorMode: 'light' })}><SpanAttributeList entries={entries} searchable onTogglePin={pin} /></ThemeProvider>);
    fireEvent.change(view.getByRole('textbox', { name: '搜索 Span 属性' }), { target: { value: 'aDA' } });
    expect(view.container.querySelectorAll('[data-attribute-key]')).toHaveLength(1);
    fireEvent.click(view.getByRole('button', { name: '固定 payload.user.name' }));
    expect(pin).toHaveBeenCalledWith('payload.user.name');
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'http.method' } });
    expect(view.getByText('GET')).toBeVisible();
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'missing' } });
    expect(view.getByRole('status')).toHaveTextContent('没有匹配的属性');
  });
  it('expands long values and copies the complete untruncated value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const long = 'abc'.repeat(200);
    const view = render(<ThemeProvider theme={createTheme({ colorMode: 'light' })}><SpanAttributeList entries={[{ key: 'message', value: long }]} /></ThemeProvider>);
    expect(view.queryByText(long)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '展开完整值' }));
    expect(view.getByText(long)).toBeVisible();
    fireEvent.click(view.getByRole('button', { name: '复制属性值 message' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(long));
  });
});
