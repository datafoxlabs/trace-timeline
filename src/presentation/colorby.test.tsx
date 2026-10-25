import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { DdColorByDropdown, type ColorByDimension } from './DdColorByDropdown';

const theme = createTheme({ colorMode: 'light' });

function mount(props: Parameters<typeof DdColorByDropdown>[0] = {}) {
  return render(createElement(ThemeProvider, { theme, children: <DdColorByDropdown {...props} /> }));
}

// Story 9.2：原生 <select> → datafox 复合 <Select>（Radix）。触发器是 combobox 按钮，选项在 Portal listbox。
// Radix Select 的「打开 Portal 菜单」交互依赖 react-remove-scroll 等 transitive CJS 依赖；在本仓 vitest（jsdom
// + 跨 PM `file:` 链的 datafox 嵌套 react）下无法稳定 dedupe → 打开即抛。真浏览器（demo/prod）由 bundler 正常
// dedupe，无此问题。故此处覆盖「值/标签契约 + a11y」，选中→onChange 的交互留 demo 手工核（Story 9.2 Task 11）。
describe('DdColorByDropdown', () => {
  it('渲染 Color by 标签 + 触发器默认显示 Service', () => {
    const { getByText, getByLabelText } = mount();
    expect(getByText('Color by')).not.toBeNull();
    expect(getByLabelText('Color by 维度').textContent).toContain('Service');
  });

  it('受控 value 覆盖三维度：触发器分别显示 Service / Host / Entity Type', () => {
    const cases: Array<[ColorByDimension, string]> = [
      ['service', 'Service'],
      ['host', 'Host'],
      ['entity', 'Entity Type'],
    ];
    for (const [value, label] of cases) {
      const { getByLabelText, unmount } = mount({ value });
      expect(getByLabelText('Color by 维度').textContent).toContain(label);
      unmount();
    }
  });

  it('触发器保留 a11y 契约：role=combobox + aria-label', () => {
    const { getByRole } = mount();
    const trigger = getByRole('combobox', { name: 'Color by 维度' });
    expect(trigger).not.toBeNull();
  });
});
