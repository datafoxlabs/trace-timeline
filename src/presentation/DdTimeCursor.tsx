// 刻度游标（Story 9.4 / A；Story 9.4b 改造）——**瀑布图与火焰图共用**。
//
// 真页实测（已登录会话 + CDP 真指针 hover；合成 dispatchEvent 不触发 CSS :hover）：
//   overlay：position:absolute / pointer-events:none，覆盖表头 + 全部行
//   药丸（居中于游标 x）+ 下指三角 + 1px 竖线直达底部
//   **仅在轴盒内渲染**：x=1037（轴内）→ 渲染；x=1439.5（轴右 gutter，时长文字上）→ 不渲染；标签列 → 不渲染。
//
// 时间换算是 `DdTicks` 的 `axis` 形态的**逆映射**，共用 AXIS_LEFT_INSET / AXIS_RIGHT_GUTTER，
// 故与刻度、瀑布条严格零漂移（继承 Story 9.3 的 D10）。火焰图无标签列，轴盒 = 整个画布（axisX=0）。
//
// —— Story 9.4b：药丸改用 datafox `Tooltip`（用户定案）——
//
// 9.4 初版手搓 SVG `<foreignObject>` 药丸 + `<path>` 三角，并照抄 DRUIDS 的明暗字面值
// （亮=深底白字 / 暗=**反相**的浅底深字），登记为三条 Foundations 例外。改用 datafox `Tooltip` 后：
//   · 面色取 `--ui-background-shade`，且 datafox tooltip 自身强制 `.dark` 上下文 ⇒ **明暗同色深炭底 + 白字**。
//     三条字面值例外随之注销；不再复刻 DRUIDS 的暗态反相（刻意取舍，见 story「与真页的偏差」）。
//   · 圆角回到 Foundations 半径刻度（datafox `--radius-sm`），9.4 的「2px 不在刻度上」台账项一并了结。
//   · 药丸宽度改由内容决定（真页固定 65px）；高 26（真页 20）；三角为 Radix Arrow 11×6（真页 10×5）。
//
// **两个必须显式打开的 Radix 开关**（默认值会让药丸和竖线分家，实测于 @radix-ui/react-popper@1.3.1）：
//   · `updatePositionStrategy="always"` → floating-ui `autoUpdate({animationFrame:true})`。
//     默认 `"optimized"` 只监听 resize/scroll/layout-shift，**不逐帧跟随移动中的 trigger**。
//     变异测试（真浏览器扫动 24 帧）：改回默认值后药丸最多落后竖线 115.6px、均值 44px，并周期性跳回追赶。
//   · `avoidCollisions={false}` → 关掉 `shift()`/`flip()`。否则游标接近轴右端时药丸被推回视口内，脱离竖线中心。
// 二者在 DOM 上均无痕迹，故 timecursor.test.tsx 里做源级守卫。
import { Tooltip, TooltipProvider } from '@datafox/ui';
import { css } from '@emotion/css';
import { useEffect, useState, type RefObject } from 'react';

import { useStyles2 } from '../theme';
import { formatSpanDuration } from '../utils';

import { AXIS_LEFT_INSET, AXIS_RIGHT_GUTTER } from './layout';
import { ui } from './uiTokens';

/**
 * datafox `TooltipContent` 的实测盒子（Chrome，本仓 demo；`px-sm py-xs` + `text-sm/leading-normal`）：
 * 内容盒高 26px（18px 行高 + 上下 4px padding），Radix `Arrow` 11×6，二者同色。
 *
 * 仅用于把药丸摆到竖线正上方；datafox 若调整 tooltip 内边距，药丸只会整体上下平移几像素，不会错位。
 */
export const CURSOR = {
  pillH: 26,
  arrowW: 11,
  arrowH: 6,
} as const;

/** 竖线顶端 = 药丸箭尖的落点；药丸整体（含箭头）占据其上方。火焰图传 0，让药丸浮到 ruler 上。 */
export const CURSOR_ANCHOR_Y = CURSOR.pillH + CURSOR.arrowH;

export interface AxisGeometry {
  /** 轴盒左缘（相对 overlay 容器的 px）。 */
  axisX: number;
  /** 轴盒宽（px）。≤0 表示列宽被拖到极限，轴已坍塌。 */
  axisW: number;
  /** 视窗起点的绝对耗时（微秒）。 */
  lo: number;
  /** 视窗终点的绝对耗时（微秒）。 */
  hi: number;
}

export interface AxisGeometryInput {
  width: number;
  columnWidth: number;
  viewDuration: number;
  viewStart: number;
  viewEnd: number;
}

/** 瀑布轴盒 = 标签列右缘 + AXIS_LEFT_INSET → 总宽 − AXIS_RIGHT_GUTTER。与 DdTicks/DdSpanBar 的定位盒同源。 */
export function axisGeometry({ width, columnWidth, viewDuration, viewStart, viewEnd }: AxisGeometryInput): AxisGeometry {
  const axisX = columnWidth * width + AXIS_LEFT_INSET;
  const axisW = width - AXIS_RIGHT_GUTTER - axisX;
  return { axisX, axisW, lo: viewStart * viewDuration, hi: viewEnd * viewDuration };
}

/** 火焰图轴盒 = 整个画布（无标签列、无 gutter）。 */
export function flameGeometry(width: number, viewDuration: number, viewStart: number, viewEnd: number): AxisGeometry {
  return { axisX: 0, axisW: width, lo: viewStart * viewDuration, hi: viewEnd * viewDuration };
}

/** 游标 x 处的时刻（微秒）。落在轴盒外、或轴已坍塌 → `null`（= 不渲染游标）。 */
export function timeAtCursor(x: number, geo: AxisGeometry): number | null {
  const { axisX, axisW, lo, hi } = geo;
  if (!(axisW > 0) || x < axisX || x > axisX + axisW) {
    return null;
  }
  return lo + ((x - axisX) / axisW) * (hi - lo);
}

const getStyles = () => ({
  // div（非 `<svg>`）：`inset:0` 对普通元素即撑满包含块。9.4 初版用 `<svg>` 踩过替换元素的坑——
  // `inset:0` + `width:auto` 会退回固有尺寸 300×150，药丸被裁、竖线不到底（jsdom 不布局，测不出来）。
  overlay: css({ label: 'DdTimeCursor', position: 'absolute', inset: 0, pointerEvents: 'none' }),
  // 竖线**不跟药丸同色**。药丸是 datafox tooltip（强制 `.dark` ⇒ 明暗恒为深炭 `--ui-background-shade`），
  // 但同一个值铺成 1px 竖线压在暗态行底上，实测对比度只有 1.48（`--ui-border` 恰好也是这个值 —— 它是
  // 「分隔线级」的灰，不是「游标级」）。真页正是为此在暗态把游标整体反相成浅色。
  // `--ui-text-secondary` 本身明暗反相（亮 = 深岩板 / 暗 = 半透白），方向与真页一致且是语义 token。
  // 代价：暗态下药丸仍是深炭底，与浅色竖线不同色（真页二者同色）。已入 story 的「与真页的偏差」。
  line: css({ label: 'DdTimeCursorLine', position: 'absolute', top: 0, bottom: 0, width: 1, background: ui.textSecondary }),
  anchor: css({ label: 'DdTimeCursorPillAnchor', position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }),
});

interface Props {
  /** 游标横坐标（相对 overlay 容器的 px）。`null` = 鼠标不在容器内。 */
  cursorX: number | null;
  geo: AxisGeometry;
  /** 药丸箭尖落点（相对 overlay 顶）。默认让药丸整体落在容器顶部 26px 内。 */
  anchorY?: number;
}

export function DdTimeCursor({ cursorX, geo, anchorY = CURSOR_ANCHOR_Y }: Props) {
  const styles = useStyles2(getStyles);
  if (cursorX == null) {
    return null;
  }
  const t = timeAtCursor(cursorX, geo);
  if (t == null) {
    return null;
  }
  return (
    <div className={styles.overlay} data-testid="time-cursor">
      <div className={styles.line} style={{ left: cursorX }} data-testid="time-cursor-line" />
      {/* 自带 Provider：`DdFlameGraphView` 亦被单独导出使用（demo 直接挂载），不能假设外层有 TooltipProvider。
          嵌套 Provider 是 Radix 支持的，且让游标的 open/close 不干扰外层按钮 tooltip 的延时状态机。 */}
      <TooltipProvider delayDuration={0}>
        <Tooltip
          open
          isAnimated={false}
          placement="top"
          // 0 而非 CURSOR.arrowH：Radix Popper 的 offset 中间件**已把箭头高度算进去**，
          // sideOffset 量的是「箭尖 → trigger」的间距。写 6 会让药丸整体再上移 6px（实测）。
          sideOffset={0}
          avoidCollisions={false}
          updatePositionStrategy="always"
          // testid 落在 TooltipContent 自身：Radix 另有一份 `role="tooltip"` 的视觉隐藏副本（供 aria-describedby），
          // 若把 testid 放进 `content` 会渲染两遍、getByTestId 报「找到多个」。
          data-testid="time-cursor-pill"
          content={formatSpanDuration(t)}
        >
          <span
            className={styles.anchor}
            style={{ left: cursorX, top: anchorY }}
            data-testid="time-cursor-pill-anchor"
          />
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/**
 * 瀑布图游标图层：自己订阅容器的 mousemove/mouseleave，**状态不上浮**。
 *
 * 若把鼠标位置存进 `TraceTimeline` 的 state，每次 mousemove 都会重渲染整个
 * `VirtualizedTraceView`（数百行）——正是 D4 为准星所极力避免的。rAF 合并同帧多次移动。
 */
export function DdTimeCursorLayer({
  container,
  ...geo
}: { container: RefObject<HTMLElement | null> } & Omit<AxisGeometryInput, 'width'>) {
  const [pos, setPos] = useState<{ x: number; width: number } | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) {
      return;
    }
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const next = { x: e.clientX - r.left, width: r.width };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPos(next));
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      setPos(null);
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [container]);

  if (!pos) {
    return null;
  }
  return <DdTimeCursor cursorX={pos.x} geo={axisGeometry({ ...geo, width: pos.width })} />;
}
