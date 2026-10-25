// 折叠/展开按钮组（FR-5）——全展开/全折叠/逐层展开/逐层折叠。放在表头标签列（datadog-visual-spec §6）。
// Story 9.2：自研 ui Icon/Tooltip → datafox `Button`(icon, isBorderless) + `Tooltip`（需祖先 TooltipProvider，
// 由 TraceTimeline 根提供）。
import { Button, ChevronDownIcon, ChevronUpIcon, ExpandDownIcon, ExpandUpIcon, Tooltip } from '@datafox/ui';
import { css } from '@emotion/css';

import { useStyles2 } from '../theme';

const getStyles = () => ({
  root: css({
    label: 'DdTimelineCollapser',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    marginRight: 8,
    // 让**首个按钮（展开一层 ⌄）的箭头中心**对齐根行的树形折叠箭头中心（用户 2026-07-10）。
    // 实测：根行树箭头 16px、中心距标签列左缘 15px；工具栏按钮 24px 内居中 12px 图标，中心距列左缘
    // (paddingLeft 7 + 12) = 19px —— 右偏 4px。左移 4px 使两者共中线（12px 图标 34..46 落在 16px 箭头 32..48 内）。
    marginLeft: -4,
  }),
});

export interface DdTimelineCollapserProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandOne: () => void;
  onCollapseOne: () => void;
}

export function DdTimelineCollapser({
  onExpandAll,
  onCollapseAll,
  onExpandOne,
  onCollapseOne,
}: DdTimelineCollapserProps) {
  const styles = useStyles2(getStyles);
  return (
    <span className={styles.root}>
      <Tooltip content="展开一层">
        <Button isBorderless size="sm" icon={ChevronDownIcon} onClick={onExpandOne} aria-label="expand one level" />
      </Tooltip>
      <Tooltip content="折叠一层">
        <Button isBorderless size="sm" icon={ChevronUpIcon} onClick={onCollapseOne} aria-label="collapse one level" />
      </Tooltip>
      {/* 全展开/全折叠：用同向**双箭头**（`ExpandDownIcon`=⌄⌄ / `ExpandUpIcon`=⌃⌃）——
          与上面的单箭头（一层）形成「单=一层、双=全部」的一致隐喻。
          真页表头是加/减方块 [+]/[−]，但真页只有全展开/全折叠两个键；我们有四个，双箭头更自洽（用户 2026-07-10 定）。
          注：`ExpandUpIcon` 是 datafox 对「双上箭头」这个字形的命名，语义（全折叠）由 aria-label 承载。 */}
      <Tooltip content="全部展开">
        <Button isBorderless size="sm" icon={ExpandDownIcon} onClick={onExpandAll} aria-label="expand all" />
      </Tooltip>
      <Tooltip content="全部折叠">
        <Button isBorderless size="sm" icon={ExpandUpIcon} onClick={onCollapseAll} aria-label="collapse all" />
      </Tooltip>
    </span>
  );
}
