// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// 移植自 grafana TraceView/components/model/transform-trace-data.tsx。
// 变更：@grafana/data 类型→本地；去 get-config（default-config 无 topTagPrefixes，orderTags 传 []）。
import _isEqual from 'lodash/isEqual.js';

import { getTraceName } from './get-trace-name';
import { getServiceDisplayName } from './service-name';
import { getTraceSpanIdsAsTree } from './trace-tree';
import type TreeNode from './tree-node';
import type { TraceKeyValuePair } from './grafana-types';
import type { Trace, TraceProcess, TraceResponse, TraceSpan } from './types';

// exported for tests
export function deduplicateTags(tags: TraceKeyValuePair[]) {
  const warningsHash: Map<string, string> = new Map<string, string>();
  const dedupedTags: TraceKeyValuePair[] = tags.reduce<TraceKeyValuePair[]>((uniqueTags, tag) => {
    if (!uniqueTags.some((t) => t.key === tag.key && t.value === tag.value)) {
      uniqueTags.push(tag);
    } else {
      warningsHash.set(`${tag.key}:${tag.value}`, `Duplicate tag "${tag.key}:${tag.value}"`);
    }
    return uniqueTags;
  }, []);
  const warnings = Array.from(warningsHash.values());
  return { dedupedTags, warnings };
}

// exported for tests
export function orderTags(tags: TraceKeyValuePair[], topPrefixes?: string[]) {
  const orderedTags: TraceKeyValuePair[] = tags?.slice() ?? [];
  const tp = (topPrefixes || []).map((p: string) => p.toLowerCase());

  orderedTags.sort((a, b) => {
    const aKey = a.key.toLowerCase();
    const bKey = b.key.toLowerCase();

    for (let i = 0; i < tp.length; i++) {
      const p = tp[i];
      if (aKey.startsWith(p) && !bKey.startsWith(p)) {
        return -1;
      }
      if (!aKey.startsWith(p) && bKey.startsWith(p)) {
        return 1;
      }
    }
    if (aKey > bKey) {
      return 1;
    }
    if (aKey < bKey) {
      return -1;
    }
    return 0;
  });

  return orderedTags;
}

/**
 * 每个树节点的**子孙总数**（= subtree size − 1）。
 *
 * 真页 Datadog waterfall 行首那个灰色数字用的是这个量，**不是**直接子节点数
 * （实测 `6a505e15…` 21 span：根显示 `20`；`TraceScenarioController.complex` 直接子节点 8 个、显示 `16`）。
 *
 * 单次 DFS 收集顺序 + 逆序累加，O(n)。**勿改成对每个节点调 `TreeNode.size`** —— 那个 getter 自身要 walk 整棵子树，
 * 逐节点调用会退化成 O(n²)。以节点对象（而非 `value`）为键：`transformTraceData` 会给重复 spanID 改名，
 * 但树是按改名后的 id 建的，用对象做键可彻底规避同名碰撞。
 */
function computeDescendantCounts(tree: TreeNode<string>): Map<TreeNode<string>, number> {
  const order: Array<TreeNode<string>> = [];
  const stack: Array<TreeNode<string>> = [tree];
  while (stack.length) {
    const node = stack.pop()!;
    order.push(node);
    for (const child of node.children) {
      stack.push(child);
    }
  }
  // `order` 是先序（父恒在子之前）⇒ 逆序遍历即后序，子节点的计数必已就绪。
  const counts = new Map<TreeNode<string>, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    let total = 0;
    for (const child of node.children) {
      total += 1 + counts.get(child)!;
    }
    counts.set(node, total);
  }
  return counts;
}

/**
 * NOTE: Mutates `data` —— 把 HTTP 响应数据转成 app 需要的派生 Trace。
 */
export default function transformTraceData(data: TraceResponse | undefined): Trace | null {
  if (!data?.traceID) {
    return null;
  }
  const traceID = data.traceID.toLowerCase();

  let traceEndTime = 0;
  let traceStartTime = Number.MAX_SAFE_INTEGER;
  const spanIdCounts = new Map<string, number>();
  const spanMap = new Map<string, TraceSpan>();
  // 过滤掉 startTime 为空的 span
  data.spans = data.spans.filter((span) => Boolean(span.startTime));

  // 排序 process tags
  data.processes = Object.entries(data.processes).reduce<Record<string, TraceProcess>>(
    (processes, [id, process]) => {
      processes[id] = { ...process, tags: orderTags(process.tags) };
      return processes;
    },
    {}
  );

  const max = data.spans.length;
  for (let i = 0; i < max; i++) {
    const span = data.spans[i] as TraceSpan;
    const { startTime, duration, processID } = span;

    let spanID = span.spanID;
    if (startTime < traceStartTime) {
      traceStartTime = startTime;
    }
    if (startTime + duration > traceEndTime) {
      traceEndTime = startTime + duration;
    }
    const idCount = spanIdCounts.get(spanID);
    if (idCount != null) {
      // eslint-disable-next-line no-console
      console.warn(`Dupe spanID, ${idCount + 1} x ${spanID}`, span, spanMap.get(spanID));
      if (_isEqual(span, spanMap.get(spanID))) {
        // eslint-disable-next-line no-console
        console.warn('\t two spans with same ID have `isEqual(...) === true`');
      }
      spanIdCounts.set(spanID, idCount + 1);
      spanID = `${spanID}_${idCount}`;
      span.spanID = spanID;
    } else {
      spanIdCounts.set(spanID, 1);
    }
    span.process = data.processes[processID];
    spanMap.set(spanID, span);
  }

  // 用树排序，让子 span 跟在父后、兄弟按 startTime 排
  const tree = getTraceSpanIdsAsTree(data, spanMap);
  const descendantCounts = computeDescendantCounts(tree);
  const spans: TraceSpan[] = [];
  const svcCounts: Record<string, number> = {};

  tree.walk((spanID: string, node: TreeNode<string>, depth = 0) => {
    if (spanID === '__root__') {
      return;
    }
    if (typeof spanID !== 'string') {
      return;
    }
    const span = spanMap.get(spanID);
    if (!span) {
      return;
    }
    const svcKey = getServiceDisplayName(span.process);
    svcCounts[svcKey] = (svcCounts[svcKey] || 0) + 1;
    span.relativeStartTime = span.startTime - traceStartTime;
    span.depth = depth - 1;
    span.hasChildren = node.children.length > 0;
    span.childSpanCount = node.children.length;
    // 真页行首徽标显示的是**子孙总数**，不是直接子节点数。两者在小树上常常相等，别当成同一个量。
    span.descendantSpanCount = descendantCounts.get(node) ?? 0;
    span.warnings = span.warnings || [];
    span.tags = span.tags || [];
    span.references = span.references || [];

    span.childSpanIds = node.children
      .slice()
      .sort((a, b) => {
        const spanA = spanMap.get(a.value)!;
        const spanB = spanMap.get(b.value)!;
        return spanB.startTime + spanB.duration - (spanA.startTime + spanA.duration);
      })
      .map((each) => each.value);

    const tagsInfo = deduplicateTags(span.tags);
    span.tags = orderTags(tagsInfo.dedupedTags, []);
    span.warnings = span.warnings.concat(tagsInfo.warnings);
    span.references.forEach((ref, index) => {
      const refSpan = spanMap.get(ref.spanID);
      if (refSpan) {
        ref.span = refSpan;
        if (index > 0) {
          // 不计父，仅其它 references
          refSpan.subsidiarilyReferencedBy = refSpan.subsidiarilyReferencedBy || [];
          refSpan.subsidiarilyReferencedBy.push({ spanID, traceID, span, refType: ref.refType });
        }
      }
    });
    spans.push(span);
  });

  const traceName = getTraceName(spans);
  const services = Object.keys(svcCounts).map((name) => ({ name, numberOfSpans: svcCounts[name] }));
  return {
    services,
    spans,
    traceID,
    traceName,
    processes: data.processes,
    duration: traceEndTime - traceStartTime,
    startTime: traceStartTime,
    endTime: traceEndTime,
  };
}
