// 时间轴整步长刻度取值（Story 9.3 复审 / AC #12）。
//
// 真页 waterfall 表头是一根 d3 轴（`svg.trace_svg_x-axis`）：刻度落在 **1/2/5 × 10ⁿ** 的整步长上
// （实测 trace 时长 54.1ms → `0, 5ms, 10ms, …, 50ms` 共 11 刻度），而非把时长等分。
// trace-timeline 原先按 `numTicks` 等分，102ms 的 trace 会渲染出 `25.5ms / 76.5ms` 这类脏值。
//
// 与 d3-array 的 `tickIncrement` / `ticks` 同构（不引依赖；d3 未在本仓 package.json 中）。

const E10 = Math.sqrt(50); // 7.0710…
const E5 = Math.sqrt(10); // 3.1622…
const E2 = Math.sqrt(2); // 1.4142…

/**
 * 给定区间与期望刻度数，返回最接近的「漂亮」步长（1/2/5 × 10ⁿ）。
 * `count` 是**期望的刻度间隔数**（d3 语义的 count hint），非精确刻度个数。
 */
export function tickStep(start: number, stop: number, count: number): number {
  const raw = Math.abs(stop - start) / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) {
    return 0;
  }
  const power = Math.floor(Math.log10(raw));
  const magnitude = Math.pow(10, power);
  const error = raw / magnitude;
  const base = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  return base * magnitude;
}

/**
 * 返回 [start, stop] 闭区间内全部整步长刻度值（升序）。
 * - `stop <= start` 或非有限值 → 返回单点 `[start]`（调用方按 0 宽区间处理，不抛）。
 * - 区间过窄以致内部无整刻度 → 返回 `[start, stop]` 兜底，保证轴两端仍有参照。
 */
export function niceTickValues(start: number, stop: number, count: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || !(stop > start)) {
    return [start];
  }
  const step = tickStep(start, stop, count);
  if (!(step > 0) || !Number.isFinite(step)) {
    return [start, stop];
  }
  // 1e-9 相对容差：吸收 `54100 / 5000` 这类浮点余数，避免端点刻度被 ceil/floor 挤掉。
  const eps = 1e-9;
  const i0 = Math.ceil(start / step - eps);
  const i1 = Math.floor(stop / step + eps);
  if (i1 < i0) {
    return [start, stop];
  }
  const out: number[] = [];
  for (let i = i0; i <= i1; i++) {
    // `Math.ceil(0/step - eps)` 得 `-0`，`-0 * step` 仍是 `-0`——归一化，避免下游渲染出 `-0`。
    const value = i * step;
    out.push(value === 0 ? 0 : value);
  }
  return out;
}
