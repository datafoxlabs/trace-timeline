import { TooltipProvider } from '@datafox/ui';
import { fireEvent, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { mockTrace } from '../model';
import type { SearchState } from '../state';
import { createTheme, ThemeProvider } from '../theme';

import { DdSearchBar } from './DdSearchBar';

const theme = createTheme({ colorMode: 'light' });

// Story 9.2：DdSearchBar 叶子替换（InputSearch / Button+Tooltip / Checkbox）渲染 + 交互契约。
function makeSearch(over: Partial<SearchState> = {}): SearchState {
  return {
    query: '',
    setQuery: vi.fn(),
    matches: undefined,
    matchCount: 0,
    showMatchesOnly: false,
    setShowMatchesOnly: vi.fn(),
    errorsOnly: false,
    setErrorsOnly: vi.fn(),
    errorCount: 0,
    focusedMatchId: undefined,
    focusedMatchIndex: 0,
    nextMatch: vi.fn(),
    prevMatch: vi.fn(),
    ...over,
  };
}

function mount(children: ReactNode) {
  return render(
    createElement(ThemeProvider, { theme, children: createElement(TooltipProvider, null, children) })
  );
}

describe('DdSearchBar 叶子替换（Story 9.2）', () => {
  it('empty query keeps search navigation out of the toolbar', () => {
    const { queryByLabelText, queryByText } = mount(<DdSearchBar search={makeSearch()} />);
    expect(queryByLabelText('上一个命中')).toBeNull();
    expect(queryByText('只看匹配')).toBeNull();
  });
  it('RichSearchBar commits a valid query on Enter', () => {
    const search = makeSearch({ query: 'service:redis' });
    const { getByRole } = mount(<DdSearchBar search={search} spans={mockTrace.spans} />);
    const editor = getByRole('textbox', { name: '搜索 span' });
    expect(search.setQuery).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(search.setQuery).toHaveBeenCalledWith('service:redis');
  });

  it('keeps manual querying available for existing consumers without spans', () => {
    const search = makeSearch({ query: 'redis' });
    const { getByRole } = mount(<DdSearchBar search={search} />);
    fireEvent.keyDown(getByRole('textbox', { name: '搜索 span' }), { key: 'Enter' });
    expect(search.setQuery).toHaveBeenCalledWith('redis');
  });

  it('Errors alone shows match navigation; no matches removes arrows', () => {
    const { getByLabelText, unmount } = mount(<DdSearchBar search={makeSearch({ errorsOnly: true, matchCount: 2, focusedMatchIndex: 1 })} />);
    expect(getByLabelText('下一个命中')).toBeEnabled();
    unmount();
    const { queryByLabelText, getByText } = mount(<DdSearchBar search={makeSearch({ query: 'missing' })} />);
    expect(queryByLabelText('下一个命中')).toBeNull();
    expect(getByText('No matches')).toBeInTheDocument();
  });

  it('Errors checkbox：errorCount>0 时渲染，点击 toggle，aria-checked 反映 errorsOnly', () => {
    const search = makeSearch({ errorCount: 2, errorsOnly: true });
    const { getByTestId } = mount(<DdSearchBar search={search} />);
    const btn = getByTestId('DdSearchErrors');
    expect(btn.getAttribute('aria-checked')).toBe('true');
    expect(btn.textContent).toContain('Errors');
    fireEvent.click(btn);
    expect(search.setErrorsOnly).toHaveBeenCalledWith(false);
  });

  it('hides Errors when there are no errors and never offers hide-context filtering', () => {
    const { queryByRole, queryByText } = mount(<DdSearchBar search={makeSearch({ query: 'match' })} />);
    expect(queryByRole('checkbox')).toBeNull();
    expect(queryByText('只看匹配')).toBeNull();
  });

  it('incomplete query reports an error without replacing committed matches', () => {
    const search = makeSearch({ query: 'service:' });
    const { getByRole } = mount(<DdSearchBar search={search} spans={mockTrace.spans} />);
    fireEvent.keyDown(getByRole('textbox', { name: '搜索 span' }), { key: 'Enter' });
    expect(getByRole('alert')).toHaveTextContent('冒号后需要填写值');
    expect(search.setQuery).not.toHaveBeenCalled();
  });

  // Story 10.9：图例显隐开关移到工具条（真页位置）。仅火焰态传 legendToggle；瀑布态不传即不渲染。
  it('legendToggle：不传时无按钮；传则渲染 Hide/Show Legend、点击 toggle', () => {
    const search = makeSearch();
    const { queryByTestId } = mount(<DdSearchBar search={search} />);
    expect(queryByTestId('DdFlameLegendToggle')).toBeNull();

    const onToggle = vi.fn();
    const { getByTestId } = mount(<DdSearchBar search={search} legendToggle={{ show: true, onToggle }} />);
    const btn = getByTestId('DdFlameLegendToggle');
    expect(btn.textContent).toBe('Hide Legend');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('legendToggle show=false → 显示 Show Legend、点击回传 true', () => {
    const search = makeSearch();
    const onToggle = vi.fn();
    const { getByTestId } = mount(<DdSearchBar search={search} legendToggle={{ show: false, onToggle }} />);
    const btn = getByTestId('DdFlameLegendToggle');
    expect(btn.textContent).toBe('Show Legend');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
