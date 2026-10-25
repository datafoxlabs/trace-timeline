import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { backgroundFor, DdIndentGuides } from './DdIndentGuides';
// 源级守卫：jsdom 不解析 `repeating-linear-gradient` / `calc()`，computed style 断言不可靠。
// 沿用本仓 foundation-bridge.test.tsx 的 `?raw` 模式；像素级复核走真浏览器（AC #8）。
import DdIndentGuidesSrc from './DdIndentGuides.tsx?raw';
import DdSpanRowSrc from './DdSpanRow.tsx?raw';

const theme = createTheme({ colorMode: 'light' });

function mount(props: Partial<Parameters<typeof DdIndentGuides>[0]> = {}) {
  return render(
    createElement(ThemeProvider, {
      theme,
      children: (
        <DdIndentGuides ancestorSpanIds={['a', 'b']} hasChildren={false} isCollapsed={false} {...props} />
      ),
    })
  );
}

const treeEl = (c: HTMLElement) => c.querySelector('[class*="DdIndentGuides"]') as HTMLElement;

// Story 9.3d（D1）：树 span 宽度与背景层。真页 W = 30 + 16 × depth。
describe('DdIndentGuides 几何（Story 9.3d）', () => {
  it.each([
    [0, '30px'],
    [1, '46px'],
    [2, '62px'],
    [3, '78px'],
    [4, '94px'],
  ])('depth=%i → 树 span 宽 %s（真页逐行实测值）', (depth, expected) => {
    const { container } = mount({ ancestorSpanIds: Array.from({ length: depth }, (_, i) => `a${i}`) });
    expect(treeEl(container).style.width).toBe(expected);
  });

  it('depth=0 且无子节点 → 无任何背景层（根叶子行）', () => {
    expect(backgroundFor(0, false)).toEqual({});
  });

  it('depth=0 展开 → 仅下探竖头，无条纹、无肘部', () => {
    const bg = backgroundFor(0, true, false);
    expect(bg.backgroundImage).not.toContain('repeating-linear-gradient');
    expect(bg.backgroundSize).toBe('1px 10px');
    expect(bg.backgroundPosition).toBe('calc(100% - 14px) 100%');
  });

  // Story 9.3g（A）：真页 `--tree-line-start` 只在 `.cell--is-expanded` 上赋值 —— 折叠的枝行没有下探竖头。
  it('depth=0 折叠 → 无下探竖头（真页 --tree-line-start 未赋值）', () => {
    expect(backgroundFor(0, true, true)).toEqual({});
  });

  it('展开的枝行 → 三层：条纹 + 10px 肘部 + 下探竖头', () => {
    const bg = backgroundFor(2, true, false);
    expect(bg.backgroundImage).toContain('repeating-linear-gradient');
    expect(bg.backgroundSize).toBe('calc(100% - 32px) 100%, 10px 1px, 1px 10px');
    expect(bg.backgroundPosition).toBe('0 0, calc(100% - 20px) 50%, calc(100% - 14px) 100%');
  });

  it('折叠的枝行 → 两层：条纹 + 10px 肘部，**无**下探竖头（肘部长度仍按叶/枝，非展开态）', () => {
    const bg = backgroundFor(2, true, true);
    expect(bg.backgroundSize).toBe('calc(100% - 32px) 100%, 10px 1px');
    expect(bg.backgroundPosition).toBe('0 0, calc(100% - 20px) 50%');
  });

  it('叶行 → 两层：条纹 + 20px 肘部，无下探竖头', () => {
    const bg = backgroundFor(2, false);
    expect(bg.backgroundSize).toBe('calc(100% - 32px) 100%, 20px 1px');
    expect(bg.backgroundPosition).toBe('0 0, calc(100% - 10px) 50%');
  });

  it('条纹层只用语义色，不含 hex/rgba（datafox Foundations：禁 palette hex）', () => {
    const bg = backgroundFor(2, true);
    expect(bg.backgroundImage).toContain('var(--ui-border)');
    expect(bg.backgroundImage).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });
});

// Story 9.3d（D1）：父级导线（level d-1）背景层画不到，由 connector 承担。
// Story 9.3g（B）：高度键在 `isExpanded`；短连接件键在 `isAfterRoot`（真页 `.tr--is-root + .tr`），非 depth===1。
describe('DdIndentGuides 父级连接件（Story 9.3d / 9.3g）', () => {
  it('depth=0 → 无 connector（真页根行 ::before display:none）', () => {
    const { container } = mount({ ancestorSpanIds: [] });
    expect(container.querySelector('[data-testid="indent-connector"]')).toBeNull();
  });

  it('紧跟根行的那一行 → 上探 3.5px、止于行中心（真页在根行下半留断口）', () => {
    const { container } = mount({ ancestorSpanIds: ['a'], hasChildren: true, isAfterRoot: true });
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.left).toBe('15px');
    expect(c.style.top).toBe('-3.5px');
    expect(c.style.height).toBe('15px'); // 11.5 + 3.5
  });

  // 真页该规则特异度高于 `.cell--is-expanded { height: 150% }`，故展开也不变 15px。
  it('紧跟根行且展开 → 仍是 15px（真页相邻兄弟选择器特异度更高）', () => {
    const { container } = mount({ ancestorSpanIds: ['a'], hasChildren: true, isCollapsed: false, isAfterRoot: true });
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.height).toBe('15px');
  });

  // 9.3d 把这条键在 `depth === 1`，导致根的**非首个**展开子行连接件短 19.5px、x=15 处留缺口。
  it('depth=1 但**不**紧跟根行、且展开 → 常规连接件下探到本行底（34.5）', () => {
    const { container } = mount({ ancestorSpanIds: ['a'], hasChildren: true, isCollapsed: false, isAfterRoot: false });
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.top).toBe('-11.5px');
    expect(c.style.height).toBe('34.5px');
  });

  it('depth≥2 叶行 → 上一行中心 → 本行中心（h = 行高 23）', () => {
    const { container } = mount({ ancestorSpanIds: ['a', 'b'], hasChildren: false });
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.left).toBe('31px'); // 15 + 16×(2-1)
    expect(c.style.top).toBe('-11.5px');
    expect(c.style.height).toBe('23px');
  });

  it('depth≥2 展开的枝行 → 下探到本行底（h = 1.5 × 行高 = 34.5），交棒给子行条纹层', () => {
    const { container } = mount({ ancestorSpanIds: ['a', 'b'], hasChildren: true, isCollapsed: false });
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.height).toBe('34.5px');
  });

  // Story 9.3g（A）：折叠的枝行没有子行接棒，真页 `height: 150%` 不生效 → 止于本行中心。
  it('depth≥2 折叠的枝行 → 止于本行中心（23），不下探（否则会在下一行留一截野线）', () => {
    const { container } = mount({ ancestorSpanIds: ['a', 'b'], hasChildren: true, isCollapsed: true });
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.height).toBe('23px');
  });
});

// Story 9.3g（C）：真页 `.expander--arrow { z-index:1; background: var(--table-row-background) }`
// —— 不透明底板把穿过箭头的导线遮住。缺了它，子行连接件会压在父行箭头上。
describe('DdIndentGuides 折叠箭头底板（Story 9.3g）', () => {
  it('箭头带不透明底板 + z-index，消费 DdSpanRow 下发的 --dd-row-bg', () => {
    expect(DdIndentGuidesSrc).toMatch(/zIndex:\s*1/);
    expect(DdIndentGuidesSrc).toContain('var(--dd-row-bg');
  });

  it('DdSpanRow 为每种行态赋值 --dd-row-bg（默认/hover/选中/命中）', () => {
    const occurrences = DdSpanRowSrc.match(/--dd-row-bg/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
  });
});

// Story 9.3g：真页导线**无任何 `:hover` 规则**（唯一那条 `:hover > .expander--tree` 改的是图标色，
// 且针对另一个变体）。9.3d D3 的 hover 跨行高亮是本仓自造，据真页移除；core 的 useHoverIndentGuide API 保留。
describe('DdIndentGuides 不再有 hover 高亮（Story 9.3g 推翻 9.3d D3）', () => {
  it('不渲染 hover 命中区', () => {
    const { container } = mount({ ancestorSpanIds: ['a', 'b', 'c'] });
    expect(container.querySelectorAll('[class$="DdIndentHit"]').length).toBe(0);
  });

  it('即便传入 hoverIndentGuideIds，也不渲染覆盖线、connector 不变色', () => {
    const { container } = mount({ ancestorSpanIds: ['a', 'b', 'c'], hoverIndentGuideIds: new Set(['a', 'b']) });
    expect(container.querySelectorAll('[class$="DdIndentHighlight"]').length).toBe(0);
    const c = container.querySelector('[data-testid="indent-connector"]') as HTMLElement;
    expect(c.style.background).toBe('');
  });

  it('源码不再引用 interactionPrimary 作导线色（focus-visible 描边除外）', () => {
    const guideColorUse = DdIndentGuidesSrc.match(/interactionPrimary/g) ?? [];
    expect(guideColorUse.length).toBe(1); // 仅 `&:focus-visible` 的 outline
  });
});

// Story 9.3d（D8/D10）：datafox 图标 + 原生 button + a11y。
describe('DdIndentGuides 图标与 a11y（Story 9.3d）', () => {
  it('折叠箭头用 datafox 图标，不再引 lucide 的 ../ui Icon', () => {
    expect(DdIndentGuidesSrc).toContain("from '@datafox/ui'");
    expect(DdIndentGuidesSrc).toContain('ChevronRightIcon');
    expect(DdIndentGuidesSrc).toContain('ChevronDownIcon');
    expect(DdIndentGuidesSrc).not.toContain("from '../ui'");
  });

  it('箭头尺寸 size="md" = 16px（datafox size.icon.md，与真页 size--md 一致）', () => {
    const { container } = mount({ hasChildren: true });
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('16px');
    expect(svg.getAttribute('height')).toBe('16px');
  });

  it('有子节点 → 原生 button + aria-expanded + aria-label', () => {
    const { container } = mount({ hasChildren: true, isCollapsed: true });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.type).toBe('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('expand');
  });

  it('展开态 aria-expanded=true', () => {
    const { container } = mount({ hasChildren: true, isCollapsed: false });
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('叶子行 → 无 button、无箭头、不可聚焦', () => {
    const { container } = mount({ hasChildren: false });
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('不再消费服务色（colorForSpanId 已摘除）', () => {
    expect(DdIndentGuidesSrc).not.toContain('colorForSpanId');
    expect(DdIndentGuidesSrc).not.toContain('indentLine');
  });
});
