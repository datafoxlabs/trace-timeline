import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { RenderableRow } from '../core';
import type { TraceProcess, TraceSpan } from '../model';
import { createTheme, ThemeProvider } from '../theme';

import { DdLabelCell } from './DdLabelCell';

const theme = createTheme({ colorMode: 'light' });

const proc: TraceProcess = { serviceName: 'user-service', tags: [] };

function baseRow(over: Partial<RenderableRow>): RenderableRow {
  const span = {
    spanID: 's1',
    traceID: 't',
    operationName: 'GET /order',
    startTime: 0,
    duration: 100,
    process: { serviceName: 'mall-order-api', tags: [] },
    tags: [],
    logs: [],
    references: [],
    childSpanCount: 0,
    hasChildren: false,
  } as unknown as TraceSpan;
  return {
    span,
    spanIndex: 0,
    isDetail: false,
    depth: 0,
    ancestorSpanIds: [],
    viewBounds: { start: 0, end: 1, clippingLeft: false, clippingRight: false },
    isCollapsed: false,
    isMatchingFilter: false,
    isFocused: false,
    isError: false,
    descendantHasError: false,
    criticalPathSections: [],
    columnWidth: 0.3,
    hoverIndentGuideIds: new Set(),
    onChildrenToggle: () => {},
    onDetailToggle: () => {},
    addHoverIndentGuideId: () => {},
    removeHoverIndentGuideId: () => {},
    ...over,
  } as RenderableRow;
}

function mount(row: RenderableRow) {
  return render(
    // Story 9.3d：`colorForSpanId` 已从 DdLabelCell 摘除（树线不再用服务色）。
    createElement(ThemeProvider, { theme, children: <DdLabelCell row={row} /> })
  );
}

describe('DdLabelCell — RPC 合并 / 未插桩外部服务（Story 4.4）', () => {
  it('row.rpc → 渲染对端服务名/操作名（带色点）', () => {
    const row = baseRow({
      isCollapsed: true,
      rpc: { serviceName: 'user-service', operationName: 'GET /order', process: proc, viewStart: 0, viewEnd: 1 },
    });
    const { getByTestId, getByText } = mount(row);
    expect(getByTestId('rpc-merge')).not.toBeNull();
    expect(getByText('user-service')).not.toBeNull();
  });

  it('row.noInstrumentedServer → 渲染外部服务名', () => {
    const row = baseRow({ noInstrumentedServer: { serviceName: 'redis-cache' } });
    const { getByTestId, getByText } = mount(row);
    expect(getByTestId('peer-service')).not.toBeNull();
    expect(getByText('redis-cache')).not.toBeNull();
  });

  it('rpc 优先于 peer（同时存在时只渲染 rpc-merge）', () => {
    const row = baseRow({
      isCollapsed: true,
      rpc: { serviceName: 'user-service', operationName: 'GET /order', process: proc, viewStart: 0, viewEnd: 1 },
      noInstrumentedServer: { serviceName: 'redis-cache' },
    });
    const { queryByTestId } = mount(row);
    expect(queryByTestId('rpc-merge')).not.toBeNull();
    expect(queryByTestId('peer-service')).toBeNull();
  });
});
