import { useMemo, type ReactNode } from "react";
import { css } from "@emotion/css";
import {
  CopyButton,
  ErrorMessage,
  Flex,
  Link,
  StackTrace,
  ToggleButtons,
} from "@datafox/ui";
import { useRetainedCardState, type CardState } from './retainedCardState';
import type { SpanError } from "./SpanErrors";
import {
  groupStackLines,
  parseStackLines,
  type StackLine,
} from "./stackFrames";

const frameText = css({
  minWidth: 0,
  flex: 1,
  fontFamily: "var(--font-mono)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});
const frameRow = css({
  "& .stack-file-copy": { opacity: 0 },
  "&:hover .stack-file-copy, &:focus-within .stack-file-copy": { opacity: 1 },
});
const modes = [
  { value: "pretty", label: "格式化" },
  { value: "raw", label: "原始" },
] as const;

export function ErrorStackContent({ error, actions, state, stateKey = 'stack' }: { error: SpanError; actions?: ReactNode; state?: CardState; stateKey?: string }) {
  const [mode, setMode] = useRetainedCardState<"pretty" | "raw">(state, `${stateKey}:mode`, "pretty");
  const [expandedGroups, setExpandedGroups] = useRetainedCardState<Set<number>>(state, `${stateKey}:groups`,
    () => new Set(),
  );
  const [folded, setFolded] = useRetainedCardState(state, `${stateKey}:folded`, true);
  const stack = error.stack ?? "";
  const groups = useMemo(() => {
    const lines = parseStackLines(stack);
    const summary = [error.type, error.message].filter(Boolean).join(": ");
    // Only remove an exact duplicate summary. Preserve differing messages and causes.
    if (summary && lines[0]?.raw.trim() === summary) lines.shift();
    while (lines.length && !lines[lines.length - 1].raw.trim()) lines.pop();
    return groupStackLines(lines);
  }, [stack, error.type, error.message]);


  return (
    <Flex direction="column" alignItems="stretch" gap="sm">
      <Flex justify="space-between" alignItems="center" gap="sm" wrap>
        <ToggleButtons
          aria-label="堆栈显示方式"
          options={modes}
          value={mode}
          isSoft
          size="md"
          onChange={(value) => {
            if (value) setMode(value);
          }}
        />
        <Flex alignItems="center" gap="sm" wrap>{actions}<CopyButton value={stack} messageCopy="复制完整堆栈" messageCopied="已复制" aria-label="复制完整堆栈" /></Flex>
      </Flex>
      <ErrorMessage type={error.type} message={error.message} isFullWidth>
        {mode === "raw" ? (
          <pre
            aria-label="原始堆栈"
            style={{
              margin: 0,
              padding: "var(--spacing-md)",
              fontFamily: "var(--font-mono)",
              fontSize: "inherit",
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {stack}
          </pre>
        ) : (
          <StackTrace
            stack={groups}
            isFoldedByDefault={folded}
            onClick={event => {
              // Retain the public disclosure state when a virtual row remounts.
              const disclosure = (event.target as HTMLElement).closest('button[aria-expanded]');
              if (disclosure) setFolded(disclosure.getAttribute('aria-expanded') === 'true');
            }}
            breakpoint={5}
            expandLabel="展开全部栈帧"
            collapseLabel="收起栈帧"
            preserveWhiteSpace="pre-wrap"
            style={{ minWidth: 0 }}
            renderItem={(item) =>
              item.kind === "line" ? <StackFrame line={item} /> : expandedGroups.has(item.id) ? (
                <Flex direction="column" alignItems="stretch" isFullWidth className={groupRows}>
                  {item.frames.map(line => <StackFrame key={line.id} line={line} />)}
                </Flex>
              ) : (
                <Link component={<button type="button" />} onClick={() => setExpandedGroups(current => new Set([...current, item.id]))}>
                  展开 {item.frames.length} 个第三方栈帧
                </Link>
              )
            }
          />
        )}
      </ErrorMessage>
    </Flex>
  );
}

const groupRows = css({
  '& > * + *': {
    borderTop: '1px solid var(--ui-border)',
    paddingTop: 'var(--spacing-sm)',
    marginTop: 'var(--spacing-sm)',
  },
});

function StackFrame({ line }: { line: StackLine }) {
  return <Flex alignItems="center" gap="xs" isFullWidth className={frameRow}>
    <span className={frameText} title={line.raw}>{line.display}</span>
    {line.file && <CopyButton size="xs" isBorderless value={line.file} messageCopy="复制文件名" messageCopied="已复制"
      aria-label={`复制文件名： ${line.file}`} wrapperClassName="stack-file-copy" />}
  </Flex>;
}
