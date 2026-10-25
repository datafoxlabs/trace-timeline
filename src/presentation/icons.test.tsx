// Story 9.3e — 图标一律取自 datafox icon 库（DRUIDS 全量 441 个）。
//
// 守卫两件事：
// 1) 源级：presentation/ 下任何组件不得再从 `../ui` 引 lucide 包装的 <Icon>。
//    （`src/ui/Icon.tsx` 是 Story 1.4 的 grafana 名 → lucide 映射，视觉与真页不同源。）
// 2) 渲染级：实际渲染出的 <svg> 必须是 DRUIDS 填充式图标（fill=currentColor、无 stroke），
//    而非 lucide 的描边图标（fill=none + stroke=currentColor）。这一条 lucide 冒充不了。
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { RenderableRow } from '../core';
import { mockTrace } from '../model';
import type { TraceSpan } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { DdAccordian } from './DdAccordian';
import DdAccordianSrc from './DdAccordian.tsx?raw';
import { DdLabelCell } from './DdLabelCell';
import DdLabelCellSrc from './DdLabelCell.tsx?raw';
import { DdShareButton, DdSpanLinks } from './detailStubs';
import detailStubsSrc from './detailStubs.tsx?raw';

const theme = createTheme({ colorMode: 'light' });

const ICON_SRC: Record<string, string> = {
  DdLabelCell: DdLabelCellSrc,
  DdAccordian: DdAccordianSrc,
  detailStubs: detailStubsSrc,
};

function wrap(children: React.ReactNode) {
  return render(createElement(ThemeProvider, { theme, children }));
}

function makeRow(span: TraceSpan, over: Partial<RenderableRow> = {}): RenderableRow {
  return {
    span,
    spanIndex: 0,
    isDetail: false,
    depth: span.depth,
    ancestorSpanIds: [],
    viewBounds: { start: 0, end: 1, clippingLeft: false, clippingRight: false },
    isCollapsed: false,
    isMatchingFilter: false,
    isFocused: false,
    isError: false,
    descendantHasError: false,
    criticalPathSections: [],
    columnWidth: 0.3,
    hoverIndentGuideIds: new Set(),
    onChildrenToggle: () => {},
    onDetailToggle: () => {},
    addHoverIndentGuideId: () => {},
    removeHoverIndentGuideId: () => {},
    ...over,
  };
}

/**
 * DRUIDS 填充图标的指纹：`fill="currentColor"` 且**无 `stroke`**。
 * lucide 恰好相反（`fill="none"` + `stroke="currentColor"` + `viewBox="0 0 24 24"`），冒充不了。
 *
 * 注意：viewBox 并非恒为 192×192——createIconFromMarkup 默认 192，但 40 个字形自带原生网格
 * （如 AttentionCircledIcon = 448×512）。故 viewBox 逐图标钉死，兼作「别换成邻近字形」的回归锚。
 */
function expectDruidsIcon(svg: SVGElement | null, viewBox: string) {
  expect(svg).toBeTruthy();
  expect(svg!.getAttribute('fill')).toBe('currentColor');
  expect(svg!.getAttribute('stroke')).toBeNull();
  expect(svg!.getAttribute('viewBox')).toBe(viewBox);
}

const VB = { grid192: '0 0 192 192', attentionCircled: '0 0 448 512' } as const;

describe('图标来源守卫（Story 9.3e）', () => {
  it.each(Object.keys(ICON_SRC))('%s 不再从 ../ui 引 lucide 包装的 Icon', (name) => {
    expect(ICON_SRC[name]).not.toContain("from '../ui'");
    expect(ICON_SRC[name]).not.toMatch(/<Icon\s+name=/);
  });

  it.each(Object.keys(ICON_SRC))('%s 从 @datafox/ui 取图标', (name) => {
    expect(ICON_SRC[name]).toContain("from '@datafox/ui'");
  });

  // 全域守卫：src/ 下**任何**文件都不得再 import lucide-react（依赖已卸，装回来也会被这条挡住）。
  // `import.meta.glob` 在构建期展开，故新增文件自动纳入，不需维护清单。
  it('src/ 全域：无一处 import lucide-react', () => {
    const all = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >;
    const paths = Object.keys(all);
    expect(paths.length).toBeGreaterThan(30); // glob 真的抓到了文件，而非静默返回空集

    const offenders = paths.filter((p) => /from\s+['"]lucide-react['"]/.test(all[p]));
    expect(offenders).toEqual([]);
  });
});

describe('DdLabelCell 错误图标（Story 9.3e）', () => {
  const errSpan = mockTrace.spans.find((s) => s.spanID === 's4')!;

  it('小红叹号 = datafox AttentionCircledIcon（DRUIDS 填充式，非 lucide 描边）', () => {
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { isError: true })} />);
    const wrapEl = container.querySelector('[class*="DdLabelError"]')!;
    expectDruidsIcon(wrapEl.querySelector('svg'), VB.attentionCircled);
  });

  // Story 9.3f 复审：真页该图标是 `Icon size--md` = 16px。9.3e 的 `xs`(12px) 是「把 lucide 的 13px 归到
  // datafox icon 刻度」时就近取的，**从未在真页核实**——真页 error trace（`6a4fc31c…`）实测为 16px。
  it('叹号尺寸 = size token md=16px（真页 `Icon size--md` 实测）', () => {
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { isError: true })} />);
    const svg = container.querySelector('[class*="DdLabelError"] svg')!;
    expect(svg.getAttribute('width')).toBe('16px');
    expect(svg.getAttribute('height')).toBe('16px');
  });

  it('红色由 currentColor 从 statusDanger 容器继承（图标自身不写死颜色）', () => {
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { isError: true })} />);
    const wrapEl = container.querySelector('[class*="DdLabelError"]') as HTMLElement;
    expect(wrapEl.className).toBeTruthy();
    expect(container.querySelector('[class*="DdLabelError"] svg')!.getAttribute('fill')).toBe('currentColor');
  });

  // Story 9.3g 复审（a11y）：`title` 必须传给 icon 自身——datafox `createIcon` 有 title 才渲染
  // `role="img"` + `<title>`，否则恒 `aria-hidden="true"`，挂在外层 div 上的 title 读屏不可靠。
  // 真页此处是 aria-hidden，本仓**有意偏离**：零视觉差异，不拿可访问性换像素一致。
  it('错误图标对读屏可见：role=img + <title>，且不再 aria-hidden', () => {
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { isError: true })} />);
    const svg = container.querySelector('[class*="DdLabelError"] svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.querySelector('title')?.textContent).toBe('error');
  });

  it('仅子代出错时 title 区分为 descendant error', () => {
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { isError: false, descendantHasError: true })} />);
    expect(container.querySelector('[class*="DdLabelError"] svg title')?.textContent).toBe('descendant error');
  });

  it('无错误 → 不渲染叹号', () => {
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { isError: false, descendantHasError: false })} />);
    expect(container.querySelector('[class*="DdLabelError"]')).toBeNull();
  });

  it('RPC 合并箭头 = datafox ArrowRightIcon', () => {
    const rpc = { serviceName: 'svc-b', operationName: 'op', process: errSpan.process, viewStart: 0, viewEnd: 1 };
    const { container } = wrap(<DdLabelCell row={makeRow(errSpan, { rpc })} />);
    expectDruidsIcon(container.querySelector('[class*="DdLabelRpcArrow"] svg'), VB.grid192);
  });
});

describe('DdAccordian 折叠箭头（Story 9.3e）', () => {
  it('chevron = datafox AngleRightIcon（DRUIDS 填充式）', () => {
    const { container } = wrap(
      <DdAccordian label="Tags" isOpen={false} onToggle={() => {}}>
        <div />
      </DdAccordian>
    );
    expectDruidsIcon(container.querySelector('[data-slot="accordion-header"] svg'), VB.grid192);
  });

  it('箭头 16px（size token md），展开状态由公共 Accordion 提供', () => {
    const { container } = wrap(
      <DdAccordian label="Tags" isOpen onToggle={() => {}}>
        <div />
      </DdAccordian>
    );
    const svg = container.querySelector('[data-slot="accordion-header"] svg')!;
    expect(svg.getAttribute('width')).toBe('16px');
    expect(container.querySelector('[data-slot="accordion-header"]')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('detailStubs 图标（Story 9.3e）', () => {
  const span = mockTrace.spans[0];

  it('分享按钮 = datafox ExportIcon（DRUIDS 无 share 字形，见 story D2）', () => {
    const { container } = wrap(<DdShareButton span={span} onShareSpan={() => {}} />);
    expectDruidsIcon(container.querySelector('svg'), VB.grid192);
  });

  it('关联链接按钮 = datafox LinkIcon', () => {
    const { container } = wrap(<DdSpanLinks span={span} onSpanLinks={() => {}} />);
    expectDruidsIcon(container.querySelector('svg'), VB.grid192);
  });

  it('两个按钮图标均 14px（size token sm）', () => {
    const a = wrap(<DdShareButton span={span} onShareSpan={() => {}} />);
    const b = wrap(<DdSpanLinks span={span} onSpanLinks={() => {}} />);
    expect(a.container.querySelector('svg')!.getAttribute('width')).toBe('14px');
    expect(b.container.querySelector('svg')!.getAttribute('width')).toBe('14px');
  });
});
