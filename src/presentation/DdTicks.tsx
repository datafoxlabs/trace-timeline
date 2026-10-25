// 时间刻度。两种形态，勿混用：
//
// - `variant='grid'`（默认，移植自上游 Ticks.tsx）：全高 1px 竖网格线 + 左偏标签。
//   火焰图背景网格（DdFlameGraphView）与火焰尺（DdFlameRuler）沿用，Epic 6/7 行为不变。
//
// - `variant='axis'`（Story 9.3 复审 / AC #11、#12）：瀑布表头轴，对齐真页 `svg.trace_svg_x-axis` 实测：
//     · 刻度取**整步长**（niceTickValues），非按时长等分 —— 真页 54.1ms → `0,5ms,…,50ms`；
//     · 刻度线是**贴轴底的 6px 短竖线**（`<line y2="-6">`），非贯穿表头的网格线；
//     · 标签 `10px` / `--ui-text` 主文本色 / `text-anchor:middle` **居中于刻度**（我方用 translateX(-50%)）。
//   真页那条 domain 基线 `<line class="trace_svg_x-axis__axis">` 看似存在，实则被裁掉：
//   其 `<g transform="translate(0,24.5)">` 而 `svg height=24` 且 `overflow:hidden` ——
//   1px 描边覆盖 y∈[24,25]，与视口 [0,24] 交集为零高。故**不实现基线**。
import { css } from '@emotion/css';
import { Fragment } from 'react';

import { useStyles2 } from '../theme';
import { formatDuration, niceTickValues } from '../utils';

import { ui } from './uiTokens';

const getStyles = () => ({
  ticks: css({ label: 'DdTicks', position: 'absolute', inset: 0, pointerEvents: 'none' }),
  tick: css({
    label: 'DdTick',
    position: 'absolute',
    top: 0,
    height: '100%',
    width: 1,
    background: ui.border,
  }),
  label: css({
    label: 'DdTickLabel',
    position: 'absolute',
    left: 4,
    top: 2,
    fontFamily: ui.fontSans,
    fontSize: 12,
    color: ui.textSecondary,
    whiteSpace: 'nowrap',
  }),
  labelEnd: css({ left: 'initial', right: 4 }),
  // —— axis 形态（真页实测）——
  axisTick: css({
    label: 'DdTick',
    position: 'absolute',
    bottom: 0,
    height: 6,
    width: 1,
    transform: 'translateX(-50%)',
    background: ui.text,
  }),
  axisLabel: css({
    label: 'DdTickLabel',
    position: 'absolute',
    bottom: 6,
    transform: 'translateX(-50%)',
    fontFamily: ui.fontSans,
    fontSize: 10,
    lineHeight: '13.5px',
    color: ui.text,
    whiteSpace: 'nowrap',
  }),
});

export type DdTicksVariant = 'grid' | 'axis';

interface Props {
  /**
   * `grid` 形态：精确刻度个数（等分）。
   * `axis` 形态：**期望的刻度间隔数**（d3 count hint）——实际刻度数由整步长决定，通常为 hint+1。
   */
  numTicks: number;
  /** trace 总时长（微秒）= trace.duration。 */
  viewDuration: number;
  /** 当前缩放视窗起点占比 [0,1]，默认 0（无缩放）。 */
  viewStart?: number;
  /** 当前缩放视窗终点占比 [0,1]，默认 1（无缩放）。 */
  viewEnd?: number;
  showLabels?: boolean;
  variant?: DdTicksVariant;
}

/** 真页轴标签数值与单位间有空格（`5 ms`），与行内时长（`54.1ms`）不同；零点渲染为 `0` 而非 `0μs`。 */
function formatAxisTick(microseconds: number): string {
  if (microseconds === 0) {
    return '0';
  }
  return formatDuration(microseconds).replace(/^([\d.]+)/, '$1 ');
}

export function DdTicks({ numTicks, viewDuration, viewStart = 0, viewEnd = 1, showLabels = true, variant = 'grid' }: Props) {
  const styles = useStyles2(getStyles);

  // 两形态**同源取值**：整步长 niceTickValues over [lo,hi]（Story 10.4，消等分脏值 25.5ms、与 DdFlameRuler 同 x 落位）。
  // 仅**渲染标记**不同：axis = 6px 贴底刻度 + 居中标签；grid = 全高竖线 + 左偏标签。
  const lo = viewStart * viewDuration;
  const hi = viewEnd * viewDuration;
  const span = hi - lo;
  if (!(span > 0)) {
    return <div className={styles.ticks} />;
  }
  const ticks = niceTickValues(lo, hi, numTicks);

  if (variant === 'axis') {
    return (
      <div className={styles.ticks}>
        {ticks.map((t) => {
          const left = `${((t - lo) / span) * 100}%`;
          return (
            <Fragment key={t}>
              <div className={styles.axisTick} style={{ left }} />
              {showLabels && (
                <span className={styles.axisLabel} style={{ left }}>
                  {formatAxisTick(t)}
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.ticks}>
      {ticks.map((t) => {
        const portion = (t - lo) / span;
        return (
          <div key={t} className={styles.tick} style={{ left: `${portion * 100}%` }}>
            {showLabels && (
              <span className={`${styles.label}${portion >= 0.999 ? ` ${styles.labelEnd}` : ''}`}>
                {formatAxisTick(t)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
