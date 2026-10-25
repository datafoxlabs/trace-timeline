// Story 9.1 — Foundation 桥接（waterfall 区域先行）。
//
// waterfall 区域组件的 emotion 直接引用这些 datafox `--ui-*` 变量 / 值，
// 替代平行自研 DRUIDS 值（`theme.colors.*` / `theme.trace.status` 等来自 `theme/tokens/druids.ts`）。
// 全局 druids.ts / trace.ts / createTheme.ts **暂不动**（决策 D1）——火焰图/详情卡仍走旧 `theme.colors.*`，本次零影响。
//
// 明暗：由组件根 wrapper 的 `.dark` class 驱动（datafox `styles.css` 的 `.dark {}` 块重定义 `--ui-*`），
// 这些 `var(--ui-*)` 字符串明暗同值、靠 CSS 级联切换；消费端须 `import '@datafox/ui/styles.css'`。
//
// 变量名均已核对 `datafox-ui/src/styles/theme.css` 存在。

export const ui = {
  // —— 文本 ——
  text: 'var(--ui-text)',
  textSecondary: 'var(--ui-text-secondary)',
  textDisabled: 'var(--ui-text-disabled)',
  // —— 背景 ——
  bg: 'var(--ui-background)',
  bgSecondary: 'var(--ui-background-secondary)',
  bgElevated: 'var(--ui-background-elevated)',
  // 深色浮起面。datafox `Tooltip` 即用它作深色卡底（`tooltip.tsx`: bg-ui-background-shade + text-ui-text-knockout）。
  // 亮 #464b59 / 暗 #3b393d —— **两态都是深色，不反相**。
  // ⚠ 刻度游标不用它：真页游标暗态是**浅底深字**（见 DdTimeCursor.tsx 顶部的 DRUIDS 原文）。
  // 留给 Story 9.5 的 hover 浮层（真页浮层上半 = #3b393d，正是本 token 的暗态值）。
  bgShade: 'var(--ui-background-shade)',
  // 深底之上的反白文字（明暗同为 #fff）。
  textKnockout: 'var(--ui-text-knockout)',
  // —— 边框 ——
  border: 'var(--ui-border)',
  formBorder: 'var(--ui-form-border)',
  // —— 交互主色（选中竖条 / 聚焦边 / reframe 游标 / 链接）——datafox interaction-primary = 蓝 #006bc2（≈ Datadog #3598EC）。
  interactionPrimary: 'var(--ui-interaction-primary)',
  // —— 交互次色（软蓝交互底：选中/hover 行）——datafox interaction-secondary 亮值 #eaf6fc = 原 DRUIDS selectedRowBg rgb(234,246,252) 逐位吻合；暗值 #091222。
  interactionSecondary: 'var(--ui-interaction-secondary)',
  // —— 状态（fg / soft 底）——
  statusSuccess: 'var(--ui-status-success)',
  statusSuccessSoft: 'var(--ui-status-success-soft)',
  statusDanger: 'var(--ui-status-danger)',
  statusDangerSoft: 'var(--ui-status-danger-soft)',
  statusWarning: 'var(--ui-status-warning)',
  statusWarningSoft: 'var(--ui-status-warning-soft)',
  // ⚠ datafox status-in-progress 实为**紫**（#9364cd / soft #f2ecfc），非蓝；此二 token 暂无区域消费者，保留待后续真·in-progress 语义使用。
  statusInfo: 'var(--ui-status-in-progress)',
  statusInfoSoft: 'var(--ui-status-in-progress-soft)',
  // —— 选中/hover/focus 行底（Datadog 浅蓝）——datafox interaction-secondary（软蓝交互底）逐位吻合原值，取代原先误用的紫 in-progress-soft。
  selectedRowBg: 'var(--ui-interaction-secondary)',
  // —— 搜索命中底（琥珀，区别 focus 蓝）——原硬编码 rgba(255,196,0,…) → token 化。
  matchBg: 'var(--ui-status-warning-soft)',
  // —— 字体（决策 D3：用 datafox typography；datafox 实为 Noto Sans 栈，非 Geist；栈内无 PingFang，CJK 靠浏览器 fallback）——
  fontSans: "'Noto Sans', 'NotoSans', 'Lucida Grande', 'Lucida Sans Unicode', sans-serif",
  fontMono: "'Roboto Mono', Menlo, 'Liberation Mono', Courier, monospace",
} as const;

// Story 9.2：区域 HTTP pill 已改用 datafox `<HttpStatusPill>`（原生 DRUIDS 着色：2xx 绿 / 3xx·4xx 橙 / 5xx 红），
// 故 9.1 的 `uiHttpStatus()` 桥接函数已移除（共享 `httpStatusToken` 仍服务详情卡，未动）。
