import { describe, expect, it } from 'vitest';
import { mockTrace } from '../model';
import { createSpanSearchRecords, getSpanSearchFields, parseSpanSearch, quoteSpanSearchValue } from './spanSearchQuery';

const records = createSpanSearchRecords(mockTrace.spans);
const hits = (query: string) => records.filter(parseSpanSearch(query).matches).map(record => record.span.spanID);

describe('Trace-local search grammar', () => {
  it('service queries and suggestions count the same spans', () => {
    const fields = getSpanSearchFields(records);
    for (const candidate of fields.find(field => field.name === 'service')!.values) {
      expect(hits(`service:${quoteSpanSearchValue(candidate.value)}`)).toHaveLength(candidate.count);
    }
  });
  it('duration units compare model microseconds without rounding', () => {
    for (const query of ['duration:>200ms', 'duration:>0.2s', 'duration:>200000000']) {
      expect(hits(query)).toEqual(mockTrace.spans.filter(span => span.duration > 200000).map(span => span.spanID));
    }
    expect(hits('duration:[0 TO 200ms]')).toEqual(mockTrace.spans.filter(span => span.duration <= 200000).map(span => span.spanID));
  });
  it('combines OR, exclusion, custom attributes and existence', () => {
    const services = [...new Set(mockTrace.spans.map(span => span.process.serviceName))].slice(0, 2);
    const query = `service:(${services.map(quoteSpanSearchValue).join(' OR ')}) -service:${quoteSpanSearchValue(services[1])}`;
    expect(hits(query)).toEqual(hits(`service:${quoteSpanSearchValue(services[0])}`));
    expect(hits('@http.status_code:>=500')).toEqual(mockTrace.spans.filter(span => span.tags.some(tag => tag.key === 'http.status_code' && Number(tag.value) >= 500)).map(span => span.spanID));
    expect(hits('service:*')).toHaveLength(records.length);
    expect(hits('service:*order*')).toEqual(records.filter(r => r.span.process.serviceName.includes('order')).map(r => r.span.spanID));
  });
  it('quoted values preserve whitespace and punctuation', () => {
    const record = records[0];
    record.fields.set('test', ['GET /x?name="a"']);
    const query = `@test:${quoteSpanSearchValue('GET /x?name="a"')}`;
    expect(parseSpanSearch(query).error).toBeUndefined();
    expect(parseSpanSearch(query).matches(record)).toBe(true);
  });
  it.each(['service:', 'service:(a OR)', 'duration:>oops', 'duration:[2s TO 1ms]', 'service:"abc', 'service:(a]', 'service:a OR service:b'])(
    'rejects invalid query without broadening results: %s', query => {
      const parsed = parseSpanSearch(query);
      expect(parsed.error).toBeTruthy();
      expect(records.filter(parsed.matches)).toHaveLength(0);
    },
  );
  it('deduplicates repeated attribute values within each span', () => {
    const record = { ...records[0], fields: new Map([['service', ['a', 'a']]]) };
    expect(getSpanSearchFields([record])[0].values).toEqual([{ value: 'a', count: 1 }]);
  });
});
