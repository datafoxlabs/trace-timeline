import { describe, expect, it } from 'vitest';

import { mockTrace } from './mock-trace';
import transformTraceData from './transform-trace-data';
import type { TraceResponse, TraceSpanData } from './types';

const TID = 'trace-test-0001';

function mkSpan(
  p: Partial<TraceSpanData> & Pick<TraceSpanData, 'spanID' | 'operationName' | 'startTime' | 'duration'>
): TraceSpanData {
  return { traceID: TID, processID: 'p1', logs: [], tags: [], flags: 0, references: [], ...p };
}

function resp(spans: TraceSpanData[]): TraceResponse {
  return { traceID: TID, processes: { p1: { serviceName: 'svc', tags: [] } }, spans };
}

describe('transformTraceData', () => {
  it('无数据/无 traceID 返回 null', () => {
    expect(transformTraceData(undefined)).toBeNull();
    // @ts-expect-error 测试缺 traceID
    expect(transformTraceData({ spans: [], processes: {} })).toBeNull();
  });

  it('派生 depth / childSpanIds（按结束时间降序）/ relativeStartTime', () => {
    const t = transformTraceData(
      resp([
        mkSpan({ spanID: 'r', operationName: 'root', startTime: 100, duration: 100 }),
        mkSpan({
          spanID: 'c1',
          operationName: 'c1',
          startTime: 110,
          duration: 50, // end 160
          references: [{ refType: 'CHILD_OF', spanID: 'r', traceID: TID }],
        }),
        mkSpan({
          spanID: 'c2',
          operationName: 'c2',
          startTime: 120,
          duration: 70, // end 190
          references: [{ refType: 'CHILD_OF', spanID: 'r', traceID: TID }],
        }),
      ])
    )!;
    const byId = Object.fromEntries(t.spans.map((s) => [s.spanID, s]));
    expect(byId.r.depth).toBe(0);
    expect(byId.c1.depth).toBe(1);
    expect(byId.r.hasChildren).toBe(true);
    expect(byId.r.childSpanCount).toBe(2);
    expect(byId.r.descendantSpanCount).toBe(2); // 扁平树：两者相等（正是它容易被混为一谈的原因）
    // 按结束时间降序：c2(190) 在 c1(160) 前
    expect(byId.r.childSpanIds).toEqual(['c2', 'c1']);
    expect(byId.c1.relativeStartTime).toBe(10);
    expect(t.startTime).toBe(100);
    expect(t.endTime).toBe(200); // root r 在 100+100=200 结束
    expect(t.duration).toBe(100);
  });

  // Story 9.3i：`childSpanCount`（直接子节点）与 `descendantSpanCount`（子孙总数）是**两个量**。
  // 真页 waterfall 行首徽标用的是后者——实测 `6a505e15…`（21 span）：
  //   root                        → 20（= 21 − 1）
  //   TraceScenarioController…    → 16，而其直接子节点只有 8 个
  //   GET /order/complex          → 2（flux 那行 + 它的 1 个子孙）
  // 下面这棵树按同一形状缩小：链式深度让两者必然分岔，扁平树则会掩盖 bug。
  it('descendantSpanCount = 子孙总数，与 childSpanCount（直接子节点）分岔', () => {
    //  r ── a ── b ── c
    //   └── d
    const chain = (id: string, parent: string, startTime: number) =>
      mkSpan({
        spanID: id,
        operationName: id,
        startTime,
        duration: 10,
        references: [{ refType: 'CHILD_OF' as const, spanID: parent, traceID: TID }],
      });
    const t = transformTraceData(
      resp([
        mkSpan({ spanID: 'r', operationName: 'root', startTime: 100, duration: 100 }),
        chain('a', 'r', 110),
        chain('b', 'a', 120),
        chain('c', 'b', 130),
        chain('d', 'r', 140),
      ])
    )!;
    const byId = Object.fromEntries(t.spans.map((s) => [s.spanID, s]));

    // 直接子节点
    expect(byId.r.childSpanCount).toBe(2); // a, d
    expect(byId.a.childSpanCount).toBe(1); // b
    expect(byId.b.childSpanCount).toBe(1); // c
    expect(byId.c.childSpanCount).toBe(0);
    expect(byId.d.childSpanCount).toBe(0);

    // 子孙总数（= subtree size − 1）
    expect(byId.r.descendantSpanCount).toBe(4); // a, b, c, d
    expect(byId.a.descendantSpanCount).toBe(2); // b, c
    expect(byId.b.descendantSpanCount).toBe(1); // c
    expect(byId.c.descendantSpanCount).toBe(0);
    expect(byId.d.descendantSpanCount).toBe(0);

    // 关键：根与 a 上两者不等；叶子上相等（=0）。
    expect(byId.r.descendantSpanCount).toBeGreaterThan(byId.r.childSpanCount);
    expect(byId.a.descendantSpanCount).toBeGreaterThan(byId.a.childSpanCount);

    // 全树恒等式：Σ descendantSpanCount 不等于 span 数；但根的 descendantSpanCount = 总 span 数 − 1。
    expect(byId.r.descendantSpanCount).toBe(t.spans.length - 1);
  });

  it('多个顶层 span 挂在虚拟 root 下（depth 0）', () => {
    const t = transformTraceData(
      resp([
        mkSpan({ spanID: 'a', operationName: 'a', startTime: 10, duration: 5 }),
        mkSpan({ spanID: 'b', operationName: 'b', startTime: 20, duration: 5 }),
      ])
    )!;
    expect(t.spans).toHaveLength(2);
    expect(t.spans.every((s) => s.depth === 0)).toBe(true);
  });

  it('tags 去重并排序', () => {
    const t = transformTraceData(
      resp([
        mkSpan({
          spanID: 's',
          operationName: 's',
          startTime: 1,
          duration: 1,
          tags: [
            { key: 'x', value: 1 },
            { key: 'a', value: 2 },
            { key: 'x', value: 1 },
          ],
        }),
      ])
    )!;
    const s = t.spans[0];
    expect(s.tags.map((kv) => kv.key)).toEqual(['a', 'x']); // 去重 + 字母序
  });
});

describe('mockTrace', () => {
  it('多服务派生正确', () => {
    expect(mockTrace).toBeTruthy();
    expect(mockTrace.spans).toHaveLength(9);
    expect(mockTrace.services.map((s) => s.name).sort()).toEqual(
      ['mall-order-api', 'mysql', 'redis', 'user-service'].sort()
    );
    expect(mockTrace.traceName).toContain('mall-order-api');
    // 根 span depth 0
    expect(mockTrace.spans[0].depth).toBe(0);
  });
});
