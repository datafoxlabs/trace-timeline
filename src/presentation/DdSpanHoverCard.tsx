import { AttentionIcon, Flex, Text } from '@datafox/ui';
import { palette, tokens } from '@datafox/ui/tokens';
import { css } from '@emotion/css';
import type { TraceSpan } from '../model';
import { formatSpanDuration } from '../utils';
import { spanPresentation } from './spanPresentation';

// A trace-specific inverse surface, matching the measured official hover card.
// These three fixed inverse layers deliberately stay dark in both page themes.
const styles = {
  title: css({ background: palette.gray[4].dark, padding: 8 }),
  operation: css({ paddingTop: 2, paddingRight: 4, lineHeight: '18px', color: tokens.color.formBorder }),
  body: css({ background: tokens.color.otherContrast, padding: '4px 8px 8px' }),
  resource: css({ lineHeight: '20px' }),
  timing: css({ lineHeight: '20px', color: tokens.color.formBorder, whiteSpace: 'nowrap' }),
  error: css({ background: palette.gray[13].light }),
  // Official measurements: service tile 22px, error tile 30px (documented fidelity exceptions).
  serviceIcon: css({ width: 22, height: 22, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: tokens.color.fgKnockout }),
  errorIcon: css({ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: tokens.color.danger, color: tokens.color.fgKnockout }),
};

export function DdSpanHoverCard({ span, color, traceDuration, isError }: {
  span: TraceSpan; color: string; traceDuration: number; isError: boolean;
}) {
  const { resourceName, Icon } = spanPresentation(span);
  const percent = traceDuration > 0 ? (span.duration / traceDuration * 100).toFixed(1) : '0.0';
  return <div data-testid="span-hover-card">
    <div className={styles.title}>
      <Flex >
        <span className={styles.serviceIcon} style={{ background: color }}><Icon size="md" /></span>
        <Text size="md" weight="bold" color="knockout" marginLeft="sm" hasEllipsis>{span.process.serviceName}</Text>
      </Flex>
      <Text as="div" size="md" weight="bold" hasEllipsis className={styles.operation}>{span.operationName}</Text>
    </div>
    <div className={styles.body}>
      {resourceName !== span.operationName && <Text as="div" size="md" weight="bold" color="knockout" hasEllipsis className={styles.resource}>{resourceName}</Text>}
      <Text as="div" size="md" className={styles.timing}>{formatSpanDuration(span.duration)} ({percent}% total duration)</Text>
    </div>
    {isError && <Flex  className={styles.error}>
      <span className={styles.errorIcon}><AttentionIcon size="sm" /></span>
      <Text size="md" color="knockout" marginLeft="sm">Error detected</Text>
    </Flex>}
  </div>;
}
