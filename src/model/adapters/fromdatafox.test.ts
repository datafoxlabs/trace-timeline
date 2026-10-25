import { describe, expect, it } from 'vitest';

import { dataFoxFixture } from './datafox-fixture';
import { dataFoxSyntheticFixture } from './datafox-synthetic-fixture';
import { decodeDataFox, fromDataFox, type DataFoxResponse } from './fromDataFox';

describe('fromDataFox', () => {
  it('列式 DataFrame → 内部 Trace', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    expect(trace).not.toBeNull();
    expect(trace.spans).toHaveLength(96);
    expect(trace.traceID).toBe('0123456789abcdef0123456789abcdef');
  });

  it('parent_span_id → CHILD_OF references；建立父子 depth', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    const root = trace.spans.find((s) => s.spanID === 'demo-span-001')!;
    const child = trace.spans.find((s) => s.spanID === 'demo-span-002')!;
    expect(root.depth).toBe(0);
    expect(root.references).toHaveLength(0); // 根无 parent
    expect(child.depth).toBe(1);
    expect(child.references[0]).toMatchObject({ refType: 'CHILD_OF', spanID: 'demo-span-001' });
  });

  it('时间单位归一化：ms→µs、ns→µs', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    const root = trace.spans.find((s) => s.spanID === 'demo-span-001')!;
    // 80_000_000 ns → 80_000 µs
    expect(root.duration).toBe(80_000);
    // root.startTime 是相对 trace 起点（transform 后 relativeStartTime=0）
    expect(root.relativeStartTime).toBe(0);
  });

  it('attrs_raw JSON → tags/process.tags', () => {
    const trace = fromDataFox(dataFoxSyntheticFixture)!;
    const root = trace.spans.find((s) => s.spanID === 'sp-root')!;
    expect(root.tags.some((t) => t.key === 'http.method' && t.value === 'GET')).toBe(true);
    expect(root.process.serviceName).toBe('mall-order-api');
    expect(root.process.tags.some((t) => t.key === 'telemetry.sdk.language')).toBe(true);
  });

  it('status_code Error / exception → statusCode 2（错误）', () => {
    const trace = fromDataFox(dataFoxSyntheticFixture)!;
    const err = trace.spans.find((s) => s.spanID === 'sp-err')!;
    expect(err.statusCode).toBe(2);
    expect(err.tags.some((t) => t.key === 'error' && t.value === true)).toBe(true);
    expect(err.tags.some((t) => t.key === 'exception.type')).toBe(true);
  });

  it('events → logs', () => {
    const trace = fromDataFox(dataFoxSyntheticFixture)!;
    const order = trace.spans.find((s) => s.spanID === 'sp-order')!;
    expect(order.logs.length).toBe(1);
    expect(order.logs[0].name).toBe('rpc.start');
    expect(order.logs[0].fields.some((f) => f.key === 'rpc')).toBe(true);
  });

  it('孤儿父按 root：parent 不在结果集 → 无 reference', () => {
    const orphan: DataFoxResponse = {
      data: {
        A: {
          frames: [
            {
              schema: { fields: [{ name: 'trace_id' }, { name: 'span_id' }, { name: 'parent_span_id' }, { name: 'timestamp' }, { name: 'duration' }, { name: 'service_name' }, { name: 'operation_name' }] },
              data: { values: [['t'], ['sp1'], ['missing-parent'], [1_700_000_000_000], [1_000_000], ['svc'], ['op']] },
            },
          ],
        },
      },
    };
    const trace = fromDataFox(orphan)!;
    expect(trace.spans).toHaveLength(1);
    expect(trace.spans[0].references).toHaveLength(0); // 孤儿父 → root
    expect(trace.spans[0].depth).toBe(0);
  });

  it('空/坏响应 → null', () => {
    expect(fromDataFox({})).toBeNull();
    expect(fromDataFox({ data: { A: { frames: [] } } })).toBeNull();
  });
});

describe('dataFoxFixture（合成 trace）', () => {
  it('96 span / 12 服务 / 单根 / 树深 17', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    expect(Object.keys(trace.processes)).toHaveLength(12);
    expect(trace.spans.filter((s) => s.depth === 0)).toHaveLength(1);
    expect(Math.max(...trace.spans.map((s) => s.depth))).toBe(17);
  });

  it('小数毫秒 timestamp 精确还原微秒（无浮点漂移）', () => {
    const decoded = decodeDataFox(dataFoxFixture)!;
    const byId = new Map(decoded.spans.map((s) => [s.spanID, s]));
    // 合成 startTime 1700000000002125 µs → fixture 写作 1700000000002.125 ms。
    expect(byId.get('demo-span-002')!.startTime).toBe(1_700_000_000_002_125);
    expect(byId.get('demo-span-002')!.duration).toBe(76_000);
    // 最短 span 25µs：整数毫秒表示会把它归零。
    expect(Math.min(...decoded.spans.map((s) => s.duration))).toBe(25);
  });

  it('根 span 的悬空父被丢弃；异步 span 越过根的结束时间', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    const root = trace.spans.find((s) => s.depth === 0)!;
    expect(root.spanID).toBe('demo-span-001');
    expect(root.references).toHaveLength(0); // parent_span_id=demo-missing-parent 不在结果集
    // 异步 span 在根结束后仍未结束 → trace 总宽 > 根时长。
    expect(root.duration).toBe(80_000);
    expect(trace.duration).toBe(140_000);
  });

  it('spanType → kind；requestHost → tags', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    const redis = trace.spans.find((s) => s.spanID === 'demo-span-019')!;
    expect(redis.kind).toBe('redis');
    expect(redis.tags.some((t) => t.key === 'span.kind' && t.value === 'redis')).toBe(true);
    const root = trace.spans.find((s) => s.depth === 0)!;
    expect(root.tags).toContainEqual({ key: 'requestHost', value: 'api.example.com' });
  });

  it('全 Ok：无错误 span', () => {
    const trace = fromDataFox(dataFoxFixture)!;
    expect(trace.spans.every((s) => s.statusCode === 1)).toBe(true);
  });
});
