import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { autoColor } from './autoColor';
import { createTheme } from './createTheme';
import { ThemeProvider } from './context';
import { useStyles2 } from './useStyles2';
import type { Theme } from './types';

describe('createTheme', () => {
  it('light/dark colorMode 与标志位', () => {
    const light = createTheme({ colorMode: 'light' });
    expect(light.isLight).toBe(true);
    expect(light.isDark).toBe(false);
    expect(light.colors.background.primary).toBe('rgb(249,250,251)');

    const dark = createTheme({ colorMode: 'dark' });
    expect(dark.isDark).toBe(true);
    expect(dark.colors.background.primary).not.toBe(light.colors.background.primary);
  });

  it('theme.trace 字段齐全', () => {
    const t = createTheme();
    // Story 9.3（D2）：真页实测 bar 为 height:15 + 四角全圆 2px；
    // 旧断言 '2px 2px 0 0' / 19 记的是被误认作 bar 的 `span-separator`。
    expect(t.trace.barRadius).toBe('2px');
    expect(t.trace.barHeight).toBe(15);
    expect(t.trace.selectedRowBg).toBe('rgb(234,246,252)');
    expect(t.trace.categoricalPalette.length).toBeGreaterThan(0);
    expect(t.trace.status.error.fg).toBe('#EB364B');
  });

  it('spacing 按 gridSize(8) 计算', () => {
    const t = createTheme();
    expect(t.spacing(2)).toBe('16px');
    expect(t.spacing(1, 2)).toBe('8px 16px');
  });

  it('override 深合并、未覆盖回退内置', () => {
    const base = createTheme({ colorMode: 'light' });
    const t = createTheme({
      colorMode: 'light',
      override: { colors: { text: { primary: '#ff0000' } } },
    });
    expect(t.colors.text.primary).toBe('#ff0000'); // 覆盖
    expect(t.colors.text.secondary).toBe(base.colors.text.secondary); // 回退
    expect(t.trace.barRadius).toBe(base.trace.barRadius); // 未触及
  });
});

describe('autoColor', () => {
  it('light 原样返回', () => {
    expect(autoColor({ isLight: true }, '#abcdef')).toBe('#abcdef');
  });
  it('dark 返回不同值', () => {
    expect(autoColor({ isLight: false }, '#abcdef')).not.toBe('#abcdef');
  });
});

describe('useStyles2', () => {
  const getStyles = (theme: Theme) => ({ color: theme.colors.text.primary });

  it('同一 theme + getStyles 返回同一引用（memo）', () => {
    const theme = createTheme({ colorMode: 'light' });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ThemeProvider, { theme, children });
    const { result, rerender } = renderHook(() => useStyles2(getStyles), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.color).toBe(theme.colors.text.primary);
  });
});
