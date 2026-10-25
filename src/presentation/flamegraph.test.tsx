import { TooltipProvider } from '@datafox/ui';
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { computeFlameLayout, isErrorSpan } from '../core';
import { getServiceColorKey, mockTrace } from '../model';
import { createTheme, ThemeProvider } from '../theme';
import { formatSpanDuration } from '../utils';

import { readableTextColor } from './colorAccessor';
import { DdFlameControls } from './DdFlameControls';
import { DdFlameGraphView } from './DdFlameGraphView';
import { DdFlameRuler } from './DdFlameRuler';

const theme = createTheme({ colorMode: 'light' });
const ROW_H = theme.trace.flame.rowHeight;

function mount(props: Parameters<typeof DdFlameGraphView>[0]) {
  return render(createElement(ThemeProvider, { theme, children: <DdFlameGraphView {...props} /> }));
}

describe('DdFlameGraphView', () => {
  it('每个 span 渲染一个矩形', () => {
    const { getAllByTestId } = mount({ trace: mockTrace });
    expect(getAllByTestId('FlameRect').length).toBe(mockTrace.spans.length);
  });

  it('top follows the collision-free layout', () => {
    const { container } = mount({ trace: mockTrace });
    computeFlameLayout(mockTrace).rows.forEach((s) => {
      const el = container.querySelector(`[data-span-id="${s.spanID}"]`) as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.style.top).toBe(`${s.depth * ROW_H}px`);
    });
  });

  it('容器高 = (maxDepth+1) × rowHeight', () => {
    const { getByTestId } = mount({ trace: mockTrace });
    const { maxDepth } = computeFlameLayout(mockTrace);
    expect((getByTestId('DdFlameGraphView') as HTMLElement).style.height).toBe(`${(maxDepth + 1) * ROW_H}px`);
  });

  it('shows resource names while retaining operations in the hover card', () => {
    const span = { ...mockTrace.spans[0], operationName: 'http.server.request', tags: [{ key: 'resource.name', value: 'GET /orders/{id}' }] };
    const trace = { ...mockTrace, spans: [span] };
    const { getByText, getByTestId } = mount({ trace });
    expect(getByText('GET /orders/{id}')).toBeTruthy();
    fireEvent.mouseEnter(getByTestId('FlameRect'));
    expect(getByTestId('FlameTooltip').textContent).toContain('http.server.request');
    expect(getByTestId('FlameTooltip').textContent).toContain('GET /orders/{id}');
  });

  // Story 10.7：真页火焰图帧内字色随条底明暗（亮底深字 / 暗底白字），非一律白字（原来≈瀑布字体）。
  it('填充帧字色随条底明暗二选一（非一律白，Story 10.7）', () => {
    const { getAllByTestId } = mount({ trace: mockTrace });
    const rects = getAllByTestId('FlameRect') as HTMLElement[];
    const filled = rects.filter((el) => el.dataset.inferred !== 'true' && el.dataset.dimmed !== 'true');
    expect(filled.length).toBeGreaterThan(0);
    for (const el of filled) {
      const bg = el.style.background;
      const color = el.style.color;
      // 字色必是两枚火焰文本色之一，且与该条底色的明暗判定一致。
      expect(['rgba(0, 0, 0, 0.9)', 'rgba(255, 255, 255, 0.9)']).toContain(color);
      expect(color).toBe(readableTextColor(bg));
    }
  });

  // Story 10.7：真页 errors 视图火焰帧左缘 `!` 徽标（canvas 采像素：19px 满条高、白 `!`、错误红底）。
  it('error span 帧带 `!` 徽标，正常帧不带（Story 10.7）', () => {
    const { getAllByTestId, container } = mount({ trace: mockTrace });
    const errorSpanIds = mockTrace.spans.filter(isErrorSpan).map((s) => s.spanID);
    expect(errorSpanIds.length).toBeGreaterThan(0);
    const badges = getAllByTestId('FlameErrBadge') as HTMLElement[];
    expect(badges.length).toBe(errorSpanIds.length);
    for (const b of badges) {
      expect(b.textContent).toBe('!');
      const rect = b.closest('[data-testid="FlameRect"]') as HTMLElement;
      expect(errorSpanIds).toContain(rect.dataset.spanId);
    }
    // 非 error 帧不含徽标
    const firstOk = mockTrace.spans.find((s) => !isErrorSpan(s))!;
    const okRect = container.querySelector(`[data-span-id="${firstOk.spanID}"]`) as HTMLElement;
    expect(okRect.querySelector('[data-testid="FlameErrBadge"]')).toBeNull();
  });

  it('选中的 error 帧 → 近黑徽标；未选中 error 帧 → 错误红徽标（Story 10.7 真页实测）', () => {
    const errSpan = mockTrace.spans.find(isErrorSpan)!;
    const otherErr = mockTrace.spans.filter(isErrorSpan).find((s) => s.spanID !== errSpan.spanID);
    const { container } = mount({ trace: mockTrace, selectedSpanId: errSpan.spanID });
    const selBadge = container
      .querySelector(`[data-span-id="${errSpan.spanID}"]`)!
      .querySelector('[data-testid="FlameErrBadge"]') as HTMLElement;
    expect(selBadge.style.background).toBe('rgb(0, 0, 0)'); // 纯黑 #000（真页 getImageData 实测 = 选中描边同色）
    if (otherErr) {
      const otherBadge = container
        .querySelector(`[data-span-id="${otherErr.spanID}"]`)!
        .querySelector('[data-testid="FlameErrBadge"]') as HTMLElement;
      expect(otherBadge.style.background).toBe('rgb(235, 54, 75)'); // 错误红 #EB364B（DOM 归一化）
      expect(theme.trace.status.error.fg.toUpperCase()).toBe('#EB364B'); // 该红即 status.error.fg
    }
  });

  it('灰显（非高亮组）的 error 帧不加徽标（随帧淡出，Story 10.7）', () => {
    const errSpan = mockTrace.spans.find(isErrorSpan)!;
    // 用一个不匹配任何帧的高亮组 → 全部灰显
    const { container } = mount({
      trace: mockTrace,
      highlightedGroupKey: '__none__',
      groupKeyForSpan: () => 'x',
    });
    const errRect = container.querySelector(`[data-span-id="${errSpan.spanID}"]`) as HTMLElement;
    expect(errRect.dataset.dimmed).toBe('true');
    expect(errRect.querySelector('[data-testid="FlameErrBadge"]')).toBeNull();
  });

  it('selectedSpanId 命中矩形带选中描边类，其余不带', () => {
    const sel = mockTrace.spans[1].spanID;
    const { container } = mount({ trace: mockTrace, selectedSpanId: sel });
    const selEl = container.querySelector(`[data-span-id="${sel}"]`) as HTMLElement;
    expect(selEl.className).toContain('Selected');
    const otherEl = container.querySelector(`[data-span-id="${mockTrace.spans[0].spanID}"]`) as HTMLElement;
    expect(otherEl.className).not.toContain('Selected');
  });

  it('点矩形触发 onSelectSpan(spanID)（Story 6.2）', () => {
    const onSelectSpan = vi.fn();
    const target = mockTrace.spans[2].spanID;
    const { container } = mount({ trace: mockTrace, onSelectSpan });
    fireEvent.click(container.querySelector(`[data-span-id="${target}"]`)!);
    expect(onSelectSpan).toHaveBeenCalledWith(target);
  });

  // Story 9.4b：自研 FlameCursor → 共用 `DdTimeCursor`（testid `time-cursor`），几何走 flameGeometry。
  // jsdom 不布局 ⇒ 画布 rect 宽为 0 ⇒ 轴盒坍塌 ⇒ 游标不渲染，故须给容器打宽度桩。
  it('mouseMove → 出竖线游标 + 时刻药丸（Story 6.3 / 9.4b）', () => {
    const { getByTestId, queryByTestId } = mount({ trace: mockTrace });
    const root = getByTestId('DdFlameGraphView');
    root.getBoundingClientRect = () =>
      ({ left: 0, width: 800, top: 0, right: 800, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    expect(queryByTestId('time-cursor')).toBeNull();
    fireEvent.mouseMove(root, { clientX: 400, clientY: 5 });
    expect(getByTestId('time-cursor')).toBeTruthy();
    // 画布中点 → trace 时长的一半（火焰图轴盒 = 整个画布，无标签列偏移）。
    // 取首个文本节点：Radix TooltipContent 内另有一份 role="tooltip" 的视觉隐藏副本，textContent 会翻倍。
    expect(getByTestId('time-cursor-pill').firstChild?.textContent).toBe(formatSpanDuration(mockTrace.duration / 2));
  });

  it('游标药丸浮在画布之上（anchorY=0），不遮住第一行矩形（Story 9.4b）', () => {
    const { getByTestId } = mount({ trace: mockTrace });
    const root = getByTestId('DdFlameGraphView');
    root.getBoundingClientRect = () =>
      ({ left: 0, width: 800, top: 0, right: 800, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.mouseMove(root, { clientX: 400, clientY: 5 });
    expect(getByTestId('time-cursor-pill-anchor').style.top).toBe('0px');
  });

  it('hover 矩形 → tooltip 含 operation + service（Story 6.3）', () => {
    const { container, getByTestId } = mount({ trace: mockTrace });
    fireEvent.mouseEnter(container.querySelector('[data-span-id="s1"]')!);
    const tip = getByTestId('FlameTooltip');
    expect(tip.textContent).toContain('GET /user');
    expect(tip.textContent).toContain('mall-order-api');
  });

  // Story 10.4：tooltip 追加「(…% total duration)」（真页字段）；error span 追加「Error detected」。
  it('tooltip 尾附「% total duration」；error span 追加「Error detected」（Story 10.4）', () => {
    const { container, getByTestId } = mount({ trace: mockTrace });
    // s4 = error span（statusCode 2）
    fireEvent.mouseEnter(container.querySelector('[data-span-id="s4"]')!);
    const tip = getByTestId('FlameTooltip');
    expect(tip.textContent).toContain('% total duration');
    expect(tip.textContent).toContain('Error detected');
  });

  it('非 error 帧 tooltip 无「Error detected」（Story 10.4）', () => {
    const { container, getByTestId } = mount({ trace: mockTrace });
    fireEvent.mouseEnter(container.querySelector('[data-span-id="s1"]')!);
    const tip = getByTestId('FlameTooltip');
    expect(tip.textContent).toContain('% total duration');
    expect(tip.textContent).not.toContain('Error detected');
  });

  it('滚轮 → onViewRangeChange 窗口变小（zoom in，Story 6.4）', () => {
    const onViewRangeChange = vi.fn();
    const { getByTestId } = mount({ trace: mockTrace, onViewRangeChange });
    fireEvent.wheel(getByTestId('DdFlameGraphView'), { deltaY: -100, clientX: 100, clientY: 5 });
    expect(onViewRangeChange).toHaveBeenCalled();
    const calls = onViewRangeChange.mock.calls;
    const [vs, ve] = calls[calls.length - 1];
    expect(ve - vs).toBeLessThan(1); // 比全量 [0,1] 窄
  });

  it('拖拽后抑制 click 选中（Story 6.4）', () => {
    const onSelectSpan = vi.fn();
    const onViewRangeChange = vi.fn();
    const { container, getByTestId } = mount({ trace: mockTrace, onSelectSpan, onViewRangeChange });
    const view = getByTestId('DdFlameGraphView');
    const rect = container.querySelector('[data-span-id="s1"]')!;
    fireEvent.mouseDown(view, { button: 0, clientX: 100 });
    fireEvent.mouseMove(view, { clientX: 140, clientY: 5 }); // dx=40 > 3 → moved
    fireEvent.mouseUp(view);
    fireEvent.click(rect);
    expect(onSelectSpan).not.toHaveBeenCalled(); // 拖动后不选中
  });

  it('背景拖拽后再点 rect 仍能选中（H1 回归：mousedown 复位抑制）', () => {
    const onSelectSpan = vi.fn();
    const onViewRangeChange = vi.fn();
    const { container, getByTestId } = mount({ trace: mockTrace, onSelectSpan, onViewRangeChange });
    const view = getByTestId('DdFlameGraphView');
    const rect = container.querySelector('[data-span-id="s1"]')!;
    // 背景拖拽（在 bg 松开，rect.onClick 不触发 → 旧实现残留 suppress）
    fireEvent.mouseDown(view, { button: 0, clientX: 100 });
    fireEvent.mouseMove(view, { clientX: 160, clientY: 5 });
    fireEvent.mouseUp(view);
    // 新一次对 rect 的完整点击：mousedown 冒泡到容器 → 复位 suppress → click 正常选中
    fireEvent.mouseDown(rect, { button: 0 });
    fireEvent.mouseUp(rect);
    fireEvent.click(rect);
    expect(onSelectSpan).toHaveBeenCalledWith('s1');
  });

  it('highlightedGroupKey → 非匹配帧灰显、匹配帧保留服务色（Story 7.1）', () => {
    const groupKeyForSpan = (s: (typeof mockTrace.spans)[number]) => getServiceColorKey(s.process);
    // s1 = mall-order-api（高亮）；s3 = redis（非匹配 → 灰显）
    const key = getServiceColorKey(mockTrace.spans[0].process); // 'mall-order-api'
    const { container } = mount({ trace: mockTrace, highlightedGroupKey: key, groupKeyForSpan });
    const match = container.querySelector('[data-span-id="s1"]') as HTMLElement;
    const dimmed = container.querySelector('[data-span-id="s3"]') as HTMLElement;
    expect(match.getAttribute('data-dimmed')).toBeNull();
    expect(dimmed.getAttribute('data-dimmed')).toBe('true');
    // 灰显帧背景 = dimmedFill，与匹配帧不同
    expect(dimmed.style.background).not.toBe(match.style.background);
  });

  it('无 highlightedGroupKey → 全部不灰显（零回归）', () => {
    const { container } = mount({ trace: mockTrace });
    expect(container.querySelector('[data-dimmed="true"]')).toBeNull();
  });

  // Story 10.3：推断/未插桩下游依赖 span（db/peer/…）= 空心 + 服务色虚线边（真页实测），已插桩 = 实心。
  // s3 = redis（db.system + peer.service）→ inferred；s1 = 根 mall-order-api → 非 inferred。判定同图例 isInferredEntity。
  it('推断 span → 空心 + 服务色虚线边；已插桩 span → 实心（Story 10.3）', () => {
    const { container } = mount({ trace: mockTrace });
    const inferred = container.querySelector('[data-span-id="s3"]') as HTMLElement;
    const solid = container.querySelector('[data-span-id="s1"]') as HTMLElement;
    expect(inferred.getAttribute('data-inferred')).toBe('true');
    expect(inferred.style.background).toBe('transparent');
    expect(inferred.style.border).toContain('dashed');
    expect(solid.getAttribute('data-inferred')).toBeNull();
    expect(solid.style.background).not.toBe('transparent');
    expect(solid.style.border).toBe('');
  });

  // 灰显优先于 inferred：真页高亮时非匹配帧一律定值灰，不再画虚线。
  it('推断 span 被灰显时 → 定值灰填充、不画虚线（Story 10.3 × 7.1）', () => {
    const groupKeyForSpan = (s: (typeof mockTrace.spans)[number]) => getServiceColorKey(s.process);
    const key = getServiceColorKey(mockTrace.spans[0].process); // 高亮根组 → s3(redis) 非匹配
    const { container } = mount({ trace: mockTrace, highlightedGroupKey: key, groupKeyForSpan });
    const dimmedInferred = container.querySelector('[data-span-id="s3"]') as HTMLElement;
    expect(dimmedInferred.getAttribute('data-dimmed')).toBe('true');
    expect(dimmedInferred.style.background).not.toBe('transparent');
    expect(dimmedInferred.style.border).toBe('');
  });

  it('hover 帧 → onSpanHover(分组 key)（Story 7.1 反向联动）', () => {
    const onSpanHover = vi.fn();
    const groupKeyForSpan = (s: (typeof mockTrace.spans)[number]) => getServiceColorKey(s.process);
    const { container } = mount({ trace: mockTrace, groupKeyForSpan, onSpanHover });
    fireEvent.mouseEnter(container.querySelector('[data-span-id="s3"]')!);
    expect(onSpanHover).toHaveBeenCalledWith('redis');
  });

  it('CR-F6：拖拽平移进行中 hover 帧不触发 onSpanHover/tooltip', () => {
    const onSpanHover = vi.fn();
    const groupKeyForSpan = (s: (typeof mockTrace.spans)[number]) => getServiceColorKey(s.process);
    const onViewRangeChange = vi.fn();
    const { container, getByTestId, queryByTestId } = mount({
      trace: mockTrace,
      groupKeyForSpan,
      onSpanHover,
      onViewRangeChange,
    });
    fireEvent.mouseDown(getByTestId('DdFlameGraphView'), { button: 0, clientX: 100 }); // 起拖
    fireEvent.mouseEnter(container.querySelector('[data-span-id="s3"]')!);
    expect(onSpanHover).not.toHaveBeenCalled();
    expect(queryByTestId('FlameTooltip')).toBeNull();
  });
});

// Story 10.7：真页 canvas 实测的帧文本明暗判据（YIQ 阈值 128）。
describe('readableTextColor（火焰帧字色，Story 10.7）', () => {
  it('亮底（橙/黄）→ 深字', () => {
    expect(readableTextColor('#fcaf2b')).toBe('rgba(0, 0, 0, 0.9)'); // 橙，YIQ 182.9
    expect(readableTextColor('#FFCC00')).toBe('rgba(0, 0, 0, 0.9)'); // 亮黄
  });
  it('暗底（绿/紫/蓝）→ 白字', () => {
    expect(readableTextColor('#50931f')).toBe('rgba(255, 255, 255, 0.9)'); // 绿，YIQ 113.7（真页实测白字）
    expect(readableTextColor('#8934a4')).toBe('rgba(255, 255, 255, 0.9)'); // 紫
    expect(readableTextColor('#3969b3')).toBe('rgba(255, 255, 255, 0.9)'); // 蓝
  });
  it('接受 3 位 hex 与 rgb()', () => {
    expect(readableTextColor('#fff')).toBe('rgba(0, 0, 0, 0.9)');
    expect(readableTextColor('#000')).toBe('rgba(255, 255, 255, 0.9)');
    expect(readableTextColor('rgb(80, 147, 31)')).toBe('rgba(255, 255, 255, 0.9)');
  });
  it('非法色 → 回退白字（不炸）', () => {
    expect(readableTextColor('nonsense')).toBe('rgba(255, 255, 255, 0.9)');
    expect(readableTextColor('')).toBe('rgba(255, 255, 255, 0.9)');
  });
});

describe('DdFlameControls (Story 6.4)', () => {
  function mountCtl(props: Parameters<typeof DdFlameControls>[0]) {
    return render(
      createElement(ThemeProvider, {
        theme,
        children: (
          <TooltipProvider>
            <DdFlameControls {...props} />
          </TooltipProvider>
        ),
      })
    );
  }
  it('全览按钮触发 onZoomFull；无选中时后两者禁用', () => {
    const onZoomFull = vi.fn();
    const { container } = mountCtl({ onZoomFull, onZoomSelected: () => {}, onFocusSelected: () => {}, hasSelection: false });
    fireEvent.click(container.querySelector('[data-action="zoom-full"]')!);
    expect(onZoomFull).toHaveBeenCalled();
    expect((container.querySelector('[data-action="zoom-selected"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('[data-action="focus-selected"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('hasSelection 时放大/聚焦可用并回调', () => {
    const onZoomSelected = vi.fn();
    const onFocusSelected = vi.fn();
    const { container } = mountCtl({ onZoomFull: () => {}, onZoomSelected, onFocusSelected, hasSelection: true });
    fireEvent.click(container.querySelector('[data-action="zoom-selected"]')!);
    fireEvent.click(container.querySelector('[data-action="focus-selected"]')!);
    expect(onZoomSelected).toHaveBeenCalled();
    expect(onFocusSelected).toHaveBeenCalled();
  });

  it('isFocused 时出「重置聚焦」并回调（Story 6.7）', () => {
    const onResetFocus = vi.fn();
    const { container } = mountCtl({
      onZoomFull: () => {},
      onZoomSelected: () => {},
      onFocusSelected: () => {},
      hasSelection: true,
      isFocused: true,
      onResetFocus,
    });
    // Story 10.2：改为 icon-only Button（无文字），以 data-action 定位。
    const resetBtn = container.querySelector('[data-action="reset-focus"]');
    expect(resetBtn).toBeTruthy();
    fireEvent.click(resetBtn!);
    expect(onResetFocus).toHaveBeenCalled();
  });

  it('未聚焦时无「重置聚焦」', () => {
    const { container } = mountCtl({
      onZoomFull: () => {},
      onZoomSelected: () => {},
      onFocusSelected: () => {},
      hasSelection: true,
      isFocused: false,
    });
    expect(container.querySelector('[data-action="reset-focus"]')).toBeNull();
  });
});

describe('DdFlameRuler', () => {
  it('渲染 ms 刻度标签', () => {
    const { container } = render(
      createElement(ThemeProvider, {
        theme,
        children: <DdFlameRuler numTicks={5} viewDuration={102_000} />,
      })
    );
    expect(container.querySelector('[data-testid="DdFlameRuler"]')).toBeTruthy();
    // DdTicks 标签：含末端 102ms 这类（formatDuration(102000)）
    expect(container.querySelector('[class$="DdTickLabel"]')).toBeTruthy();
  });

  // Story 10.4：火焰尺改用 axis 形态 = 整步长（niceTickValues），消除等分脏值（102ms/5 等分会出 25.5ms）。
  it('刻度取整步长，无等分脏值（Story 10.4）', () => {
    const { container } = render(
      createElement(ThemeProvider, { theme, children: <DdFlameRuler numTicks={5} viewDuration={102_000} /> })
    );
    const labels = [...container.querySelectorAll('[class$="DdTickLabel"]')].map((el) => el.textContent ?? '');
    expect(labels.length).toBeGreaterThan(0);
    // 等分会产生 25.5ms/76.5ms 这类小数脏值；整步长全是整数 ms
    expect(labels.some((l) => /\d\.\d/.test(l))).toBe(false);
  });

  // Story 10.5：缩放裁剪箭头（真页 svg_arrow 实测，2026-07-11）——某侧视窗外有 trace 内容时出现。
  const renderRuler = (viewStart: number, viewEnd: number) =>
    render(
      createElement(ThemeProvider, {
        theme,
        children: <DdFlameRuler numTicks={5} viewDuration={102_000} viewStart={viewStart} viewEnd={viewEnd} />,
      })
    );

  it('全览（0..1）→ 两端无裁剪箭头', () => {
    const { queryByTestId } = renderRuler(0, 1);
    expect(queryByTestId('FlameClipArrowLeft')).toBeNull();
    expect(queryByTestId('FlameClipArrowRight')).toBeNull();
  });

  it('左侧被裁（viewStart>0）→ 仅左箭头', () => {
    const { queryByTestId } = renderRuler(0.3, 1);
    expect(queryByTestId('FlameClipArrowLeft')).toBeTruthy();
    expect(queryByTestId('FlameClipArrowRight')).toBeNull();
  });

  it('右侧被裁（viewEnd<1）→ 仅右箭头', () => {
    const { queryByTestId } = renderRuler(0, 0.7);
    expect(queryByTestId('FlameClipArrowLeft')).toBeNull();
    expect(queryByTestId('FlameClipArrowRight')).toBeTruthy();
  });

  it('两侧被裁 → 左右皆有', () => {
    const { queryByTestId } = renderRuler(0.2, 0.8);
    expect(queryByTestId('FlameClipArrowLeft')).toBeTruthy();
    expect(queryByTestId('FlameClipArrowRight')).toBeTruthy();
  });
});
