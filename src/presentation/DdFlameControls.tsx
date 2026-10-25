// 火焰图缩放控制（Story 6.4 / Epic 6）——对齐 Datadog：全览 / 放大到选中 / 聚焦选中。
// Story 10.2：自研文字按钮 → datafox `Button`(icon-only) + `Tooltip`（需祖先 TooltipProvider，
// 由 TraceTimeline 根提供）。图标对齐真页 minimap 停靠控件：ZoomOut=全览 / ZoomIn=放大到选中 / Focus=聚焦选中。
// Story 10.6：真页 minimap 按钮为**白底带边框**（`1px solid --ui-border` / radius 4px / 24×24）——
// = datafox Button 默认档（非 isBorderless），故去掉 isBorderless；簇内 gap 4、由 footer 提供内边距。
import { Button, FocusIcon, Tooltip, TooltipProvider, ZoomInIcon, ZoomOutIcon } from '@datafox/ui';
import { css } from '@emotion/css';

import { useStyles2, type Theme } from '../theme';

const getStyles = (theme: Theme) => ({
  bar: css({
    label: 'DdFlameControls',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: theme.trace.fontFamily,
  }),
});

export interface DdFlameControlsProps {
  onZoomFull: () => void;
  onZoomSelected: () => void;
  onFocusSelected: () => void;
  hasSelection: boolean;
  canZoomFull?: boolean;
  canZoomSelected?: boolean;
  /** 当前是否处于聚焦（re-root）态（Story 6.7）。 */
  isFocused?: boolean;
  /** 重置聚焦回调（Story 6.7）。 */
  onResetFocus?: () => void;
}

export function DdFlameControls({
  onZoomFull,
  onZoomSelected,
  onFocusSelected,
  hasSelection,
  canZoomFull = true,
  canZoomSelected = hasSelection,
  isFocused = false,
  onResetFocus,
}: DdFlameControlsProps) {
  const styles = useStyles2(getStyles);
  // 自带 Provider：本组件为公开导出，宿主可能独立挂载（不套 TooltipProvider）；照 DdTimeCursor 的做法自带。
  return (
    <TooltipProvider>
      <div className={styles.bar} data-testid="DdFlameControls">
      <Tooltip content="全览（Zoom Out to Full Trace）">
        <Button
          size="sm"
          icon={ZoomOutIcon}
          onClick={onZoomFull}
          disabled={!canZoomFull}
          aria-label="Zoom Out to Full Trace"
          data-action="zoom-full"
        />
      </Tooltip>
      <Tooltip content="放大到选中（Zoom In to Selected Span）">
        <Button
          size="sm"
          icon={ZoomInIcon}
          onClick={onZoomSelected}
          disabled={!canZoomSelected}
          aria-label="Zoom In to Selected Span"
          data-action="zoom-selected"
        />
      </Tooltip>
      <Tooltip content={isFocused ? 'Reset Focus' : 'Focus on Selected Span'}>
        <Button
          size="sm"
          icon={FocusIcon}
          onClick={isFocused ? onResetFocus : onFocusSelected}
          disabled={!isFocused && !hasSelection}
          isPrimary={isFocused}
          aria-pressed={isFocused}
          aria-label={isFocused ? 'Reset Focus' : 'Focus on Selected Span'}
          data-action={isFocused ? 'reset-focus' : 'focus-selected'}
        />
      </Tooltip>
      </div>
    </TooltipProvider>
  );
}
