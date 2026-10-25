// Story 9.4 / A —— 刻度游标；Story 9.4b —— 药丸改用 datafox Tooltip，瀑布图/火焰图共用。
//
// 纯函数 `axisGeometry` / `flameGeometry` / `timeAtCursor` 承担全部换算，组件只负责画。
// 理由：jsdom 不布局，也无从测浮层几何；换算若埋在组件里就测不动。
// 药丸的**外观**（深炭底、白字、4px 圆角、11×6 箭头）由 datafox `TooltipContent` 负责，
// 本文件只钉住「确实走了 datafox Tooltip」以及两个必须显式打开的 Radix 开关。
import { fireEvent, render, waitFor } from '@testing-library/react';
import { createElement, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import {
  axisGeometry,
  CURSOR,
  CURSOR_ANCHOR_Y,
  DdTimeCursor,
  DdTimeCursorLayer,
  flameGeometry,
  timeAtCursor,
} from './DdTimeCursor';
import DdTimeCursorSrc from './DdTimeCursor.tsx?raw';
import { AXIS_LEFT_INSET, AXIS_RIGHT_GUTTER } from './layout';

const theme = createTheme({ colorMode: 'light' });

const MS = 1000; // 微秒 → 毫秒

const WATERFALL_GEO = axisGeometry({ width: 1000, columnWidth: 0.3, viewDuration: 100 * MS, viewStart: 0, viewEnd: 1 });

/**
 * 药丸的可见文本。
 *
 * Radix `TooltipContent` 内除可见内容外，还渲染一份 `role="tooltip"` 的视觉隐藏副本（供 aria-describedby），
 * 故整个节点的 `textContent` 是**双份**（`50ms50ms`）。取首个文本节点即可见那份。
 */
const pillText = (pill: HTMLElement) => pill.firstChild?.textContent;

function mount(props: Partial<Parameters<typeof DdTimeCursor>[0]> = {}) {
  return render(
    createElement(ThemeProvider, {
      theme,
      children: <DdTimeCursor cursorX={600} geo={WATERFALL_GEO} {...props} />,
    })
  );
}

describe('axisGeometry（Story 9.4）', () => {
  it('轴盒 = 标签列右缘 + AXIS_LEFT_INSET → 总宽 − AXIS_RIGHT_GUTTER（与 DdTicks/DdSpanBar 同源）', () => {
    const g = axisGeometry({ width: 1000, columnWidth: 0.3, viewDuration: 100 * MS, viewStart: 0, viewEnd: 1 });
    expect(g.axisX).toBe(300 + AXIS_LEFT_INSET);
    expect(g.axisX + g.axisW).toBe(1000 - AXIS_RIGHT_GUTTER);
  });

  it('缩放态 lo/hi 反映视窗内的绝对耗时', () => {
    const g = axisGeometry({ width: 1000, columnWidth: 0.3, viewDuration: 100 * MS, viewStart: 0.25, viewEnd: 0.75 });
    expect(g.lo).toBe(25 * MS);
    expect(g.hi).toBe(75 * MS);
  });
});

describe('flameGeometry（Story 9.4b）', () => {
  it('火焰图无标签列/无 gutter：轴盒 = 整个画布', () => {
    const g = flameGeometry(800, 100 * MS, 0, 1);
    expect(g.axisX).toBe(0);
    expect(g.axisW).toBe(800);
  });

  it('画布左右缘均落在轴内（旧 FlameCursor 的 clamp 语义得以保留）', () => {
    const g = flameGeometry(800, 100 * MS, 0, 1);
    expect(timeAtCursor(0, g)).toBe(0);
    expect(timeAtCursor(800, g)).toBe(100 * MS);
  });

  it('缩放/聚焦态：lo/hi 相对传入的 effectiveDuration', () => {
    const g = flameGeometry(800, 40 * MS, 0.25, 0.5);
    expect(g.lo).toBe(10 * MS);
    expect(g.hi).toBe(20 * MS);
    expect(timeAtCursor(400, g)).toBe(15 * MS);
  });
});

describe('timeAtCursor（Story 9.4 / AC #2 #3）', () => {
  const geo = WATERFALL_GEO;

  it('轴左缘 → lo；轴右缘 → hi', () => {
    expect(timeAtCursor(geo.axisX, geo)).toBe(0);
    expect(timeAtCursor(geo.axisX + geo.axisW, geo)).toBe(100 * MS);
  });

  it('轴中点 → 时长一半', () => {
    expect(timeAtCursor(geo.axisX + geo.axisW / 2, geo)).toBeCloseTo(50 * MS, 6);
  });

  it('标签列内（x < axisX）→ null，不渲染游标', () => {
    expect(timeAtCursor(geo.axisX - 1, geo)).toBeNull();
    expect(timeAtCursor(0, geo)).toBeNull();
  });

  it('轴右侧 gutter（x > axisRight）→ null（真页实测 x=1439.5 处不渲染）', () => {
    expect(timeAtCursor(geo.axisX + geo.axisW + 1, geo)).toBeNull();
    expect(timeAtCursor(999, geo)).toBeNull();
  });

  it('零宽/负宽轴 → null（列宽拖到极限时不炸）', () => {
    const degenerate = axisGeometry({ width: 60, columnWidth: 0.9, viewDuration: 100 * MS, viewStart: 0, viewEnd: 1 });
    expect(degenerate.axisW).toBeLessThanOrEqual(0);
    expect(timeAtCursor(30, degenerate)).toBeNull();
  });

  it('缩放态：轴中点 → 视窗中点的绝对耗时', () => {
    const z = axisGeometry({ width: 1000, columnWidth: 0.3, viewDuration: 100 * MS, viewStart: 0.25, viewEnd: 0.75 });
    expect(timeAtCursor(z.axisX + z.axisW / 2, z)).toBeCloseTo(50 * MS, 6);
    expect(timeAtCursor(z.axisX, z)).toBe(25 * MS);
  });

  it('复刻真页实测：轴 612..1408（w=796）、trace 54.1ms、游标 x=1037 → 药丸 28.9ms', () => {
    const real = { axisX: 612, axisW: 796, lo: 0, hi: 54.1 * MS };
    const t = timeAtCursor(1037, real)!;
    expect(t / MS).toBeCloseTo(28.885, 3);
    // 真页药丸显示 `28.9ms`——DRUIDS `formatted-number` 取 **3 位有效数字**。
    // 我方 `formatDuration` 取 2 位小数 ⇒ 会显示 `28.89ms`。此差异**早于本 story**（行内时长标签同源），
    // 不在此改全局格式化函数；已入 deferred-work。此处只钉住换算本身。
    expect(Math.round((t / MS) * 10) / 10).toBe(28.9);
  });
});

describe('DdTimeCursor 渲染（Story 9.4 / AC #1 #4）', () => {
  it('游标在轴盒内 → 渲染 overlay', () => {
    const { queryByTestId } = mount({ cursorX: 600 });
    expect(queryByTestId('time-cursor')).toBeTruthy();
  });

  it('游标在标签列 → 完全不渲染（非 display:none）', () => {
    const { queryByTestId } = mount({ cursorX: 100 });
    expect(queryByTestId('time-cursor')).toBeNull();
  });

  it('cursorX = null（鼠标移出）→ 不渲染', () => {
    const { queryByTestId } = mount({ cursorX: null });
    expect(queryByTestId('time-cursor')).toBeNull();
  });

  it('overlay 不吃指针事件（AC #4：框选缩放/列宽拖拽/行点击不受影响）', () => {
    const { getByTestId } = mount();
    expect(getComputedStyle(getByTestId('time-cursor')).pointerEvents).toBe('none');
  });

  it('药丸文案 = 该 x 处时刻（轴中点 → 50.0ms，DRUIDS 3 位有效数字）', () => {
    // 真页实测（2026-07-11，trace 6a505e15…）：游标药丸走 `druids_measures_formatted-number`，
    // 整值补零（50ms → `50.0ms`）、非整值 3 位有效数字（47.48ms → `47.5ms`）。故用 formatSpanDuration。
    const { getByTestId } = mount({ cursorX: WATERFALL_GEO.axisX + WATERFALL_GEO.axisW / 2 });
    expect(pillText(getByTestId('time-cursor-pill'))).toBe('50.0ms');
  });

  it('竖线与锚点都钉在游标 x 上（药丸靠 Radix 以锚点居中）', () => {
    const { getByTestId } = mount({ cursorX: 600 });
    expect(getByTestId('time-cursor-line').style.left).toBe('600px');
    expect(getByTestId('time-cursor-pill-anchor').style.left).toBe('600px');
  });

  it('默认锚点 Y = 药丸高 + 箭头高（药丸整体落在容器顶部之内）', () => {
    expect(CURSOR_ANCHOR_Y).toBe(CURSOR.pillH + CURSOR.arrowH);
    const { getByTestId } = mount();
    expect(getByTestId('time-cursor-pill-anchor').style.top).toBe(`${CURSOR_ANCHOR_Y}px`);
  });

  it('anchorY=0（火焰图）→ 药丸浮到画布之上', () => {
    const { getByTestId } = mount({ anchorY: 0 });
    expect(getByTestId('time-cursor-pill-anchor').style.top).toBe('0px');
  });
});

// —— Story 9.4b：药丸走 datafox Tooltip（用户定案）——
describe('DdTimeCursor 药丸 = datafox Tooltip（Story 9.4b）', () => {
  it('药丸就是 datafox TooltipContent（data-slot），而非自研 foreignObject', () => {
    const { getByTestId } = mount();
    expect(getByTestId('time-cursor-pill').getAttribute('data-slot')).toBe('tooltip-content');
  });

  it('走 datafox 深色 tooltip 外观（强制 dark 上下文 + --ui-background-shade + knockout 白字）', () => {
    const { getByTestId } = mount();
    const cls = getByTestId('time-cursor-pill').className;
    expect(cls).toContain('dark');
    expect(cls).toContain('bg-ui-background-shade');
    expect(cls).toContain('text-ui-text-knockout');
    // popover 浅色变体会换成 bg-ui-background-elevated —— 确保没走错分支。
    expect(cls).not.toContain('bg-ui-background-elevated');
  });

  // 竖线**刻意不**跟药丸同色：`--ui-background-shade` 在暗态是 #3b393d，与行底 #1d1c1f 的对比度仅 1.48
  // （它正是 `--ui-border` 的暗态值），铺成 1px 线等于隐形。`--ui-text-secondary` 明暗反相，两态都可见。
  it('竖线用 --ui-text-secondary（明暗反相、两态可见），不用 tooltip 的 background-shade', () => {
    expect(DdTimeCursorSrc).toContain('background: ui.textSecondary');
    expect(DdTimeCursorSrc).not.toContain('ui.bgShade');
  });

  it('药丸在竖线正上方（side=top）', () => {
    const { getByTestId } = mount();
    expect(getByTestId('time-cursor-pill').getAttribute('data-side')).toBe('top');
  });

  // 两个 Radix 默认值会让药丸和竖线分家；DOM 上不可观测，故做源级守卫。
  // `updatePositionStrategy` 默认 "optimized" → floating-ui autoUpdate 不逐帧跟随移动中的 trigger ⇒ 药丸滞后。
  // `avoidCollisions` 默认 true → 轴右端 shift() 把药丸推回视口，脱离竖线中心。
  it('显式打开 updatePositionStrategy="always"（否则药丸滞后于竖线）', () => {
    expect(DdTimeCursorSrc).toContain('updatePositionStrategy="always"');
  });

  it('显式关闭 avoidCollisions（否则轴右端药丸被推离竖线中心）', () => {
    expect(DdTimeCursorSrc).toContain('avoidCollisions={false}');
  });

  it('不再手搓药丸配色：源码内无 DRUIDS 明暗字面值', () => {
    expect(DdTimeCursorSrc).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(DdTimeCursorSrc).not.toContain('cursorColors');
  });
});

// —— 图层：自订阅 mousemove/mouseleave，状态不上浮（否则每帧重渲染整个虚拟列表）——
function Host() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    // jsdom 不布局 —— mountHost() 会给这个容器打上 1000px 宽的 rect 桩。
    <div ref={ref} data-testid="host">
      <DdTimeCursorLayer container={ref} columnWidth={0.3} viewDuration={100 * MS} viewStart={0} viewEnd={1} />
    </div>
  );
}

describe('DdTimeCursorLayer（Story 9.4 / A）', () => {
  function mountHost() {
    const utils = render(createElement(ThemeProvider, { theme, children: <Host /> }));
    const host = utils.getByTestId('host');
    host.getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 0, right: 1000, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return { ...utils, host };
  }

  it('初始不渲染（鼠标未进入）', () => {
    const { queryByTestId } = mountHost();
    expect(queryByTestId('time-cursor')).toBeNull();
  });

  it('mousemove 到轴内 → 渲染游标', async () => {
    const { host, queryByTestId } = mountHost();
    fireEvent.mouseMove(host, { clientX: 600 });
    await waitFor(() => expect(queryByTestId('time-cursor')).toBeTruthy());
  });

  it('mousemove 到标签列 → 不渲染（AC #2）', async () => {
    const { host, queryByTestId } = mountHost();
    // 先进轴内让游标出现——否则断言 null 会「假绿」（游标本来就没出现过）。
    fireEvent.mouseMove(host, { clientX: 600 });
    await waitFor(() => expect(queryByTestId('time-cursor')).toBeTruthy());
    fireEvent.mouseMove(host, { clientX: 100 });
    await waitFor(() => expect(queryByTestId('time-cursor')).toBeNull());
  });

  it('mouseleave → 游标消失', async () => {
    const { host, queryByTestId } = mountHost();
    fireEvent.mouseMove(host, { clientX: 600 });
    await waitFor(() => expect(queryByTestId('time-cursor')).toBeTruthy());
    fireEvent.mouseLeave(host);
    await waitFor(() => expect(queryByTestId('time-cursor')).toBeNull());
  });
});
