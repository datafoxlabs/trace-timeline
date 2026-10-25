// SpanDetail 详情卡（Story 3.4 重绘——对齐 Datadog 结构）：
// 顶部 span header + Tab 栏 + Pinned 区 + 语义属性分组（友好标签）+ Logs/References 分组。
// 引擎/状态零改动：detailState 驱动各组折叠（closedSections + 既有 logs/references 标志）。
import { useMemo, useState } from 'react';
import { SpanEvents } from './SpanEvents';
import { TraceSqlQueries } from './TraceSqlQueries';
import type { SpanSqlQuery } from './sqlQueries';
import { TraceErrors } from './TraceErrors';
import { SpanErrors } from './SpanErrors';
import { isErrorSpan } from '../core';
import { SpanAttributeList, flattenAttributes } from './SpanAttributeList';
import { Text } from '@datafox/ui';
import { css } from '@emotion/css';

import type { TraceSpan } from '../model';
import type { DetailState, DetailToggles } from '../state';
import { useStyles2, type Theme } from '../theme';

import { buildAttributeGroups } from './attributeGroups';
import { DdAccordian } from './DdAccordian';
import { DdFlameGraph, DdShareButton, DdSpanLinks, type DetailStubs } from './detailStubs';
import { DdHttpRequestBar } from './DdHttpRequestBar';
import { DdKeyValuesTable } from './DdKeyValuesTable';
import { DdSpanDetailHeader } from './DdSpanDetailHeader';
import { DdSpanDetailTabs } from './DdSpanDetailTabs';
import { spanPresentation } from './spanPresentation';

const getStyles = (theme: Theme) => ({
  card: css({
    label: 'DdSpanDetail',
    containerType: 'inline-size',
    fontFamily: theme.trace.fontFamily,
    fontSize: 13,
    color: theme.colors.text.primary,
    // 自然高度——由内容决定（ListView _scanItemHeights 测量真实高，AD-12）；勿设 height:100%。
    boxSizing: 'border-box',
    background: theme.colors.background.primary,
  }),
  pinned: css({ label: 'DdSpanDetailPinned', display: 'flex', alignItems: 'center', minHeight: 38, padding: '0 16px', borderTop: '1px solid var(--ui-border)', boxSizing: 'border-box' }),
  pinnedEmpty: css({ label: 'DdSpanDetailPinnedEmpty', color: theme.trace.detail.label, fontSize: 12, padding: '2px 8px 6px 30px' }),
  textList: css({ label: 'DdSpanDetailTextList', margin: 0, paddingLeft: 16, lineHeight: '18.2px' }),
  pre: css({ label: 'DdSpanDetailPre', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: '17px' }),
  logTime: css({ label: 'DdSpanDetailLogTime', color: theme.trace.detail.label, fontSize: 12 }),
});

interface Props {
  span: TraceSpan;
  traceDuration?: number;
  errorSpans?: TraceSpan[];
  sqlQueries?: SpanSqlQuery[];
  onSelectDetailSpan?: (spanId: string) => void;
  detailColor?: (span: TraceSpan) => string;
  fillContainer?: boolean;
  detailState: DetailState;
  detailToggles: DetailToggles;
  /** 服务色（顶部 chip 图标）。 */
  color: string;
  /** 深耦合注入回调（火焰图/分享/链接；Story 5.4）。 */
  detailStubs?: DetailStubs;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function DdSpanDetail({ span, traceDuration, errorSpans, sqlQueries, onSelectDetailSpan, detailColor, fillContainer = false, detailState, detailToggles, color, detailStubs, onClose, isCollapsed = false, onToggleCollapsed }: Props) {
  const styles = useStyles2(getStyles);
  const { spanID } = span;
  const [activeTab, setActiveTab] = useState<'Overview' | 'Errors' | 'SQL Queries'>('Overview');
  const [hasVisitedSql, setHasVisitedSql] = useState(false);
  const [hasVisitedErrors, setHasVisitedErrors] = useState(false);
  const presentation = spanPresentation(span);
  const displayTags = useMemo(() => (span.rawSpanAttributes ?? span.tags).filter(tag => !tag.key.startsWith('_')), [span.rawSpanAttributes, span.tags]);
  const groups = buildAttributeGroups({ ...span, tags: displayTags });
  const attributes = useMemo(() => flattenAttributes(displayTags), [displayTags]);
  const resourceAttributes = useMemo(() => flattenAttributes((span.rawResourceAttributes ?? span.process?.tags ?? []).filter(tag => !tag.key.startsWith('_'))), [span.rawResourceAttributes, span.process?.tags]);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const togglePin = (key: string) => setPinnedKeys(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pinned = attributes.filter(entry => pinnedKeys.has(entry.key));
  const references = (span.references ?? []).filter((r) => r.refType);
  const warnings = span.warnings ?? [];
  const stackTraces = span.stackTraces ?? [];

  return (
    <div className={styles.card} style={fillContainer ? { height: '100%', paddingTop: 2, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: 'var(--ui-background)' } : undefined} data-testid="DdSpanDetail">
      <DdSpanDetailHeader
        serviceName={span.process?.serviceName ?? ''}
        operationName={span.operationName}
        resourceName={presentation.resourceName}
        icon={presentation.Icon}
        duration={span.duration}
        traceDuration={traceDuration}
        color={color}
        actions={
          detailStubs && (
            <>
              <DdSpanLinks span={span} onSpanLinks={detailStubs.onSpanLinks} />
              <DdShareButton span={span} onShareSpan={detailStubs.onShareSpan} />
            </>
          )
        }
        onClose={onClose}
        isCollapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        isError={isErrorSpan(span)}
      />
      <DdSpanDetailTabs active={activeTab} errorCount={errorSpans?.length} sqlCount={sqlQueries?.length} onChange={errorSpans ? tab => { setActiveTab(tab); if (tab === 'Errors') setHasVisitedErrors(true); if (tab === 'SQL Queries') setHasVisitedSql(true); } : undefined} />

      <div hidden={isCollapsed} data-testid="DdSpanDetailBody" style={fillContainer ? { overflow: 'hidden', minHeight: 0, flex: 1 } : undefined}>
      {errorSpans && hasVisitedErrors && <div hidden={activeTab !== 'Errors'} style={fillContainer ? { height: '100%' } : undefined}><TraceErrors active={activeTab === 'Errors' && !isCollapsed} virtualized={fillContainer} spans={errorSpans} selectedSpanId={spanID} onSelectSpan={onSelectDetailSpan!} colorForSpan={detailColor!} /></div>}
      {sqlQueries && hasVisitedSql && <div hidden={activeTab !== 'SQL Queries'} style={fillContainer ? { height: '100%' } : undefined}><TraceSqlQueries active={activeTab === 'SQL Queries' && !isCollapsed} virtualized={fillContainer} queries={sqlQueries} selectedSpanId={spanID} onSelectSpan={onSelectDetailSpan!} colorForSpan={detailColor!} /></div>}
      <div hidden={activeTab !== 'Overview'} style={fillContainer ? { height: '100%', overflow: 'auto' } : undefined}>
      {/* HTTP 请求摘要条（UX-DR11；仅含 http 字段时渲染） */}
      {!fillContainer && <DdHttpRequestBar span={span} />}

      <SpanErrors key={spanID} span={span} />
      <div className={styles.pinned}>
        <Text weight="bold">Pinned Span Attributes</Text>{!pinned.length && <Text color="muted" marginLeft="md">No pinned tags found</Text>}
      </div>
      {pinned.length > 0 && <SpanAttributeList entries={pinned} pinnedKeys={pinnedKeys} onTogglePin={togglePin} />}
      {fillContainer ? <>
        <DdAccordian label="Span Attributes" isOpen={detailState.isSectionOpen('Span Attributes')} onToggle={() => detailToggles.section(spanID, 'Span Attributes')}>
          <SpanAttributeList key={spanID} entries={attributes} pinnedKeys={pinnedKeys} onTogglePin={togglePin} searchable />
        </DdAccordian>
        <DdAccordian label="Resource Attributes" isOpen={detailState.isSectionOpen('Resource Attributes')} onToggle={() => detailToggles.section(spanID, 'Resource Attributes')}>
          <SpanAttributeList key={spanID} entries={resourceAttributes} scope="Resource" searchable />
        </DdAccordian>
      </> : groups.map((g) => (
        <DdAccordian
          key={g.title}
          label={g.title}
          count={g.rows.length}
          isOpen={detailState.isSectionOpen(g.title)}
          onToggle={() => detailToggles.section(spanID, g.title)}
        >
          <DdKeyValuesTable rows={g.rows} />
        </DdAccordian>
      ))}

      <SpanEvents key={`events:${spanID}`} span={span} />

      {!fillContainer && <>
      {/* References */}
      {references.length > 0 && (
        <DdAccordian
          label="References"
          count={references.length}
          isOpen={detailState.references.isOpen}
          onToggle={() => detailToggles.references(spanID)}
        >
          <DdKeyValuesTable
            rows={references.map((r) => ({
              label: r.refType,
              value: r.span ? `${r.span.operationName} (${r.spanID})` : r.spanID,
              kind: 'text' as const,
            }))}
          />
        </DdAccordian>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <DdAccordian
          label="Warnings"
          count={warnings.length}
          isOpen={detailState.isWarningsOpen}
          onToggle={() => detailToggles.warnings(spanID)}
        >
          <ul className={styles.textList}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </DdAccordian>
      )}

      {/* Stack traces */}
      {stackTraces.length > 0 && (
        <DdAccordian
          label="Stack traces"
          count={stackTraces.length}
          isOpen={detailState.isStackTracesOpen}
          onToggle={() => detailToggles.stackTraces(spanID)}
        >
          {stackTraces.map((st, i) => (
            <pre className={styles.pre} key={i}>
              {st}
            </pre>
          ))}
        </DdAccordian>
      )}

      {/* 火焰图占位区（Story 5.4；宿主经 renderFlameGraph 接管） */}
      {detailStubs && <DdFlameGraph span={span} renderFlameGraph={detailStubs.renderFlameGraph} />}
      </>}
      </div>
      </div>
    </div>
  );
}
