import { Accordion, Flex, Text } from '@datafox/ui';
import { css } from '@emotion/css';
import type { ReactNode } from 'react';

const header = css({ minHeight: 34, boxSizing: 'border-box', padding: '0 8px' });
interface Props { label: ReactNode; isOpen: boolean; onToggle: () => void; count?: number; actions?: ReactNode; children?: ReactNode }

/** Retain the public legacy spelling while delegating interaction to Datafox. */
export function DdAccordian({ label, isOpen, onToggle, count, actions, children }: Props) {
  return <Accordion size="md" title={<Text weight="bold">{label}</Text>} isOpen={isOpen} onToggle={onToggle}
    hasTopBorder hasAnimatedHeight={false} headerClassName={header}
    iconProps={{ style: { marginLeft: 0, marginRight: 'var(--spacing-sm)' } }}
    headerAdditionalContent={count != null || actions ? <Flex alignItems="center" gap="sm">{count != null && <Text color="muted">{count}</Text>}{actions}</Flex> : undefined}
    contentProps={{ style: { padding: 0 } }}>{children}</Accordion>;
}
