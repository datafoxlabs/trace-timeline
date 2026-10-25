import { fireEvent, render, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { DdViewTabs } from './DdViewTabs';

const theme = createTheme({ colorMode: 'light' });

function mount(props: Parameters<typeof DdViewTabs>[0]) {
  return render(createElement(ThemeProvider, { theme, children: <DdViewTabs {...props} /> }));
}

describe('DdViewTabs', () => {
  it('点 tab 触发 onChange', () => {
    const onChange = vi.fn();
    const { container } = mount({ value: 'waterfall', onChange });
    fireEvent.click(within(container).getByRole('tab', { name: 'Flame Graph' }));
    expect(onChange).toHaveBeenCalledWith('flamegraph');
  });

  it('active 态 aria-selected 正确', () => {
    const { container } = mount({ value: 'flamegraph', onChange: () => {} });
    expect(within(container).getByRole('tab', { name: 'Flame Graph' }).getAttribute('aria-selected')).toBe('true');
    expect(within(container).getByRole('tab', { name: 'Waterfall' }).getAttribute('aria-selected')).toBe('false');
  });
});
