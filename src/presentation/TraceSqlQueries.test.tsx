import { fireEvent, render, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { mockTrace, type TraceSpan } from '../model';
import { getSqlQueries, formatSqlQuery } from './sqlQueries';
import { TraceSqlQueries } from './TraceSqlQueries';

const span = (id: string, text: string, duration = 100, statusCode = 0): TraceSpan => ({ ...mockTrace.spans[0], spanID: id, duration, startTime: 1789808316268000, statusCode, tags: [], rawSpanAttributes: [{ key: 'db.system', value: 'mysql' }, { key: 'db.statement', value: text }] });
describe('SQL Queries', () => {
  it('uses raw modern/legacy SQL attributes, without importing enriched or non-SQL statements', () => {
    const legacy = span('legacy', 'select 1');
    const modern = { ...span('modern', 'old'), rawSpanAttributes: [{ key: 'db.system.name', value: 'postgresql' }, { key: 'db.query.text', value: 'select 2' }] };
    const redis = { ...span('redis', 'SET foo bar'), rawSpanAttributes: [{ key: 'db.system', value: 'redis' }, { key: 'db.statement', value: 'SET foo bar' }] };
    const enriched = { ...span('enriched', ''), tags: [{ key: 'db.statement', value: 'SELECT secret' }] };
    const oldAdapter = { ...legacy, spanID: 'old-adapter', rawSpanAttributes: undefined, tags: legacy.rawSpanAttributes! };
    expect(getSqlQueries([legacy, modern, redis, enriched, oldAdapter]).map(q => [q.span.spanID, q.text])).toEqual([['legacy','select 1'], ['modern','select 2'], ['old-adapter','select 1']]);
  });
  it('formats without changing string literals, comments or parameters', () => {
    const [query] = getSqlQueries([span('one', "select 'a  b' as value, ? from orders where id = ? -- retain comment")]);
    const result = formatSqlQuery(query);
    expect(result).toContain("'a  b'");
    expect(result).toContain('-- retain comment');
    expect(result.match(/\?/g)).toHaveLength(2);
    expect(query.text).not.toContain('\n');
  });
  it('sorts by duration and filters SQL case-insensitively and by actual error status', () => {
    const queries = getSqlQueries([span('short', 'select 1', 10), span('long', 'INSERT INTO orders VALUES (?)', 200, 2)]);
    const view = render(<TraceSqlQueries queries={queries} selectedSpanId="none" onSelectSpan={vi.fn()} colorForSpan={() => 'red'} />);
    const ids = () => Array.from(view.container.querySelectorAll('[data-sql-span-id]')).map(e => e.getAttribute('data-sql-span-id'));
    expect(ids()).toEqual(['long', 'short']);
    fireEvent.change(view.getByRole('textbox', { name: '搜索 SQL 查询' }), { target: { value: 'SELECT' } });
    expect(ids()).toEqual(['short']);
    fireEvent.click(view.getByRole('switch'));
    expect(view.getByRole('status')).toHaveTextContent('没有匹配的 SQL 查询');
    fireEvent.change(view.getByRole('textbox', { name: '搜索 SQL 查询' }), { target: { value: '' } });
    expect(ids()).toEqual(['long']);
    expect(queries).toHaveLength(2);
  });
  it('keeps expansion independent, persists selection on blur, and isolates formatting controls', () => {
    const queries = getSqlQueries([span('one', 'select 1'), span('two', 'select 2')]);
    const onSelectSpan = vi.fn();
    const props = { queries, selectedSpanId: 'none', onSelectSpan, colorForSpan: () => 'red' };
    const view = render(<TraceSqlQueries {...props} />);
    const card = (id: string) => view.container.querySelector(`[data-sql-span-id="${id}"]`)! as HTMLElement;
    const one = within(card('one'));
    fireEvent.click(card('one').querySelector('code')!);
    expect(onSelectSpan).toHaveBeenLastCalledWith('one');
    expect(one.getByRole('button', { expanded: true })).toBeVisible();
    fireEvent.click(within(card('two')).getByRole('button'));
    view.rerender(<TraceSqlQueries {...props} selectedSpanId="two" />);
    expect(one.getByRole('button', { expanded: true })).toBeVisible();
    expect(within(card('two')).getByRole('button', { expanded: true })).toBeVisible();
    onSelectSpan.mockClear();
    fireEvent.click(one.getByRole('button', { name: '格式化查询' }));
    expect(card('one').querySelector('code')!.textContent).toBe('select  1');
    expect(onSelectSpan).not.toHaveBeenCalled();
    fireEvent.click(one.getByRole('button', { name: '还原查询' }));
    expect(card('one').querySelector('code')!.textContent).toBe('select 1');
    fireEvent.mouseLeave(card('two'));
    fireEvent.blur(card('two'));
    expect(card('two')).toHaveAttribute('data-selected', 'true');
    expect(one.getByRole('button', { name: '解释查询' })).toBeDisabled();
  });
  it('retains malformed SQL when formatting fails and shows an actionable message', () => {
    const view = render(<TraceSqlQueries queries={getSqlQueries([span('one', "select 'unclosed")])} selectedSpanId="one" onSelectSpan={vi.fn()} colorForSpan={() => 'red'} />);
    fireEvent.click(view.getByRole('button', { name: '格式化查询' }));
    expect(view.getByRole('alert')).toHaveTextContent('已保留原始 SQL');
    expect(view.container.querySelector('code')!.textContent).toBe("select 'unclosed");
  });
});
