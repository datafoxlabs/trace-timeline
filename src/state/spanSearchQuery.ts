import type { TraceSpan } from '../model';

export interface SearchTerm { text: string; from: number; to: number }
export interface SpanSearchRecord { span: TraceSpan; fields: Map<string, string[]>; text: string }
export interface SpanSearchField { name: string; values: { value: string; count: number }[] }

/** Preserve offsets for the editor, including unfinished quoted/grouped drafts. */
export function scanSpanQuery(query: string): { terms: SearchTerm[]; error?: string } {
  const terms: SearchTerm[] = [];
  const brackets: string[] = [];
  let quote = '';
  let from = 0;
  let error: string | undefined;
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') brackets.push(char);
    else if (char === ')' || char === ']') {
      if (brackets.pop() !== (char === ')' ? '(' : '[')) error = '括号不匹配';
    } else if (/\s/.test(char) && !brackets.length) {
      if (i > from) terms.push({ text: query.slice(from, i), from, to: i });
      from = i + 1;
    }
  }
  if (from < query.length) terms.push({ text: query.slice(from), from, to: query.length });
  return { terms, error: error ?? (quote ? '请闭合引号' : brackets.length ? '请闭合括号' : undefined) };
}

export function createSpanSearchRecords(spans: readonly TraceSpan[]): SpanSearchRecord[] {
  return spans.map(span => {
    const fields = new Map<string, string[]>();
    for (const tag of [...span.process.tags, ...span.tags]) {
      const values = Array.isArray(tag.value) ? tag.value : [tag.value];
      fields.set(tag.key, values.filter(value => value != null).map(String));
    }
    const first = (...keys: string[]) => keys.map(key => fields.get(key)).find(value => value?.length);
    fields.set('service', [span.process.serviceName]);
    fields.set('operation_name', [span.operationName]);
    fields.set('resource_name', first('resource.name', 'http.route', 'http.target', 'db.statement', 'db.operation.name', 'db.operation') ?? [span.operationName]);
    fields.set('span_id', [span.spanID]);
    fields.set('duration', [String(span.duration * 1000)]); // Query bare durations are nanoseconds; model is microseconds.
    const env = first('env', 'deployment.environment.name', 'deployment.environment');
    if (env) fields.set('env', env);
    const host = first('hostname', 'host.name');
    if (host) fields.set('host', host);
    const type = first('type', 'span.type');
    if (type) fields.set('type', type);
    const text = [span.operationName, span.process.serviceName, ...fields.keys(), ...[...fields.values()].flat(),
      ...span.logs.flatMap(log => [log.name ?? '', ...log.fields.flatMap(tag => [tag.key, String(tag.value)])])].join(' ').toLowerCase();
    return { span, fields, text };
  });
}

export function getSpanSearchFields(records: readonly SpanSearchRecord[]): SpanSearchField[] {
  const counts = new Map<string, Map<string, number>>();
  for (const record of records) {
    for (const [key, values] of record.fields) {
      let field = counts.get(key);
      if (!field) { field = new Map(); counts.set(key, field); }
      for (const value of new Set(values)) field.set(value, (field.get(value) ?? 0) + 1);
    }
  }
  const priority = ['env', 'service', 'resource_name', 'type', 'duration', 'operation_name', 'host', 'span_id'];
  const rank = (key: string) => priority.includes(key) ? priority.indexOf(key) : priority.length;
  return [...counts].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([name, values]) => ({
    name, values: name === 'duration' ? [] : [...values].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  }));
}

export function quoteSpanSearchValue(value: string): string {
  return /^[\w./-]+$/.test(value) && !['OR', 'AND', 'TO'].includes(value) ? value : JSON.stringify(value);
}

function unquote(value: string) {
  return /^['"]/.test(value) ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value;
}

function numberValue(value: string, duration: boolean): number {
  const match = /^(-?\d+(?:\.\d+)?)(ns|us|µs|ms|s|m)?$/.exec(value);
  if (!match || (!duration && match[2])) return NaN;
  const factor: Record<string, number> = { ns: 1, us: 1e3, 'µs': 1e3, ms: 1e6, s: 1e9, m: 6e10 };
  return Number(match[1]) * (match[2] ? factor[match[2]] : 1);
}

type ValueMatcher = (values: readonly string[]) => boolean;
function valueMatcher(expression: string, duration: boolean): ValueMatcher {
  if (!expression) throw new Error('冒号后需要填写值');
  if (expression === '*') return values => values.length > 0;
  if (expression.startsWith('(')) {
    const { terms, error } = scanSpanQuery(expression.slice(1, -1));
    if (error || !terms.length || terms.length % 2 === 0 || terms.some((term, i) => i % 2 === 1 && term.text !== 'OR')) throw new Error('多值条件请使用 (value OR value)');
    const matchers = terms.filter((_, i) => i % 2 === 0).map(term => valueMatcher(term.text, duration));
    return values => matchers.some(match => match(values));
  }
  const range = /^\[(.+) TO (.+)\]$/.exec(expression);
  const comparison = /^(>=|<=|>|<)(.+)$/.exec(expression);
  if (range || comparison || duration) {
    const lower = numberValue(range?.[1] ?? comparison?.[2] ?? expression, duration);
    const upper = range ? numberValue(range[2], duration) : lower;
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) throw new Error('请输入有效数值或范围；duration 支持 ns、us、ms、s、m');
    return values => values.some(value => {
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      if (range) return number >= lower && number <= upper;
      switch (comparison?.[1]) {
        case '>': return number > lower;
        case '>=': return number >= lower;
        case '<': return number < lower;
        case '<=': return number <= lower;
        default: return number === lower;
      }
    });
  }
  if (!/^(['"])(?:[\s\S]*)\1$/.test(expression) && /[\s()[\]<>]/.test(expression)) throw new Error('包含空格或特殊符号的值请加引号');
  const value = unquote(expression);
  const pattern = value.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  const regex = new RegExp(`^${pattern}$`, 'i');
  return values => values.some(candidate => regex.test(candidate));
}

export function parseSpanSearch(query: string): { matches: (record: SpanSearchRecord) => boolean; error?: string } {
  const { terms, error } = scanSpanQuery(query);
  if (error) return { matches: () => false, error };
  try {
    const predicates = terms.map(term => {
      const field = /^(-?)([\w@.-]+):(.*)$/s.exec(term.text);
      if (!field) {
        if (['OR', 'AND', 'NOT'].includes(term.text)) throw new Error('多个条件用空格连接；字段多值使用 field:(a OR b)');
        const text = unquote(term.text).toLowerCase();
        return (record: SpanSearchRecord) => record.text.includes(text);
      }
      const name = field[2].replace(/^@/, '');
      const match = valueMatcher(field[3], name === 'duration');
      return (record: SpanSearchRecord) => match(record.fields.get(name) ?? []) !== Boolean(field[1]);
    });
    return { matches: record => predicates.every(match => match(record)) };
  } catch (cause) {
    return { matches: () => false, error: (cause as Error).message };
  }
}
