// span-separator（Story 9.4d）——时间线列左缘的 3px 服务色竖脊。
//
// 真页实测口径（us5 waterfall，2026-07-10，`getComputedStyle` + `Color by` 切换 + 折叠）：
//   · 几何四态见 `separatorGeometry` 的 doc 表
//   · 填充跟 colorAccessor（随 colorBy 变），断口跟 **service**（不随 colorBy 变）
//   · 连段按**可见行序**算，兄弟行同样相连
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_HEIGHTS, type RenderableRow } from '../core';
import { mockTrace } from '../model';
import type { TraceSpan } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { colorAccessorForDimension, defaultColorAccessor, type ColorAccessor } from './colorAccessor';
import { separatorGeometry } from './DdSpanRow';
import { createDatadogRowRenderer } from './rowRenderer';

const theme = createTheme({ colorMode: 'light' });

/** mockTrace 可见行序（无折叠）：mall × 2 → redis → user → mysql → user → mall × 3。四种修饰符状态全覆盖。 */
const SPANS = mockTrace.spans;

function makeRow(index: number, over: Partial<RenderableRow> = {}): RenderableRow {
  const span = SPANS[index];
  return {
    span,
    spanIndex: index,
    isDetail: false,
    depth: span.depth,
    ancestorSpanIds: [],
    prevSpan: SPANS[index - 1],
    nextSpan: SPANS[index + 1],
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

function separatorOf(row: RenderableRow, colorAccessor?: ColorAccessor): HTMLElement | null {
  const renderer = createDatadogRowRenderer({ theme, trace: mockTrace, colorAccessor });
  const { container } = render(createElement(ThemeProvider, { theme, children: renderer(row) }));
  return container.querySelector<HTMLElement>('[data-testid="span-separator"]');
}

/** jsdom 会把 hex 归一成 `rgb(...)`；用同一条通道换算期望值，避免测试里手写转换。 */
function asCssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

const GAP = (DEFAULT_HEIGHTS.bar - theme.trace.barHeight) / 2;

describe('separatorGeometry —— 真页四态（gap = (行高 - 条高) / 2）', () => {
  it('gap 恰为 4px：竖脊上下缘与本行瀑布条齐平', () => {
    expect(GAP).toBe(4);
    expect(DEFAULT_HEIGHTS.bar).toBe(23);
    expect(theme.trace.barHeight).toBe(15);
  });

  it('两端皆断（孤立行）→ top/bottom 各 4、全圆角；净高 = 条高 15', () => {
    expect(separatorGeometry(true, true, theme)).toEqual({ top: 4, bottom: 4, borderRadius: '2px' });
    expect(DEFAULT_HEIGHTS.bar - 4 - 4).toBe(theme.trace.barHeight);
  });

  it('仅上断（向下接同服务）→ top 4 / bottom 0、仅顶圆角；净高 19', () => {
    expect(separatorGeometry(true, false, theme)).toEqual({ top: 4, bottom: 0, borderRadius: '2px 2px 0px 0px' });
    expect(DEFAULT_HEIGHTS.bar - 4 - 0).toBe(19);
  });

  it('仅下断（向上接同服务）→ top 0 / bottom 4、仅底圆角；净高 19', () => {
    expect(separatorGeometry(false, true, theme)).toEqual({ top: 0, bottom: 4, borderRadius: '0px 0px 2px 2px' });
  });

  it('两端皆连（连段中段）→ top/bottom 均 0、无圆角；净高 = 整行 23', () => {
    expect(separatorGeometry(false, false, theme)).toEqual({ top: 0, bottom: 0, borderRadius: '0px' });
  });
});

describe('span-separator 渲染', () => {
  it('每个 span 行都画竖脊：3px 宽、left:-1 骑在列分界线上', () => {
    const sep = separatorOf(makeRow(0))!;
    expect(sep).not.toBeNull();
    const cs = getComputedStyle(sep);
    expect(cs.width).toBe('3px');
    expect(cs.left).toBe('-1px');
    expect(cs.position).toBe('absolute');
    // 不吃指针：真页竖脊在 hover/点击上是透明的（行的 hover 底色照常跨过它）。
    expect(cs.pointerEvents).toBe('none');
  });

  it('竖脊是时间线列的首个子元素：条与 clipEdge 晚于它绘制', () => {
    const sep = separatorOf(makeRow(0))!;
    expect(sep.parentElement!.firstElementChild).toBe(sep);
  });

  it('detail 行不画竖脊（它不是 span 行）', () => {
    expect(separatorOf(makeRow(0, { isDetail: true }))).toBeNull();
  });

  it('填充 = colorAccessor(span)', () => {
    const sep = separatorOf(makeRow(2))!; // redis
    expect(sep.style.backgroundColor).toBe(asCssColor(defaultColorAccessor(theme)(SPANS[2])));
  });

  // mockTrace 可见行序：0,1 mall / 2 redis / 3 user / 4 mysql / 5 user / 6,7,8 mall
  it.each([
    [0, '4px', '0px', '2px 2px 0px 0px', '首行：上端收口，向下接同服务的 s2'],
    [1, '0px', '4px', '0px 0px 2px 2px', '向上接 s1，向下遇 redis 断开'],
    [2, '4px', '4px', '2px', 'redis 孤立：两端皆断'],
    [5, '4px', '4px', '2px', 'user-service 被 mysql 隔断：与同服务的 s7 不相邻，故仍孤立'],
    [7, '0px', '0px', '0px', '连段中段（s6-s5-s4 同服务）：整行贯通、无圆角'],
    [8, '0px', '4px', '0px 0px 2px 2px', '末行：下端收口'],
  ])('第 %i 行 → top=%s bottom=%s radius=%s（%s）', (i, top, bottom, radius) => {
    const sep = separatorOf(makeRow(i as number))!;
    expect(sep.style.top).toBe(top);
    expect(sep.style.bottom).toBe(bottom);
    expect(sep.style.borderRadius).toBe(radius);
  });

  it('兄弟行同服务也相连（不止父子）：s5 与 s6 之间无断口', () => {
    const s5 = SPANS[7];
    const s6 = SPANS[8];
    expect(s5.references[0]?.spanID).toBe(s6.references[0]?.spanID); // 同父 → 兄弟
    expect(separatorOf(makeRow(7))!.style.bottom).toBe('0px'); // s5 向下接 s6
    expect(separatorOf(makeRow(8))!.style.top).toBe('0px'); // s6 向上接 s5
  });

  // 真页反证（`Color by` → Entity Type）：相邻两行填充变同色，`--top-gap`/`--bottom-gap` 依旧在。
  // 这里用 `host` 维度复现——mockTrace 只有 s1 带 host 标签，s2..s6 全落到 'unknown host' → 同色。
  it('断口键在 service，不在渲染色：换 colorBy 后相邻行同色，断口一个不动', () => {
    const byHost = colorAccessorForDimension('host', theme);
    const fills = new Set([1, 2, 3, 4, 5].map((i) => asCssColor(byHost(SPANS[i]))));
    expect(fills.size).toBe(1); // 前提：s2..s9 在 host 维度下确实同色了

    // s2（index 1）与 s3（index 2）此刻同色，但异服务 → 断口必须仍在
    expect(separatorOf(makeRow(1), byHost)!.style.bottom).toBe('4px');
    expect(separatorOf(makeRow(2), byHost)!.style.top).toBe('4px');
    // 而填充确实跟着 colorBy 走了（redis 行不再是 service 维度那个颜色）
    expect(separatorOf(makeRow(2), byHost)!.style.backgroundColor).toBe(asCssColor(byHost(SPANS[2])));
    expect(separatorOf(makeRow(2), byHost)!.style.backgroundColor).not.toBe(
      asCssColor(defaultColorAccessor(theme)(SPANS[2])),
    );
  });

  it('邻行缺失（引擎给 undefined，如列表两端或隔着 detail 行）→ 该端收口', () => {
    const isolated = makeRow(7, { prevSpan: undefined, nextSpan: undefined });
    const sep = separatorOf(isolated)!;
    expect(sep.style.top).toBe('4px');
    expect(sep.style.bottom).toBe('4px');
    expect(sep.style.borderRadius).toBe('2px');
  });
});

describe('span-separator 服务同一性口径', () => {
  it('同服务名不同 process 对象仍视为同段（键取 getServiceColorKey，不比对象引用）', () => {
    const s1 = SPANS[0];
    const clone: TraceSpan = { ...s1, process: { ...s1.process } };
    const sep = separatorOf(makeRow(0, { prevSpan: clone }))!;
    expect(sep.style.top).toBe('0px'); // 与「同服务」的上一行相连
  });
});
