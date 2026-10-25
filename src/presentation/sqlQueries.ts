import { format, type SqlLanguage } from 'sql-formatter';
import type { TraceSpan } from '../model';

export interface SpanSqlQuery { span: TraceSpan; text: string; language: SqlLanguage }
const sqlStart = /^\s*(?:(?:\/\*[\s\S]*?\*\/|--[^\n]*(?:\n|$))\s*)*(?:select|insert|update|delete|with|create|alter|drop|truncate|merge|explain|begin|commit|rollback|show|set|call|exec|grant|revoke)\b/i;
const dialects: Record<string, SqlLanguage> = { mysql: 'mysql', mariadb: 'mariadb', postgresql: 'postgresql', postgres: 'postgresql', mssql: 'transactsql', 'microsoft.sql_server': 'transactsql', oracle: 'plsql', sqlite: 'sqlite', h2: 'sql', db2: 'db2', cockroachdb: 'postgresql', redshift: 'redshift', snowflake: 'snowflake', bigquery: 'bigquery', trino: 'trino', presto: 'trino' };
const nonSql = new Set(['redis', 'memcached', 'mongodb', 'elasticsearch', 'opensearch', 'cassandra', 'couchbase', 'neo4j']);

/** Raw instrumentation attributes own query text; enriched resource names are not SQL. */
export function getSqlQueries(spans: TraceSpan[]): SpanSqlQuery[] {
  return spans.flatMap(span => {
    const attributes = new Map((span.rawSpanAttributes ?? span.tags).map(tag => [tag.key, tag.value]));
    const text = attributes.get('db.query.text') ?? attributes.get('db.statement');
    if (typeof text !== 'string' || !text.trim()) return [];
    const system = String(attributes.get('db.system.name') ?? attributes.get('db.system') ?? '').toLowerCase();
    if (nonSql.has(system) || (!dialects[system] && !sqlStart.test(text))) return [];
    return [{ span, text, language: dialects[system] ?? 'sql' }];
  });
}

export function formatSqlQuery(query: SpanSqlQuery): string {
  return format(query.text, { language: query.language, tabWidth: 2 });
}
