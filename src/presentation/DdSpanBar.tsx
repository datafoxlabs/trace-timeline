// 瀑布条（FR-24 / UX-DR1）：left/width 按 viewBounds 投影，仅顶圆角 2px、高 ~19px、无边框、上下 gap。
import { css } from '@emotion/css';

import type { RenderableRow } from '../core';
import { useStyles2, type Theme } from '../theme';
import { formatSpanDuration } from '../utils';

import { AXIS_LEFT_INSET, AXIS_RIGHT_GUTTER } from './layout';
import { ui } from './uiTokens';

const getStyles = (theme: Theme) => ({
  // Story 9.3（D10）+ 复审（D11）：投影容器左缩 AXIS_LEFT_INSET、右缩 AXIS_RIGHT_GUTTER，与表头刻度轴逐像素同宽。
  // 时长文案溢出进右侧预留区，故永不越出时间轴列（真页 bar 容器 612..1408 < 单元格 604..1470 亦如此）。
  container: css({
    label: 'DdSpanBarContainer',
    position: 'relative',
    height: '100%',
    marginLeft: AXIS_LEFT_INSET,
    marginRight: AXIS_RIGHT_GUTTER,
  }),
  bar: css({
    label: 'DdSpanBar',
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    height: theme.trace.barHeight,
    minWidth: 2,
    borderRadius: theme.trace.barRadius,
    border: 'none',
  }),
  label: css({
    label: 'DdSpanBarDuration',
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    fontFamily: ui.fontSans,
    fontSize: 11,
    color: ui.textSecondary,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  }),
  // 关键路径区段（Story 4.3）——条底部高对比描边带，叠在 bar 上。
  // Story 9.1 文档化例外：叠在任意服务色瀑布条上的纯黑/白最大对比标记，非语义主题色，datafox 无对应 token；保留原值。
  cp: css({
    label: 'DdSpanBarCriticalPath',
    position: 'absolute',
    bottom: `calc(50% - ${theme.trace.barHeight / 2}px)`,
    height: 3,
    background: theme.isDark ? '#fff' : '#111',
    pointerEvents: 'none',
  }),
});

interface Props {
  row: RenderableRow;
  color: string;
}

export function DdSpanBar({ row, color }: Props) {
  const styles = useStyles2(getStyles);
  const { start, end } = row.viewBounds;
  const leftPct = Math.max(0, Math.min(100, start * 100));
  const rightPct = Math.max(0, Math.min(100, end * 100));
  const widthPct = Math.max(0, rightPct - leftPct);
  // Story 9.3（D10）：时长恒贴条右侧。原 `labelOnLeft`（rightPct>88 翻到条左）已删除——
  // 它会让根 span（leftPct=0）的时长溢出到标签列。现由容器右侧的 AXIS_RIGHT_GUTTER 承接溢出。

  // 关键路径区段：把绝对时间戳投影回 view 分数（与 span 同一映射）。
  const { span } = row;
  const cpSegments = (row.criticalPathSections ?? [])
    .map((sec) => {
      const f0 = span.duration ? (sec.section_start - span.startTime) / span.duration : 0;
      const f1 = span.duration ? (sec.section_end - span.startTime) / span.duration : 0;
      const segLeft = (start + f0 * (end - start)) * 100;
      const segRight = (start + f1 * (end - start)) * 100;
      const l = Math.max(0, Math.min(100, Math.min(segLeft, segRight)));
      const r = Math.max(0, Math.min(100, Math.max(segLeft, segRight)));
      return { left: l, width: Math.max(0, r - l) };
    })
    .filter((s) => s.width > 0);

  return (
    <div className={styles.container}>
      <div className={styles.bar} style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }} />
      {cpSegments.map((s, i) => (
        <div key={i} className={styles.cp} style={{ left: `${s.left}%`, width: `${s.width}%` }} data-testid="cp-seg" />
      ))}
      <span className={styles.label} style={{ left: `${rightPct}%`, marginLeft: 6 }}>
        {formatSpanDuration(row.span.duration)}
      </span>
    </div>
  );
}
