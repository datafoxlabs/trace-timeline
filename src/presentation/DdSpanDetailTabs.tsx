import { Badge, Flex, Tab, TabList, Text } from '@datafox/ui';
import { css } from '@emotion/css';
const tabs = ['Overview', 'Errors', 'Infrastructure', 'Metrics', 'Logs', 'Network', 'Processes', 'SQL Queries', 'Profiles'] as const;
const bar = css({ padding: '0 16px', height: 36, flexShrink: 0, borderBottom: '1px solid var(--ui-border)', boxSizing: 'border-box' });
export function DdSpanDetailTabs({ active = 'Overview', errorCount = 0, sqlCount = 0, onChange }: { active?: (typeof tabs)[number]; errorCount?: number; sqlCount?: number; onChange?: (tab: 'Overview' | 'Errors' | 'SQL Queries') => void }) {
  return <Flex className={bar} data-testid="DdSpanDetailTabs" gap="xxs"><Text weight="bold">Span:</Text>
    <TabList size="md" isBorderless ariaAttrs={{ 'aria-label': 'Span details' }}>
      {tabs.map(tab => {
        const enabled = tab === 'Overview' || ((tab === 'Errors' || tab === 'SQL Queries') && Boolean(onChange));
        return <Tab key={tab} isSelected={tab === active} isDisabled={!enabled} onClick={() => { if (tab === 'Overview' || tab === 'Errors' || tab === 'SQL Queries') onChange?.(tab); }}
          suffix={tab === 'Errors' && errorCount > 0 ? <Badge level="danger" size="xs" count={errorCount} /> : tab === 'SQL Queries' && sqlCount > 0 ? <Badge size="xs" count={sqlCount} /> : undefined}
          tooltipOnTab={!enabled ? '此视图尚未接入数据' : undefined}>{tab}</Tab>;
      })}
    </TabList>
  </Flex>;
}
