// 主题类型（AD-7）：沿用 GrafanaTheme2 的「子集形状」，值填 DRUIDS。
// 只定义被 TraceTimeline 引擎/皮肤实际用到的字段（实测自源码 — addendum §D）。

export type ThemeColorMode = 'light' | 'dark';

/** Datadog 专属令牌（theme.trace.*）——唯一真相源，皮肤层只读这里。 */
export interface TraceThemeTokens {
  /** 条内部视觉高（~19），与行高（28/161/197 归 core，AD-12）正交 */
  barHeight: number;
  /** 仅顶圆角 */
  barRadius: string;
  /** 条与行的上下留白 */
  barGap: number;
  /** Datadog 分类色板（按服务稳定分配，Story 1.4 的 colorGenerator 消费） */
  categoricalPalette: string[];
  /** HTTP 状态 pill 配色 */
  status: {
    ok: StatusColor;
    info: StatusColor;
    warn: StatusColor;
    error: StatusColor;
  };
  /**
   * 缩进竖线。
   * @deprecated Story 9.3d 起 `DdIndentGuides` 不再消费本 token —— 真页树线是 1px `--ui-border` 灰导线
   * （见 `9-3d-tree-guides-alignment.md`）。字段保留仅为不破坏 `Theme` 公开类型。
   */
  indentLine: { width: number; colorFrom: 'service' };
  /** 选中行底色 */
  selectedRowBg: string;
  /** 字体栈（NotoSans + CJK 回退） */
  fontFamily: string;
  /** 详情卡令牌（Story 3.2；实测对齐 Datadog，见 datadog-span-detail-ux 调研） */
  detail: {
    /** section 分隔线（实测 rgb(226,229,237)） */
    border: string;
    /** 键值表标签 / 次要文本（实测 rgba(28,43,52,0.68)） */
    label: string;
    /** chevron 静默色（实测 rgba(28,43,52,0.66)） */
    chevron: string;
    /** 值链接色（实测 rgb(0,107,194)） */
    link: string;
    /** section header 高（实测 34.5 → 取 34） */
    sectionHeaderHeight: number;
    /** 键值表标签列宽（实测 ≈156） */
    keyColumnWidth: number;
    /** JSON 语法着色（Story 3.3，json-markup-* 类） */
    json: {
      key: string;
      string: string;
      number: string;
      bool: string;
      null: string;
    };
  };
  /** 火焰图视图令牌（Story 6.1 / Epic 6；实测 Datadog 行高≈24 紧贴堆叠，见 datadog-trace-flamegraph-layout 调研） */
  flame: {
    /** 行高（depth→y：top = depth × rowHeight）。实测 ≈24。 */
    rowHeight: number;
    /** 矩形间纵向缝隙（紧贴堆叠的 1px 描边缝）。 */
    rowGap: number;
    /** 矩形最小可见宽度（px，低于此不显示文字标签）。 */
    minLabelWidth: number;
    /** 矩形内文字左右内边距（px）。 */
    labelPadding: number;
    /** 选中 span 描边色（实测黑 2px；dark 取浅色）。 */
    selectedOutline: string;
    /** minimap 浮层宽（px，Story 6.6）。 */
    minimapWidth: number;
    /** minimap 概览遮罩色（实测 Datadog rgba(234,246,252,0.5)）。 */
    minimapMask: string;
    /** minimap 视口框边色（实测 Datadog rgb(0,107,194)）。 */
    minimapViewportBorder: string;
    /** 图例高亮某组时，非匹配火焰图帧的灰显填充色（Story 7.1；实测 Datadog 定值替换 #C2C8DD，非降透明/去饱和）。 */
    dimmedFill: string;
  };
}

export interface StatusColor {
  fg: string;
  bg: string;
}

export interface HeadingToken {
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
}

export interface Theme {
  colorMode: ThemeColorMode;
  isLight: boolean;
  isDark: boolean;
  colors: {
    text: { primary: string; secondary: string; link: string; disabled: string };
    background: { primary: string; secondary: string; canvas: string };
    border: { weak: string; strong: string };
    primary: { main: string };
    error: { text: string; transparent: string; borderTransparent: string };
    success: { text: string };
    /** 提亮/压暗一个颜色（dark 提亮、light 压暗），用于 hover 等 */
    emphasize: (color: string, amount?: number) => string;
  };
  typography: {
    fontFamily: string;
    fontWeightMedium: number;
    bodySmall: { fontSize: string };
    size: { sm: string; lg: string };
    h1: HeadingToken;
    h2: HeadingToken;
    h3: HeadingToken;
    h4: HeadingToken;
    h5: HeadingToken;
    h6: HeadingToken;
  };
  shape: { radius: { sm: string; md: string; default: string } };
  /** Grafana 风格 spacing：gridSize(8) * n，多参拼空格。spacing(2)='16px'，spacing(1,2)='8px 16px' */
  spacing: (...n: number[]) => string;
  breakpoints: { down: (key: BreakpointKey) => string };
  /** Datadog 专属令牌 */
  trace: TraceThemeTokens;
}

export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** createTheme 的深合并覆盖（递归 Partial） */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type ThemeOverride = DeepPartial<Theme>;
