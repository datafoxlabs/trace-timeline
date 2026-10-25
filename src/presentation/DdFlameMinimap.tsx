// 火焰图 minimap（Story 6.5 + 6.6 + 10.6 高保真对齐）——整 trace 缩略 + 视口框 + 点击/拖拽定位 + 控件停靠 + 可收起。
// 真页 `profiling_minimap` 实测（2026-07-12）：无边框白面板 + 两层柔和阴影 + 4px 圆角；canvas 内嵌 5px；
// **只暗化视口外**（canvas 鲜艳 + 0.5 浅蓝 overlay 仅盖视口外，故内鲜艳外淡）；footer space-between
// （收起图标左 / 缩放右），按钮为白底带边框（datafox Button 默认档）。
import { Button, PanelLeftGrowIcon, PanelLeftShrinkIcon, Tooltip, TooltipProvider } from '@datafox/ui';
import { css } from '@emotion/css';
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { computeFlameLayout } from '../core';
import type { Trace } from '../model';
import { useStyles2, type Theme } from '../theme';

import { defaultColorAccessor, type ColorAccessor } from './colorAccessor';
import { DdFlameControls } from './DdFlameControls';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// 真页实测：无边框 + 两层柔和阴影。
const MINIMAP_SHADOW = 'rgba(36, 41, 49, 0.1) 0px 0px 1px 0px, rgba(36, 41, 49, 0.25) 0px 1px 5px 0px';

const getStyles = (theme: Theme) => ({
  panel: css({
    label: 'DdFlameMinimap',
    position: 'absolute',
    zIndex: 5,
    width: theme.trace.flame.minimapWidth,
    background: theme.colors.background.primary,
    borderRadius: theme.shape.radius.md,
    boxShadow: MINIMAP_SHADOW,
    fontFamily: theme.trace.fontFamily,
    overflow: 'hidden',
  }),
  // canvas 内嵌 5px（真页 content 210 / canvas 200，上/左/右各 5px）。
  canvasWrap: css({ label: 'DdFlameMiniCanvasWrap', padding: '5px 5px 0' }),
  canvas: css({ label: 'DdFlameMinimapCanvas', position: 'relative', width: '100%', cursor: 'grab', overflow: 'hidden', '&:active': { cursor: 'grabbing' } }),
  rect: css({ label: 'DdFlameMiniRect', position: 'absolute', borderRadius: 1 }),
  // 只暗化视口外：左块 [0,viewStart] + 右块 [viewEnd,1]，视口区不蒙 → 内鲜艳外淡（真页观感）。
  mask: css({
    label: 'DdFlameMiniMask',
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: theme.trace.flame.minimapMask,
    pointerEvents: 'none',
  }),
  viewport: css({
    label: 'DdFlameMiniViewport',
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: 'transparent',
    border: `1px solid ${theme.trace.flame.minimapViewportBorder}`,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  }),
  footer: css({
    label: 'DdFlameMinimapFooter',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 4,
    background: theme.trace.flame.minimapMask,
  }),
  collapsed: css({
    label: 'DdFlameMinimapCollapsed',
    position: 'absolute',
    zIndex: 5,
    background: theme.colors.background.primary,
    borderRadius: theme.shape.radius.md,
    boxShadow: MINIMAP_SHADOW,
    padding: 4,
  }),
});

export interface DdFlameMinimapProps {
  trace: Trace;
  colorAccessor?: ColorAccessor;
  viewStart: number;
  viewEnd: number;
  onViewRangeChange: (viewStart: number, viewEnd: number) => void;
  /** 聚焦根 span（Story 6.7）：概览只显示该子树（铺满 minimap）。 */
  focusRootSpanId?: string;
  /** minimap 概览画布高（px），默认 100。 */
  height?: number;
  /** 停靠控件回调（Story 6.6）。 */
  onZoomFull: () => void;
  onZoomSelected: () => void;
  onFocusSelected: () => void;
  hasSelection: boolean;
  canZoomFull?: boolean;
  canZoomSelected?: boolean;
  /** 聚焦态 + 重置（Story 6.7），转发给停靠的 DdFlameControls。 */
  isFocused?: boolean;
  onResetFocus?: () => void;
  className?: string;
  /** 浮层定位（由父传入 top/left）。 */
  style?: CSSProperties;
}

export function DdFlameMinimap({
  trace,
  colorAccessor,
  viewStart,
  viewEnd,
  onViewRangeChange,
  focusRootSpanId,
  height = 100,
  onZoomFull,
  onZoomSelected,
  onFocusSelected,
  hasSelection,
  canZoomFull,
  canZoomSelected,
  isFocused = false,
  onResetFocus,
  className,
  style,
}: DdFlameMinimapProps) {
  const styles = useStyles2(getStyles);
  const theme = useStyles2((t) => t);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // 拖拽态：真页 viewport `cursor:grab`/`pointer-events:auto` → 抓住视口相对平移；视口外点击居中跳转。
  const dragRef = useRef<{ mode: 'pan' | 'jump'; startX: number; startVS: number; startW: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const layout = useMemo(() => computeFlameLayout(trace, undefined, focusRootSpanId), [trace, focusRootSpanId]);
  const spanById = useMemo(() => new Map(trace.spans.map((s) => [s.spanID, s])), [trace]);
  const resolveColor = colorAccessor ?? defaultColorAccessor(theme);
  const miniRowH = height / (layout.maxDepth + 1);

  const fracOf = (clientX: number) => {
    const el = canvasRef.current;
    if (!el) {
      return 0;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 ? clamp((clientX - r.left) / r.width, 0, 1) : 0;
  };

  const jumpTo = (clientX: number) => {
    const frac = fracOf(clientX);
    const w = viewEnd - viewStart;
    const ns = clamp(frac - w / 2, 0, 1 - w);
    onViewRangeChange(ns, ns + w);
  };

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const frac = fracOf(e.clientX);
    const startW = viewEnd - viewStart;
    if (frac >= viewStart && frac <= viewEnd) {
      // 抓住视口 → 相对拖拽平移（真页做法），点击不立即跳转。
      dragRef.current = { mode: 'pan', startX: e.clientX, startVS: viewStart, startW };
    } else {
      // 视口外 → 居中跳转到该处。
      dragRef.current = { mode: 'jump', startX: e.clientX, startVS: viewStart, startW };
      jumpTo(e.clientX);
    }
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    if (d.mode === 'jump') {
      jumpTo(e.clientX);
      return;
    }
    const el = canvasRef.current;
    if (!el) {
      return;
    }
    const width = el.getBoundingClientRect().width;
    const deltaFrac = width > 0 ? (e.clientX - d.startX) / width : 0;
    const ns = clamp(d.startVS + deltaFrac, 0, 1 - d.startW);
    onViewRangeChange(ns, ns + d.startW);
  };
  const stop = () => {
    dragRef.current = null;
  };

  if (collapsed) {
    // 真页收起后为一枚白底带边框图标按钮（展开方向 icon）。自带 Provider：本组件为公开导出，宿主可能独立挂载。
    return (
      <TooltipProvider>
        <div className={className ? `${styles.collapsed} ${className}` : styles.collapsed} style={style} data-testid="DdFlameMinimapCollapsed">
          <Tooltip content="Expand minimap">
            <Button
              size="sm"
              icon={PanelLeftGrowIcon}
              onClick={() => setCollapsed(false)}
              aria-label="Expand minimap"
              data-testid="FlameMinimapToggle"
            />
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  // 自带 Provider（覆盖收起按钮 + 停靠的 DdFlameControls）：本组件为公开导出，宿主可能独立挂载。
  return (
    <TooltipProvider>
    <div className={className ? `${styles.panel} ${className}` : styles.panel} style={style} data-testid="DdFlameMinimap">
      <div className={styles.canvasWrap}>
        <div
          ref={canvasRef}
          className={styles.canvas}
          style={{ height }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stop}
          onMouseLeave={stop}
        >
          {layout.rows.map((row) => {
            const span = spanById.get(row.spanID);
            if (!span) {
              return null;
            }
            return (
              <div
                key={row.spanID}
                data-testid="FlameMiniRect"
                className={styles.rect}
                style={{
                  top: row.depth * miniRowH,
                  height: Math.max(miniRowH - 0.5, 1),
                  left: `${row.left * 100}%`,
                  width: `${Math.max(row.width * 100, 0.3)}%`,
                  background: resolveColor(span),
                }}
              />
            );
          })}
          {/* 只暗化视口外（真页：内鲜艳外淡）。左块 [0,viewStart] + 右块 [viewEnd,1]，视口区不蒙。 */}
          {viewStart > 0 && (
            <div className={styles.mask} data-testid="FlameMiniMaskLeft" style={{ left: 0, width: `${viewStart * 100}%` }} />
          )}
          {viewEnd < 1 && (
            <div className={styles.mask} data-testid="FlameMiniMaskRight" style={{ left: `${viewEnd * 100}%`, right: 0 }} />
          )}
          {/* 视口框：透明 + 蓝边 */}
          <div
            className={styles.viewport}
            data-testid="FlameMinimapViewport"
            style={{ left: `${viewStart * 100}%`, width: `${(viewEnd - viewStart) * 100}%` }}
          />
        </div>
      </div>
      <div className={styles.footer}>
        {/* 收起：真页左下 panel-left-shrink 图标（白底带边框） */}
        <Tooltip content="Collapse minimap">
          <Button
            size="sm"
            icon={PanelLeftShrinkIcon}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse minimap"
            data-testid="FlameMinimapToggle"
          />
        </Tooltip>
        <DdFlameControls
          onZoomFull={onZoomFull}
          onZoomSelected={onZoomSelected}
          onFocusSelected={onFocusSelected}
          hasSelection={hasSelection}
          canZoomFull={canZoomFull}
          canZoomSelected={canZoomSelected}
          isFocused={isFocused}
          onResetFocus={onResetFocus}
        />
      </div>
    </div>
    </TooltipProvider>
  );
}
