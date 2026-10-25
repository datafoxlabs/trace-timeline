// 时间线表头（FR-2）：左标签列头（静态文案；折叠全部按钮留 Epic 2）| 右刻度区。
import { css } from '@emotion/css';

import type { TUpdateViewRangeTimeFunction, ViewRangeTime, ViewRangeTimeUpdate } from '../core';
import { useStyles2, type Theme } from '../theme';

import { DdColumnResizer } from './DdColumnResizer';
import { DdTicks } from './DdTicks';
import { DdTimelineCollapser } from './DdTimelineCollapser';
import { DdViewingLayer } from './DdViewingLayer';
import { AXIS_LEFT_INSET, AXIS_RIGHT_GUTTER } from './layout';
import { ui } from './uiTokens';

const COLUMN_MIN = 0.2;
const COLUMN_MAX = 0.85;

// Story 9.3（D2）：表头高按真页实测 26px（grid-template-rows 首行），原 28。
const HEADER_HEIGHT = 26;

const getStyles = (theme: Theme) => ({
  // Story 9.3 复审（D11）：真页表头上色元素（`th > div`，position:sticky）实测背景为**纯白**
  // = --ui-background（**与 body 同色**，非 secondary）。
  // 表头下边框**不在这一层**（`th` 与上色 div 的 `border-bottom-width` 皆为 0）——见 ticksHead。
  header: css({
    label: 'DdTimelineHeader',
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    height: HEADER_HEIGHT,
    boxSizing: 'border-box',
    background: ui.bg,
    fontFamily: ui.fontSans,
    fontSize: 12,
  }),
  // Story 9.3f（D11'）：真页表头标签列的内层 flex 是 `padding: 4px 7px`，故首个按钮落在 `列左缘 + 7`
  // ——恰与根行折叠箭头同列（箭头也在 `treeLeft + 7`，见 DdIndentGuides 的 ICON_INSET）。
  // 原值 8 会让表头按钮比箭头右偏 1px。
  labelHead: css({
    label: 'DdTimelineHeaderLabel',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 7,
    boxSizing: 'border-box',
    color: ui.textSecondary,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  // Story 9.3 复审（D11）：表头的两条线**都长在时间轴列头上**，标签列头一条都没有。
  // 真页 = 时间轴列头内层 flex 容器的 `border-left: 1px solid --ui-border`
  //        + `border-bottom: 1px solid --ui-border`（二者同色同宽，`th` 与上色 div 上均为 0）。
  //   ⇒ 竖线只有表头 26px 高（body 行 `border-left: 0`）；横线只跨时间轴列，**不跨标签列**。
  //   ⇒ Story 9.3 原实现两处皆错：竖线只查了标签列的 `border-right-width` → 漏掉，还当残留删了；
  //      横线原是**贯穿全行**的 `--ui-form-border`，颜色、粗细归属、跨度全不对。
  //
  // 两条线的画法**必须分开**：
  //   · 竖线 → inset box-shadow。ticksHead 是 `flex:1` 弹性项，`border-left` 会把内容盒挤窄 1px，
  //     令表头轴与行内条区产生 1px 漂移（破坏 D10 零漂移）。box-shadow 不占布局。
  //   · 横线 → 真 `border-bottom`。它只影响竖直方向：`align-items: stretch` 下 ticksHead 的
  //     border-box 仍是 26px，内容盒收成 25px，`axis` 的 `height:100%` 随之为 25px ——
  //     刻度短线（`bottom:0`）正好落在横线之上，与真页（svg h=24 落在 25px 内容盒里）同构。
  ticksHead: css({
    label: 'DdTimelineHeaderTicks',
    position: 'relative',
    flex: 1,
    minWidth: 0,
    boxShadow: `inset 1px 0 0 ${ui.border}`,
    borderBottom: `1px solid ${ui.border}`,
  }),
  // Story 9.3（D10）+ 复审（D11）：刻度轴与行内瀑布条投影区同宽 —— 左缩 AXIS_LEFT_INSET、右缩 AXIS_RIGHT_GUTTER，
  // 否则刻度与条会错位。DdTicks/DdViewingLayer 均以此为定位基准。
  axis: css({
    label: 'DdTimelineHeaderAxis',
    position: 'relative',
    height: '100%',
    marginLeft: AXIS_LEFT_INSET,
    marginRight: AXIS_RIGHT_GUTTER,
  }),
});

interface Props {
  columnWidth: number;
  numTicks: number;
  viewDuration: number;
  /**
   * 左标签列头文案。Story 9.3（D6）：**默认不渲染**——真页表头左侧只有 `[+][-]` 折叠按钮、无列名。
   * 显式传入时仍渲染（保持 API 不破坏）。
   */
  labelText?: string;
  /** 折叠/展开按钮组回调（全部提供时渲染 DdTimelineCollapser，FR-5）。 */
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onExpandOne?: () => void;
  onCollapseOne?: () => void;
  // —— 缩放（FR-8；全部提供时在刻度区叠加 DdViewingLayer）——
  viewRangeTime?: ViewRangeTime;
  updateViewRangeTime?: TUpdateViewRangeTimeFunction;
  updateNextViewRangeTime?: (update: ViewRangeTimeUpdate) => void;
  // —— 列宽拖拽（FR-9；提供时叠加 DdColumnResizer）——
  onColumnResize?: (newSize: number) => void;
  columnResizeHandleHeight?: number;
}

export function DdTimelineHeader({
  columnWidth,
  numTicks,
  viewDuration,
  labelText,
  onExpandAll,
  onCollapseAll,
  onExpandOne,
  onCollapseOne,
  viewRangeTime,
  updateViewRangeTime,
  updateNextViewRangeTime,
  onColumnResize,
  columnResizeHandleHeight = HEADER_HEIGHT,
}: Props) {
  const styles = useStyles2(getStyles);
  const hasCollapser = onExpandAll && onCollapseAll && onExpandOne && onCollapseOne;
  const hasZoom = viewRangeTime && updateViewRangeTime && updateNextViewRangeTime;
  return (
    <div className={styles.header}>
      <div className={styles.labelHead} style={{ flexBasis: `${columnWidth * 100}%`, maxWidth: `${columnWidth * 100}%` }}>
        {hasCollapser && (
          <DdTimelineCollapser
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            onExpandOne={onExpandOne}
            onCollapseOne={onCollapseOne}
          />
        )}
        {labelText}
      </div>
      <div className={styles.ticksHead}>
        <div className={styles.axis}>
          <DdTicks
            variant="axis"
            numTicks={numTicks}
            viewDuration={viewDuration}
            viewStart={viewRangeTime?.current[0] ?? 0}
            viewEnd={viewRangeTime?.current[1] ?? 1}
          />
          {hasZoom && (
            <DdViewingLayer
              boundsInvalidator={columnWidth}
              viewRangeTime={viewRangeTime}
              updateViewRangeTime={updateViewRangeTime}
              updateNextViewRangeTime={updateNextViewRangeTime}
            />
          )}
        </div>
      </div>
      {onColumnResize && (
        <DdColumnResizer
          position={columnWidth}
          min={COLUMN_MIN}
          max={COLUMN_MAX}
          onChange={onColumnResize}
          columnResizeHandleHeight={columnResizeHandleHeight}
        />
      )}
    </div>
  );
}

export { HEADER_HEIGHT };
