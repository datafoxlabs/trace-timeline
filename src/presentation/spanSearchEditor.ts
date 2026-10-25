import { getRichSearchBarPartText, type RichSearchBarDocument } from '@datafox/ui';
import { quoteSpanSearchValue, scanSpanQuery, type SpanSearchField } from '../state/spanSearchQuery';

export function createSpanSearchDocument(text: string): RichSearchBarDocument {
  const parts: RichSearchBarDocument['parts'][number][] = [];
  let offset = 0;
  for (const term of scanSpanQuery(text).terms) {
    if (term.from > offset) parts.push({ id: `space-${offset}`, kind: 'text', text: text.slice(offset, term.from) });
    const match = /^(-?[\w@.-]+:)(.*)$/s.exec(term.text);
    parts.push(match ? {
      id: `term-${term.from}`, kind: 'pill', ariaLabel: term.text,
      isInvalid: !match[2], errorMessage: !match[2] ? '冒号后需要填写值' : undefined,
      terminals: [{ id: 'field', kind: 'key', text: match[1] }, { id: 'value', kind: 'value', text: match[2] }],
    } : { id: `term-${term.from}`, kind: 'text', text: term.text });
    offset = term.to;
  }
  if (offset < text.length || !parts.length) parts.push({ id: `tail-${offset}`, kind: 'text', text: text.slice(offset) });
  return { parts };
}

export function getSpanSearchPosition(document: RichSearchBarDocument, cursor: number) {
  let offset = 0;
  for (const part of document.parts) {
    const length = getRichSearchBarPartText(part).length;
    if (cursor <= offset + length) return { partId: part.id, offset: cursor - offset };
    offset += length;
  }
  const last = document.parts[document.parts.length - 1];
  return { partId: last.id, offset: getRichSearchBarPartText(last).length };
}

export interface SpanSearchSuggestion {
  id: string;
  label: string;
  count?: number;
  kind: 'field' | 'value' | 'history';
  from: number;
  to: number;
  replacement: string;
}

export function getSpanSearchSuggestions(text: string, cursor: number, fields: readonly SpanSearchField[]): SpanSearchSuggestion[] {
  const term = scanSpanQuery(text).terms.find(term => cursor >= term.from && cursor <= term.to);
  const from = term?.from ?? cursor;
  const raw = term?.text ?? '';
  const colon = raw.indexOf(':');
  if (colon < 0 || cursor <= from + colon) {
    const excluded = raw.startsWith('-') ? 1 : 0;
    const fragment = text.slice(from + excluded, cursor).replace(/^@/, '').toLowerCase();
    return fields.filter(field => field.name.toLowerCase().includes(fragment)).map(field => ({
      id: `field:${field.name}`, label: field.name, kind: 'field', from: from + excluded,
      to: colon < 0 ? from + raw.length : from + colon + 1, replacement: `${field.name}:`,
    }));
  }
  const name = raw.slice(0, colon).replace(/^-?@?/, '');
  let valueFrom = from + colon + 1;
  let valueTo = term!.to;
  if (raw[colon + 1] === '(') {
    const inside = raw.slice(colon + 2).replace(/\)$/, '');
    const base = from + colon + 2;
    const valueTerm = scanSpanQuery(inside).terms.find(item => cursor >= base + item.from && cursor <= base + item.to);
    if (valueTerm?.text === 'OR') return [];
    valueFrom = valueTerm ? base + valueTerm.from : cursor;
    valueTo = valueTerm ? base + valueTerm.to : cursor;
  }
  const fragment = text.slice(valueFrom, cursor).replace(/^["']|["']$/g, '').toLowerCase();
  return (fields.find(field => field.name === name)?.values ?? [])
    .filter(item => item.value.toLowerCase().includes(fragment)).map(item => ({
      id: `value:${name}:${item.value}`, label: item.value, count: item.count, kind: 'value',
      from: valueFrom, to: valueTo, replacement: quoteSpanSearchValue(item.value),
    }));
}

export function removeSpanSearchTerm(text: string, id: string) {
  const terms = scanSpanQuery(text).terms;
  const index = terms.findIndex(term => `term-${term.from}` === id);
  if (index < 0) return text;
  const term = terms[index];
  const next = terms[index + 1];
  const from = !next && index > 0 ? terms[index - 1].to : term.from;
  return text.slice(0, from) + text.slice(next?.from ?? term.to);
}
