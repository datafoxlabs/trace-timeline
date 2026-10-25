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
// 移植自 grafana TraceView/components/types/trace.ts；@grafana/data 类型换成本地 grafana-types。
import type { TraceKeyValuePair, TraceLog } from './grafana-types';

/** All timestamps are in microseconds */

export type TraceLink = {
  url: string;
  text: string;
};

export type TraceProcess = {
  serviceName: string;
  serviceNamespace?: string;
  tags: TraceKeyValuePair[];
};

export type TraceSpanReference = {
  refType: 'CHILD_OF' | 'FOLLOWS_FROM' | 'EXTERNAL';
  // eslint-disable-next-line no-use-before-define
  span?: TraceSpan | null | undefined;
  spanID: string;
  traceID: string;
  tags?: TraceKeyValuePair[];
};

export type TraceSpanData = {
  spanID: string;
  traceID: string;
  processID: string;
  operationName: string;
  // Times are in microseconds
  startTime: number;
  duration: number;
  logs: TraceLog[];
  tags?: TraceKeyValuePair[];
  /** Original attributes, before presentation metadata is appended to tags. */
  rawSpanAttributes?: TraceKeyValuePair[];
  rawResourceAttributes?: TraceKeyValuePair[];
  kind?: string;
  statusCode?: number;
  statusMessage?: string;
  instrumentationLibraryName?: string;
  instrumentationLibraryVersion?: string;
  traceState?: string;
  references?: TraceSpanReference[];
  warnings?: string[] | null;
  stackTraces?: string[];
  flags: number;
  errorIconColor?: string;
  dataFrameRowIndex?: number;
  childSpanIds?: string[];
};

export type TraceSpan = TraceSpanData & {
  depth: number;
  hasChildren: boolean;
  /**
   * **直接子节点数**（`node.children.length`）。Jaeger / Grafana 上游同名字段的同一语义，
   * 与 `hasChildren` 天然成对。**不要**把它改成子孙总数——见 `descendantSpanCount`。
   */
  childSpanCount: number;
  /**
   * **子孙总数**（= subtree size − 1）。真页 Datadog waterfall 行首那个灰色数字用的是这个。
   *
   * 与 `childSpanCount` 在小树上常常相等，别被骗了。真页实测（`6a505e15…`，21 span）：
   * 根行显示 `20`（= 21 − 1）；`TraceScenarioController.complex` 显示 `16`，
   * 而它的直接子节点只有 8 个。第二例（`6a4eff6d…`，6 span）：`HelloController.create`
   * 直接子节点 2 个（`redis SET` / `GET /order`），显示 `4`。
   */
  descendantSpanCount: number;
  process: TraceProcess;
  relativeStartTime: number;
  tags: NonNullable<TraceSpanData['tags']>;
  references: NonNullable<TraceSpanData['references']>;
  warnings: NonNullable<TraceSpanData['warnings']>;
  childSpanIds: NonNullable<TraceSpanData['childSpanIds']>;
  subsidiarilyReferencedBy: TraceSpanReference[];
};

export type TraceData = {
  processes: Record<string, TraceProcess>;
  traceID: string;
  warnings?: string[] | null;
};

export type TraceResponse = TraceData & {
  spans: TraceSpanData[];
};

export type Trace = TraceData & {
  duration: number;
  endTime: number;
  spans: TraceSpan[];
  startTime: number;
  traceName: string;
  services: Array<{ name: string; numberOfSpans: number }>;
};

/** A section of span that lies on the critical path */
export type CriticalPathSection = {
  spanId: string;
  section_start: number;
  section_end: number;
};

export type { TraceKeyValuePair, TraceLog };
