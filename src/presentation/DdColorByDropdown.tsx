// Color by 维度下拉（Story 4.5 / 7.3）——对齐 Datadog 工具条右侧「Color by [Service ▾]」。
// Waterfall exposes Service / Host; other views may also allow Entity Type.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text, useElevation } from '@datafox/ui';
import { css } from '@emotion/css';
import { useRef, useState } from 'react';

import type { LegendDimension } from '../core';

import { useStyles2 } from '../theme';

import { ui } from './uiTokens';

export type ColorByDimension = LegendDimension;

const OPTIONS: Array<{ value: ColorByDimension; label: string }> = [
  { value: 'service', label: 'Service' },
  { value: 'host', label: 'Host' },
  { value: 'entity', label: 'Entity Type' },
];

const getStyles = () => ({
  wrap: css({
    label: 'DdColorBy',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--trace-color-by-gap, 6px)',
    fontFamily: 'var(--font-sans)',
    color: ui.textSecondary,
    whiteSpace: 'nowrap',
  }),
  label: css({ fontFamily: 'inherit', lineHeight: '28px' }),
  trigger: css({
    label: 'DdColorByTrigger',
    color: ui.text,
    // An open host SidePanel must not hide a closed Select's arrow.
    '&[data-state="closed"] svg': { visibility: 'visible' },
    '&[data-state="closed"] [data-slot="select-value"]': { color: ui.text },
  }),
});

interface Props {
  value?: ColorByDimension;
  allowEntity?: boolean;
  onChange?: (value: ColorByDimension) => void;
}

export function DdColorByDropdown({ value = 'service', onChange, allowEntity = true }: Props) {
  const styles = useStyles2(getStyles);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [menuFont, setMenuFont] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  // Share the host SidePanel elevation stack when the portaled menu opens.
  const elevation = useElevation({ isEnabled: isOpen });
  // G2：Radix Portal 逃逸组件根 `.dark` 作用域 → 暗态给下拉内容单挂 `.dark`，使 var(--ui-*) 解析暗色。
  const isDark = useStyles2((t) => t.isDark);
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  const handleOpenChange = (open: boolean) => {
    // Portals lose the host font scope; carry the computed family into the menu.
    if (open && wrapperRef.current) setMenuFont(getComputedStyle(wrapperRef.current).fontFamily);
    setIsOpen(open);
  };

  return (
    <span ref={wrapperRef} className={styles.wrap} data-testid="DdColorBy">
      <Text size="md" className={styles.label}>Color by</Text>
      <Select value={value} open={isOpen} onOpenChange={handleOpenChange} canBeQuiet={false} onValueChange={(v) => onChange?.(v as ColorByDimension)}>
        <SelectTrigger size="md" hasArrow className={styles.trigger} aria-label="Color by 维度" data-testid="DdColorBySelect">
          {/* 显式子节点，保证 trigger 恒显当前维度标签（不依赖 Portal 内 Item 是否已挂载）。 */}
          <SelectValue>{current.label}</SelectValue>
        </SelectTrigger>
        <SelectContent style={{ ...elevation.style, fontFamily: menuFont }} className={isDark ? 'dark' : undefined} align="end" searchable
          minOpenWidth="201px" searchPlaceholder={current.label} noResultsText="No matching results">
          {OPTIONS.filter(o => allowEntity || o.value !== 'entity').map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}
