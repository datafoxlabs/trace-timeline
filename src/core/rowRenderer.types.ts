// core 行渲染契约（AD-2）——引擎与皮肤之间的**唯一**接缝。
// 不变量：无颜色、无主题。core 计算「数据」，presentation 经 colorAccessor+theme.trace 决定「外观」。
import type { ReactNode } from 'react';

import type { CriticalPathSection, TraceProcess, TraceSpan } from '../model';

/** span 在当前缩放后视图区间内的相对位置，值域 [0,1]（= core getViewedBounds 输出）。 */
export interface ViewBounds {
  start: number;
  end: number;
  /** 缩放后超出视口左/右边界——喂 FR-8 裁剪提示。 */
  clippingLeft: boolean;
  clippingRight: boolean;
}

/** 折叠 client span 时其 server 子 span 的 RPC 合并数据（无颜色；process 供 presentation 着色，AD-6）。 */
export interface RpcInfo {
  serviceName: string;
  operationName: string;
  process: TraceProcess;
  viewStart: number;
  viewEnd: number;
}

/**
 * 引擎派发给皮肤的一整行数据（AD-2）。皮肤据此渲染，但**禁止**自行做时间映射或读 DETAIL 内部结构以外的引擎状态。
 */
export interface RenderableRow {
  span: TraceSpan;
  spanIndex: number;
  isDetail: boolean;
  depth: number;
  /** 根→父有序，不含自身；不变量 `length === depth`（FR-25 缩进竖线逐层对齐）。 */
  ancestorSpanIds: string[];
  /**
   * 相邻**可见** span 行（Story 9.4d）。列表两端、或邻行是 detail 行时为 `undefined`。
   *
   * 供 `span-separator` 判断服务连段：真页按**可见行序**算（折叠会改变连段），而非静态树，
   * 故此处必须由引擎给出——presentation 拿不到折叠后的行序。仍守 AD-2「无颜色」：给的是 model 数据。
   */
  prevSpan?: TraceSpan;
  nextSpan?: TraceSpan;
  viewBounds: ViewBounds;
  isCollapsed: boolean;
  isMatchingFilter: boolean;
  isFocused: boolean;
  /** 本 span 报错。 */
  isError: boolean;
  /** 折叠时子树含错误（驱动折叠父条提示）——与 isError 分离（FR-15/26）。 */
  descendantHasError: boolean;
  /** HTTP 状态码（驱动状态 pill，FR-26）。 */
  httpStatus?: number;
  rpc?: RpcInfo;
  /** 叶子 client + peer.service：疑似未插桩的外部服务（FR-17，无颜色）。 */
  noInstrumentedServer?: { serviceName: string };
  criticalPathSections: CriticalPathSection[];
  /** 名称列占比 [0,1]。 */
  columnWidth: number;
  /** isDetail 行携带的不透明 DetailState（Epic 3 由 presentation 解读）。 */
  detailState?: unknown;
  // —— 交互 ——
  hoverIndentGuideIds: Set<string>;
  onChildrenToggle: (spanID: string) => void;
  onDetailToggle: (spanID: string) => void;
  addHoverIndentGuideId: (spanID: string) => void;
  removeHoverIndentGuideId: (spanID: string) => void;
}

/** api 把 presentation 的行渲染器以此类型注入 core（依赖反转）。 */
export type RowRenderer = (row: RenderableRow) => ReactNode;
