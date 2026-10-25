// theme.trace 令牌（AD-7 TraceThemeTokens）+ Datadog 分类色板（datadog-visual-spec §3.1）。
import type { ThemeColorMode, TraceThemeTokens } from '../types';

// Datadog 「Color by Service」分类色板——20 色官方全集。
// 来源：Datadog APM Trace 视图 service 图标点开的「Service color:」选择器，
// 用 Chrome DevTools getComputedStyle 从 swatch DOM 精确读取（5 列 × 4 行，行优先）。
export const DATADOG_CATEGORICAL_PALETTE: string[] = [
  // 行 1
  '#CC3C71', // 玫红
  '#C86B74', // 鲑红
  '#DD8451', // 橙褐
  '#FCAF2B', // 金黄（默认选中色）
  '#FFCC00', // 亮黄
  // 行 2
  '#8934A4', // 紫
  '#BE53BB', // 品红紫
  '#985083', // 梅紫
  '#927FB9', // 灰紫
  '#6E69CC', // 靛蓝紫
  // 行 3
  '#C68CCD', // 浅紫
  '#3969B3', // 蓝
  '#3399CC', // 天蓝
  '#2EB0DE', // 青蓝
  '#3BCBCB', // 青
  // 行 4
  '#457557', // 墨绿
  '#50931F', // 绿
  '#A7B342', // 橄榄绿
  '#BED017', // 柠檬绿
  '#57B79A', // 青绿
];

const FONT_FAMILY = 'NotoSans, "PingFang SC", "Lucida Grande", sans-serif';

function statusTokens(mode: ThemeColorMode): TraceThemeTokens['status'] {
  if (mode === 'light') {
    return {
      ok: { fg: '#008645', bg: '#ECF9EF' },
      info: { fg: '#0953BF', bg: '#EAF6FC' },
      warn: { fg: '#C15800', bg: '#FFF6E3' },
      error: { fg: '#EB364B', bg: '#FDEBED' },
    };
  }
  return {
    ok: { fg: '#4FC47C', bg: 'rgba(0,134,69,0.18)' },
    info: { fg: '#5BA4F0', bg: 'rgba(53,152,236,0.18)' },
    warn: { fg: '#F2A33C', bg: 'rgba(249,157,2,0.18)' },
    error: { fg: '#F2576B', bg: 'rgba(235,54,75,0.18)' },
  };
}

export function traceTokens(mode: ThemeColorMode): TraceThemeTokens {
  return {
    // Story 9.3（D2 / 纠正二）：真页实测瀑布条 `height:15px` + `border-radius:2px`（四角全圆）。
    // 原值 19 / '2px 2px 0 0' 有误——「仅顶圆角」实为另一元素 `span-separator`（时间轴原点处 3px 宽的
    // 服务色竖向连接条，用 --top-gap/--bottom-gap 与上下行相连），被 visual-spec 误当成了 bar。
    barHeight: 15,
    barRadius: '2px',
    barGap: 4,
    categoricalPalette: DATADOG_CATEGORICAL_PALETTE,
    status: statusTokens(mode),
    // Story 9.3d：树线改为真页的 1px `--ui-border` 灰导线，`colorFrom: 'service'` 已无消费者。
    // 保留字段以免破坏 `Theme` 公开类型；宽度校正为实测 1px。
    indentLine: { width: 1, colorFrom: 'service' },
    selectedRowBg: mode === 'light' ? 'rgb(234,246,252)' : 'rgb(31,46,61)',
    fontFamily: FONT_FAMILY,
    detail: detailTokens(mode),
    flame: {
      // Story 10.7：真页火焰 canvas 直接采像素——干净列 bar 高 24 / 行距 25 / gap 1（原 24 使 bar 高塌成 23）。
      rowHeight: 25,
      rowGap: 1,
      minLabelWidth: 24,
      labelPadding: 6,
      selectedOutline: mode === 'light' ? 'rgb(0,0,0)' : 'rgb(255,255,255)',
      minimapWidth: 210,
      minimapMask: mode === 'light' ? 'rgba(234,246,252,0.5)' : 'rgba(31,46,61,0.5)',
      minimapViewportBorder: mode === 'light' ? 'rgb(0,107,194)' : 'rgb(110,159,255)',
      // Story 10.1：桥到 datafox dataviz token。light 用 var（`:root` 默认即 `#c2c8dd`，与原 `#C2C8DD` 逐位相同）。
      // 10.6 复审：dark 改用**具体值** `#2c2b2b`（= datafox 暗态 dim 色）——`.dark` 仅挂在 TraceTimeline 根，
      // 独立挂载 `DdFlameGraphView`（demo 直挂）时 CSS var 无 `.dark` 祖先会回落浅色，故 dark 取具体值以健壮。
      dimmedFill: mode === 'dark' ? '#2c2b2b' : 'var(--ui-dataviz-graph-disabled-series)',
    },
  };
}

// 详情卡令牌（Story 3.2）——light 值实测自 Datadog；dark 取等价深色（暗模式令牌后续可精修）。
function detailTokens(mode: ThemeColorMode): TraceThemeTokens['detail'] {
  if (mode === 'light') {
    return {
      border: 'rgb(226,229,237)',
      label: 'rgba(28,43,52,0.68)',
      chevron: 'rgba(28,43,52,0.66)',
      link: 'rgb(0,107,194)',
      sectionHeaderHeight: 34,
      keyColumnWidth: 156,
      json: {
        key: 'rgb(140,55,140)', // 紫
        string: 'rgb(42,126,65)', // 绿
        number: 'rgb(0,107,194)', // 蓝
        bool: 'rgb(193,88,0)', // 橙
        null: 'rgba(28,43,52,0.5)', // 灰
      },
    };
  }
  return {
    border: 'rgba(255,255,255,0.12)',
    label: 'rgba(255,255,255,0.62)',
    chevron: 'rgba(255,255,255,0.60)',
    link: 'rgb(110,159,255)',
    sectionHeaderHeight: 34,
    keyColumnWidth: 156,
    json: {
      key: 'rgb(205,148,205)',
      string: 'rgb(120,200,150)',
      number: 'rgb(110,159,255)',
      bool: 'rgb(230,160,90)',
      null: 'rgba(255,255,255,0.5)',
    },
  };
}
