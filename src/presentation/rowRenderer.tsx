// rowRenderer 工厂（AD-2 接缝的 presentation 侧）——api 在 1.7 注入 core。
// 闭包捕获 theme（着色）+ trace（祖先色解析），主题/trace 变化时由上层 useMemo 重建。
import type { RowRenderer } from '../core';
import type { Trace } from '../model';
import type { DetailToggles } from '../state';
import type { Theme } from '../theme';

import { defaultColorAccessor, type ColorAccessor } from './colorAccessor';
import { DdSpanRow } from './DdSpanRow';
import type { DetailStubs } from './detailStubs';

export interface DatadogSkinOptions {
  theme: Theme;
  trace: Trace;
  /** 自定义着色（默认 service 维度）。 */
  colorAccessor?: ColorAccessor;
  /** 详情子分组 toggle（trace 级回调，闭包注入详情卡；Story 3.2）。 */
  detailToggles?: DetailToggles;
  /** 深耦合功能注入回调（火焰图/分享/链接；Story 5.4）。 */
  detailStubs?: DetailStubs;
  /** 当前选中 span（选中行高亮；Story 5.5）。 */
  selectedSpanId?: string;
  /** 点击行内准星（Story 9.4 / B）。不传 → 准星不渲染。 */
  onFocusSpan?: (spanID: string) => void;
  focusedRootSpanId?: string;
  onUnfocusSpan?: () => void;
}

export function createDatadogRowRenderer(opts: DatadogSkinOptions): RowRenderer {
  const { theme, trace, detailToggles, detailStubs, selectedSpanId, onFocusSpan } = opts;
  const colorAccessor = opts.colorAccessor ?? defaultColorAccessor(theme);
  // spanID → 服务色，供缩进竖线解析祖先色（core 只给 ancestorSpanIds，AD-6）。
  const spanMap = new Map(trace.spans.map((s) => [s.spanID, s]));
  const colorForSpanId = (id: string): string => {
    const s = spanMap.get(id);
    return s ? colorAccessor(s) : 'transparent';
  };
  return (row) => (
    <DdSpanRow
      key={row.span.spanID}
      row={row}
      colorAccessor={colorAccessor}
      colorForSpanId={colorForSpanId}
      detailToggles={detailToggles}
      detailStubs={detailStubs}
      isSelected={selectedSpanId != null && row.span.spanID === selectedSpanId}
      onFocusSpan={onFocusSpan}
      isFocusRoot={row.span.spanID === opts.focusedRootSpanId}
      onUnfocusSpan={opts.onUnfocusSpan}
      traceDuration={trace.duration}
    />
  );
}
