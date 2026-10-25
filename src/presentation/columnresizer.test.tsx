import { act, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { DdColumnResizer, RESIZER } from './DdColumnResizer';
import DdColumnResizerSrc from './DdColumnResizer.tsx?raw';

const theme = createTheme({ colorMode: 'light' });

/** 最后一次 onChange 的实参（tsconfig 的 lib 早于 ES2022，没有 `Array.prototype.at`）。 */
const lastArg = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0];

function mount(onChange: ReturnType<typeof vi.fn>, position = 0.3) {
  const utils = render(
    createElement(ThemeProvider, {
      theme,
      children: (
        <DdColumnResizer position={position} min={0.2} max={0.85} onChange={onChange} columnResizeHandleHeight={400} />
      ),
    })
  );
  const root = utils.getByTestId('DdColumnResizer');
  const dragger = utils.getByTestId('DdColumnResizer--dragger');
  // jsdom 无布局——根元素覆盖全宽 [0,100] → value = clientX/100。
  root.getBoundingClientRect = () =>
    ({ left: 0, width: 100, top: 0, right: 100, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { ...utils, dragger, root };
}

describe('DdColumnResizer 拖拽换算', () => {
  it('拖拽提交新占比 onChange(value)', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);

    fireEvent.mouseDown(dragger, { clientX: 30, button: 0 }); // DragStart @ 0.3
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 55, button: 0 })); // → 0.55
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 55, button: 0 }));

    expect(lastArg(onChange)).toBeCloseTo(0.55);
  });

  it('越界拖拽被 min/max 钳制（拖到 95% → 钳到 max=0.85）', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);

    fireEvent.mouseDown(dragger, { clientX: 30, button: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 95, button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 95, button: 0 }));

    expect(lastArg(onChange)).toBeCloseTo(0.85);
  });

  it('向左越界被钳到 min=0.2（拖到 5%）', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);

    fireEvent.mouseDown(dragger, { clientX: 30, button: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 5, button: 0 }));

    expect(lastArg(onChange)).toBeCloseTo(0.2);
  });
});

// —— Story 9.4c：列宽实时跟随（真页 / datafox 语义）——
//
// 真页实测（DRUIDS 文档站 Table 示例，拖 +20/+40/+60px）：`grid-template-columns` 逐帧变
// `220.27→240→260→280`，松手不再变。datafox `Table.moveColumnResize` 亦是每次 pointermove 就写宽度。
// 原 Grafana 语义是「拖拽中只画预览色带，松手才 onChange」。
describe('DdColumnResizer 实时跟随（Story 9.4c）', () => {
  it('拖拽过程中每次 mousemove 都提交，而非只在松手时提交一次', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);

    fireEvent.mouseDown(dragger, { clientX: 30, button: 0 });
    expect(onChange, 'mousedown 本身不该改列宽（真页 --is-resizing 也是首次 move 才加）').not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, button: 0 }));

    const during = onChange.mock.calls.map((c) => c[0]);
    expect(during.length, '拖拽中应已提交 3 次').toBe(3);
    expect(during[0]).toBeCloseTo(0.4);
    expect(during[1]).toBeCloseTo(0.5);
    expect(during[2]).toBeCloseTo(0.6);

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 60, button: 0 }));
    expect(onChange).toHaveBeenCalledTimes(4); // 松手再提交一次终值
    expect(lastArg(onChange)).toBeCloseTo(0.6);
  });

  // 命中条 7px 宽，从边缘按下时指针距边界 3px。若用「指针绝对占比」而非「抓取点 + 位移」，
  // 按下后第一次 move 会把列宽整体拽偏 3px。
  it('增量语义：从命中条边缘按下不产生跳变', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);

    fireEvent.mouseDown(dragger, { clientX: 33, button: 0 }); // 边界在 30，抓在右缘 +3
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 43, button: 0 })); // 位移 +10

    expect(onChange.mock.calls[0][0], '应为 0.3 + 0.10，而非指针绝对位置 0.43').toBeCloseTo(0.4);
  });

  it('键盘 Arrow 调宽（真页 separator 可聚焦；datafox Table 亦支持）', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);

    fireEvent.keyDown(dragger, { key: 'ArrowRight' });
    expect(lastArg(onChange)).toBeCloseTo(0.3 + RESIZER.keyboardStepPx / 100);

    fireEvent.keyDown(dragger, { key: 'ArrowLeft' });
    expect(lastArg(onChange)).toBeCloseTo(0.3 - RESIZER.keyboardStepPx / 100);
  });

  it('键盘调宽同样被 min/max 钳制', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.845); // max=0.85，右移一步会越界
    fireEvent.keyDown(dragger, { key: 'ArrowRight' });
    expect(lastArg(onChange)).toBeCloseTo(0.85);
  });

  it('非方向键不触发 onChange', () => {
    const onChange = vi.fn();
    const { dragger } = mount(onChange, 0.3);
    fireEvent.keyDown(dragger, { key: 'Enter' });
    fireEvent.keyDown(dragger, { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

// —— Story 9.4 / D + 9.4c：分隔线视觉 —— 真页 DRUIDS `Table` resizer 逐条对齐。
//
// deferred-work 的悬案结案（9.4）：真页那条贯穿全表的竖线**不是行 hover 触发**（实测 hover 行时仍 opacity:0），
// 而是 hover 列宽拖拽条。9.4c 补齐拖拽态：resizer 画 3px 蓝条，helper 在 :active 时转蓝。
describe('DdColumnResizer 分隔线视觉（Story 9.4 / D + 9.4c）', () => {
  it('helper 线静态 opacity:0，hover 命中条时变 1', () => {
    const { getByTestId } = mount(vi.fn());
    expect(getComputedStyle(getByTestId('DdColumnResizer--helper')).opacity).toBe('0');
    expect(DdColumnResizerSrc).toMatch(/'&:hover \[data-resizer-helper\]':\s*\{\s*opacity:\s*1/);
  });

  it('helper 线 = 1px `--ui-border` 灰（真页实测 rgb(226,229,237)），hover 时**不**变蓝', () => {
    expect(DdColumnResizerSrc).toMatch(/helper: css\(\{[\s\S]*?width: 1,[\s\S]*?background: ui\.border/);
    // datafox `Table` 在 hover 就把 helper 变蓝（group-hover:bg-ui-interaction-primary）；真页不是。
    expect(DdColumnResizerSrc).not.toMatch(/'&:hover \[data-resizer-helper\]':\s*\{[^}]*background/);
  });

  it('helper 线不吃指针事件', () => {
    expect(getComputedStyle(mount(vi.fn()).getByTestId('DdColumnResizer--helper')).pointerEvents).toBe('none');
  });

  it('命中条 7px 宽，可见蓝条为其中 2..5px（真页 601..608，边界 604）', () => {
    expect(RESIZER.hitWidth).toBe(7);
    expect(RESIZER.barStart).toBe(2);
    expect(RESIZER.barEnd).toBe(5);
    // 边界（helper）落在条内 left:3px ⇒ 容器需左移 3px 才能让边界对准 position。
    expect(DdColumnResizerSrc).toContain('marginLeft: -RESIZER.barStart - 1');
  });

  it('separator 画真页那条渐变，`--table-resizer-color` 默认透明、hover/active/focus-visible 转主色', () => {
    const { dragger } = mount(vi.fn());
    const bg = getComputedStyle(dragger).background;
    expect(bg).toContain('linear-gradient');
    expect(DdColumnResizerSrc).toContain("'--table-resizer-color': 'transparent'");
    expect(DdColumnResizerSrc).toMatch(/'&:hover':\s*\{\s*'--table-resizer-color': accent/);
    expect(DdColumnResizerSrc).toMatch(/'&:active':\s*\{\s*'--table-resizer-color': accent/);
    expect(DdColumnResizerSrc).toMatch(/'&:focus-visible':\s*\{\s*'--table-resizer-color': accent/);
  });

  it('拖拽态：helper 转蓝且常驻（真页 `.resizer:active + .helper` / `.table--is-resizing .helper`）', () => {
    const onChange = vi.fn();
    const { dragger, getByTestId } = mount(onChange, 0.3);
    const helper = getByTestId('DdColumnResizer--helper');
    expect(helper.className).not.toContain('HelperDragging');

    fireEvent.mouseDown(dragger, { clientX: 30, button: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, button: 0 }));
    expect(getByTestId('DdColumnResizer--helper').className).toContain('HelperDragging');
    expect(getByTestId('DdColumnResizer--dragger').className).toContain('SeparatorDragging');

    // window 上的原生 mouseup 不经 React 合成事件 → setState 落在微任务里，须 act 冲刷后再断言。
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, button: 0 }));
    });
    expect(getByTestId('DdColumnResizer--helper').className).not.toContain('HelperDragging');
  });

  it('拖拽态不再画半透明色带 / 双边框 / Grafana grip 刻痕', () => {
    expect(DdColumnResizerSrc).not.toContain('rgba(110, 159, 255, 0.08)');
    expect(DdColumnResizerSrc).not.toContain('draggerDraggingLeft');
    expect(DdColumnResizerSrc).not.toContain('draggerDraggingRight');
    expect(DdColumnResizerSrc).not.toContain('gripIcon');
  });

  it('hover 前后 dragger 都保持 cursor: col-resize', () => {
    expect(getComputedStyle(mount(vi.fn()).dragger).cursor).toBe('col-resize');
  });

  it('命中条 role=separator + 可聚焦 + value 语义（真页/datafox 语义）', () => {
    const { dragger } = mount(vi.fn(), 0.3);
    expect(dragger.getAttribute('role')).toBe('separator');
    expect(dragger.getAttribute('aria-orientation')).toBe('vertical');
    expect(dragger.hasAttribute('aria-hidden')).toBe(false);
    expect(dragger.getAttribute('tabindex')).toBe('0');
    expect(dragger.getAttribute('aria-valuenow')).toBe('30');
    expect(dragger.getAttribute('aria-valuemin')).toBe('20');
    expect(dragger.getAttribute('aria-valuemax')).toBe('85');
  });
});
