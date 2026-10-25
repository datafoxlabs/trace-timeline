// Story 9.1：datafox-ui Foundation 层（--ui-* 变量 + .dark 明暗）。区域 emotion 桥接依赖此表。
import '@datafox/ui/styles.css';
import { css } from '@emotion/css';
import { StrictMode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { TraceTimeline, VERSION, loadTrace } from '../src';
// 子路径导出（AD-15）：适配器按需引入，证明多后端经同一 loadTrace 渲染。
// DataFox fixture 是合成 trace（96 span / 12 服务 / 树深 17）。
import { datafoxDataSource, dataFoxFixture } from '../src/datasources/datafox';
import { otlpDataSource, otlpFixture } from '../src/datasources/otlp';
import { DdFlameGraphView } from '../src/presentation';
import {
  createTheme,
  getColorByKey,
  ThemeProvider,
  useStyles2,
  useTheme2,
  type Theme,
  type ThemeColorMode,
} from '../src/theme';

const getStyles = (theme: Theme) => ({
  panel: css({
    fontFamily: theme.trace.fontFamily,
    background: theme.colors.background.primary,
    color: theme.colors.text.primary,
    padding: theme.spacing(3),
    minHeight: '100vh',
    boxSizing: 'border-box',
  }),
  bar: css({
    height: theme.trace.barHeight,
    borderRadius: theme.trace.barRadius,
    marginRight: theme.spacing(0.5),
    display: 'inline-block',
    width: 48,
  }),
  toggle: css({
    fontFamily: theme.trace.fontFamily,
    background: theme.colors.primary.main,
    color: '#fff',
    border: 'none',
    borderRadius: theme.shape.radius.md,
    padding: theme.spacing(1, 2),
    cursor: 'pointer',
  }),
  pill: css({
    display: 'inline-block',
    borderRadius: theme.shape.radius.md,
    padding: theme.spacing(0.25, 1),
    fontSize: theme.typography.bodySmall.fontSize,
    marginRight: theme.spacing(1),
  }),
});

/** operationName 可能很长（如带参数的路由模板），按钮标签截断。 */
const ellipsis = (s: string, max = 28) => (s.length > max ? `${s.slice(0, max)}…` : s);

function Demo({ mode, onToggle }: { mode: ThemeColorMode; onToggle: () => void }) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  // 滚动定位演示（FR-7）：受控 focusedSpanId + 受限高度，使尾部 span 出视口可观察滚动。
  const [focusedSpanId, setFocusedSpanId] = useState<string | undefined>(undefined);
  // 数据源切换（AD-15）：DataFox（合成 trace fixture）⇄ OTLP，两者经同一 loadTrace 解码。
  const [source, setSource] = useState<'datafox' | 'otlp'>('datafox');
  const datafoxTrace = useMemo(() => loadTrace(datafoxDataSource, dataFoxFixture)!, []);
  const otlpTrace = useMemo(() => loadTrace(otlpDataSource, otlpFixture), []);
  const activeTrace = source === 'otlp' ? otlpTrace : datafoxTrace;
  const firstSpan = datafoxTrace.spans[0];
  const lastSpan = datafoxTrace.spans[datafoxTrace.spans.length - 1];
  // 自适应高度：TraceTimeline 的 `height`（滚动区高）是宿主控制的定值（虚拟化需像素高）。
  // 宿主（本 demo）据视口算「填满」高，令火焰图/瀑布在 4K 等大屏自适应铺满（非固定 320）。
  const mainWrapRef = useRef<HTMLDivElement>(null);
  const [fillHeight, setFillHeight] = useState(320);
  useLayoutEffect(() => {
    const compute = () => {
      const top = mainWrapRef.current?.getBoundingClientRect().top ?? 0;
      // 视口高 − 组件顶到视口的距离 − 组件内 chrome（tabs/toolbar/ruler ≈ 120）− 底部缓冲（40）。
      setFillHeight(Math.max(240, Math.round(window.innerHeight - top - 120 - 40)));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return (
    <div className={styles.panel}>
      <h3>trace-timeline theme demo — v{VERSION}</h3>
      <button className={styles.toggle} onClick={onToggle}>
        切换主题（当前：{mode}）
      </button>

      <h4>Datadog 分类色板（瀑布条圆角 {theme.trace.barRadius}）</h4>
      <div>
        {theme.trace.categoricalPalette.map((c) => (
          <span key={c} className={styles.bar} style={{ background: c }} title={c} />
        ))}
      </div>

      <h4>服务色（colorGenerator，{datafoxTrace.services.length} 个服务）</h4>
      <div>
        {datafoxTrace.services.map((svc) => (
          <span key={svc.name} className={styles.pill} style={{ background: getColorByKey(svc.name, theme), color: '#fff' }}>
            {svc.name} ({svc.numberOfSpans})
          </span>
        ))}
      </div>

      <h4>HTTP 状态 pill</h4>
      <div>
        {(['ok', 'info', 'warn', 'error'] as const).map((k) => (
          <span
            key={k}
            className={styles.pill}
            style={{ color: theme.trace.status[k].fg, background: theme.trace.status[k].bg }}
          >
            {k.toUpperCase()}
          </span>
        ))}
      </div>

      <h4>&lt;TraceTimeline trace={'{trace}'} /&gt;（对外组件）</h4>
      <p style={{ opacity: 0.6, fontSize: 12, margin: '0 0 8px' }}>
        一行注入：api 把 Datadog 皮肤注入 core 引擎，渲染完整静态瀑布（圆角瀑布条 / 树形缩进线 / HTTP 状态 pill / 错误 ⚠ / 刻度表头）。
      </p>
      <button className={styles.toggle} onClick={() => setSource((s) => (s === 'datafox' ? 'otlp' : 'datafox'))}>
        数据源（AD-15 可插拔适配器）：
        {source === 'datafox' ? `DataFox（合成 trace，${datafoxTrace.spans.length} span）` : 'OTLP（loadTrace）'} — 点击切换
      </button>
      <div ref={mainWrapRef} />
      <TraceTimeline
        trace={activeTrace}
        height={fillHeight}
        detailStubs={{
          onShareSpan: (s) => console.log('[demo] share span', s.spanID),
          onSpanLinks: (s) => console.log('[demo] span links', s.spanID),
          // renderFlameGraph 不传 → 显示占位（FR-19，可由宿主接管）
        }}
      />

      <h4 style={{ marginTop: 24 }}>滚动定位（focusedSpanId，FR-7）</h4>
      <p style={{ opacity: 0.6, fontSize: 12, margin: '0 0 8px' }}>
        受限高度（120px）使尾部 span 出视口；点按钮设置 focusedSpanId → 视图滚动到该 span 并高亮，表头不遮挡。
      </p>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button className={styles.toggle} onClick={() => setFocusedSpanId(firstSpan.spanID)}>
          定位顶部：{ellipsis(firstSpan.operationName)}
        </button>
        <button className={styles.toggle} onClick={() => setFocusedSpanId(lastSpan.spanID)}>
          定位底部：{ellipsis(lastSpan.operationName)}
        </button>
        <button className={styles.toggle} onClick={() => setFocusedSpanId(undefined)}>
          清除
        </button>
      </div>
      <TraceTimeline
        trace={datafoxTrace}
        height={120}
        focusedSpanId={focusedSpanId}
        onFocusedSpanIdChange={setFocusedSpanId}
      />

      <h4 style={{ marginTop: 24 }}>火焰图视图（Epic 6 / Story 6.1 静态）</h4>
      <div style={{ border: `1px solid ${theme.colors.border.weak}`, padding: 8, background: theme.colors.background.primary }}>
        <DdFlameGraphView trace={datafoxTrace} />
      </div>

      <h4 style={{ marginTop: 24 }}>空态（trace={'{null}'}）</h4>
      <TraceTimeline trace={null} height={80} />
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<ThemeColorMode>('light');
  const theme = useMemo(() => createTheme({ colorMode: mode }), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <Demo mode={mode} onToggle={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} />
    </ThemeProvider>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('demo root element not found');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
