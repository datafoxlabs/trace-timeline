import { describe, expect, it } from 'vitest';
import { getRichSearchBarDocumentText } from '@datafox/ui';
import { createSpanSearchDocument, getSpanSearchSuggestions, removeSpanSearchTerm } from './spanSearchEditor';

const fields = [{ name: 'service', values: [{ value: 'order api', count: 6 }, { value: 'users', count: 3 }] }];
describe('Span search editor adapter', () => {
  it.each(['redis', 'service:', 'service:"order api" duration:>200ms', 'service:(users OR "order api")', 'a  b ', 'service:"unfinished'])(
    'keeps the exact editable query: %s', text => expect(getRichSearchBarDocumentText(createSpanSearchDocument(text))).toBe(text),
  );
  it('field selection includes colon; value selection quotes whitespace', () => {
    expect(getSpanSearchSuggestions('ser', 3, fields)[0].replacement).toBe('service:');
    const value = getSpanSearchSuggestions('service:', 8, fields)[0];
    expect(value).toMatchObject({ replacement: '"order api"', count: 6, from: 8, to: 8 });
  });
  it('replaces only the active value in a union', () => {
    const text = 'service:(users OR ord)';
    const suggestion = getSpanSearchSuggestions(text, text.length - 1, fields)[0];
    expect(text.slice(0, suggestion.from) + suggestion.replacement + text.slice(suggestion.to)).toBe('service:(users OR "order api")');
  });
  it('removes one pill without changing other clauses', () => {
    expect(removeSpanSearchTerm('service:users duration:>200ms', 'term-0')).toBe('duration:>200ms');
  });
});
