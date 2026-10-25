// 左标签列（UX-DR9）：树形缩进线 + 折叠箭头 + 子代计数 + resource 文本 + HTTP 状态 pill + 错误 ⚠。
// Story 9.3e：错误叹号 / RPC 箭头改用 datafox DRUIDS 图标（原为 `../ui` 的 lucide 包装）。
//
// Story 9.3f：单元格内布局改用 datafox `<Flex>/<FlexItem>`，与真页 `druids_layout_flex(-item)` 同源。
// datafox `Flex` 的默认 direction=row / justify=flex-start / alignItems=center / wrap=nowrap 与真页那串
// modifier 逐个吻合，故一个默认 `<Flex>` 即是真页那层，无需再手写 emotion flex。
// 间距一律走 `marginLeft="xs"`（= `var(--spacing-xs)` = 4px），对应真页的 `druids_margin--left-xs` helper。
//
// **不传 `gap`**，两个理由：①真页该 Flex `gap: 0px`——计数槽与 Text 块之间必须零间距；
// ②datafox `<Flex gap>` 当前**恒失效**：React 把随后的 `columnGap/rowGap: undefined` 写成 `''`，
// 清掉 `gap` 简写刚设好的长写属性（已记 deferred-work）。flex 容器 `gap: normal` 行为等同 0，故渲染无碍。
//
// 关键不变式：**服务名 x 恒为「树 span 右缘 + 20」**，与 depth 无关、与叶/枝无关、与有无错误无关。
// 靠「计数槽定宽 20px 且叶行也渲染（空串）」锁死——真页正是如此；条件渲染会让同级兄弟错开一个徽标宽。
// 错误 ⚠ 与 HTTP pill 都在**尾部槽**（互斥，pill 优先），不参与左侧几何。
import { ArrowRightIcon, AttentionCircledIcon, Flex, FlexItem, FormattedNumber, HttpStatusPill, Text } from '@datafox/ui';
import { css } from '@emotion/css';

import type { RenderableRow } from '../core';
import { useStyles2, type Theme } from '../theme';

import { colorForService } from './colorAccessor';
import { DdIndentGuides } from './DdIndentGuides';
import { ui } from './uiTokens';
import { spanPresentation } from './spanPresentation';

const getStyles = (theme: Theme) => ({
  // `display:flex` / `alignItems` / `wrap` 由 datafox `<Flex>` 自身给出（默认值即真页值），此处只补
  // 它作为「外层 flex item」的尺寸行为与字体。
  cell: css({
    label: 'DdLabelCell',
    // Story 9.3（D5）：本 cell 是 DdSpanRow.labelCol 的 flex item，默认 `flex:0 1 auto` 只占内容宽，
    // 会导致内部 spacer 无处伸展、pill 推不到右端。须撑满标签列。
    flex: '1 1 auto',
    fontFamily: ui.fontSans,
    // Story 9.3f（D6）：真页标签 Text 为 `text--xs` = 11px。9.2 写 12px 是为「保留原值不放大」，前提本身未经真页核实。
    fontSize: 11,
    color: ui.text,
  }),
  // Story 9.3f（复审 / D12）：错误图标在真页位于**标签列尾部槽**（spacer 之后、ActionTray 之前），
  // 与 HttpStatusPill 共用同一个 `<Flex marginLeft="xs">` 槽位，而非夹在计数与文本之间。
  // 真页实测（error trace `6a4fc31c…`）：`<svg class="Icon size--md"><use href="#…attention-circled" fill="var(--ui-status-danger)">`。
  errorIcon: css({ label: 'DdLabelError', color: ui.statusDanger, flex: 'none' }),
  text: css({
    label: 'DdLabelText',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    minWidth: 0,
    cursor: 'pointer',
    '&:hover': { textDecoration: 'underline' },
  }),
  // service/operation 仍供 RPC 合并块使用（主标签已改用 datafox <Text>，Story 9.2）。
  // Story 9.3f（D7）：RPC 合并块 / 未插桩 peer 是本仓自有特性，真页无对应元素，配色不动。
  service: css({ fontWeight: theme.typography.fontWeightMedium }),
  operation: css({ color: ui.textSecondary, marginLeft: 6 }),
  // 子代计数槽。Story 9.3（D5 / Hyp.2）：真页把计数放在**最左**（折叠箭头之后、服务图标之前）。
  // Story 9.3f（D1/D3）：`flex:0 0 auto` 由 `<FlexItem>` 默认给出；这里只补 `-4px` 咬合——
  // 复刻真页两个 grid 列的负边距（col1 树 span `margin-right:-16d`，col2 标签 cell `margin-left:-4+16d`；
  // 合成一个 flex 行后 `16d` 由树 span 自身宽度承担，只剩 `-4`）。槽宽由内层 countText 的定宽撑出（真页同构）。
  countWrap: css({ label: 'DdLabelCount', marginLeft: -4 }),
  // 计数本体：inline-block + 定宽 20px + 右对齐（真页 `span.…__children-count` 逐位如此）。
  // 右对齐让多位数向左长进树 span，而不是把后面的文本推右。
  countText: css({ label: 'DdLabelCountText', display: 'inline-block', width: 20, minWidth: 20, lineHeight: '23px' }),
  // Story 9.3（D5）：flex-grow 空占位，把 HTTP pill 推到标签列右端。
  // Story 9.3f：真页该 FlexItem 为 `flex: 1 0 auto` —— 即 `<FlexItem grow={1}>`（datafox 默认 shrink=0、basis=auto）。
  spacer: css({ label: 'DdLabelSpacer' }),
  // HTTP 状态 pill 现由 datafox `<HttpStatusPill>` 渲染（Story 9.2）。真页 pill 容器 = `<Flex marginLeft="xs">`。
  // Story 9.3f（D8）：额外 `marginRight="xs"` 复刻真页 pill 之后那个**零宽 ActionTray 容器**的 `margin-left: 4px`
  // ——真页 pill 右缘距标签列右缘恒 11px（4 + cell padding 7）。我方 tray 是绝对定位、不占流，故记在 pill 上。
  // `flex:'none'` 是对真页 `0 1 auto` 的**有意加强**：长名截断由 `.text`（min-width:0 + ellipsis）独扛，pill 永不被压。
  pillWrap: css({ label: 'DdHttpStatusPillWrap', flex: 'none' }),
  // RPC 合并 / 未插桩外部服务（Story 4.4）。
  rpc: css({
    label: 'DdLabelRpc',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
    minWidth: 0,
    color: ui.textSecondary,
  }),
  rpcDot: css({ label: 'DdLabelRpcDot', width: 8, height: 8, borderRadius: 2, flex: 'none' }),
  rpcArrow: css({ label: 'DdLabelRpcArrow', color: ui.textSecondary, flex: 'none' }),
  rpcText: css({ label: 'DdLabelRpcText', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
});

interface Props {
  row: RenderableRow;
  color?: string;
}

export function DdLabelCell({ row, color }: Props) {
  const styles = useStyles2(getStyles);
  const theme = useStyles2((t) => t);
  const { span } = row;
  const { resourceName, Icon, type } = spanPresentation(span);
  const showError = row.isError || row.descendantHasError;

  return (
    <Flex className={styles.cell} minWidth={0} isFullHeight>
      {/* `isAfterRoot`：真页 `.tr--is-root + .tr` —— 根恒为首行，故「紧跟根行」= 第二个可见 span 行。 */}
      <DdIndentGuides
        ancestorSpanIds={row.ancestorSpanIds}
        hasChildren={span.hasChildren}
        isCollapsed={row.isCollapsed}
        isAfterRoot={row.spanIndex === 1}
        onToggle={() => row.onChildrenToggle(span.spanID)}
      />
      {/* Story 9.3（D5/Hyp.2）：子代计数居左——紧随折叠箭头，位于服务名之前（真页顺序）。
          Story 9.3f（D1）：**恒渲染**，叶行为空串。条件渲染会让叶/枝行的文本起点差一个徽标宽（实测 27px）。 */}
      <FlexItem className={styles.countWrap}>
        {/* Story 9.3g 复审：真页该 span 带 `druids_measures_formatted-number` 类 ⇒ 走 datafox `<FormattedNumber>`。
            `type="integer"`（非默认 `human`）：真页 5 个子节点显示 `5`，而 `human` 会给 `5.00`——由此定死格式。
            `integer` 对 |v|<1000 取整、≥1000 走 3 位有效数字 SI 缩写（`1.23k`），避免 4 位数撑破 20px 槽。
            叶行传 `undefined` → 渲染 `nullText=''`，槽仍占 20px（同级兄弟对齐的机制，勿改为条件渲染）。

            Story 9.3i：这里是 **`descendantSpanCount`（子孙总数）**，不是 `childSpanCount`（直接子节点数）。
            二者在小树上常常相等，改错了不会报错、只会静默显示一个小得多的数。 */}
        <Text as="span" size="xs" color="secondary" align="right" className={styles.countText}>
          <FormattedNumber
            value={span.descendantSpanCount > 0 ? span.descendantSpanCount : undefined}
            type="integer"
            nullText=""
          />
        </Text>
      </FlexItem>
      <span style={{ color, display: 'inline-flex', flexShrink: 0, marginLeft: 4 }}><Icon size="md" title={type} /></span>
      <span
        className={styles.text}
        onClick={() => row.onDetailToggle(span.spanID)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            row.onDetailToggle(span.spanID);
          }
        }}
      >
        {/* Story 9.3f（D6）：`size="xs"` = 11px = 真页 `text--xs`；`weight="bold"` = 600 = 真页 `text--bold`。
            `marginLeft="xs"`：真页 Text 块内**每个** inline 子元素都挂 `margin--left-xs`（服务名自己也有，不是图标的边距）。
            故 D5 不做类型图标时，服务名落在「树右缘 + 20」= 真页的 40 减去图标占的 16。 */}
        <Text as="span" size="xs" weight="bold" marginLeft="xs">
          {span.process.serviceName}
        </Text>
        {/* Story 9.3f（D3/D4）：`marginLeft="xs"` = `var(--spacing-xs)` = 4px = 真页 `margin--left-xs`。
            真页 resource 名与服务名**同色**（两个 span 的 computed color 皆 `--ui-text`），只把字重从 600 降到 400。
            原先的 `color="secondary"` 灰是本仓自造，非真页真值。 */}
        <Text as="span" size="xs" marginLeft="xs">
          {resourceName}
        </Text>
      </span>
      {/* RPC 合并：折叠 client 时显示其 server 子的对端服务/操作（服务色着色，AD-6） */}
      {row.rpc && (
        <span className={styles.rpc} title={`${row.rpc.serviceName} · ${row.rpc.operationName}`} data-testid="rpc-merge">
          <span className={styles.rpcArrow}>
            <ArrowRightIcon size="xs" />
          </span>
          <span className={styles.rpcDot} style={{ background: colorForService(row.rpc.serviceName, theme) }} />
          <span className={styles.rpcText}>
            <span className={styles.service}>{row.rpc.serviceName}</span>
            <span className={styles.operation}>{row.rpc.operationName}</span>
          </span>
        </span>
      )}
      {/* 未插桩外部服务：叶子 client + peer.service */}
      {!row.rpc && row.noInstrumentedServer && (
        <span className={styles.rpc} title={`外部服务 ${row.noInstrumentedServer.serviceName}`} data-testid="peer-service">
          <span className={styles.rpcArrow}>
            <ArrowRightIcon size="xs" />
          </span>
          <span className={styles.rpcDot} style={{ background: colorForService(row.noInstrumentedServer.serviceName, theme) }} />
          <span className={styles.rpcText}>{row.noInstrumentedServer.serviceName}</span>
        </span>
      )}
      {/* Story 9.3（D5）：spacer 把尾部槽推到标签列右端（真页 `flex: 1 0 auto` 的空 FlexItem）。 */}
      <FlexItem grow={1} className={styles.spacer} />
      {/* HTTP 状态优先占用尾部槽；不改变 OTel 错误计数和筛选。 */}
      {row.httpStatus != null && (
        // HTTP pill：size=xs（h20 / 11px），datafox StatusPill 默认档；真页 pill 亦 h20。
        <Flex className={styles.pillWrap} marginLeft="xs" marginRight="xs">
          <HttpStatusPill statusCode={row.httpStatus} size="xs" />
        </Flex>
      )}
      {row.httpStatus == null && showError && (
        <Flex className={styles.errorIcon} marginLeft="xs" marginRight="xs">
          {/* 公共图标的 title 同时提供读屏名称，区分自身与折叠后代错误。 */}
          <AttentionCircledIcon size="md" title={row.isError ? 'error' : 'descendant error'} />
        </Flex>
      )}
    </Flex>
  );
}
