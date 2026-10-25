// 深耦合功能 stub（Story 5.4；FR-18/FR-19；AD-11）——只渲染 UI 外壳，逻辑走可注入回调。
// 火焰图/Profiles/分享/span-links 因缺外部依赖（@grafana/flamegraph、pyroscope）由宿主接管。
// Story 9.3e：图标改用 datafox DRUIDS 图标（原为 `../ui` 的 lucide 包装）。
// ⚠️ DRUIDS 全量 441 个字形里**没有 share**（组件名/kebab 名双向搜过，含子串亦无），
// 故分享按钮取语义最近的 ExportIcon。若后续 datafox 补 share 字形，此处应换回。
import { ExportIcon, LinkIcon } from '@datafox/ui';
import { css } from '@emotion/css';
import type { ReactNode } from 'react';

import type { TraceSpan } from '../model';
import { useStyles2, type Theme } from '../theme';

/** 详情面板深耦合功能的可注入回调（trace 级）。不传 → 按钮隐藏 / 区域占位。 */
export interface DetailStubs {
  /** 分享 span（点击分享按钮触发，携 span 上下文）。 */
  onShareSpan?: (span: TraceSpan) => void;
  /** span 关联链接（点击触发，宿主弹自己的菜单/跳转）。 */
  onSpanLinks?: (span: TraceSpan) => void;
  /** 火焰图渲染（返回节点接管占位区域；不传 → 显示占位文案）。 */
  renderFlameGraph?: (span: TraceSpan) => ReactNode;
}

const getStyles = (theme: Theme) => ({
  iconBtn: css({
    label: 'DdDetailIconBtn',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    border: 'none',
    background: 'none',
    borderRadius: theme.shape.radius.md,
    color: theme.trace.detail.label,
    cursor: 'pointer',
    '&:hover': { background: theme.trace.selectedRowBg, color: theme.colors.text.primary },
  }),
  flame: css({
    label: 'DdFlameGraph',
    border: `1px dashed ${theme.trace.detail.border}`,
    borderRadius: theme.shape.radius.md,
    padding: theme.spacing(2),
    margin: theme.spacing(1),
    color: theme.trace.detail.label,
    fontSize: 12,
    textAlign: 'center',
  }),
});

export function DdShareButton({ span, onShareSpan }: { span: TraceSpan; onShareSpan?: DetailStubs['onShareSpan'] }) {
  const styles = useStyles2(getStyles);
  if (!onShareSpan) {
    return null;
  }
  return (
    <button
      className={styles.iconBtn}
      onClick={() => onShareSpan(span)}
      title="分享 span"
      aria-label="分享 span"
      data-testid="DdShareButton"
    >
      <ExportIcon size="sm" />
    </button>
  );
}

export function DdSpanLinks({ span, onSpanLinks }: { span: TraceSpan; onSpanLinks?: DetailStubs['onSpanLinks'] }) {
  const styles = useStyles2(getStyles);
  if (!onSpanLinks) {
    return null;
  }
  return (
    <button
      className={styles.iconBtn}
      onClick={() => onSpanLinks(span)}
      title="关联链接"
      aria-label="关联链接"
      data-testid="DdSpanLinks"
    >
      <LinkIcon size="sm" />
    </button>
  );
}

/** 火焰图占位区——renderFlameGraph 注入则接管，否则显示占位（FR-19）。 */
export function DdFlameGraph({ span, renderFlameGraph }: { span: TraceSpan; renderFlameGraph?: DetailStubs['renderFlameGraph'] }) {
  const styles = useStyles2(getStyles);
  if (renderFlameGraph) {
    return <div data-testid="DdFlameGraph">{renderFlameGraph(span)}</div>;
  }
  return (
    <div className={styles.flame} data-testid="DdFlameGraph">
      火焰图（注入 renderFlameGraph 接管）
    </div>
  );
}
