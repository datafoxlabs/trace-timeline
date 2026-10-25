// 缩放视图层（FR-8）——移植自 grafana TimelineViewingLayer（Apache/Uber）。
// 在表头刻度区之上叠一层，按下拖拽产出新的 viewRange；半透明选区 + 游标竖线反馈。
// 行为照搬（AD-3 class line-port + DraggableManager）；配色走 theme（AD-6/AD-7，Datadog 皮肤）。
import { css, cx } from '@emotion/css';
import { PureComponent, type ReactNode } from 'react';

import type { TNil, TUpdateViewRangeTimeFunction, ViewRangeTime, ViewRangeTimeUpdate } from '../core';
import { useStyles2 } from '../theme';
import { DraggableManager, type DraggableBounds, type DraggingUpdate } from '../utils';

import { ui } from './uiTokens';

const getStyles = () => {
  const reframe = ui.interactionPrimary;
  return {
    layer: css({
      label: 'DdViewingLayer',
      position: 'absolute',
      inset: 0,
      cursor: 'vertical-text',
    }),
    cursorGuide: css({
      label: 'DdViewingLayerCursorGuide',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 1,
      backgroundColor: reframe,
    }),
    dragged: css({
      label: 'DdViewingLayerDragged',
      position: 'absolute',
      top: 0,
      bottom: 0,
    }),
    draggingLeft: css({ label: 'DdViewingLayerDraggingLeft', borderLeft: `1px solid ${reframe}` }),
    draggingRight: css({ label: 'DdViewingLayerDraggingRight', borderRight: `1px solid ${reframe}` }),
    reframeDrag: css({
      label: 'DdViewingLayerReframeDrag',
      // Story 9.1 文档化例外：datafox 无 `--ui-interaction-*-soft`，且此处需半透明让底层刻度透出；保留原 reframe 蓝。
      background: 'rgba(110, 159, 255, 0.18)',
    }),
  };
};

type Styles = ReturnType<typeof getStyles>;

export type DdViewingLayerProps = {
  /** 任意值变化即让拖拽 bounds 失效重算（实践中传名称列宽即可）。 */
  boundsInvalidator: number | null | undefined;
  updateNextViewRangeTime: (update: ViewRangeTimeUpdate) => void;
  updateViewRangeTime: TUpdateViewRangeTimeFunction;
  viewRangeTime: ViewRangeTime;
};

type TDraggingLeftLayout = {
  isDraggingLeft: boolean;
  left: string;
  width: string;
};

type TOutOfViewLayout = {
  isOutOfView: true;
};

function isOutOfView(layout: TDraggingLeftLayout | TOutOfViewLayout): layout is TOutOfViewLayout {
  return Reflect.has(layout, 'isOutOfView');
}

/** 把子区间值映射回更大的 view 区间（缩放态下保证嵌套拖拽正确）。 */
function mapFromViewSubRange(viewStart: number, viewEnd: number, value: number) {
  return viewStart + value * (viewEnd - viewStart);
}

/** 把 [0,1] 的全局值映射到当前 view 子区间。 */
function mapToViewSubRange(viewStart: number, viewEnd: number, value: number) {
  return (value - viewStart) / (viewEnd - viewStart);
}

function getNextViewLayout(start: number, position: number): TDraggingLeftLayout | TOutOfViewLayout {
  let [left, right] = start < position ? [start, position] : [position, start];
  if (left >= 1 || right <= 0) {
    return { isOutOfView: true };
  }
  if (left < 0) {
    left = 0;
  }
  if (right > 1) {
    right = 1;
  }
  return {
    isDraggingLeft: start > position,
    left: `${left * 100}%`,
    width: `${(right - left) * 100}%`,
  };
}

function getMarkers(
  styles: Styles,
  viewStart: number,
  viewEnd: number,
  from: number,
  to: number
): ReactNode {
  const mappedFrom = mapToViewSubRange(viewStart, viewEnd, from);
  const mappedTo = mapToViewSubRange(viewStart, viewEnd, to);
  const layout = getNextViewLayout(mappedFrom, mappedTo);
  if (isOutOfView(layout)) {
    return null;
  }
  const { isDraggingLeft, left, width } = layout;
  return (
    <div
      className={cx(
        styles.dragged,
        styles.reframeDrag,
        isDraggingLeft ? styles.draggingLeft : styles.draggingRight
      )}
      style={{ left, width }}
      data-testid="Dragged"
    />
  );
}

/** 内层 class——持有 DraggableManager + root ref + 生命周期（AD-3）。 */
class ViewingLayerInner extends PureComponent<DdViewingLayerProps & { styles: Styles }> {
  _draggerReframe: DraggableManager;
  _root: Element | TNil;

  constructor(props: DdViewingLayerProps & { styles: Styles }) {
    super(props);
    this._draggerReframe = new DraggableManager({
      getBounds: this._getDraggingBounds,
      onDragEnd: this._handleReframeDragEnd,
      onDragMove: this._handleReframeDragUpdate,
      onDragStart: this._handleReframeDragUpdate,
      onMouseLeave: this._handleReframeMouseLeave,
      onMouseMove: this._handleReframeMouseMove,
    });
    this._root = undefined;
  }

  componentDidUpdate(prevProps: DdViewingLayerProps & { styles: Styles }) {
    if (prevProps.boundsInvalidator !== this.props.boundsInvalidator) {
      this._draggerReframe.resetBounds();
    }
  }

  componentWillUnmount() {
    this._draggerReframe.dispose();
  }

  _setRoot = (elm: Element | TNil) => {
    this._root = elm;
  };

  _getDraggingBounds = (): DraggableBounds => {
    if (!this._root) {
      throw new Error('invalid state');
    }
    const { left: clientXLeft, width } = this._root.getBoundingClientRect();
    return { clientXLeft, width };
  };

  _handleReframeMouseMove = ({ value }: DraggingUpdate) => {
    const [viewStart, viewEnd] = this.props.viewRangeTime.current;
    const cursor = mapFromViewSubRange(viewStart, viewEnd, value);
    this.props.updateNextViewRangeTime({ cursor });
  };

  _handleReframeMouseLeave = () => {
    this.props.updateNextViewRangeTime({ cursor: undefined });
  };

  _handleReframeDragUpdate = ({ value }: DraggingUpdate) => {
    const { current, reframe } = this.props.viewRangeTime;
    const [viewStart, viewEnd] = current;
    const shift = mapFromViewSubRange(viewStart, viewEnd, value);
    const anchor = reframe ? reframe.anchor : shift;
    const update = { reframe: { anchor, shift } };
    this.props.updateNextViewRangeTime(update);
  };

  _handleReframeDragEnd = ({ manager, value }: DraggingUpdate) => {
    const { current, reframe } = this.props.viewRangeTime;
    const [viewStart, viewEnd] = current;
    const shift = mapFromViewSubRange(viewStart, viewEnd, value);
    const anchor = reframe ? reframe.anchor : shift;
    const [start, end] = shift < anchor ? [shift, anchor] : [anchor, shift];
    manager.resetBounds();
    this.props.updateViewRangeTime(start, end, 'timeline-header');
  };

  render() {
    const { styles, viewRangeTime } = this.props;
    const { current, cursor, reframe, shiftEnd, shiftStart } = viewRangeTime;
    const [viewStart, viewEnd] = current;
    const haveNextTimeRange = reframe != null || shiftEnd != null || shiftStart != null;
    let cursorPosition: string | TNil;
    if (!haveNextTimeRange && cursor != null && cursor >= viewStart && cursor <= viewEnd) {
      cursorPosition = `${mapToViewSubRange(viewStart, viewEnd, cursor) * 100}%`;
    }
    return (
      <div
        aria-hidden
        className={styles.layer}
        ref={this._setRoot}
        onMouseDown={this._draggerReframe.handleMouseDown}
        onMouseLeave={this._draggerReframe.handleMouseLeave}
        onMouseMove={this._draggerReframe.handleMouseMove}
        data-testid="DdViewingLayer"
      >
        {cursorPosition != null && (
          <div className={styles.cursorGuide} style={{ left: cursorPosition }} data-testid="DdViewingLayer--cursorGuide" />
        )}
        {reframe != null && getMarkers(styles, viewStart, viewEnd, reframe.anchor, reframe.shift)}
        {shiftEnd != null && getMarkers(styles, viewStart, viewEnd, viewEnd, shiftEnd)}
        {shiftStart != null && getMarkers(styles, viewStart, viewEnd, viewStart, shiftStart)}
      </div>
    );
  }
}

/** 函数包装——用 hook 取主题样式后注入内层 class。 */
export function DdViewingLayer(props: DdViewingLayerProps) {
  const styles = useStyles2(getStyles);
  return <ViewingLayerInner {...props} styles={styles} />;
}
