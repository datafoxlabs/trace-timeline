// Trace 火焰图布局引擎（Story 6.1 / 6.7）——纯几何数据，零颜色/零皮肤（AD-2）。
// 复用 createViewedBoundsFunc（与瀑布同源的线性时间→[0,1] 映射）；火焰图与瀑布共用同一套
// 时间数学，差异只在 y 轴用 depth 而非行序。详见 investigations/datadog-trace-flamegraph-layout。
// 6.7：focusRootSpanId → re-root（只取子树 + depth 重基 + 时间映射到 root 区间）。
import memoizeOne from 'memoize-one';

import type { Trace } from '../model';

import { createViewedBoundsFunc } from './utils';

/** 单个 span 在火焰图中的几何：depth 决定行（y=depth×rowHeight 由皮肤换算），left/width ∈ [0,1] 为时间占位。 */
export interface FlameLayoutRow {
  spanID: string;
  depth: number;
  /** 左缘相对位置 [0,1]（当前缩放视口内）。 */
  left: number;
  /** 宽度相对值 [0,1]。 */
  width: number;
}

/** 火焰图整体布局：行数据 + 最大深度（皮肤据此算容器高）。 */
export interface FlameLayout {
  rows: FlameLayoutRow[];
  maxDepth: number;
}

export interface FlameViewRange {
  /** 缩放起点 [0,1]，相对当前坐标系（全 trace 或 focus 子树）。默认 0。 */
  viewStart: number;
  /** 缩放终点 [0,1]。默认 1。 */
  viewEnd: number;
}

const FULL_RANGE: FlameViewRange = { viewStart: 0, viewEnd: 1 };

/**
 * 取焦点 span 的子树 ID 集（含自身）。依赖 transform-trace-data 的 DFS 顺序（子紧跟父）：
 * 子树 = 焦点 index 起、后续 depth>rootDepth 的连续段。健壮，不依赖 references.span。
 */
export function getFlameSubtreeIds(trace: Trace, rootSpanId: string): Set<string> {
  const spans = trace.spans;
  const i = spans.findIndex((s) => s.spanID === rootSpanId);
  const ids = new Set<string>();
  if (i < 0) {
    return ids;
  }
  const rootDepth = spans[i].depth;
  ids.add(rootSpanId);
  for (let j = i + 1; j < spans.length && spans[j].depth > rootDepth; j++) {
    ids.add(spans[j].spanID);
  }
  return ids;
}

function compute(trace: Trace, viewRange: FlameViewRange, focusRootSpanId: string | undefined): FlameLayout {
  let spans = trace.spans;
  let baseDepth = 0;
  let min = trace.startTime;
  let max = trace.startTime + trace.duration;

  if (focusRootSpanId) {
    const root = trace.spans.find((s) => s.spanID === focusRootSpanId);
    if (root) {
      const ids = getFlameSubtreeIds(trace, focusRootSpanId);
      spans = trace.spans.filter((s) => ids.has(s.spanID));
      baseDepth = root.depth;
      min = root.startTime;
      max = root.startTime + root.duration;
    }
  }

  // 退化区间（min>=max，如 trace.duration=0 / focus 根瞬时）→ viewWindow=0 会产 NaN/Infinity；短路防护（M1）。
  const degenerate = max - min <= 0;
  const fn = createViewedBoundsFunc({ min, max, viewStart: viewRange.viewStart, viewEnd: viewRange.viewEnd });
  const safe = (v: number) => (Number.isFinite(v) ? v : 0);
  // Tree depth is a minimum lane, not a collision policy. Concurrent siblings and
  // missing-parent roots must remain individually visible. Preorder preserves the
  // parent lane; interval insertion also handles roots starting earlier in time.
  const lanes: Array<Array<[number, number]>> = [];
  const ancestors: number[] = [];
  let maxDepth = 0;
  const rows: FlameLayoutRow[] = spans.map((span) => {
    const treeDepth = span.depth - baseDepth;
    const startTime = span.startTime;
    const endTime = startTime + span.duration;
    let depth = treeDepth === 0 ? 0 : ancestors[treeDepth - 1] + 1;
    for (;; depth++) {
      const intervals = lanes[depth] ?? (lanes[depth] = []);
      let lo = 0;
      let hi = intervals.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (intervals[mid][0] < startTime) lo = mid + 1;
        else hi = mid;
      }
      if ((lo > 0 && intervals[lo - 1][1] > startTime) ||
          (lo < intervals.length && intervals[lo][0] < endTime)) continue;
      intervals.splice(lo, 0, [startTime, endTime]);
      break;
    }
    ancestors[treeDepth] = depth;
    ancestors.length = treeDepth + 1;
    if (depth > maxDepth) {
      maxDepth = depth;
    }
    if (degenerate) {
      return { spanID: span.spanID, depth, left: 0, width: 0 };
    }
    const { start, end } = fn(span.startTime, span.startTime + span.duration);
    return { spanID: span.spanID, depth, left: safe(start), width: safe(end - start) };
  });
  return { rows, maxDepth };
}

/**
 * 计算 trace 火焰图布局：每个 span → { spanID, depth, left, width }。
 * Preserve parent-before-child lanes and allocate extra lanes for overlapping intervals.
 * focusRootSpanId（6.7）：re-root → 只取子树 + depth 重基 + 时间映射到 root 区间（root 铺满）。
 * memoize：相同 (trace, viewRange, focusRootSpanId) 返回同一结果。
 */
export const computeFlameLayout: (
  trace: Trace,
  viewRange?: FlameViewRange,
  focusRootSpanId?: string
) => FlameLayout = memoizeOne((trace: Trace, viewRange: FlameViewRange = FULL_RANGE, focusRootSpanId?: string) =>
  compute(trace, viewRange, focusRootSpanId)
);
