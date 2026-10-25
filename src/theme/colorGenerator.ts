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
// 移植自 grafana TraceView color-generator。Story 10.12 重构——服务色 = 服务名**纯哈希**映射到
// Datadog 20 色板：同名恒同色、**与请求顺序/服务集合无关（稳定）**，且均匀铺满整板（稀疏、不挤色）。
//
// 修两处旧缺陷（是「颜色集中在深紫/蓝一隅」的根因，实测 12 服务只落 6 色、8 个是紫）：
//   (1) 原 `getFilteredColors` 按「与背景对比度 ≥3」过滤色板，把近半个**亮色**删光（20→11：橙/黄/青/浅紫/浅绿）。
//       但服务色是**填充色**（其上另按 YIQ 感知亮度绘深/浅字，Story 10.7），非背景上的文字，不该按背景对比度筛。
//       → 去掉该过滤，用满 20 色。
//   (2) 原 `_getColorIndex` 用 `prevColorIndex + readability` 避相邻相似，但**依赖请求顺序** → 破坏稳定性
//       （同名在不同 trace/顺序里可能换色），且在缩水色板上进一步逼同色。 → 去掉，纯哈希定色。
//
// 权衡（知情）：固定 20 色 + 稳定（每名定色）下，碰撞由生日悖论决定（>~6 服务即可能有个别撞色），不可能既
//   保证「稳定」又「所有服务都不撞色」（后者须按服务集合动态分配 → 破坏稳定）。本实现用强分布哈希把撞色降到
//   最低、并把颜色均匀撒满整板（实测 12 服务 → 10 色 / 覆盖 8 个色相桶，原为 6 色 / 6 桶）。
import memoizeOne from 'memoize-one';

import type { Theme } from './types';

function strToRgb(s: string): [number, number, number] {
  if (s.length !== 7) {
    return [0, 0, 0];
  }
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5), 16)];
}

// djb2 / Java String.hashCode（h*31 + c），收敛到 32 位有符号（`| 0`）——确定、无长键 float64 漂移。
// 对短串 / 共前缀服务名（demo-service-*）实测分布良好（末尾差异经滚动哈希充分扩散）。
function hashCode(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return hash;
}

class ColorGenerator {
  colorsHex: string[];
  colorsRgb: Array<[number, number, number]>;
  cache: Map<string, number>;

  constructor(colorsHex: string[]) {
    this.colorsHex = getFilteredColors(colorsHex);
    this.colorsRgb = this.colorsHex.map(strToRgb);
    this.cache = new Map();
  }

  // 纯哈希 → 定色：同 key 恒同 index，与请求顺序/服务集合无关（稳定）。cache 仅省重复计算。
  _getColorIndex(key: string): number {
    let i = this.cache.get(key);
    if (i == null) {
      i = Math.abs(hashCode(key ? key.toLowerCase() : '') % this.colorsHex.length);
      this.cache.set(key, i);
    }
    return i;
  }

  /** 给任意 key 分配颜色；同 key 同色。 */
  getColorByKey(key: string): string {
    return this.colorsHex[this._getColorIndex(key)];
  }

  getRgbColorByKey(key: string): [number, number, number] {
    return this.colorsRgb[this._getColorIndex(key)];
  }

  clear() {
    this.cache.clear();
  }
}

const getGenerator = memoizeOne((colors: string[]) => new ColorGenerator(colors));

export function getColorByKey(key: string, theme: Theme): string {
  return getGenerator(theme.trace.categoricalPalette).getColorByKey(key);
}

export function getRgbColorByKey(key: string, theme: Theme): [number, number, number] {
  return getGenerator(theme.trace.categoricalPalette).getRgbColorByKey(key);
}

/**
 * 仅剔除明显的「错误红」（若自定义色板含之，避免服务被染成像错误态）。默认 Datadog 20 色板不含这两红，
 * 即原样返回 20 色。**不再按背景对比度过滤**（服务色是填充色，见文件头）。
 */
export function getFilteredColors(colorsHex: string[]): string[] {
  return colorsHex.filter((c) => c !== '#E24D42' && c !== '#BF1B00');
}
