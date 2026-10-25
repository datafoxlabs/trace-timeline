import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { Accordion, AiIcon, AngleRightIcon, AttentionCircledIcon, Button, ErrorMessage, ExternalLinkIcon, Flex, Modal, ResizeFullIcon, Text } from '@datafox/ui';
import { SpanCardList } from './SpanCardList';
import { useRetainedCardState, type CardState } from './retainedCardState';
import type { TraceSpan } from '../model';
import { getSpanErrors, type SpanError } from './SpanErrors';
import { ErrorStackContent } from './ErrorStackContent';
import { spanPresentation } from './spanPresentation';

const list = css({ padding: 'var(--spacing-md)' });
const card = css({
  cursor: 'pointer',
  padding: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', minWidth: 0,
  '&[data-selected="true"], &:hover': { background: 'var(--ui-interaction-secondary)' },
  '&[data-selected="true"]': { outline: '1px solid var(--ui-interaction-primary)' },
});
const title = css({ minWidth: 0, overflow: 'hidden' });
// Official CDP: 32.5px title line plus a 1px transparent divider.
const header = css({ minHeight: 33.5, boxSizing: 'border-box', padding: '0 var(--spacing-sm)', borderBottom: '1px solid transparent' });
const serviceIcon = css({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  width: 'calc(var(--spacing-md) + var(--spacing-xs))', height: 'calc(var(--spacing-md) + var(--spacing-xs))',
  borderRadius: 'var(--radius-sm)', color: 'var(--ui-text-knockout)',
});
const missing = css({
  padding: 'var(--spacing-sm)', border: '1px solid var(--ui-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--ui-background-secondary)',
});

const errorKey = (span: TraceSpan) => span.spanID;

interface Props {
  active?: boolean;
  virtualized?: boolean;
  spans: TraceSpan[];
  selectedSpanId: string;
  onSelectSpan: (spanId: string) => void;
  colorForSpan: (span: TraceSpan) => string;
}

/** Selection belongs to the trace; expansion and expensive stack rendering stay local to a card. */
export function TraceErrors({ spans, selectedSpanId, onSelectSpan, colorForSpan, active = true, virtualized = false }: Props) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollOffset = useRef(0);
  const states = useRef(new Map<string, CardState>());
  const cardState = (id: string) => {
    if (!states.current.has(id)) states.current.set(id, new Map());
    return states.current.get(id)!;
  };
  const [stack, setStack] = useState<SpanError | null>(null);
  // The timeline's selection callback changes with selection. Keep card props stable
  // while still dispatching to the latest controlled host callback.
  const selection = useRef(onSelectSpan);
  useLayoutEffect(() => { selection.current = onSelectSpan; }, [onSelectSpan]);
  const select = useCallback((id: string) => selection.current(id), []);
  return <div ref={setScrollElement} className={list} data-testid="TraceErrors" style={virtualized ? { height: '100%', boxSizing: 'border-box', overflow: 'auto', overflowAnchor: 'none' } : undefined} onScroll={event => { if (active) scrollOffset.current = event.currentTarget.scrollTop; }}>
    {!spans.length && <Text color="muted" role="status">当前 Trace 没有错误 Span。</Text>}
    {<SpanCardList items={spans} itemKey={errorKey} scrollElement={scrollElement} active={active} virtualized={virtualized} estimateSize={150} scrollOffset={scrollOffset}>{span => <ErrorCard state={cardState(span.spanID)} key={span.spanID} span={span} isSelected={span.spanID === selectedSpanId}
      color={colorForSpan(span)} onSelect={select} onExpandStack={setStack} />}</SpanCardList>}
    <Modal title="错误堆栈" isOpen={stack !== null} onClose={() => setStack(null)} size="lg" position="top" hasSeparator isScrollable willCloseOnEsc shouldReturnFocusAfterClose>
      {stack && <ErrorStackContent error={stack} />}
    </Modal>
  </div>;
}

interface ErrorCardProps {
  state: CardState;
  span: TraceSpan;
  isSelected: boolean;
  color: string;
  onSelect: (id: string) => void;
  onExpandStack: (error: SpanError) => void;
}

const ErrorCard = memo(function ErrorCard({ span, isSelected, color, onSelect, onExpandStack, state }: ErrorCardProps) {
  const [isOpen, setOpen] = useRetainedCardState(state, 'open', isSelected);
  const errors = useMemo(() => getSpanErrors(span), [span]);
  const { Icon, resourceName } = useMemo(() => spanPresentation(span), [span]);
  const summaries = useMemo(() => errors.length ? errors.map((error, i) => <ErrorMessage key={i} type={error.type} message={error.message} isFullWidth />)
    : <Flex className={missing} alignItems="center" gap="sm" role="status"><AttentionCircledIcon style={{ color: 'var(--ui-status-danger)' }} /><Text color="muted">未提供错误信息和堆栈</Text></Flex>, [errors]);
  return <div className={card} data-selected={isSelected} data-error-span-id={span.spanID}
    onClick={event => {
      // Nested controls keep their own action; the accordion provides keyboard selection.
      if (isSelected || (event.target as HTMLElement).closest('button, a, input, [role="button"], [role="radio"]')) return;
      setOpen(true);
      onSelect(span.spanID);
    }}>
    <Accordion size="md" isOpen={isOpen} hasAnimatedHeight={false} hasTopBorder={false} hasBottomBorder={false}
      headerClassName={header} contentProps={{ style: { padding: 0 } }}
      iconProps={{ style: { marginLeft: 0, marginRight: 'var(--spacing-sm)' } }}
      title={<Flex alignItems="center" className={title}>
        <span className={serviceIcon} style={{ background: color, marginRight: 'var(--spacing-sm)' }}><Icon size="sm" /></span>
        <Text size="md" weight="bold" hasEllipsis title={span.process.serviceName} style={{ lineHeight: '18.2px' }}>{span.process.serviceName}</Text>
        <AngleRightIcon size="md" style={{ flexShrink: 0, marginLeft: 'var(--spacing-sm)', marginRight: 'var(--spacing-xs)', color: 'var(--ui-icon-secondary)' }} />
        <Text size="sm" weight="bold" hasEllipsis title={resourceName} style={{ lineHeight: '30px' }}>{resourceName}</Text>
      </Flex>}
      onToggle={() => { setOpen(value => !value); onSelect(span.spanID); }}>
      {isOpen && <Flex direction="column" alignItems="stretch" gap="sm">
        {errors.length ? errors.map((error, i) => error.stack ? <ErrorStackContent key={i} error={error} state={state} stateKey={`error:${i}`} actions={<>
          <Button size="sm" isDangerouslyNaked iconRight={ExternalLinkIcon} disabled>错误追踪</Button>
          <Button size="sm" isPrimary icon={AiIcon} disabled>智能运维助手</Button>
          <Button size="sm" isDangerouslyNaked icon={ResizeFullIcon} aria-label="放大错误堆栈" onClick={() => onExpandStack(error)} />
        </>} /> : <ErrorMessage key={i} type={error.type} message={error.message} isFullWidth hasCopyButton />) : summaries}
      </Flex>}
    </Accordion>
    {!isOpen && <Flex direction="column" alignItems="stretch" gap="sm">{summaries}</Flex>}
  </div>;
});
