import { Flex, Tab, TabList, Text } from '@datafox/ui';
import { css } from '@emotion/css';

export type TraceViewMode = 'waterfall' | 'flamegraph';
export interface DdViewTabsProps {
  value: TraceViewMode;
  onChange: (mode: TraceViewMode) => void;
}
const bar = css({ height: 41, flexShrink: 0, padding: '4px 16px 0', boxSizing: 'border-box', borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-background)' });
export function DdViewTabs({ value, onChange }: DdViewTabsProps) {
  return <Flex className={bar} data-testid="DdViewTabs" gap="sm">
    <Text weight="bold">Trace:</Text>
    <TabList size="md" isBorderless ariaAttrs={{ 'aria-label': 'Trace view' }}>
      <Tab value="flamegraph" isSelected={value === 'flamegraph'} onClick={() => onChange('flamegraph')}>Flame Graph</Tab>
      <Tab value="waterfall" isSelected={value === 'waterfall'} onClick={() => onChange('waterfall')}>Waterfall</Tab>
      <Tab value="map" isDisabled>Map</Tab>
    </TabList>
  </Flex>;
}
