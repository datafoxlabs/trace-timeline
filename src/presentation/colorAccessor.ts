// presentation 着色（AD-6）——颜色只在此层计算，core 零颜色。
import { dimensionKeyFor, type LegendDimension } from '../core';
import type { TraceSpan } from '../model';
import { getServiceColorKey } from '../model';
import type { StatusColor, Theme } from '../theme';
import { getColorByKey } from '../theme';

/** span → 颜色 key → 分类色。 */
export type ColorAccessor = (span: TraceSpan) => string;

/** colorBy='service'：散列服务名到 Datadog 分类色板（getColorByKey 内含相邻 readability 去重）。 */
export function defaultColorAccessor(theme: Theme): ColorAccessor {
  return (span) => getColorByKey(getServiceColorKey(span.process), theme);
}

/** colorBy=维度（service/host/entity，Story 7.3）：散列维度 key 到分类色板，与图例分组同口径。 */
export function colorAccessorForDimension(dimension: LegendDimension, theme: Theme): ColorAccessor {
  return (span) => getColorByKey(dimensionKeyFor(span, dimension), theme);
}

/** 按服务名取分类色（RPC 合并 / 未插桩外部服务用，Story 4.4）。 */
export function colorForService(serviceName: string, theme: Theme): string {
  return getColorByKey(serviceName, theme);
}

// 火焰图帧内文本配色（Story 10.7）——真页 canvas 实测：帧文字按条底色明暗二选一，
// 亮底（橙/黄，如 #fcaf2b）用深字 rgba(0,0,0,.9)，暗底（绿/品红，如 #50931f）用白字 rgba(255,255,255,.9)。
// 判据用经典 YIQ 感知亮度阈值 128（实测 #50931f=113.7→白、#fcaf2b=182.9→深，全命中）。
// 空格式与 DOM `el.style.color` 归一化后一致，便于测试与去重比对。
const FLAME_TEXT_DARK = 'rgba(0, 0, 0, 0.9)';
const FLAME_TEXT_LIGHT = 'rgba(255, 255, 255, 0.9)';

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return null;
}

/** 条底色 → 可读帧文本色（深字 / 白字），真页火焰图帧内文字用。非法色回退白字。 */
export function readableTextColor(color: string): string {
  const rgb = parseRgb(color);
  if (!rgb) {
    return FLAME_TEXT_LIGHT;
  }
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 128 ? FLAME_TEXT_DARK : FLAME_TEXT_LIGHT;
}

/** HTTP 状态码 → 状态 pill 配色（2xx 绿 / 3xx 蓝 / 4xx 橙 / 5xx 红），取 theme.trace.status。 */
export function httpStatusToken(code: number, theme: Theme): StatusColor {
  const s = theme.trace.status;
  if (code >= 500) {
    return s.error;
  }
  if (code >= 400) {
    return s.warn;
  }
  if (code >= 300) {
    return s.info;
  }
  if (code >= 200) {
    return s.ok;
  }
  return s.info;
}
