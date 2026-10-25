import { CacheIcon, CogMultiIcon, DatabaseIcon, GlobeIcon, QueueIcon } from '@datafox/ui';
import type { TraceSpan } from '../model';

/** Presentation only: preserve operationName and show a concrete resource when attributes supply one. */
export function spanPresentation(span: TraceSpan) {
  const tags = new Map(span.tags.map(tag => [tag.key, tag.value]));
  const resourceName = String(tags.get('resource.name') ?? tags.get('http.route') ?? tags.get('http.target') ?? tags.get('db.statement') ?? tags.get('db.operation.name') ?? tags.get('db.operation') ?? span.operationName);
  const entityType = String(tags.get('datafox.entity.type') ?? '').trim().toLowerCase();
  const technology = String(tags.get('datafox.entity.technology') ?? '').trim().toLowerCase();
  // An explicit entity classification wins over operation names and OTel hints.
  // Unknown classifications stay generic instead of claiming another entity type.
  if (entityType) {
    switch (entityType) {
      case 'web':
      case 'http':
        return { resourceName, Icon: GlobeIcon, type: 'Web' };
      case 'cache':
        return { resourceName, Icon: CacheIcon, type: 'Cache' };
      case 'database':
      case 'db':
      case 'sql':
        return technology === 'redis' || technology === 'memcached'
          ? { resourceName, Icon: CacheIcon, type: 'Cache' }
          : { resourceName, Icon: DatabaseIcon, type: 'Database' };
      case 'queue':
        return { resourceName, Icon: QueueIcon, type: 'Queue' };
      case 'service':
        return { resourceName, Icon: CogMultiIcon, type: 'Service' };
      case 'custom':
        return { resourceName, Icon: CogMultiIcon, type: 'Custom' };
      default:
        return { resourceName, Icon: CogMultiIcon, type: 'Other' };
    }
  }
  const database = String(tags.get('db.system') ?? '');
  if (database === 'redis' || span.operationName.startsWith('redis.')) return { resourceName, Icon: CacheIcon, type: 'Cache' };
  if (database) return { resourceName, Icon: DatabaseIcon, type: 'Database' };
  if (span.operationName.startsWith('http.') || tags.has('http.method') || tags.has('http.request.method')) return { resourceName, Icon: GlobeIcon, type: 'Web' };
  return { resourceName, Icon: CogMultiIcon, type: 'Custom' };
}
