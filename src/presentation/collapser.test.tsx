import { TooltipProvider } from '@datafox/ui';
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createTheme, ThemeProvider } from '../theme';

import { DdTimelineCollapser } from './DdTimelineCollapser';
import DdTimelineCollapserSrc from './DdTimelineCollapser.tsx?raw';

const theme = createTheme({ colorMode: 'light' });

describe('DdTimelineCollapser', () => {
  it('4 按钮触发对应回调', () => {
    const onExpandAll = vi.fn();
    const onCollapseAll = vi.fn();
    const onExpandOne = vi.fn();
    const onCollapseOne = vi.fn();
    // Story 9.2：datafox Tooltip 需祖先 TooltipProvider（真实由 TraceTimeline 根提供）。
    const { getByLabelText } = render(
      createElement(ThemeProvider, {
        theme,
        children: (
          <TooltipProvider>
            <DdTimelineCollapser
              onExpandAll={onExpandAll}
              onCollapseAll={onCollapseAll}
              onExpandOne={onExpandOne}
              onCollapseOne={onCollapseOne}
            />
          </TooltipProvider>
        ),
      })
    );
    fireEvent.click(getByLabelText('expand all'));
    fireEvent.click(getByLabelText('collapse all'));
    fireEvent.click(getByLabelText('expand one level'));
    fireEvent.click(getByLabelText('collapse one level'));
    expect(onExpandAll).toHaveBeenCalledTimes(1);
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
    expect(onExpandOne).toHaveBeenCalledTimes(1);
    expect(onCollapseOne).toHaveBeenCalledTimes(1);
  });

  // 图标契约（用户 2026-07-10 定）：一层用单箭头、全部用**同向双箭头**——
  //   全展开 = ExpandDownIcon（⌄⌄）、全折叠 = ExpandUpIcon（⌃⌃），形成「单=一层、双=全部」的一致隐喻。
  // 钉在源级：datafox 图标渲染成内联 path，DOM 端难稳断字形；此处防的是有人改回 [+]/[−] 方块。
  it('全展开/全折叠用同向双箭头（ExpandDown/ExpandUp），不再是加减方块', () => {
    expect(DdTimelineCollapserSrc).toContain('ExpandDownIcon');
    expect(DdTimelineCollapserSrc).toContain('ExpandUpIcon');
    expect(DdTimelineCollapserSrc).not.toContain('PlusSquareIcon');
    expect(DdTimelineCollapserSrc).not.toContain('MinusSquareIcon');
    // 一层仍是单箭头
    expect(DdTimelineCollapserSrc).toContain('ChevronDownIcon');
    expect(DdTimelineCollapserSrc).toContain('ChevronUpIcon');
  });
});
