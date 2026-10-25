// 详情顶部 span header（Story 3.4）——对齐 Datadog：服务 chip(通用色块图标)+operationName +
// 耗时占比以完整 Trace 的可见时间范围为分母。
import { Button, ClockIcon, PanelBottomShrinkIcon, PanelBottomGrowIcon, EntityPill, PercentBar, AttentionCircledIcon, KebabVerticalIcon, Flex, Text, PopoverRoot, PopoverTrigger, PopoverContent, CopyButton, type IconProps } from '@datafox/ui';
import { css } from '@emotion/css';
import type { ComponentType, ReactNode } from 'react';
import { formatSpanDuration } from '../utils';

const header = css({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 'var(--spacing-lg)', paddingLeft: 'var(--spacing-md)',
  minHeight: 36, flexShrink: 0, boxSizing: 'border-box',
});
const identity = css({ minWidth: 0, flex: '1 1 auto' });
const operationWrapper = css({
  minWidth: 0, flex: '0 1 auto', borderRadius: 8,
  '&:hover': { backgroundColor: 'var(--ui-interaction-secondary)' },
});
// Measured official operation handle: 18px text + 4px vertical padding, no border.
const operation = css({
  minWidth: 0, maxWidth: '100%', height: 26, border: 0, borderRadius: 8,
  justifyContent: 'flex-start', padding: 'var(--spacing-xs) var(--spacing-sm)',
  color: 'var(--ui-text)', lineHeight: '18px',
});
const timing = css({ width: 190, flexShrink: 0,
  '@container (max-width: 600px)': { width: 'auto' },
});
const execution = css({ whiteSpace: 'nowrap', '@container (max-width: 600px)': { display: 'none' } });

interface Props {
  serviceName: string;
  operationName: string;
  resourceName?: string;
  icon?: ComponentType<IconProps>;
  duration: number;
  traceDuration?: number;
  /** 服务色（用作 chip 图标色块）。 */
  color: string;
  /** 右侧动作槽（分享/链接等 stub 按钮，Story 5.4）。 */
  actions?: ReactNode;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  isError?: boolean;
}

export function DdSpanDetailHeader({ serviceName, operationName, resourceName, icon: Icon, duration, traceDuration, color, actions, onClose, isCollapsed, onToggleCollapsed, isError }: Props) {
  const percentage = traceDuration && traceDuration > 0 ? duration / traceDuration * 100 : undefined;
  return (
    <div className={header} data-testid="DdSpanDetailHeader">
      <Flex alignItems="center" gap="xs" className={identity}>
        <EntityPill label={serviceName} beforeContent={Icon && <Icon size="md" />} chipColor={color} size="md" isReadOnly maxWidth={220} style={{ flexShrink: 1, minWidth: 0, maxWidth: 'min(220px, 30cqw)' }} />
        <PopoverRoot>
          <Flex className={operationWrapper}>
          <PopoverTrigger asChild>
            <Button isDangerouslyNaked className={operation} aria-label="Span 操作">
              <Flex alignItems="center" gap="xs" style={{ minWidth: 0 }}>
                <Text size="md" style={{ lineHeight: '18px' }} weight="normal" isItalic hasEllipsis title={operationName}>{operationName}</Text>
                {isError && <AttentionCircledIcon size="md" title="Span error" style={{ color: 'var(--ui-status-danger)', flexShrink: 0 }} />}
                {resourceName && resourceName !== operationName && <Text size="md" style={{ lineHeight: '18px' }} weight="bold" hasEllipsis title={resourceName}>{resourceName}</Text>}
                <KebabVerticalIcon size="sm" style={{ flexShrink: 0 }} />
              </Flex>
            </Button>
          </PopoverTrigger>
          </Flex>
          <PopoverContent placement="bottom-start" isPadded aria-label="Span 操作">
            <Flex direction="column" alignItems="stretch" gap="xs">
              <CopyButton value={operationName} label="复制操作名称" messageCopy="复制操作名称" messageCopied="已复制" />
              {resourceName && <CopyButton value={resourceName} label="复制资源名称" messageCopy="复制资源名称" messageCopied="已复制" />}
            </Flex>
          </PopoverContent>
        </PopoverRoot>
      </Flex>
      <Flex alignItems="center" gap="md" style={{ flexShrink: 0 }}>
        <Flex direction="column" alignItems="stretch" gap="xxs" className={timing}>
          <Flex alignItems="center" justify="space-between">
            <Flex alignItems="center" gap="xs"><ClockIcon size="md" /><Text size="xs" weight="bold">{formatSpanDuration(duration)}</Text></Flex>
            {percentage !== undefined && <Text size="xs" className={execution}>{Number(percentage.toFixed(2))}% total exec time</Text>}
          </Flex>
          {percentage !== undefined && <PercentBar ratio={percentage / 100} width="100%" height={4} hasTitleText={false} />}
        </Flex>
        {actions}
        <Button size="md" isBorderless style={{ marginRight: 'var(--spacing-sm)' }} icon={isCollapsed ? PanelBottomGrowIcon : PanelBottomShrinkIcon} onClick={onToggleCollapsed ?? onClose} aria-label={onToggleCollapsed ? (isCollapsed ? "展开 Span 详情" : "收起 Span 详情") : "关闭详情"} title={isCollapsed ? "展开 Span 详情" : "收起 Span 详情"} aria-expanded={onToggleCollapsed ? !isCollapsed : undefined} />
      </Flex>
    </div>
  );
}
