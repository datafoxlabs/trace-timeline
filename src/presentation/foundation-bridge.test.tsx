// Story 9.1 — Foundation 桥接守卫。
// 1) 源级守卫：waterfall 区域 10 组件不得回退平行 DRUIDS（theme.colors.*/status/selectedRowBg/fontFamily/detail.link），且须消费 uiTokens。
//    服务色（theme.trace.categoricalPalette / colorForSpanId / colorForService）是 D2 例外，不在守卫内。
// 2) 残留色守卫：除 4 处文档化例外（clip 渐隐 · reframe/resize 半透明蓝）外，区域内无硬编码 6 位 hex / rgba。
// 3) .dark 作用域 wrapper（AC #2）：TraceTimeline 根按 colorMode 挂/摘 `.dark`，且不触碰 document.documentElement。
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { TraceTimeline } from '../api/TraceTimeline';
import { createTheme, ThemeProvider, type ThemeColorMode } from '../theme';

// `?raw` 把源文件作为字符串引入（vitest 原生支持；类型见 src/vite-raw.d.ts）。
import DdColorByDropdownSrc from './DdColorByDropdown.tsx?raw';
import DdColumnResizerSrc from './DdColumnResizer.tsx?raw';
import DdIndentGuidesSrc from './DdIndentGuides.tsx?raw';
import DdTimeCursorSrc from './DdTimeCursor.tsx?raw';
import DdLabelCellSrc from './DdLabelCell.tsx?raw';
import DdSearchBarSrc from './DdSearchBar.tsx?raw';
import DdSpanBarSrc from './DdSpanBar.tsx?raw';
import DdSpanRowSrc from './DdSpanRow.tsx?raw';
import DdTicksSrc from './DdTicks.tsx?raw';
import DdTimelineHeaderSrc from './DdTimelineHeader.tsx?raw';
import DdViewingLayerSrc from './DdViewingLayer.tsx?raw';

const REGION_SRC: Record<string, string> = {
  DdSearchBar: DdSearchBarSrc,
  DdColorByDropdown: DdColorByDropdownSrc,
  DdLabelCell: DdLabelCellSrc,
  DdSpanBar: DdSpanBarSrc,
  DdSpanRow: DdSpanRowSrc,
  DdTimelineHeader: DdTimelineHeaderSrc,
  DdTicks: DdTicksSrc,
  DdIndentGuides: DdIndentGuidesSrc,
  DdColumnResizer: DdColumnResizerSrc,
  DdViewingLayer: DdViewingLayerSrc,
  // Story 9.4：hover 交互态新增的区域组件（行内 ActionTray 于 9.4e 改用 datafox `ActionTray`，不再是本仓组件）。
  DdTimeCursor: DdTimeCursorSrc,
};

// 已桥接到 --ui-* 的旧 DRUIDS 消费点——区域内不得再出现。
// `theme.colors.` 为 catch-all：区域任何 theme.colors.* 都应已桥接，避免手挑清单漏掉 warning/info/disabled/secondary 等新增键。
const LEGACY = [
  'theme.colors.',
  'theme.trace.status',
  'theme.trace.selectedRowBg',
  'theme.trace.fontFamily',
  'theme.trace.detail.link',
];

// 文档化例外（datafox 无对应 token：功能性最大对比 / 半透明装饰；见各文件行内注释）。
const DOC_EXCEPTIONS = [
  '#fff', // DdSpanBar.cp 关键路径最大对比标记（亮态叠色）
  '#111', // DdSpanBar.cp 关键路径最大对比标记（暗态叠色）
  'rgba(255,255,255,0.22)', // DdSpanRow clipLeft/Right 暗端渐隐
  'rgba(25,25,25,0.22)', // DdSpanRow clipLeft/Right 亮端渐隐
  // Story 9.4c 注销了 DdColumnResizer 的 `rgba(110,159,255,0.08)` 拖拽色带例外：
  // 拖拽态改为真页语义（3px `--ui-interaction-primary` 实心条），无半透明装饰。
  'rgba(110, 159, 255, 0.18)', // DdViewingLayer reframe 半透明蓝
  // Story 9.4b 注销了 DdTimeCursor 的三条字面值例外（DRUIDS 明暗对）：药丸改用 datafox `Tooltip`，
  // 面色/字色/箭头全部来自 --ui-background-shade / --ui-text-knockout，无需例外。
];

describe('Story 9.1 Foundation 桥接：源级守卫', () => {
  it.each(Object.keys(REGION_SRC))('%s 不回退平行 DRUIDS 且消费 uiTokens', (name) => {
    const src = REGION_SRC[name];
    for (const legacy of LEGACY) {
      expect(src.includes(legacy), `${name} 仍引用已桥接的 ${legacy}`).toBe(false);
    }
    expect(src.includes("from './uiTokens'"), `${name} 未 import uiTokens`).toBe(true);
  });

  it('区域内无残留硬编码 hex/rgba（文档化例外除外）', () => {
    // 3–8 位 hex（含 #fff 三位 / #rrggbbaa 八位）+ rgb/rgba + hsl/hsla；不再用 6 位专用正则，避免漏掉短 hex。
    const colorRe = /#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
    const offenders: string[] = [];
    for (const [name, src] of Object.entries(REGION_SRC)) {
      src.split('\n').forEach((line, i) => {
        const matches = line.match(colorRe);
        if (!matches) return;
        // 逐个匹配精确判定：rgba(0,0,0,0) 透明兜底 + 文档化例外**整串**放行（不再整行放行，避免同行掩护真违规）。
        const bad = matches.filter((m) => m !== 'rgba(0,0,0,0)' && !DOC_EXCEPTIONS.includes(m));
        if (bad.length) offenders.push(`${name}:${i + 1}  ${bad.join(' , ')}`);
      });
    }
    expect(offenders, `发现残留硬编码色：\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('Story 9.1 .dark 作用域 wrapper（AC #2）', () => {
  // 用 trace={null} 的空态路径：走同一 rootClass 逻辑，但不触发虚拟列表测量（jsdom 稳定）。
  const renderRoot = (mode: ThemeColorMode) => {
    const theme = createTheme({ colorMode: mode });
    const { container } = render(
      createElement(ThemeProvider, {
        theme,
        children: createElement(TraceTimeline, { trace: null, height: 200 }),
      })
    );
    return container.firstElementChild as HTMLElement;
  };

  it('colorMode=dark → 组件根挂 .dark', () => {
    expect(renderRoot('dark').classList.contains('dark')).toBe(true);
  });

  it('colorMode=light → 组件根无 .dark', () => {
    expect(renderRoot('light').classList.contains('dark')).toBe(false);
  });

  it('作用域限组件子树：不触碰 document.documentElement', () => {
    renderRoot('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
