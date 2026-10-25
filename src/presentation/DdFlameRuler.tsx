// 火焰图时间轴 ruler（Story 6.3 / Epic 6）——复用 DdTicks 数学，定高带状容器显示 ms 刻度。
import { css } from '@emotion/css';

import { useStyles2 } from '../theme';

import { DdTicks } from './DdTicks';
import { ui } from './uiTokens';

// 缩放裁剪箭头出现阈值：视窗端点偏离 trace 边界超过此值即判为「该侧有被裁内容」。
const CLIP_EPS = 1e-4;
// 轴 domain 基线到火焰条的间距（真页实测 231.5→242 = 10.5px）。真页火焰图轴 svg 高 35，
// 基线在 24.5、下留 10.5px 空白再接 canvas；我方基线用 ruler 底边、下加此 margin 复现该间距。
const FLAME_RULER_BAR_GAP = 10;

const getStyles = () => ({
  ruler: css({
    label: 'DdFlameRuler',
    position: 'relative',
    height: 22,
    // 真页火焰图 domain 基线 `trace_svg_x-axis__axis` = 全宽 1px 实线、`--ui-text`（rgba(28,43,52,.98)）。
    // 与瀑布表头不同：瀑布那条被 svg overflow 裁掉（DdTicks 注释），火焰这条未裁、可见。
    borderBottom: `1px solid ${ui.text}`,
    marginBottom: FLAME_RULER_BAR_GAP,
    // Story 10.8：轴背景 = `--ui-background`（白，与瀑布表头 `DdTimelineHeader`/真页火焰面板同色）。
    // 原 `background.primary` 实为 `rgb(249,250,251)`（= datafox `--ui-background-secondary` 灰），与真页/瀑布不符。
    background: ui.bg,
  }),
  // Story 10.5：缩放裁剪箭头（真页 `svg.trace_svg_x-axis > g.svg_arrow` 实测，2026-07-11）。
  // 贴轴基线（ruler 底边 domain 基线），30px 虚线 + chevron 指向外侧。右箭头靠 scaleX(-1) 镜像。
  // svg 8px、虚线画在中线 y=4 → bottom:-4 令虚线正落在 ruler 底边（与实线基线对齐），chevron 上下各 3px 跨线。
  clip: css({
    label: 'DdFlameClipArrow',
    position: 'absolute',
    bottom: -4,
    pointerEvents: 'none',
    overflow: 'visible',
  }),
  clipLeft: css({ left: 0 }),
  clipRight: css({ right: 0, transform: 'scaleX(-1)' }),
  // ClipArrow 的擦除色 = ruler 背景色（复现真页「白虚线擦暗基线」）——同为 `--ui-background`（白）。
  eraseColor: ui.bg,
});

/**
 * 裁剪箭头（真页 `<g class="svg_arrow">` 逐位复刻）。真页做法**不是**在基线上再画一条暗虚线，
 * 而是 `svg_arrow__dash` 用**白色（=背景色）** 2px `dasharray 4,3` 沿基线画——**擦掉**实线基线的一小段段落，
 * 令 domain 基线在边缘处自然呈现断口（solid→dashed 同一条线、浑然一体）；再叠两条 `svg_arrow__arrow`
 * 组成 (1,4)→(6,±3) 的暗色 chevron 箭头。本仓照此：擦除段用 `eraseColor`（背景色）4px 覆盖基线，
 * `dasharray 4,3` 留出 3px 断口露出基线；chevron 用 `ui.text`。
 */
function ClipArrow({ className, testid, eraseColor }: { className: string; testid: string; eraseColor: string }) {
  return (
    <svg className={className} data-testid={testid} width={30} height={8} viewBox="0 0 30 8" aria-hidden="true">
      <line x1={30} y1={4} x2={0} y2={4} stroke={eraseColor} strokeWidth={4} strokeDasharray="4 3" />
      <line x1={1} y1={4} x2={6} y2={1} stroke={ui.text} strokeWidth={1} />
      <line x1={1} y1={4} x2={6} y2={7} stroke={ui.text} strokeWidth={1} />
    </svg>
  );
}

export interface DdFlameRulerProps {
  numTicks: number;
  /** trace 总时长（微秒）= trace.duration。 */
  viewDuration: number;
  viewStart?: number;
  viewEnd?: number;
}

export function DdFlameRuler({ numTicks, viewDuration, viewStart = 0, viewEnd = 1 }: DdFlameRulerProps) {
  const styles = useStyles2(getStyles);
  // 真页实测（2026-07-11，trace 6a505e15…）：某侧视窗外仍有 trace 内容时，轴该端出现虚线箭头；
  // 全览（0..1 覆盖整条 trace）两端皆无。左箭头 ⟺ viewStart>0；右箭头 ⟺ viewEnd<1。
  const showLeft = viewStart > CLIP_EPS;
  const showRight = viewEnd < 1 - CLIP_EPS;
  return (
    <div className={styles.ruler} data-testid="DdFlameRuler">
      {/* Story 10.4：火焰尺改用 `axis` 形态——复用瀑布表头已对齐真页的刻度实现
          （niceTickValues 整步长 + 6px 贴底刻度 + 10px `--ui-text` 居中标签 + formatAxisTick）。
          与真页 `svg.trace_svg_x-axis` 一致；背景网格（DdFlameGraphView）仍用 grid 形态、同 niceTickValues 落位。 */}
      <DdTicks numTicks={numTicks} viewDuration={viewDuration} viewStart={viewStart} viewEnd={viewEnd} variant="axis" />
      {showLeft && (
        <ClipArrow className={`${styles.clip} ${styles.clipLeft}`} testid="FlameClipArrowLeft" eraseColor={styles.eraseColor} />
      )}
      {showRight && (
        <ClipArrow className={`${styles.clip} ${styles.clipRight}`} testid="FlameClipArrowRight" eraseColor={styles.eraseColor} />
      )}
    </div>
  );
}
