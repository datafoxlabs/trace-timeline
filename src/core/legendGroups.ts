// 火焰图服务图例分组聚合（Story 7.1）——纯数据，零颜色/零皮肤（AD-2）。
// 把 trace 按维度（v1=service）分组，给出每组的 self/exec-time 与 span 计数，按所选指标降序。
// exec-time 口径 = self time（span 时长扣除子 span 覆盖区间的并集），所有 span self-time 之和 = 根时长，
// 故按服务分组即对总执行时间做不重叠的 100% 划分（对齐 Datadog Flame Graph 图例「% Exec Time」）。
import memoizeOne from 'memoize-one';

import { getServiceColorKey, getServiceDisplayName, type Trace, type TraceSpan } from '../model';

export type LegendDimension = 'service' | 'host' | 'entity';
export type LegendMetric = 'execTime' | 'spans';

/** 在 span.tags / process.tags 里找首个命中 key 的值（字符串化）。 */
function findTagValue(span: TraceSpan, keys: string[]): string | undefined {
  for (const k of keys) {
    const t = span.tags?.find((x) => x.key === k);
    if (t != null && t.value != null && `${t.value}` !== '') {
      return `${t.value}`;
    }
    const pt = span.process?.tags?.find((x) => x.key === k);
    if (pt != null && pt.value != null && `${pt.value}` !== '') {
      return `${pt.value}`;
    }
  }
  return undefined;
}

/**
 * span 是否为「推断」下游依赖（db / 外部 peer / 消息 / rpc 客户端）——Entity Type 维度标 (inferred)。
 * Story 10.3：火焰图给这类 span 画空心 + 服务色虚线条,与图例 `(inferred)` 后缀**同判定源**。
 */
export function isInferredEntity(span: TraceSpan): boolean {
  return (
    findTagValue(span, ['db.system', 'db.type', 'peer.service', 'messaging.system', 'rpc.system']) != null
  );
}

/**
 * span → 分组 key（着色/匹配同口径）。对应 Datadog Color by 的 colorByAttr：
 * service=service / host=hostname / entity=inferred.catalog。
 */
export function dimensionKeyFor(span: TraceSpan, dimension: LegendDimension): string {
  if (dimension === 'host') {
    return findTagValue(span, ['host', 'hostname', 'host.name', 'net.host.name', 'http.host']) ?? 'unknown host';
  }
  if (dimension === 'entity') {
    const svc = getServiceDisplayName(span.process);
    return isInferredEntity(span) ? `${svc} (inferred)` : svc;
  }
  return getServiceColorKey(span.process);
}

/** span → 分组展示名（service 维度含 namespace；host/entity 即 key）。 */
export function dimensionLabelFor(span: TraceSpan, dimension: LegendDimension): string {
  if (dimension === 'service') {
    return getServiceDisplayName(span.process);
  }
  return dimensionKeyFor(span, dimension);
}

export interface LegendGroup {
  /** 分组 key（着色/匹配用，= 服务配色 key）。 */
  key: string;
  /** 展示名。 */
  label: string;
  /** 组内 span 数。 */
  spanCount: number;
  /** 组内 self/exec time 合计（µs）。 */
  execTime: number;
  /** execTime / 总 exec time，[0,1]。 */
  execTimeRatio: number;
  /** 按所选指标的占比 [0,1]（execTime → execTimeRatio；spans → spanCount/总 span 数）。 */
  ratio: number;
  /** 代表 span（presentation 用 colorAccessor 取组色，确保与火焰图帧同源）。 */
  representativeSpanId: string;
}

export interface LegendOptions {
  dimension?: LegendDimension;
  metric?: LegendMetric;
}

/** span 的 self time = duration − 子 span 区间并集（裁剪到本 span）长度。兄弟重叠按并集计，避免重复扣除。 */
function selfTime(span: TraceSpan, byId: Map<string, TraceSpan>): number {
  const spanStart = span.startTime;
  const spanEnd = span.startTime + span.duration;
  // 收集直接子的 [start,end]，裁剪到本 span 区间。
  const intervals: Array<[number, number]> = [];
  for (const childId of span.childSpanIds) {
    const child = byId.get(childId);
    if (!child) {
      continue;
    }
    const s = Math.max(child.startTime, spanStart);
    const e = Math.min(child.startTime + child.duration, spanEnd);
    if (e > s) {
      intervals.push([s, e]);
    }
  }
  if (!intervals.length) {
    return Math.max(span.duration, 0);
  }
  // 区间并集长度。
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let curS = intervals[0][0];
  let curE = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s > curE) {
      covered += curE - curS;
      curS = s;
      curE = e;
    } else if (e > curE) {
      curE = e;
    }
  }
  covered += curE - curS;
  return Math.max(span.duration - covered, 0);
}

function compute(trace: Trace, dimension: LegendDimension, metric: LegendMetric): LegendGroup[] {
  const spans = trace.spans;
  const byId = new Map(spans.map((s) => [s.spanID, s]));
  // 维度 → 分组 key/label（service / host / entity，Story 7.3）。
  const keyOf = (s: TraceSpan) => dimensionKeyFor(s, dimension);
  const labelOf = (s: TraceSpan) => dimensionLabelFor(s, dimension);

  interface Acc {
    key: string;
    label: string;
    spanCount: number;
    execTime: number;
    representativeSpanId: string;
  }
  const groups = new Map<string, Acc>();
  let totalExec = 0;
  for (const span of spans) {
    const self = selfTime(span, byId);
    totalExec += self;
    const k = keyOf(span);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, label: labelOf(span), spanCount: 0, execTime: 0, representativeSpanId: span.spanID };
      groups.set(k, g);
    }
    g.spanCount += 1;
    g.execTime += self;
  }

  const totalSpans = spans.length || 1;
  const execDenom = totalExec || 1;
  const out: LegendGroup[] = [...groups.values()].map((g) => {
    const execTimeRatio = g.execTime / execDenom;
    const ratio = metric === 'spans' ? g.spanCount / totalSpans : execTimeRatio;
    return { ...g, execTimeRatio, ratio };
  });
  // 按所选指标降序；同值按 label 稳定排序。
  out.sort((a, b) => {
    const av = metric === 'spans' ? a.spanCount : a.execTime;
    const bv = metric === 'spans' ? b.spanCount : b.execTime;
    return bv - av || a.label.localeCompare(b.label);
  });
  return out;
}

// 按基本类型 memoize（trace, dimension, metric）——避免 opts 对象字面量每渲染换引用而废 memo（M3 教训）。
const computeMemo = memoizeOne((trace: Trace, dimension: LegendDimension, metric: LegendMetric) =>
  compute(trace, dimension, metric)
);

/**
 * 计算火焰图图例分组（按维度聚合 + 指标排序）。纯函数；相同 (trace, dimension, metric) 返回同一结果。
 */
export function computeLegendGroups(trace: Trace, opts: LegendOptions = {}): LegendGroup[] {
  return computeMemo(trace, opts.dimension ?? 'service', opts.metric ?? 'execTime');
}
