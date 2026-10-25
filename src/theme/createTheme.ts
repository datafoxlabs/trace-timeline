import merge from 'lodash/merge.js';
import tinycolor from 'tinycolor2';

import { druidsTokens } from './tokens/druids';
import { traceTokens } from './tokens/trace';
import type { BreakpointKey, Theme, ThemeColorMode, ThemeOverride } from './types';

const GRID = 8;

const BREAKPOINTS: Record<BreakpointKey, number> = {
  xs: 0,
  sm: 544,
  md: 769,
  lg: 992,
  xl: 1200,
};

function spacing(...n: number[]): string {
  if (n.length === 0) {
    return `${GRID}px`;
  }
  return n.map((v) => `${v * GRID}px`).join(' ');
}

function makeEmphasize(mode: ThemeColorMode) {
  // light：压暗；dark：提亮（与 Grafana emphasize 方向一致）
  return (color: string, amount = 0.15): string => {
    const c = tinycolor(color);
    const pct = Math.round(amount * 100);
    return (mode === 'dark' ? c.lighten(pct) : c.darken(pct)).toRgbString();
  };
}

function down(key: BreakpointKey): string {
  // 与 Grafana 一致：down(key) 表示 < 该断点上界
  const px = BREAKPOINTS[key] - 0.02;
  return `@media (max-width:${px}px)`;
}

export interface CreateThemeOptions {
  colorMode?: ThemeColorMode;
  override?: ThemeOverride;
}

/**
 * 组装主题：GrafanaTheme2 子集形状（值填 DRUIDS）+ theme.trace。
 * override 对内置令牌深合并，未覆盖回退内置（AD-7）。
 */
export function createTheme(options: CreateThemeOptions = {}): Theme {
  const colorMode: ThemeColorMode = options.colorMode ?? 'light';
  const isLight = colorMode === 'light';
  const d = druidsTokens(colorMode);

  const base: Theme = {
    colorMode,
    isLight,
    isDark: !isLight,
    colors: {
      text: { ...d.text },
      background: { ...d.background },
      border: { ...d.border },
      primary: { main: d.primaryMain },
      error: {
        text: d.errorText,
        transparent: d.errorTransparent,
        borderTransparent: d.errorBorderTransparent,
      },
      success: { text: d.successText },
      emphasize: makeEmphasize(colorMode),
    },
    typography: {
      fontFamily: 'NotoSans, "PingFang SC", "Lucida Grande", sans-serif',
      fontWeightMedium: 500,
      bodySmall: { fontSize: '12px' },
      size: { sm: '12px', lg: '18px' },
      h1: { fontSize: '28px', fontWeight: 400, lineHeight: 1.2 },
      h2: { fontSize: '24px', fontWeight: 400, lineHeight: 1.2 },
      h3: { fontSize: '21px', fontWeight: 400, lineHeight: 1.2 },
      h4: { fontSize: '18px', fontWeight: 400, lineHeight: 1.2 },
      h5: { fontSize: '16px', fontWeight: 500, lineHeight: 1.2 },
      h6: { fontSize: '14px', fontWeight: 500, lineHeight: 1.2 },
    },
    shape: { radius: { sm: '2px', md: '4px', default: '2px' } },
    spacing,
    breakpoints: { down },
    trace: traceTokens(colorMode),
  };

  if (options.override) {
    // 深合并：override 覆盖 base，未覆盖回退（函数字段不会被普通对象覆盖）
    return merge({}, base, options.override) as Theme;
  }
  return base;
}
