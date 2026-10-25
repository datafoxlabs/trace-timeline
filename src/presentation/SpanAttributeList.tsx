import { Button, CopyButton, InputSearch, PushpinEmptyIcon, PushpinFilledIcon, Text } from '@datafox/ui';
import { css } from '@emotion/css';
import { useState } from 'react';

export interface AttributeEntry { key: string; value: unknown }

/** Preserve literal dotted keys; nested objects/arrays become independently readable rows. */
export function flattenAttributes(entries: AttributeEntry[]): AttributeEntry[] {
  const rows: AttributeEntry[] = [];
  function visit(key: string, value: unknown) {
    if (value !== null && typeof value === 'object') {
      const children = Object.entries(value);
      if (children.length) {
        for (const [child, item] of children) visit(Array.isArray(value) ? `${key}[${child}]` : `${key}.${child}`, item);
        return;
      }
    }
    rows.push({ key, value });
  }
  for (const entry of entries) visit(entry.key, entry.value);
  return rows;
}

export function attributeText(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[]';
  if (typeof value === 'object') return '{}';
  return String(value);
}

const list = css({ margin: 0, padding: 0, width: '100%' });
const row = css({ display: 'grid', gridTemplateColumns: 'minmax(120px, 28%) minmax(0, 1fr) auto', alignItems: 'start', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--ui-border)', '&:hover': { background: 'var(--ui-background-secondary)' } });
const name = css({ margin: 0, overflowWrap: 'anywhere', color: 'var(--ui-text-secondary)' });
const valueStyle = css({ margin: 0, minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
const actions = css({ display: 'flex', gap: 2 });
const toolbar = css({ padding: '8px 16px' });

function AttributeValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = attributeText(value);
  const long = text.length > 320;
  return <><span>{long && !expanded ? `${text.slice(0, 320)}…` : text}</span>{long && <Button size="xs" isBorderless onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? '收起' : '展开完整值'}</Button>}</>;
}

export function SpanAttributeList({ entries, pinnedKeys, onTogglePin, searchable = false, scope = 'Span' }: {
  entries: AttributeEntry[];
  pinnedKeys?: ReadonlySet<string>;
  onTogglePin?: (key: string) => void;
  searchable?: boolean;
  scope?: 'Span' | 'Resource';
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = entries.filter(entry => !needle || `${entry.key}\n${attributeText(entry.value)}`.toLocaleLowerCase().includes(needle));
  return <div>
    {searchable && <div className={toolbar}><InputSearch aria-label={`搜索 ${scope} 属性`} placeholder="搜索属性名称或值" value={query} onChange={event => setQuery(event.target.value)} isFullWidth /></div>}
    {visible.length ? <dl className={list}>{visible.map((entry, index) => <div className={row} key={`${entry.key}:${index}`} data-attribute-key={entry.key}>
      <dt className={name}>{entry.key}</dt>
      <dd className={valueStyle}><AttributeValue value={entry.value} /></dd>
      <dd className={actions} style={{ margin: 0 }}>
        <CopyButton value={entry.key} size="xs" isBorderless aria-label={`复制属性名 ${entry.key}`} messageCopy="复制属性名" />
        <CopyButton value={attributeText(entry.value)} size="xs" isBorderless aria-label={`复制属性值 ${entry.key}`} messageCopy="复制属性值" />
        {onTogglePin && <Button size="xs" isBorderless icon={pinnedKeys?.has(entry.key) ? PushpinFilledIcon : PushpinEmptyIcon} aria-pressed={pinnedKeys?.has(entry.key) ?? false} aria-label={`${pinnedKeys?.has(entry.key) ? '取消固定' : '固定'} ${entry.key}`} onClick={() => onTogglePin(entry.key)} />}
      </dd>
    </div>)}</dl> : <div className={toolbar}><Text color="muted" role="status">{entries.length ? '没有匹配的属性' : `No ${scope.toLowerCase()} attributes`}</Text></div>}
  </div>;
}
