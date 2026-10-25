import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { DdAccordian } from './DdAccordian';

const theme = createTheme({ colorMode: 'light' });

function mount(props: Parameters<typeof DdAccordian>[0]) {
  return render(createElement(ThemeProvider, { theme, children: <DdAccordian {...props} /> }));
}

describe('DdAccordian', () => {
  it('点 header 触发 onToggle', () => {
    const onToggle = vi.fn();
    const { getByRole } = mount({ label: 'Tags', isOpen: false, onToggle, children: <span>X</span> });
    fireEvent.click(getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('open 时渲染 children，收起时不渲染', () => {
    const { queryByText, rerender } = mount({ label: 'Tags', isOpen: false, onToggle: () => {}, children: <span>BODY</span> });
    expect(queryByText('BODY')).toBeNull();
    rerender(
      createElement(ThemeProvider, {
        theme,
        children: (
          <DdAccordian label="Tags" isOpen onToggle={() => {}}>
            <span>BODY</span>
          </DdAccordian>
        ),
      })
    );
    expect(queryByText('BODY')).not.toBeNull();
  });

  it('count 徽标渲染；header role=button + aria-expanded 反映 isOpen', () => {
    const { getByRole, getByText } = mount({ label: 'Tags', count: 3, isOpen: true, onToggle: () => {}, children: <i /> });
    expect(getByText('3')).not.toBeNull();
    const header = getByRole('button');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('Enter/Space 键触发 onToggle', () => {
    const onToggle = vi.fn();
    const { getByRole } = mount({ label: 'Tags', isOpen: false, onToggle, children: <i /> });
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' });
    fireEvent.keyDown(getByRole('button'), { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
