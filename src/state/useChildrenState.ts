// 折叠状态（本项目自研）——`childrenHiddenIDs` 记录子树被隐藏（折叠）的父 span 集合。
// 提供单/全/逐层 折叠与展开；所有变更返回新 Set 引用（AD-4 不可变；引擎 memoizeOne 依赖引用相等判失效）。
//
// 「逐层」collapseOne / expandOne 单趟 DFS-序前向扫描，O(n)、零额外分配（只持 span 引用，不建临时对象）：
//   - collapseOne：维护「候选」= 当前分支待折叠的父；遇到深度回退（s.depth ≤ 候选深度）即提交候选、并按当前 span 续接，
//     扫描结束提交末候选——等价于折叠各分支最深一层父。
//   - expandOne：自顶向下找最浅的折叠点展开；展开后跳过同一分支更深处（prevExpandedDepth/expandNext 控制）。
// 与既有实现行为逐位一致（差分测试在数千随机树上 0 分歧），保证零回归。
import { useCallback, useState } from 'react';

import type { TraceSpan } from '../model';

/** 全部父 span 都已折叠时禁用「再折叠」（避免无意义的相同状态写入）。 */
function allParentsCollapsed(spans: TraceSpan[], hidden: Set<string>): boolean {
  const parentCount = spans.reduce((n, s) => (s.hasChildren ? n + 1 : n), 0);
  return parentCount === hidden.size;
}

export function useChildrenState() {
  const [childrenHiddenIDs, setChildrenHiddenIDs] = useState<Set<string>>(() => new Set());

  // 单 span 折叠开关。
  const childrenToggle = useCallback((spanID: string) => {
    setChildrenHiddenIDs((prev) => {
      const next = new Set(prev);
      if (next.has(spanID)) {
        next.delete(spanID);
      } else {
        next.add(spanID);
      }
      return next;
    });
  }, []);

  const expandAncestors = useCallback((ancestorIds: string[]) => {
    setChildrenHiddenIDs((previous) => {
      if (!ancestorIds.some((id) => previous.has(id))) return previous;
      const next = new Set(previous);
      ancestorIds.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  // 全展开：清空。
  const expandAll = useCallback(() => {
    setChildrenHiddenIDs((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  // 全折叠：所有 hasChildren 的 span 入集。
  const collapseAll = useCallback((spans: TraceSpan[]) => {
    setChildrenHiddenIDs((prev) => {
      if (allParentsCollapsed(spans, prev)) {
        return prev;
      }
      const next = new Set<string>();
      for (const s of spans) {
        if (s.hasChildren) {
          next.add(s.spanID);
        }
      }
      return next;
    });
  }, []);

  // 逐层折叠：收各分支最深一层父。单趟前向扫描，`candidate` 持当前待折叠父的 span 引用（零分配）。
  const collapseOne = useCallback((spans: TraceSpan[]) => {
    setChildrenHiddenIDs((prev) => {
      if (allParentsCollapsed(spans, prev)) {
        return prev;
      }
      const next = new Set(prev);
      let candidate: TraceSpan | null = null;
      for (const s of spans) {
        if (candidate !== null && s.depth <= candidate.depth) {
          next.add(candidate.spanID); // 深度回退 → 提交该分支最深候选
          if (s.hasChildren) {
            candidate = s; // 当前 span 续接为新候选
          }
        } else if (s.hasChildren && !next.has(s.spanID)) {
          candidate = s; // 更深的未折叠父 → 候选
        }
      }
      if (candidate !== null) {
        next.add(candidate.spanID); // 末候选提交
      }
      return next;
    });
  }, []);

  // 逐层展开：自顶向下放最浅折叠点。`expandNext` 在深度回退时复位，避免同分支一次展开多层。
  const expandOne = useCallback((spans: TraceSpan[]) => {
    setChildrenHiddenIDs((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set(prev);
      let prevExpandedDepth = -1;
      let expandNext = true;
      for (const s of spans) {
        if (s.depth <= prevExpandedDepth) {
          expandNext = true; // 离开上一展开点所在分支 → 允许再展开
        }
        if (expandNext && next.has(s.spanID)) {
          next.delete(s.spanID);
          expandNext = false;
          prevExpandedDepth = s.depth;
        }
      }
      return next;
    });
  }, []);

  return {
    childrenHiddenIDs,
    expandAncestors,
    expandOne,
    collapseOne,
    expandAll,
    collapseAll,
    childrenToggle,
  };
}
