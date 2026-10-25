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
// 移植自 TraceTimelineViewer/utils.tsx；零 @grafana 耦合，仅依赖 model 类型。
// 新增 getHttpStatusCode（FR-26 状态 pill 数据）与 PEER_SERVICE 常量（原 constants/tag-keys）。

import type { TraceSpan } from '../model';

/** 原 ../constants/tag-keys 中的 PEER_SERVICE。 */
export const PEER_SERVICE = 'peer.service';

export type ViewedBoundsFunctionType = (start: number, end: number) => { start: number; end: number };
/**
 * Given a range (`min`, `max`) and factoring in a zoom (`viewStart`, `viewEnd`)
 * a function is created that will find the position of a sub-range (`start`, `end`).
 * The calling the generated method will return the result as a `{ start, end }`
 * object with values ranging in [0, 1].
 *
 * @param  {number} min       The start of the outer range.
 * @param  {number} max       The end of the outer range.
 * @param  {number} viewStart The start of the zoom, on a range of [0, 1],
 *                            relative to the `min`, `max`.
 * @param  {number} viewEnd   The end of the zoom, on a range of [0, 1],
 *                            relative to the `min`, `max`.
 * @returns {(number, number) => Object} Created view bounds function
 */
export function createViewedBoundsFunc(viewRange: { min: number; max: number; viewStart: number; viewEnd: number }) {
  const { min, max, viewStart, viewEnd } = viewRange;
  const duration = max - min;
  const viewMin = min + viewStart * duration;
  const viewMax = max - (1 - viewEnd) * duration;
  const viewWindow = viewMax - viewMin;

  /**
   * View bounds function
   * @param  {number} start     The start of the sub-range.
   * @param  {number} end       The end of the sub-range.
   * @returns {Object}           The resultant range.
   */
  return (start: number, end: number) => ({
    start: (start - viewMin) / viewWindow,
    end: (end - viewMin) / viewWindow,
  });
}

/**
 * Returns `true` if the `span` has a tag matching `key` = `value`.
 *
 * @param  {string} key         The tag key to match on.
 * @param  {any}    value       The tag value to match.
 * @param  {{tag}} span         An object with a `tag` property of { key, value } items.
 * @returns {boolean}           True if a match was found.
 */
export function spanHasTag(key: string, value: unknown, span: TraceSpan) {
  if (!Array.isArray(span.tags) || !span.tags.length) {
    return false;
  }
  return span.tags.some((tag) => tag.key === key && tag.value === value);
}

const isClientOtel = (span: TraceSpan) => span.kind === 'client';
const isClient = spanHasTag.bind(null, 'span.kind', 'client');
export const isClientSpan = (span: TraceSpan) => isClientOtel(span) || isClient(span);
const isServerOtel = (span: TraceSpan) => span.kind === 'server';
const isServer = spanHasTag.bind(null, 'span.kind', 'server');
export const isServerSpan = (span: TraceSpan) => isServerOtel(span) || isServer(span);

/** OTel Span Status is authoritative; attributes and HTTP codes do not override it. */
export const isErrorSpan = (span: TraceSpan) => span.statusCode === 2;

/**
 * Returns `true` if at least one of the descendants of the `parentSpanIndex`
 * span has OTel Error status.
 *
 * @param      {TraceSpan[]}   spans            The spans for a trace - should be
 *                                         sorted with children following parents.
 * @param      {number}   parentSpanIndex  The index of the parent span - only
 *                                         subsequent spans with depth less than
 *                                         the parent span will be checked.
 * @returns     {boolean}  Returns `true` if a descendant has OTel Error status.
 */
export function spanContainsErredSpan(spans: TraceSpan[], parentSpanIndex: number) {
  const { depth } = spans[parentSpanIndex];
  let i = parentSpanIndex + 1;
  for (; i < spans.length && spans[i].depth > depth; i++) {
    if (isErrorSpan(spans[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Expects the first span to be the parent span.
 */
export function findServerChildSpan(spans: TraceSpan[]) {
  if (spans.length <= 1 || !isClientSpan(spans[0])) {
    return false;
  }
  const span = spans[0];
  const spanChildDepth = span.depth + 1;
  let i = 1;
  while (i < spans.length && spans[i].depth === spanChildDepth) {
    if (isServerSpan(spans[i])) {
      return spans[i];
    }
    i++;
  }
  return null;
}

export const isKindClient = (span: TraceSpan): boolean => {
  if (span.kind) {
    return span.kind === 'client';
  }
  return span.tags.some(({ key, value }) => key === 'span.kind' && value === 'client');
};

/**
 * 从 span tags 提取 HTTP 状态码（FR-26 状态 pill）。
 * 兼容 OTel 语义约定 http.response.status_code（新）与 http.status_code（旧）。
 * 仅做数据提取，颜色映射在 presentation（AD-6）。
 */
export function getHttpStatusCode(span: TraceSpan): number | undefined {
  if (!Array.isArray(span.tags) || !span.tags.length) {
    return undefined;
  }
  const kv = span.tags.find((t) => t.key === 'http.response.status_code' || t.key === 'http.status_code');
  if (!kv) {
    return undefined;
  }
  const n = typeof kv.value === 'number' ? kv.value : Number(kv.value);
  return Number.isFinite(n) ? n : undefined;
}
