// 列宽分隔条（FR-9）——Story 9.4c 起对齐真页 DRUIDS `Table` 的 resizer。
//
// 真页结构（`us5.datadoghq.com` waterfall，CSS 逐条读自 `druids_table_table__resizer*`，
// 并在 DRUIDS 文档站的 Table 示例上实测拖拽行为）：
//
//   .resizer            7px 命中条，以列边界为中心（`--resizer-left: -3px`），role=separator，opacity 0
//     background: linear-gradient(to right, transparent 2px, var(--table-resizer-color) 0,
//                                 var(--table-resizer-color) 5px, transparent 0)   ← 中间 3px 实心条
//   .resizer-helper     1px 竖线，恰在列边界（命中条内 left:3px），`--ui-border` 灰，pointer-events:none，opacity 0
//
//   :hover  → 两者 opacity:1；`--table-resizer-color: var(--ui-interaction-primary)`（3px 蓝条），
//             **helper 仍是灰的** ⇒ 观感是「蓝 | 灰 | 蓝」（helper 与 resizer z-index 同为 20，
//             helper 是后一个兄弟，压在蓝条正中）。
//   :active → 追加 `.resizer:active + .resizer-helper { background: var(--table-resizer-color) }`
//             ⇒ helper 转蓝，三层合成一条**实心 3px 蓝条**。
//   拖拽中 → `.table--is-resizing .resizer-helper { opacity: 1 }`，指针移开也不消失。
//
// **列宽实时跟随**（DRUIDS 文档站实测：拖 +20/+40/+60px，`grid-template-columns` 逐帧变
// `220.27→240→260→280`，相邻列同步收缩；松手不再变）。datafox `Table` 的 `moveColumnResize`
// 亦是每次 pointermove 就 `setColumnWidth`。故本组件的 `onChange` 改为**拖拽中持续触发**，
// 不再只在松手时提交（原 Grafana 语义：拖拽中只画预览色带，松手才改列宽）。
//
// datafox 有对应实现（`Table` 的 `resizableColumns` / `hasFullHeightResizer`），但绑在 `<table>` 上；
// 本仓瀑布是虚拟化自定义网格，复用不了组件，只复用其契约。
// ⚠ 一处 datafox 与真页不一致：datafox 是 `group-hover:bg-ui-interaction-primary`（hover 即把 helper 变蓝），
//   真页 hover 时 helper 保持灰、仅 `:active` 变蓝。本组件照真页。已入 deferred-work。
import { css } from '@emotion/css';
import { PureComponent, type CSSProperties, type KeyboardEvent } from 'react';

import type { TNil } from '../core';
import { useStyles2 } from '../theme';
import { DraggableManager, type DraggableBounds, type DraggingUpdate } from '../utils';

import { ui } from './uiTokens';

/** 命中条宽（真页 7px，以列边界为中心）。中间 3px（2..5）是可见的蓝条。 */
export const RESIZER = { hitWidth: 7, barStart: 2, barEnd: 5, keyboardStepPx: 8 } as const;

const getStyles = () => {
  const accent = ui.interactionPrimary;
  return {
    root: css({ label: 'DdColumnResizer', left: 0, position: 'absolute', right: 0, top: 0 }),
    // 命中条容器：以列边界为中心的 7px 竖条，跨表头 + 全部行（高度由内联 columnResizeHandleHeight 给）。
    wrap: css({
      label: 'DdColumnResizerWrap',
      position: 'absolute',
      top: 0,
      width: RESIZER.hitWidth,
      marginLeft: -RESIZER.barStart - 1, // 让边界（helper）落在条内 left:3px
      zIndex: 10,
      // hover 命中条 → helper 显形（**保持灰**，与真页一致；变蓝是 :active 的事）。
      '&:hover [data-resizer-helper]': { opacity: 1 },
    }),
    // 1px 全高竖线，恰在列边界上。pointer-events:none —— 命中交给上面的 separator。
    helper: css({
      label: 'DdColumnResizerHelper',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: RESIZER.barStart + 1,
      width: 1,
      background: ui.border,
      opacity: 0,
      pointerEvents: 'none',
    }),
    // 拖拽中：helper 转蓝且常驻（真页 `.resizer:active + .helper` + `.table--is-resizing .helper`）。
    helperDragging: css({ label: 'DdColumnResizerHelperDragging', background: accent, opacity: 1 }),
    // separator 自身画那条 3px 渐变；`--table-resizer-color` 默认透明，hover/active/focus-visible 转主色。
    separator: css({
      label: 'DdColumnResizerSeparator',
      position: 'absolute',
      inset: 0,
      cursor: 'col-resize',
      userSelect: 'none',
      outline: 'none',
      '--table-resizer-color': 'transparent',
      background: `linear-gradient(to right, transparent ${RESIZER.barStart}px, var(--table-resizer-color) 0, var(--table-resizer-color) ${RESIZER.barEnd}px, transparent 0)`,
      '&:hover': { '--table-resizer-color': accent },
      '&:active': { '--table-resizer-color': accent },
      '&:focus-visible': { '--table-resizer-color': accent, boxShadow: `inset 0 0 0 2px ${accent}` },
    }),
    separatorDragging: css({ label: 'DdColumnResizerSeparatorDragging', '--table-resizer-color': accent }),
  };
};

type Styles = ReturnType<typeof getStyles>;

export type DdColumnResizerProps = {
  min: number;
  max: number;
  /** 拖拽中**持续**触发（真页语义），松手时再提交一次终值。 */
  onChange: (newSize: number) => void;
  position: number;
  columnResizeHandleHeight: number;
};

type State = { isDragging: boolean };

class ColumnResizerInner extends PureComponent<DdColumnResizerProps & { styles: Styles }, State> {
  _dragManager: DraggableManager;
  _rootElm: Element | TNil;

  constructor(props: DdColumnResizerProps & { styles: Styles }) {
    super(props);
    this._dragManager = new DraggableManager({
      getBounds: this._getDraggingBounds,
      onDragEnd: this._handleDragEnd,
      onDragMove: this._handleDragUpdate,
      onDragStart: this._handleDragStart,
    });
    this._rootElm = undefined;
    this.state = { isDragging: false };
  }

  componentWillUnmount() {
    this._dragManager.dispose();
  }

  _setRootElm = (elm: Element | TNil) => {
    this._rootElm = elm;
  };

  _getDraggingBounds = (): DraggableBounds => {
    if (!this._rootElm) {
      throw new Error('invalid state');
    }
    const { left: clientXLeft, width } = this._rootElm.getBoundingClientRect();
    const { min, max } = this.props;
    return { clientXLeft, width, maxValue: max, minValue: min };
  };

  /**
   * 抓取点（**增量**语义，对齐 datafox `startColumnResize` 记 `startWidth` 的做法）。
   *
   * `DraggingUpdate.value` 是指针的**绝对**占比。实时跟随下若直接用它，从命中条边缘（距边界 ±3px）
   * 按下的一瞬间列宽就会跳 3px。故按下时记住 (position, x)，之后只加位移。
   */
  _grab: { startValue: number; startX: number; width: number } | null = null;

  _handleDragStart = ({ x }: DraggingUpdate) => {
    const width = this._rootElm?.getBoundingClientRect().width ?? 0;
    this._grab = { startValue: this.props.position, startX: x, width };
    this.setState({ isDragging: true });
  };

  _valueFrom = (x: number): number | null => {
    const g = this._grab;
    if (!g || !(g.width > 0)) {
      return null;
    }
    const raw = g.startValue + (x - g.startX) / g.width;
    return Math.min(this.props.max, Math.max(this.props.min, raw));
  };

  // 实时跟随。浏览器本就把 mousemove 合并到每帧至多一次，无需再 rAF 节流。
  _handleDragUpdate = ({ x }: DraggingUpdate) => {
    const v = this._valueFrom(x);
    if (v != null) {
      this.props.onChange(v);
    }
  };

  _handleDragEnd = ({ manager, x }: DraggingUpdate) => {
    const v = this._valueFrom(x);
    manager.resetBounds();
    this._grab = null;
    this.setState({ isDragging: false });
    if (v != null) {
      this.props.onChange(v);
    }
  };

  /** 键盘调宽（真页 separator 可聚焦；datafox `Table` 亦支持 Arrow）。步长按 px 折算成占比。 */
  _handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }
    const width = this._rootElm?.getBoundingClientRect().width ?? 0;
    if (!(width > 0)) {
      return;
    }
    e.preventDefault();
    const { position, min, max, onChange } = this.props;
    const delta = ((e.key === 'ArrowRight' ? 1 : -1) * RESIZER.keyboardStepPx) / width;
    onChange(Math.min(max, Math.max(min, position + delta)));
  };

  render() {
    const { styles, position, columnResizeHandleHeight, min, max } = this.props;
    const { isDragging } = this.state;
    const wrapStyle: CSSProperties = { left: `${position * 100}%`, height: columnResizeHandleHeight };

    return (
      <div className={styles.root} ref={this._setRootElm} data-testid="DdColumnResizer">
        <div className={styles.wrap} style={wrapStyle} data-testid="DdColumnResizer--wrap">
          <div
            aria-hidden
            data-resizer-helper
            className={`${styles.helper}${isDragging ? ` ${styles.helperDragging}` : ''}`}
            data-testid="DdColumnResizer--helper"
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize name column"
            aria-valuemin={Math.round(min * 100)}
            aria-valuemax={Math.round(max * 100)}
            aria-valuenow={Math.round(position * 100)}
            aria-valuetext={`${Math.round(position * 100)}%`}
            tabIndex={0}
            className={`${styles.separator}${isDragging ? ` ${styles.separatorDragging}` : ''}`}
            onMouseDown={this._dragManager.handleMouseDown}
            onKeyDown={this._handleKeyDown}
            data-testid="DdColumnResizer--dragger"
          />
        </div>
      </div>
    );
  }
}

/** 函数包装——用 hook 取主题样式后注入内层 class。 */
export function DdColumnResizer(props: DdColumnResizerProps) {
  const styles = useStyles2(getStyles);
  return <ColumnResizerInner {...props} styles={styles} />;
}
