import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { DdTimelineHeader, HEADER_HEIGHT } from './DdTimelineHeader';
// 源级守卫：jsdom 的 CSS 解析会丢 `var()` / `box-shadow` 等值，computed style 断言不可靠。
// 沿用本仓 foundation-bridge.test.tsx 已确立的 `?raw` 模式；像素级复核走真浏览器（AC #13）。
import DdTimelineHeaderSrc from './DdTimelineHeader.tsx?raw';

const theme = createTheme({ colorMode: 'light' });

function mount(props: Partial<Parameters<typeof DdTimelineHeader>[0]> = {}) {
  return render(
    createElement(ThemeProvider, {
      theme,
      children: <DdTimelineHeader columnWidth={0.3} numTicks={10} viewDuration={102_000} {...props} />,
    })
  );
}

// Story 9.3（D2/D6）：表头密度与列名对齐真页 DRUIDS Table 实测值。
describe('DdTimelineHeader（Story 9.3）', () => {
  it('表头高 = 26px（真页 grid-template-rows 首行实测值）', () => {
    expect(HEADER_HEIGHT).toBe(26);
  });

  it('默认不渲染列名文案（真页表头左侧只有折叠按钮）', () => {
    const { queryByText } = mount();
    expect(queryByText('Service & Operation')).toBeNull();
  });

  it('显式传 labelText 时仍渲染（API 不破坏）', () => {
    const { getByText } = mount({ labelText: 'Service & Operation' });
    expect(getByText('Service & Operation')).toBeTruthy();
  });
});

// Story 9.3 复审（D11 / AC #11）：表头 chrome 对齐真页 `th > div` 实测值。
describe('DdTimelineHeader 表头 chrome（Story 9.3 复审）', () => {
  it('表头背景 = --ui-background（真页与 body 同色），不再用 --ui-background-secondary', () => {
    expect(DdTimelineHeaderSrc).toContain('background: ui.bg,');
    expect(DdTimelineHeaderSrc).not.toContain('background: ui.bgSecondary');
  });

  it('下边框不贯穿全行：header 行本身无 borderBottom（真页 th / 上色 div 皆为 0）', () => {
    const headerBlock = DdTimelineHeaderSrc.slice(
      DdTimelineHeaderSrc.indexOf('header: css({'),
      DdTimelineHeaderSrc.indexOf('labelHead: css({')
    );
    expect(headerBlock).not.toContain('borderBottom');
    expect(DdTimelineHeaderSrc).not.toContain('ui.formBorder');
  });

  it('两条线都长在时间轴列头上：竖线用 inset box-shadow（用 border 会让轴漂移 1px，破坏 D10），横线用真 border-bottom（只影响竖直方向）', () => {
    const ticksBlock = DdTimelineHeaderSrc.slice(
      DdTimelineHeaderSrc.indexOf('ticksHead: css({'),
      DdTimelineHeaderSrc.indexOf('axis: css({')
    );
    expect(ticksBlock).toContain('boxShadow: `inset 1px 0 0 ${ui.border}`');
    expect(ticksBlock).toContain('borderBottom: `1px solid ${ui.border}`');
    expect(ticksBlock).not.toContain('borderLeft');
  });

  it('标签列头不带任何边框（真页横线只跨时间轴列）', () => {
    const start = DdTimelineHeaderSrc.indexOf('labelHead: css({');
    // 只取该 css({...}) 块内部，避免把下一条规则上方的注释（含 "border" 字样）圈进来。
    const labelBlock = DdTimelineHeaderSrc.slice(start, DdTimelineHeaderSrc.indexOf('}),', start));
    // 逐属性断言：裸子串 'border' 会被 `boxSizing: 'border-box'` 命中。
    for (const prop of ['borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'border:']) {
      expect(labelBlock, `labelHead 不应有 ${prop}`).not.toContain(prop);
    }
  });

  it('刻度轴左缩 AXIS_LEFT_INSET、右缩 AXIS_RIGHT_GUTTER（与行内瀑布条容器逐像素同宽）', () => {
    expect(DdTimelineHeaderSrc).toContain('marginLeft: AXIS_LEFT_INSET');
    expect(DdTimelineHeaderSrc).toContain('marginRight: AXIS_RIGHT_GUTTER');
  });

  it('表头刻度走 axis 形态（整步长取值），不是等分', () => {
    expect(DdTimelineHeaderSrc).toContain('variant="axis"');
  });
});

// Story 9.3 复审（AC #12）：刻度取值 / 标签形态。
describe('DdTimelineHeader 刻度轴（Story 9.3 复审）', () => {
  it('102ms / hint 10 → 整 10ms 步长，零点渲染为 `0`，数值与单位间有空格（对齐真页 `5 ms`）', () => {
    const { container } = mount();
    const labels = Array.from(container.querySelectorAll('[class$="DdTickLabel"]')).map((e) => e.textContent);
    expect(labels).toEqual(['0', '10 ms', '20 ms', '30 ms', '40 ms', '50 ms', '60 ms', '70 ms', '80 ms', '90 ms', '100 ms']);
  });

  it('不再出现按时长等分产生的脏值（如 25.5ms / 76.5ms）', () => {
    const { container } = mount({ numTicks: 5, viewDuration: 102_000 });
    const labels = Array.from(container.querySelectorAll('[class$="DdTickLabel"]')).map((e) => e.textContent ?? '');
    expect(labels.some((l) => l.includes('25.5') || l.includes('76.5'))).toBe(false);
    expect(labels).toEqual(['0', '20 ms', '40 ms', '60 ms', '80 ms', '100 ms']);
  });

  it('缩放态：刻度只在可见时间窗内取整步长', () => {
    const { container } = mount({
      numTicks: 4,
      viewDuration: 100_000,
      viewRangeTime: { current: [0.2, 0.6] },
      updateViewRangeTime: () => {},
      updateNextViewRangeTime: () => {},
    } as never);
    const labels = Array.from(container.querySelectorAll('[class$="DdTickLabel"]')).map((e) => e.textContent);
    expect(labels).toEqual(['20 ms', '30 ms', '40 ms', '50 ms', '60 ms']);
  });

  it('每个刻度渲染一根短刻度线，数量与标签一致', () => {
    const { container } = mount();
    expect(container.querySelectorAll('[class$="DdTick"]').length).toBe(11);
    expect(container.querySelectorAll('[class$="DdTickLabel"]').length).toBe(11);
  });

  it('零宽视窗不抛，且不渲染刻度', () => {
    const { container } = mount({ viewDuration: 0 });
    expect(container.querySelectorAll('[class$="DdTick"]').length).toBe(0);
  });
});
