// Trace-local RichSearchBar, Errors intersection and navigation preserve the call tree.
import {
  AngleDownIcon,
  AngleUpIcon,
  Badge,
  Button,
  Checkbox,
  Flex,
  Text,
  PanelRightGrowIcon,
  PanelRightShrinkIcon,
  Tooltip,
  VerticalSeparator,
} from '@datafox/ui';
import { css } from '@emotion/css';

import type { TraceSpan } from '../model';
import { DdSpanSearchInput } from './DdSpanSearchInput';

import type { SearchState } from '../state';
import { useStyles2 } from '../theme';

import { DdColorByDropdown, type ColorByDimension } from './DdColorByDropdown';
import { ui } from './uiTokens';
import { flameRegularFont } from './flameTypography';

const getStyles = () => ({
  bar: css({
    label: 'DdSearchBar',
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    minHeight: 45,
    boxSizing: 'border-box',
    flexShrink: 0,
    fontFamily: ui.fontSans,
    fontSize: 13,
    borderBottom: `1px solid ${ui.border}`,
    background: ui.bg,
  }),
  searchRegion: css({ flex: '1 1 480px', minWidth: 0 }),
  searchGroup: css({ display: 'flex', alignItems: 'stretch', flex: '0 1 60%', minWidth: 'min-content' }),
  joinedInput: css({ borderTopRightRadius: 0, borderBottomRightRadius: 0 }),
  errors: css({ alignSelf: 'flex-start', height: 28, boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'center', border: '1px solid var(--ui-form-border)', borderLeft: 0, borderRadius: '0 4px 4px 0', whiteSpace: 'nowrap' }),
  count: css({ whiteSpace: 'nowrap', flexShrink: 0 }),
  flameActions: css({
    label: 'DdFlameToolbarActions',
    flexShrink: 0,
    fontFamily: flameRegularFont,
    '--font-sans': flameRegularFont,
    // Official label includes 6px right padding and two 1px transparent borders.
    '--trace-color-by-gap': '8px',
  }),

});

interface Props {
  search: SearchState;
  spans?: readonly TraceSpan[];
  placeholder?: string;
  /** Color by 维度（Story 7.3）。传则受控，否则下拉自管显示。 */
  colorBy?: ColorByDimension;
  onColorByChange?: (value: ColorByDimension) => void;
  /**
   * 火焰态图例显隐开关（Story 10.9）——真页 `Hide/Show Legend` 位于**火焰工具条最右**
   * （`trace-flame-graph-pane__search-bar-container`），非图例内。传则在此渲染 datafox naked-primary
   * Button；仅火焰态传（瀑布态不传即不渲染）。
   */
  legendToggle?: { show: boolean; onToggle: (show: boolean) => void };
}

export function DdSearchBar({
  search,
  spans = [],
  placeholder = 'Filter spans by any attribute',
  colorBy,
  onColorByChange,
  legendToggle,
}: Props) {
  const styles = useStyles2(getStyles);
  const hasQuery = search.query.trim().length > 0 || search.errorsOnly;
  const noMatch = hasQuery && search.matchCount === 0;

  return (
    <Flex className={styles.bar} wrap gap="md" alignItems="center" data-testid="DdSearchBar">
      <Flex className={styles.searchRegion} style={legendToggle ? { flexBasis: 240 } : undefined} wrap gap="sm" alignItems="center">
        <div className={styles.searchGroup}>
          <DdSpanSearchInput spans={spans} query={search.query} onSubmit={search.setQuery} placeholder={placeholder}
            className={search.errorCount > 0 ? styles.joinedInput : undefined} />
          {search.errorCount > 0 && <span className={styles.errors}>
            <Checkbox checked={search.errorsOnly} onCheckedChange={(checked) => search.setErrorsOnly(checked === true)} aria-label={`Errors ${search.errorCount}`} data-testid="DdSearchErrors">
              <Flex gap="xs" alignItems="center"><Text size="md">Errors</Text><Badge level="danger" size="xs" count={search.errorCount} /></Flex>
            </Checkbox>
          </span>}
        </div>
        {hasQuery && <Text className={styles.count} size="md" variant="secondary" role="status" data-testid="DdSearchCount">
          {noMatch ? 'No matches' : `${search.focusedMatchIndex}/${search.matchCount}`}
        </Text>}
        {hasQuery && search.matchCount > 0 && <Flex gap="none">
          <Tooltip content="上一个命中"><Button isDangerouslyNaked size="md" icon={AngleUpIcon} onClick={search.prevMatch} aria-label="上一个命中" /></Tooltip>
          <Tooltip content="下一个命中"><Button isDangerouslyNaked size="md" icon={AngleDownIcon} onClick={search.nextMatch} aria-label="下一个命中" /></Tooltip>
        </Flex>}
      </Flex>
      <Flex gap="none" alignItems="center" className={legendToggle ? styles.flameActions : undefined}>
        <DdColorByDropdown allowEntity={Boolean(legendToggle)} value={colorBy} onChange={onColorByChange} />
        {/* Story 10.9 / 10.11：火焰态图例显隐——真页置工具条最右：`│` 竖分隔（VerticalSeparator）+
            naked-primary 按钮 + 右侧 panel-right-shrink/grow 图标（收/展图例列，真页 `iconRight` 逐位一致）。 */}
        {legendToggle && (
          <>
            <VerticalSeparator size="sm" style={{ height: 17, marginLeft: 16, marginRight: 0 }} />
            {/* Story 10.11 修正：真页「Hide Legend」= size md（font 13 / 高 28 / icon 14），原 sm（font 12 / icon 12）偏小。 */}
            <Button
              isDangerouslyNaked
              isPrimary
              size="md"
              iconRight={legendToggle.show ? PanelRightShrinkIcon : PanelRightGrowIcon}
              data-testid="DdFlameLegendToggle"
              onClick={() => legendToggle.onToggle(!legendToggle.show)}
            >
              {legendToggle.show ? 'Hide Legend' : 'Show Legend'}
            </Button>
          </>
        )}
      </Flex>
    </Flex>
  );
}
