import { useState } from 'react';
import { css } from '@emotion/css';
import { AttentionCircledIcon, Button, AiIcon, ExternalLinkIcon, Link, ResizeFullIcon, ErrorMessage, Flex, Modal, Text } from '@datafox/ui';
import type { TraceSpan, TraceKeyValuePair } from '../model';
import { isErrorSpan } from '../core';
import { ErrorStackContent } from './ErrorStackContent';
import { DdAccordian } from './DdAccordian';

export interface SpanError {
  type?: string;
  message?: string;
  stack?: string;
}

const textField = (fields: TraceKeyValuePair[], key: string) => {
  const value = fields.find(field => field.key === key)?.value;
  return typeof value === 'string' && value.trim() ? value : undefined;
};

/** Preserve event boundaries; compatibility metadata is used only when no exception event exists. */
export function getSpanErrors(span: TraceSpan): SpanError[] {
  const events = (span.logs ?? []).filter(log => log.name === 'exception').map(log => ({
    type: textField(log.fields, 'exception.type'),
    message: textField(log.fields, 'exception.message'),
    stack: textField(log.fields, 'exception.stacktrace'),
  })).filter(error => error.type || error.message || error.stack);
  if (events.length) return events;
  const fields = span.rawSpanAttributes ?? span.tags;
  const error = {
    type: textField(fields, 'error.type') ?? textField(fields, 'exception.type'),
    message: textField(fields, 'error.message') ?? textField(fields, 'error.msg') ?? textField(fields, 'exception.message') ?? (isErrorSpan(span) ? span.statusMessage : undefined),
    stack: textField(fields, 'error.stack') ?? textField(fields, 'exception.stacktrace'),
  };
  return error.type || error.message || error.stack ? [error] : [];
}

const summary = (error: SpanError) => [error.type, error.message].filter(Boolean).join(': ');

export function SpanErrors({ span }: { span: TraceSpan }) {
  const [isOpen, setOpen] = useState(true);
  const [selected, setSelected] = useState<SpanError | null>(null);
  const errors = getSpanErrors(span);
  if (!errors.length && !isErrorSpan(span)) return null;

  return <>
    <DdAccordian label={<Flex alignItems="center" gap="sm"><Text weight="bold">Error Message</Text><AttentionCircledIcon style={{ color: 'var(--ui-status-danger)' }} /></Flex>}
      isOpen={isOpen} onToggle={() => setOpen(!isOpen)} count={errors.length > 1 ? errors.length : undefined}
      actions={<Flex justify="flex-end" alignItems="center" gap="sm" marginRight="sm" wrap>
          <Button size="sm" isDangerouslyNaked iconRight={ExternalLinkIcon} disabled>错误追踪</Button>
          <Button size="sm" isPrimary icon={AiIcon} disabled>智能运维助手</Button>
        </Flex>}>
      <Flex direction="column" alignItems="stretch" gap="sm" style={{ padding: '0 var(--spacing-md) var(--spacing-md)' }}>
        {errors.length ? errors.map((error, index) => <ErrorMessage key={index} type={error.type} message={error.message}
          isFullWidth hasCopyButton copyValue={summary(error) || error.stack}>
          {error.stack && <Link component={<button type="button" />} isFullWidth className={css({ '--link-hover': 'var(--ui-interaction-primary)', '--link-active': 'var(--ui-interaction-primary)', '&:hover': { backgroundColor: 'var(--ui-interaction-secondary)' } })} onClick={() => setSelected(error)} style={{ padding: 'var(--spacing-sm) 0', lineHeight: '18px' }}><Flex alignItems="center" justify="center" gap="xs"><ResizeFullIcon size="md" aria-hidden="true" />查看堆栈</Flex></Link>}
        </ErrorMessage>) : <Text color="muted">当前 Span 已标记为错误，但未提供错误信息或堆栈。</Text>}
      </Flex>
    </DdAccordian>
    <Modal title="错误堆栈" isOpen={selected !== null} onClose={() => setSelected(null)} size="lg" position="top" hasSeparator isScrollable willCloseOnEsc shouldReturnFocusAfterClose>
      {selected && <ErrorStackContent error={selected} />}
    </Modal>
  </>;
}
