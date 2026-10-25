import { useState } from 'react';
import { Flex, Text } from '@datafox/ui';
import type { TraceSpan } from '../model';
import { formatSpanDuration } from '../utils';
import { DdAccordian } from './DdAccordian';
import { flattenAttributes, SpanAttributeList } from './SpanAttributeList';

/** Events keep their own attribute boundaries, including exception events. */
export function SpanEvents({ span }: { span: TraceSpan }) {
  const [isOpen, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const events = span.logs ?? [];
  if (!events.length) return null;

  return <DdAccordian label="Span Events" count={events.length} isOpen={isOpen} onToggle={() => setOpen(!isOpen)}>
    {events.map((event, index) => {
      const offset = event.timestamp - span.startTime;
      const attributes = flattenAttributes(event.fields.filter(field => !field.key.startsWith('_')));
      return <DdAccordian key={index} label={<Flex alignItems="center" gap="sm" wrap>
        <Text color="muted" title="相对 Span 开始时间">{offset < 0 ? '−' : '+'}{formatSpanDuration(Math.abs(offset))}</Text>
        <Text style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{event.name || '未命名事件'}</Text>
      </Flex>} count={attributes.length} isOpen={expanded.has(index)} onToggle={() => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(index)) next.delete(index); else next.add(index);
        return next;
      })}>
        {attributes.length ? <SpanAttributeList entries={attributes} /> : <Text color="muted" margin="md">暂无可展示的事件属性</Text>}
      </DdAccordian>;
    })}
  </DdAccordian>;
}
