// 火焰图服务图例面板（Story 7.1）——对齐 Datadog Flame Graph 右侧 Color Legend。
// 列出各服务的 % Exec Time 排行，可悬停（临时高亮）/点击（持久高亮 toggle）某组，可收起。
// 高亮联动由 api 把 effectiveKey 回传给 DdFlameGraphView 做灰显；本面板同步：选中行粉底、非活跃组色块褪成灰。
// 分组聚合来自 core computeLegendGroups（零皮肤）；色块用 colorAccessor 取组色（AD-6，与帧同源）。
//
// Story 10.9（1:1 真页，canvas/DOM 实测 2026-07-12）：真页 `trace_color-legend` 逐项校准——
// 面板无左边框、透明底、宽 212；表头右对齐指标 datafox Select + 1px `--ui-border` 底分隔；
// 行距 32、色块 13²/圆角 4（inferred 组 = 1px 虚线空心，与火焰帧 Story 10.3 同判定）；
// 占比数字用主文本色（非次级灰）；占比条 datafox PercentBar 不圆角（真页 border-radius 0）。
// **高亮态**（原 opacity .4 整行灰显 → 改）：pinned 行整行粉底 `--ui-interaction-callout-contrast`；
// 有高亮时非活跃组色块褪成 `--ui-border` 灰（实心填灰 / 虚线转灰边）；文字**恒主色不灰**。
import { Button, FormattedNumber, Overflower, PercentBar, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@datafox/ui';
import { css, cx } from '@emotion/css';
import { type CSSProperties } from 'react';

import { computeLegendGroups, isInferredEntity, type LegendDimension, type LegendMetric } from '../core';
import type { Trace } from '../model';
import { useStyles2, type Theme } from '../theme';

import { defaultColorAccessor, type ColorAccessor } from './colorAccessor';
import { ui } from './uiTokens';

const getStyles = (theme: Theme) => ({
  panel: css({
    label: 'DdFlameLegend',
    flex: 'none',
    // Story 10.11 修正：图例是**全高悬浮列**（真页 absolute 列 = 整个火焰面板高）——alignSelf:stretch 填满火焰体高度，
    // minHeight:0 令行数多时内部滚动而非撑高整行；内容置顶、下方留白，border-left 全高贯穿。修「box 没填满」。
    alignSelf: 'stretch',
    minHeight: 0,
    width: 215,
    boxSizing: 'border-box',
    // 1px `--ui-border` 左分隔线（真页悬浮列 border-left）。
    borderLeft: `1px solid ${ui.border}`,
    // Story 10.11 修正：DRUIDS 抬升阴影**仅悬停时出**（真页实测：静态 box-shadow:none，悬浮到 card 上 → `--ui-shadow-4`
    // = `0 0 1px, 0 3px 11px`）。原误设为常显 `--ui-shadow-2`，已改 hover-only + 提到第 4 阶。
    '&:hover': { boxShadow: 'var(--ui-shadow-4)' },
    fontFamily: theme.trace.fontFamily,
    fontSize: 12,
    color: ui.text,
    overflowY: 'auto',
    userSelect: 'none',
  }),
  header: css({
    label: 'DdFlameLegendHeader',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    height: 28,
    boxSizing: 'border-box',
    padding: '0 8px',
    // Story 10.9：真页表头 1px `--ui-border` 底分隔（rgb(226,229,237)）。
    borderBottom: `1px solid ${ui.border}`,
    // Story 10.10：真页表头 `position:sticky` + `--ui-background`（白）——滚动时表头固定、行不透过其下。
    position: 'sticky',
    top: 0,
    background: ui.bg,
    zIndex: 1,
    whiteSpace: 'nowrap',
  }),
  // Hide/Show Legend：真页为 datafox naked-primary Button（蓝 + 虚线下划线）；靠 mr:auto 顶到表头左侧，指标恒右对齐。
  toggleWrap: css({ label: 'DdFlameLegendToggleWrap', marginRight: 'auto', display: 'flex', alignItems: 'center' }),
  row: css({
    label: 'DdFlameLegendRow',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 32,
    boxSizing: 'border-box',
    padding: '2px 8px',
    cursor: 'pointer',
    // Story 10.10：真页 `.trace_color-legend-element:hover` → `--ui-interaction-secondary`（浅蓝 rgb(234,246,252)）。
    // `:hover`（0,2,0）特异性高于 rowPinned（0,1,0）→ 悬停浅蓝**盖过**选中粉底，与真页一致。
    '&:hover': { background: 'var(--ui-interaction-secondary)' },
  }),
  // Story 10.9：pinned（持久选中）行整行粉底——真页 `.trace_color-legend-element--is-highlighted` = `--ui-interaction-callout-contrast`（亮 #fff2fa）。
  rowPinned: css({ label: 'DdFlameLegendRowPinned', background: 'var(--ui-interaction-callout-contrast)' }),
  left: css({
    label: 'DdFlameLegendLeft',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: '1 1 auto',
    minWidth: 0,
  }),
  square: css({
    label: 'DdFlameLegendSquare',
    flex: 'none',
    width: 13,
    height: 13,
    borderRadius: 4,
    boxSizing: 'border-box',
  }),
  name: css({
    label: 'DdFlameLegendName',
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: ui.text,
  }),
  numberAndBar: css({
    label: 'DdFlameLegendNumberAndBar',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }),
  percent: css({
    label: 'DdFlameLegendPercent',
    // Story 10.9：真页占比数字用**主文本色**（rgba(28,43,52,.98)），非次级灰。
    color: ui.text,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  }),
  // 占比 bar 用 datafox `PercentBar`：真页 30×12、不圆角（border-radius 0）、轨底 --ui-measure-track、填充 --ui-dataviz-blue。
  collapsed: css({
    label: 'DdFlameLegendCollapsed',
    flex: 'none',
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '4px 8px',
  }),
});

export interface DdFlameLegendProps {
  trace: Trace;
  /** 自定义着色（默认按 service），用于色块取组色，与火焰图帧同源。 */
  colorAccessor?: ColorAccessor;
  /** 有效高亮 key（hover 或 pinned）→ 该组色块保持组色、其余褪灰。 */
  highlightedKey?: string | null;
  /** 持久选中（点击 pinned）key → 该行整行粉底。 */
  pinnedKey?: string | null;
  /** 悬停某行 → 临时高亮（进 key / 出 null）。 */
  onHoverChange?: (key: string | null) => void;
  /** 点击某行 → 持久高亮 toggle（由 api 决定与 pinned 比对）。 */
  onToggle?: (key: string) => void;
  /** 指标：'execTime'（% Exec Time，默认）/ 'spans'（计数，Story 7.2）。 */
  metric?: LegendMetric;
  /** 指标切换回调（Story 7.2）；传则表头渲染下拉，否则静态文本。 */
  onMetricChange?: (metric: LegendMetric) => void;
  /** 分组维度（Story 7.3：service/host/entity，默认 service）。 */
  dimension?: LegendDimension;
  /** 显隐（默认显示）；收起时只剩 Show Legend 角标。 */
  showLegend?: boolean;
  onShowLegendChange?: (show: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

export function DdFlameLegend({
  trace,
  colorAccessor,
  highlightedKey,
  pinnedKey,
  onHoverChange,
  onToggle,
  metric = 'execTime',
  onMetricChange,
  dimension = 'service',
  showLegend = true,
  onShowLegendChange,
  className,
  style,
}: DdFlameLegendProps) {
  const styles = useStyles2(getStyles);
  const theme = useStyles2((t) => t);
  // G2（同 DdColorByDropdown）：Radix Portal 逃逸组件根 `.dark` → 暗态给下拉内容单挂 `.dark`。
  const isDark = theme.isDark;
  const resolveColor: ColorAccessor = colorAccessor ?? defaultColorAccessor(theme);
  const spanById = new Map(trace.spans.map((s) => [s.spanID, s]));
  const groups = computeLegendGroups(trace, { dimension, metric });
  const metricLabel = metric === 'spans' ? 'Spans' : '% Exec Time';

  if (!showLegend) {
    return (
      <div className={styles.collapsed} style={style} data-testid="DdFlameLegendCollapsed">
        <Button
          isDangerouslyNaked
          isPrimary
          size="md"
          data-testid="DdFlameLegendToggle"
          onClick={() => onShowLegendChange?.(true)}
        >
          Show Legend
        </Button>
      </div>
    );
  }

  const hasHighlight = highlightedKey != null;

  return (
    <div
      className={className ? cx(styles.panel, className) : styles.panel}
      style={style}
      data-testid="DdFlameLegend"
    >
      <div className={styles.header}>
        {onShowLegendChange && (
          <span className={styles.toggleWrap}>
            <Button
              isDangerouslyNaked
              isPrimary
              size="md"
              data-testid="DdFlameLegendToggle"
              onClick={() => onShowLegendChange(false)}
            >
              Hide Legend
            </Button>
          </span>
        )}
        {onMetricChange ? (
          // Story 10.9：原生 <select> → datafox <Select>（真页 `druids_form_select --is-borderless`，
          // size md = 28px/13px 与真页表头一致）。交互契约 value/onValueChange 不变。
          <Select value={metric} onValueChange={(v) => onMetricChange(v as LegendMetric)}>
            <SelectTrigger
              isBorderless
              size="md"
              aria-label="图例指标"
              data-testid="DdFlameLegendMetric"
            >
              <SelectValue>{metricLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className={isDark ? 'dark' : undefined}>
              <SelectItem value="execTime">% Exec Time</SelectItem>
              <SelectItem value="spans">Spans</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span data-testid="DdFlameLegendMetric">{metricLabel}</span>
        )}
      </div>

      {groups.map((g) => {
        const rep = spanById.get(g.representativeSpanId);
        const serviceColor = rep ? resolveColor(rep) : '#888';
        const inferred = rep ? isInferredEntity(rep) : false;
        // 活跃 = 有效高亮命中本组（hover 或 pinned）→ 色块保持组色；否则（有高亮时）褪成 --ui-border 灰。
        const isActive = highlightedKey === g.key;
        const desaturate = hasHighlight && !isActive;
        const swatchColor = desaturate ? ui.border : serviceColor;
        // inferred 组：空心 + 虚线（与火焰帧同款，Story 10.3）；实心组：填充色块。
        const squareStyle: CSSProperties = inferred
          ? { background: 'transparent', border: `1px dashed ${swatchColor}` }
          : { background: swatchColor };
        const isPinned = pinnedKey != null && pinnedKey === g.key;
        return (
          <div
            key={g.key}
            className={isPinned ? cx(styles.row, styles.rowPinned) : styles.row}
            data-testid="DdFlameLegendRow"
            data-group-key={g.key}
            data-state={isActive ? 'highlighted' : hasHighlight ? 'dimmed' : 'default'}
            data-pinned={isPinned || undefined}
            title={`${g.label} (${g.spanCount} span${g.spanCount === 1 ? '' : 's'})`}
            onMouseEnter={() => onHoverChange?.(g.key)}
            onMouseLeave={() => onHoverChange?.(null)}
            onClick={() => onToggle?.(g.key)}
          >
            <span className={styles.left}>
              <span className={styles.square} style={squareStyle} />
              {/* Story 10.2：服务名 → datafox Overflower（长名截断 + 悬浮全名，真页行为）。 */}
              <Overflower size="sm" className={styles.name}>
                {g.label}
              </Overflower>
            </span>
            <span className={styles.numberAndBar}>
              {/* Story 10.2：占比数字 → datafox FormattedNumber（rate=百分比 / integer=计数）。 */}
              <span className={styles.percent}>
                {metric === 'spans' ? (
                  <FormattedNumber value={g.spanCount} type="integer" />
                ) : (
                  <FormattedNumber value={g.execTimeRatio} type="rate" />
                )}
              </span>
              {/* Story 10.9：PercentBar 去 isRounded（真页 border-radius 0）；轨底/填充走 datafox 默认（--ui-measure-track / --ui-dataviz-blue）。 */}
              <PercentBar ratio={Math.min(g.ratio, 1)} width={30} height={12} isAnimated={false} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
