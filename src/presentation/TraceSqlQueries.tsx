import dayjs from 'dayjs';
import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { Accordion, AiIcon, Button, ClockIcon, Code, Flex, GlobeIcon, InputSearch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Text } from '@datafox/ui';
import { SpanCardList } from './SpanCardList';
import { useRetainedCardState, type CardState } from './retainedCardState';
import type { TraceSpan } from '../model';
import { isErrorSpan } from '../core';
import { formatSpanDuration } from '../utils';
import { formatSqlQuery, type SpanSqlQuery } from './sqlQueries';

const list = css({ padding: 'var(--spacing-sm) var(--spacing-md) var(--spacing-md)', minWidth: 0 });
const toolbar = css({ marginBottom: 'var(--spacing-md)', minHeight: 28 });
// The public Switch supplies state and keyboard behavior; geometry matches the measured DD md toggle.
const errorSwitch = css({
  width: 37, height: 21, border: 0, cursor: 'pointer',
  '&::after': { inset: 0 },
  '& > [data-slot="switch-thumb"]': { width: 15, height: 15, translate: 'none', transform: 'translateX(3px)' },
  '&[data-state="checked"] > [data-slot="switch-thumb"]': { transform: 'translateX(19px)' },
});
const search = css({ flex: '1 1 0', minWidth: 0, margin: '0 var(--spacing-md)', '@container (max-width: 600px)': { flexBasis: '100%', order: 1, margin: 0 } });
// User-requested parity exceptions: official card radius 6px and header 33.5px.
const card = css({ cursor: 'pointer', border: '1px solid var(--ui-border)', borderRadius: 6, paddingTop: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', minWidth: 0,
  '&:hover, &[data-selected="true"]': { background: 'var(--ui-interaction-secondary)' },
  '&[data-selected="true"]': { borderColor: 'var(--ui-interaction-primary)', outline: '1px solid var(--ui-interaction-primary)' },
});
const header = css({ height: 33.5, boxSizing: 'border-box', padding: '0 var(--spacing-sm)', minWidth: 0 });
const serviceIcon = css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 20, height: 20, borderRadius: 'var(--radius-sm)', color: 'var(--ui-text-knockout)' });
const expanded = css({ margin: 'var(--spacing-sm) var(--spacing-sm) var(--spacing-md)', border: '1px solid var(--ui-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--ui-background)' });
const formatButton = css({ borderRadius: 0, border: 0, borderTop: '1px solid var(--ui-border)', color: 'var(--ui-interaction-primary)', background: 'var(--ui-background-secondary)' });
const metadata = css({ minWidth: 0, overflow: 'hidden', lineHeight: '18.2px' });
const divider = css({ borderLeft: '1px solid var(--ui-border)', paddingLeft: 'var(--spacing-sm)', flexShrink: 0 });
const code = css({ cursor: 'inherit', display: 'flex', fontSize: 13, lineHeight: '18.2px' });
// Code's line wrappers default to min-content width; allow long SQL to wrap within this view.
const codeText = css({ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '18.2px', '& > span': { minWidth: 0 } });
const formatTimestamp = (microseconds: number) => dayjs(microseconds / 1000).format('YYYY年M月D日 HH:mm:ss.SSS');

const queryKey = (query: SpanSqlQuery) => query.span.spanID;

interface Props { active?: boolean; virtualized?: boolean; queries: SpanSqlQuery[]; selectedSpanId: string; onSelectSpan: (id: string) => void; colorForSpan: (span: TraceSpan) => string }
export function TraceSqlQueries({ queries, selectedSpanId, onSelectSpan, colorForSpan, active = true, virtualized = false }: Props) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollOffset = useRef(0);
  const states = useRef(new Map<string, CardState>());
  const cardState = (id: string) => {
    if (!states.current.has(id)) states.current.set(id, new Map());
    return states.current.get(id)!;
  };
  const [sort, setSort] = useState('duration');
  const [searchText, setSearch] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const switchId = useId();
  const selection = useRef(onSelectSpan);
  useLayoutEffect(() => { selection.current = onSelectSpan; }, [onSelectSpan]);
  const select = useCallback((id: string) => selection.current(id), []);
  const visible = useMemo(() => queries.filter(query => (!onlyErrors || isErrorSpan(query.span)) && query.text.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => sort === 'duration' ? b.span.duration - a.span.duration : a.span.startTime - b.span.startTime), [queries, onlyErrors, searchText, sort]);
  useLayoutEffect(() => {
    scrollOffset.current = 0;
    if (scrollElement) scrollElement.scrollTop = 0;
  }, [sort, searchText, onlyErrors, scrollElement]);
  return <div ref={setScrollElement} className={list} data-testid="TraceSqlQueries" style={virtualized ? { height: '100%', boxSizing: 'border-box', overflow: 'auto', overflowAnchor: 'none' } : undefined} onScroll={event => { if (active) scrollOffset.current = event.currentTarget.scrollTop; }}>
    <Flex alignItems="center" wrap="wrap" className={toolbar} style={{ rowGap: 'var(--spacing-sm)' }}>
      <Flex alignItems="center" gap="sm"><Text weight="bold" style={{ whiteSpace: 'nowrap' }}>排序</Text>
        <Select value={sort} onValueChange={setSort}><SelectTrigger size="md" aria-label="SQL 排序"><SelectValue /></SelectTrigger><SelectContent searchable={false}><SelectItem value="duration">耗时</SelectItem><SelectItem value="start">开始时间</SelectItem></SelectContent></Select>
      </Flex>
      <InputSearch className={search} size="md" aria-label="搜索 SQL 查询" placeholder="搜索 SQL 查询" value={searchText} onChange={event => setSearch(event.target.value)} />
      <label htmlFor={switchId} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}><Flex alignItems="center" gap="sm"><Switch className={errorSwitch} id={switchId} checked={onlyErrors} onCheckedChange={setOnlyErrors} /><Text>仅显示错误查询</Text></Flex></label>
    </Flex>
    {!visible.length && <Text color="muted" role="status">{queries.length ? '没有匹配的 SQL 查询' : '当前 Trace 没有 SQL 查询'}</Text>}
    {<SpanCardList items={visible} itemKey={queryKey} scrollElement={scrollElement} active={active} virtualized={virtualized} estimateSize={110} scrollOffset={scrollOffset}>{query => <SqlCard state={cardState(query.span.spanID)} key={query.span.spanID} query={query} isSelected={query.span.spanID === selectedSpanId} onSelect={select} color={colorForSpan(query.span)} />}</SpanCardList>}
  </div>;
}

const SqlCard = memo(function SqlCard({ query, isSelected, onSelect, color, state }: { state: CardState; query: SpanSqlQuery; isSelected: boolean; onSelect: (id: string) => void; color: string }) {
  const { span } = query;
  const [isOpen, setOpen] = useRetainedCardState(state, 'open', isSelected);
  const [formatted, setFormatted] = useRetainedCardState<string | null>(state, 'formatted', null);
  const [formatError, setFormatError] = useRetainedCardState(state, 'formatError', false);
  const toggleFormat = () => {
    if (formatted !== null) { setFormatted(null); return; }
    try { setFormatted(formatSqlQuery(query)); setFormatError(false); }
    catch { setFormatError(true); }
  };
  const sql = <Code language="sql" className={code} codeClassName={codeText} size="md" padding={isOpen ? 'md' : 'sm'} isFullWidth isNaked
    hasCopyButton={isOpen} copyValue={formatted ?? query.text}
    extraActions={isOpen ? <Button size="xs" isDangerouslyNaked icon={AiIcon} aria-label="解释查询" disabled /> : undefined}>{formatted ?? query.text}</Code>;
  return <div className={card} data-sql-span-id={span.spanID} data-selected={isSelected} onClick={event => {
    if (isSelected || (event.target as HTMLElement).closest('button, a, input, [role="button"], [role="switch"]')) return;
    setOpen(true); onSelect(span.spanID);
  }}>
    <Accordion size="md" isOpen={isOpen} hasAnimatedHeight={false} hasTopBorder={false} hasBottomBorder={false} headerClassName={header}
      contentProps={{ style: { padding: 0 } }} iconProps={{ style: { marginLeft: 0, marginRight: 'var(--spacing-sm)' } }}
      onToggle={() => { setOpen(value => !value); onSelect(span.spanID); }}
      title={<Flex alignItems="center" gap="sm" className={metadata}>
        <span className={serviceIcon} style={{ background: color }}><GlobeIcon size="sm" /></span>
        <Text weight="bold" hasEllipsis title={span.process.serviceName}>{span.process.serviceName}</Text>
        <Flex alignItems="center" gap="sm" className={divider}><ClockIcon size="md" style={{ color: 'var(--ui-icon-secondary)' }} /><Text weight="bold" style={{ whiteSpace: 'nowrap' }}>{formatSpanDuration(span.duration)}</Text></Flex>
        <Text className={divider} style={{ flexShrink: 1, minWidth: 0 }} hasEllipsis title={formatTimestamp(span.startTime)}>{formatTimestamp(span.startTime)}</Text>
      </Flex>}>
      {isOpen && <div className={expanded}>{sql}<Button size="md" isFullWidth className={formatButton} style={{ color: 'var(--ui-interaction-primary)' }} onClick={toggleFormat}>{formatted === null ? '格式化查询' : '还原查询'}</Button></div>}
      {isOpen && formatError && <Text role="alert" color="danger" style={{ padding: '0 var(--spacing-md) var(--spacing-sm)' }}>此查询无法格式化，已保留原始 SQL。</Text>}
    </Accordion>
    {!isOpen && sql}
  </div>;
});
