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
// 移植自 grafana TraceView/components/utils/date.tsx。变更：moment → dayjs；
// formatMillisecond/SecondTime 的 moment.duration(x).asXxx() 即恒等，改普通算术。
import { formatNumber } from '@datafox/ui';
import dayjs from 'dayjs';
import _dropWhile from 'lodash/dropWhile.js';
import _round from 'lodash/round.js';

import { toFloatPrecision } from './number';

export const STANDARD_DATE_FORMAT = 'YYYY-MM-DD';
export const STANDARD_TIME_FORMAT = 'HH:mm';
export const ONE_MILLISECOND = 1000;
export const ONE_SECOND = 1000 * ONE_MILLISECOND;
export const ONE_MINUTE = 60 * ONE_SECOND;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const DEFAULT_MS_PRECISION = Math.log10(ONE_MILLISECOND);

const UNIT_STEPS: Array<{ unit: string; microseconds: number; ofPrevious: number }> = [
  { unit: 'd', microseconds: ONE_DAY, ofPrevious: 24 },
  { unit: 'h', microseconds: ONE_HOUR, ofPrevious: 60 },
  { unit: 'm', microseconds: ONE_MINUTE, ofPrevious: 60 },
  { unit: 's', microseconds: ONE_SECOND, ofPrevious: 1000 },
  { unit: 'ms', microseconds: ONE_MILLISECOND, ofPrevious: 1000 },
  { unit: 'μs', microseconds: 1, ofPrevious: 1000 },
];

const quantizeDuration = (duration: number, floatPrecision: number, conversionFactor: number) =>
  toFloatPrecision(duration / conversionFactor, floatPrecision) * conversionFactor;

/** @param duration 微秒 → YYYY-MM-DD */
export function formatDate(duration: number) {
  return dayjs(duration / ONE_MILLISECOND).format(STANDARD_DATE_FORMAT);
}

/** @param duration 微秒 → HH:mm */
export function formatTime(duration: number) {
  return dayjs(duration / ONE_MILLISECOND).format(STANDARD_TIME_FORMAT);
}

/** @param duration 微秒 → `<n>ms` */
export function formatMillisecondTime(duration: number) {
  const targetDuration = quantizeDuration(duration, DEFAULT_MS_PRECISION, ONE_MILLISECOND);
  return `${targetDuration / ONE_MILLISECOND}ms`;
}

/** @param duration 微秒 → `<n>s` */
export function formatSecondTime(duration: number) {
  const targetDuration = quantizeDuration(duration, DEFAULT_MS_PRECISION, ONE_SECOND);
  return `${targetDuration / ONE_SECOND}s`;
}

/**
 * 人类可读耗时（输入微秒）。
 * 5000ms => 5s；1000μs => 1ms；183840s => 2d 3h
 */
export function formatDuration(duration: number): string {
  const [primaryUnit, secondaryUnit] = _dropWhile(
    UNIT_STEPS,
    ({ microseconds }, index) => index < UNIT_STEPS.length - 1 && microseconds > duration
  );

  if (primaryUnit.ofPrevious === 1000) {
    return `${_round(duration / primaryUnit.microseconds, 2)}${primaryUnit.unit}`;
  }

  let primaryValue = Math.floor(duration / primaryUnit.microseconds);
  let secondaryValue = (duration / secondaryUnit.microseconds) % primaryUnit.ofPrevious;
  const secondaryValueRounded = Math.round(secondaryValue);

  if (secondaryValueRounded === primaryUnit.ofPrevious) {
    primaryValue += 1;
    secondaryValue = 0;
  } else {
    secondaryValue = secondaryValueRounded;
  }

  const primaryUnitString = `${primaryValue}${primaryUnit.unit}`;
  if (secondaryValue === 0) {
    return primaryUnitString;
  }
  const secondaryUnitString = `${secondaryValue}${secondaryUnit.unit}`;
  return `${primaryUnitString} ${secondaryUnitString}`;
}

/**
 * 行内 span 时长（DRUIDS 3 位有效数字：`54.1ms` / `28.9ms` / `8.26ms`）。
 *
 * 直接消费 datafox `formatNumber(type:'duration')`（DRUIDS measures 反编译真值），本仓**不复刻**格式逻辑。
 * datafox 期望**纳秒**、本仓模型是**微秒** → ×1000。
 * 非有限值（NaN/Infinity，或 ×1000 溢出）→ 返回空串（不吐 `NaNd NaNh` 之类垃圾；`formatDuration` 对非有限同样吐垃圾，不能兜底）。
 *
 * ⚠ 刻度轴标签**不**走这里，仍用本地 `formatDuration`：datafox 会把整刻度补零成 `5.00ms`，
 * 而真页轴是干净的 `5 ms`（见 `DdTicks` 的 `formatAxisTick` 注释）——真页本就是「轴 vs 行内」两套格式，
 * 本仓两个 formatter 各对一套。此为「datafox 不适用 → 保留自实现」的刻意分流。
 */
export function formatSpanDuration(microseconds: number): string {
  if (!Number.isFinite(microseconds)) {
    return '';
  }
  return formatNumber(microseconds * 1000, { type: 'duration' }) ?? '';
}
