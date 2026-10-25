// 树形缩进线（Story 9.3d，9.3g 订正）——移植真页 DRUIDS waterfall 的两套机制，非"每级一个 border-left"。
//
// 真页把树线拆成两半，各画各的层级、互不重叠：
//   ① 树 span 的**三层 background**：祖先满高条纹（level `0..d-2`）+ 肘部横线 + 行底下探竖头
//   ② 同元素的 **`::before`**：父级那一根（level `d-1`）——背景层数学上画不到它
//      （条纹图宽 = `W-32 = 16d-2`，条纹 k 在 `[15+16k, 16+16k]`，须 `k ≤ d-2`）
//
// 本文件用一个 <span> 承载 ①，一个 <span> 承载 ②（避免伪元素不可测/不可 hover）。
//
// ── Story 9.3g：真页 CSS 原文（从生产页 CSSOM 逐条取出），订正 9.3d 的三处误读 ──
//
//   .cell--tree-expander .expander--arrow, .expander--tree {
//     z-index: 1; position: relative;
//     background: var(--table-row-background, var(--ui-background));   /* 折叠箭头的不透明底板 */
//   }
//   .cell--tree-expander.cell--is-expanded > .cell-content { --tree-line-start: linear-gradient(...) }
//   .cell--tree-expander.cell--is-expanded > .cell-content::before   { height: 150% }
//   .tr--is-root + .tr:not(.tr--is-root) > ... > .cell-content::before { height: calc(100% - 8px); top: calc(-50% + 8px) }
//   .tr--is-root > ... > .cell-content::before { display: none }
//
// 三处订正：
//   A. 下探竖头与 `height:150%` 键在 **`is-expanded`**，不是 `hasChildren`。折叠的枝行两者都没有
//      （9.3d 用 hasChildren，导致折叠节点多画一截竖头、连接件长 34.5 而非 23）。
//   B. `-8px` 短连接件键在 **`.tr--is-root + .tr`**（紧跟根行的那一行），不是 `depth === 1`。
//      根的非首个展开子行按 9.3d 的写法会短 19.5px，在 x=15 处留缺口。
//      该规则**特异度高于** `.is-expanded`，故紧跟根行的行即便展开也用 15px。
//   C. 折叠箭头有 `z-index: 1` + **行底色不透明底板**，把穿过它的导线遮住。9.3d 漏了，于是竖线压在箭头上。
//
// 另：真页导线**没有任何 `:hover` 规则**。9.3d 的 D3（hover 跨行高亮改画 1px 主色覆盖线）是本仓自造，
// 9.3g 据真页移除；`useHoverIndentGuide` 的 core API 仍保留（穿透 RenderableRow 与引擎，动它要改引擎），
// 只是默认皮肤不再消费。
import { css, cx } from '@emotion/css';
import { ChevronDownIcon, ChevronRightIcon } from '@datafox/ui';
import type { CSSProperties } from 'react';

import { DEFAULT_HEIGHTS } from '../core';
import { useStyles2 } from '../theme';

import { ui } from './uiTokens';

// —— 真页实测常量（截图逐像素扫描，dpr=2）——
// `INDENT_STEP` 走 8px 刻度（= --spacing-md）。其余五个**不在刻度上**：它们是几何咬合值
// （箭头右缘恒距 span 右缘 7px；肘部起点恒为 `W-30`；下探竖头恒落在本行自己的层级 x），
// 改成刻度值会直接错位。datafox `table/styles.ts` 的 `px-[7px] py-[5px]` 是同类先例（台账已记）。
const INDENT_STEP = 16; // = var(--spacing-md)
const TREE_BASE = 30; // 真页 row-action 槽列宽；树 span 宽 = TREE_BASE + INDENT_STEP × depth
const STRIPE_OFFSET = 15; // 第 k 级导线 x = STRIPE_OFFSET + INDENT_STEP × k
const ICON_INSET = 7; // 箭头右缘距树 span 右缘（恒定，与 depth 无关）
const ELBOW_BRANCH = 10; // 肘部横线长（有子节点：其右侧被箭头压住）
const ELBOW_LEAF = 20; // 肘部横线长（叶子：一直伸到内容前）
const STUB_H = 10; // 行底下探竖头高

const ROW_H = DEFAULT_HEIGHTS.bar; // 23
const HALF_ROW = ROW_H / 2; // 11.5
const ROOT_OVERLAP = 3.5; // 紧跟根行的那一行，连接件上探量（接住根行那截 10px 竖头）= calc(-50% + 8px)

const STRIPES = `repeating-linear-gradient(to right, transparent 0, transparent ${STRIPE_OFFSET}px, ${ui.border} ${STRIPE_OFFSET}px, ${ui.border} ${STRIPE_OFFSET + 1}px)`;
const SOLID = `linear-gradient(${ui.border}, ${ui.border})`;

/**
 * 树 span 的三层背景。恒等式见 story「几何恒等式」。
 *
 * `isExpanded`（= 有子且未折叠）而非 `hasChildren` 决定**下探竖头**是否出现——真页
 * `--tree-line-start` 只在 `.cell--is-expanded` 上被赋值（Story 9.3g / A）。
 * 肘部长度仍由**叶/枝**决定（真页键在 `.cell--is-empty`）。
 *
 * 导出供单测直接断言——jsdom 的 cssstyle 会丢弃多层 `background-position` 里的 `calc()`（读回空串）。
 */
export function backgroundFor(depth: number, hasChildren: boolean, isCollapsed = false): CSSProperties {
  const isExpanded = hasChildren && !isCollapsed;
  const stub: CSSProperties = {
    backgroundImage: SOLID,
    backgroundSize: `1px ${STUB_H}px`,
    backgroundPosition: `calc(100% - ${STRIPE_OFFSET - 1}px) 100%`,
    backgroundRepeat: 'no-repeat',
  };
  if (depth === 0) {
    // 根行：无祖先条纹、无肘部；仅展开时画下探竖头（真页 `.tr--is-root` 的 `none, none, var(--tree-line-start)`）。
    return isExpanded ? stub : {};
  }
  const elbow = hasChildren ? ELBOW_BRANCH : ELBOW_LEAF;
  const base = {
    backgroundImage: `${STRIPES}, ${SOLID}`,
    backgroundSize: `calc(100% - ${TREE_BASE + 2}px) 100%, ${elbow}px 1px`,
    backgroundPosition: `0 0, calc(100% - ${TREE_BASE - elbow}px) 50%`,
    backgroundRepeat: 'no-repeat',
  };
  if (!isExpanded) return base;
  return {
    backgroundImage: `${base.backgroundImage}, ${SOLID}`,
    backgroundSize: `${base.backgroundSize}, 1px ${STUB_H}px`,
    backgroundPosition: `${base.backgroundPosition}, calc(100% - ${STRIPE_OFFSET - 1}px) 100%`,
    backgroundRepeat: 'no-repeat',
  };
}

/**
 * 父级导线（level d-1）的几何。真页 `::before` 三条规则的直译（Story 9.3g / B）：
 *
 * - `depth === 0`（根）→ `display: none`，本函数返回 `null`
 * - `isAfterRoot`（`.tr--is-root + .tr`）→ `top: -3.5, height: 15`。**优先于展开态**（CSS 特异度更高）
 * - 其余 → `top: -11.5`；展开 `height: 34.5`（下探到本行底，交棒给子行条纹），否则 `height: 23`（止于本行中心）
 */
export function connectorGeometry(
  depth: number,
  isExpanded: boolean,
  isAfterRoot: boolean,
): { top: number; height: number } | null {
  if (depth === 0) return null;
  if (isAfterRoot) {
    // 根行没有条纹层，只有 10px 竖头 —— 连接件上探 3.5px 接住它，止于本行中心。
    // 真页于是在根行下半留下一个可见断口；这是真页的渲染事实，照实复现。
    return { top: -ROOT_OVERLAP, height: HALF_ROW + ROOT_OVERLAP };
  }
  return { top: -HALF_ROW, height: isExpanded ? ROW_H * 1.5 : ROW_H };
}

const getStyles = () => ({
  root: css({
    label: 'DdIndentGuides',
    position: 'relative',
    alignSelf: 'stretch',
    flex: 'none',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    border: 0,
    padding: 0,
  }),
  toggle: css({
    label: 'DdIndentToggle',
    appearance: 'none',
    cursor: 'pointer',
    color: ui.textSecondary,
    '&:focus-visible': { outline: `2px solid ${ui.interactionPrimary}`, outlineOffset: -2 },
  }),
  // 父级导线（level d-1）。背景层画不到这一级，故用真实元素。
  connector: css({
    label: 'DdIndentConnector',
    position: 'absolute',
    width: 1,
    background: ui.border,
    pointerEvents: 'none',
  }),
  // Story 9.3g（C）：真页 `.expander--arrow { z-index:1; position:relative; background: var(--table-row-background) }`。
  // 这块**不透明底板**是导线不会压到箭头上的唯一原因——子行的连接件从父行中心起画，正好穿过父行箭头的下半。
  // `--dd-row-bg` 由 DdSpanRow 按行态（默认/hover/选中/命中）赋值，对应真页的 `--table-row-background`。
  // `z-index: 1` 跨行生效：行是 `position:absolute; z-index:auto`（不建立层叠上下文），
  // 正数层级恒晚于 auto 层级绘制，故父行箭头盖得住后续行的连接件。
  chevron: css({
    label: 'DdIndentChevron',
    position: 'absolute',
    right: ICON_INSET,
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    zIndex: 1,
    background: `var(--dd-row-bg, ${ui.bg})`,
  }),
});

interface Props {
  /** 根→父有序（= RenderableRow.ancestorSpanIds，length===depth）。 */
  ancestorSpanIds: string[];
  hasChildren: boolean;
  isCollapsed: boolean;
  /**
   * 该行是否**紧跟在根行之后**（真页 `.tr--is-root + .tr`）。
   * 决定父级导线用短连接件（15px）还是常规连接件——见 `connectorGeometry`。
   */
  isAfterRoot?: boolean;
  onToggle?: () => void;
  /**
   * @deprecated Story 9.3g 起默认皮肤不再消费：真页导线**无任何 hover 规则**，
   * 9.3d 的 1px 主色覆盖线是本仓自造。core 的 `useHoverIndentGuide` API 保留（引擎依赖），
   * 自定义皮肤仍可自行消费这三个值。
   */
  hoverIndentGuideIds?: Set<string>;
  /** @deprecated 见 `hoverIndentGuideIds`。 */
  addHoverIndentGuideId?: (id: string) => void;
  /** @deprecated 见 `hoverIndentGuideIds`。 */
  removeHoverIndentGuideId?: (id: string) => void;
}

export function DdIndentGuides({ ancestorSpanIds, hasChildren, isCollapsed, isAfterRoot = false, onToggle }: Props) {
  const styles = useStyles2(getStyles);
  const depth = ancestorSpanIds.length;
  const width = TREE_BASE + INDENT_STEP * depth;
  const isExpanded = hasChildren && !isCollapsed;
  const Chevron = isCollapsed ? ChevronRightIcon : ChevronDownIcon;
  const geo = connectorGeometry(depth, isExpanded, isAfterRoot);

  const inner = (
    <>
      {geo && (
        <span
          className={styles.connector}
          data-testid="indent-connector"
          style={{ left: STRIPE_OFFSET + INDENT_STEP * (depth - 1), top: geo.top, height: geo.height }}
        />
      )}
      {hasChildren && <Chevron size="md" className={styles.chevron} />}
    </>
  );

  const style = { width, ...backgroundFor(depth, hasChildren, isCollapsed) };

  return hasChildren ? (
    <button
      type="button"
      className={cx(styles.root, styles.toggle)}
      style={style}
      aria-label={isCollapsed ? 'expand' : 'collapse'}
      aria-expanded={!isCollapsed}
      onClick={onToggle}
    >
      {inner}
    </button>
  ) : (
    <span className={styles.root} style={style}>
      {inner}
    </span>
  );
}
