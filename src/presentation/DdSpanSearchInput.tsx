import { css } from '@emotion/css';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  applyEditableSyntaxTextEdit, Flex, RichSearchBar, Text,
  type RichSearchBarHandle, type RichSearchBarSuggestionGroup, type RichSearchBarTextSelection,
} from '@datafox/ui';
import type { TraceSpan } from '../model';
import { createSpanSearchRecords, getSpanSearchFields, parseSpanSearch } from '../state/spanSearchQuery';
import { createSpanSearchDocument, getSpanSearchPosition, getSpanSearchSuggestions, removeSpanSearchTerm, type SpanSearchSuggestion } from './spanSearchEditor';

const inputLayout = css({ flex: '1 1 0%', width: 0 });

interface DdSpanSearchInputProps {
  spans: readonly TraceSpan[];
  query: string;
  onSubmit: (query: string) => void;
  placeholder: string;
  className?: string;
}

/** Trace-local query adapter. Editing, anchoring, listboxes and keyboard belong to Datafox UI. */
export function DdSpanSearchInput({ spans, query, onSubmit, placeholder, className }: DdSpanSearchInputProps) {
  const [draft, setDraft] = useState(query);
  const [cursor, setCursor] = useState(query.length);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [recent, setRecent] = useState<string[]>([]);
  const [selection, setSelection] = useState<RichSearchBarTextSelection | null>(null);
  const editor = useRef<RichSearchBarHandle>(null);
  const latestDraft = useRef(draft);
  const errorId = useId();
  const edits = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const fields = useMemo(() => getSpanSearchFields(createSpanSearchRecords(spans)), [spans]);
  const document = useMemo(() => createSpanSearchDocument(draft), [draft]);
  const suggestions = getSpanSearchSuggestions(draft, cursor, fields);
  const history: SpanSearchSuggestion[] = recent.filter(text => text !== draft && text.toLowerCase().includes(draft.toLowerCase())).map(text => ({
    id: `history:${text}`, label: text, kind: 'history', from: 0, to: draft.length, replacement: text,
  }));
  const all = [...suggestions, ...history];
  const active = open && all.some(item => item.id === activeId) ? activeId : null;

  useLayoutEffect(() => {
    setDraft(query); latestDraft.current = query; setCursor(query.length); setError(undefined);
  }, [query]);
  useLayoutEffect(() => {
    if (!selection || !editor.current) return;
    setSelection(null);
    const start = getSpanSearchPosition(document, selection.start);
    const end = getSpanSearchPosition(document, selection.end);
    editor.current.focus();
    if (start.partId === end.partId) {
      editor.current.setPartSelection(start.partId, { start: start.offset, end: end.offset });
      return;
    }
    editor.current.setPartSelection(end.partId, { start: end.offset, end: end.offset });
    const native = editor.current.getEditorElement()?.ownerDocument.getSelection();
    const node = native?.focusNode;
    const offset = native?.focusOffset;
    editor.current.setPartSelection(start.partId, { start: start.offset, end: start.offset });
    if (node && offset != null) native?.extend(node, offset);
  }, [document, selection]);

  function change(text: string, start = text.length, end = start, record = true) {
    if (record && text !== latestDraft.current) {
      edits.current = { undo: [...edits.current.undo, latestDraft.current].slice(-100), redo: [] };
    }
    setDraft(text); latestDraft.current = text; setCursor(start); setSelection({ start, end });
    setError(undefined); setActiveId(null); setOpen(true);
  }
  function restore(isRedo: boolean) {
    const source = isRedo ? edits.current.redo : edits.current.undo;
    const text = source[source.length - 1];
    if (text === undefined) return;
    edits.current = isRedo
      ? { undo: [...edits.current.undo, draft], redo: source.slice(0, -1) }
      : { undo: source.slice(0, -1), redo: [...edits.current.redo, draft] };
    change(text, text.length, text.length, false);
  }
  function submit(text: string) {
    const parsed = parseSpanSearch(text);
    setError(parsed.error);
    if (parsed.error) { setOpen(false); return; }
    onSubmit(text);
    setOpen(false); setActiveId(null);
    if (text.trim()) setRecent(previous => [text, ...previous.filter(item => item !== text)].slice(0, 5));
  }
  function select(item: SpanSearchSuggestion) {
    const text = draft.slice(0, item.from) + item.replacement + draft.slice(item.to);
    change(text, item.from + item.replacement.length);
    if (item.kind !== 'field' && !parseSpanSearch(text).error) submit(text);
  }
  const group = (id: string, label: string, items: SpanSearchSuggestion[]): RichSearchBarSuggestionGroup => ({
    id, ariaLabel: label, label: id === 'history' ? label : undefined,
    suggestions: items.map(item => ({
      id: item.id, ariaLabel: item.label, content: <Text size="md">{item.label}</Text>,
      trailingContent: item.count === undefined ? undefined : <Text size="sm" variant="secondary">{item.count}</Text>,
    })),
  });

  return <Flex className={inputLayout} direction="column" alignItems="stretch" minWidth={150}>
    <RichSearchBar ref={editor} className={className} syntaxDocument={document}
      ariaLabel="搜索 span" ariaDescribedBy={error ? errorId : undefined} placeholder={placeholder}
      isInvalid={Boolean(error)}
      isSuggestionsOpen={open} onSuggestionsOpenChange={setOpen}
      activeSuggestionId={active} onActiveSuggestionChange={setActiveId}
      suggestionGroups={[
        group('attributes', suggestions[0]?.kind === 'value' ? 'Attributes values' : 'Span attributes', suggestions),
        ...(history.length ? [group('history', 'Recent Searches', history)] : []),
      ]}
      suggestionState={all.length ? { status: 'ready' } : { status: 'empty', message: '没有候选值，可继续输入查询' }}
      footer={<Flex gap="md" wrap>
        <Text size="sm">Field: <Text isMonospace size="sm">service:api</Text></Text>
        <Text size="sm">Range: <Text isMonospace size="sm">duration:&gt;200ms</Text></Text>
        <Text size="sm">Union: <Text isMonospace size="sm">service:(a OR b)</Text></Text>
      </Flex>}
      onTextChange={(text, selection) => change(text, selection?.start ?? text.length, selection?.end ?? text.length)}
      onControlledTextEdit={edit => {
        if (edit.inputType === 'historyUndo' || edit.inputType === 'historyRedo') {
          restore(edit.inputType === 'historyRedo'); return;
        }
        const next = applyEditableSyntaxTextEdit({ value: draft, selectionStart: edit.selection.start, selectionEnd: edit.selection.end, inputType: edit.inputType, data: edit.data });
        if (next) change(next.value, next.selectionStart, next.selectionEnd);
      }}
      onSelectionChange={selection => { if (selection && selection.start !== cursor) { setCursor(selection.start); setActiveId(null); } }}
      onEditorKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault(); restore(event.shiftKey); return;
        }
        if (event.key === 'Escape' && open) event.stopPropagation();
        if (event.key === 'Enter' && !active) { event.preventDefault(); submit(latestDraft.current); }
      }}
      onSuggestionSelect={suggestion => { const item = all.find(item => item.id === suggestion.id); if (item) select(item); }}
      onSubmit={submit}
      onClear={draft ? () => { change(''); submit(''); } : undefined}
      onPillRemove={id => { const text = removeSpanSearchTerm(draft, id); change(text); submit(text); }} />
    {error && <Text id={errorId} role="alert" size="sm" variant="danger">{error}</Text>}
  </Flex>;
}
