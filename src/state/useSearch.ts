import { useCallback, useEffect, useMemo, useState } from 'react';
import { isErrorSpan } from '../core';
import type { Trace, TraceSpan } from '../model';
import { createSpanSearchRecords, parseSpanSearch } from './spanSearchQuery';

export interface SearchState {
  query: string;
  setQuery: (q: string) => void;
  matches: Set<string> | undefined;
  matchCount: number;
  /** Retained for existing programmatic consumers; the toolbar preserves the tree. */
  showMatchesOnly: boolean;
  setShowMatchesOnly: (v: boolean) => void;
  /** Intersect query matches with errors without hiding context rows. */
  errorsOnly: boolean;
  setErrorsOnly: (v: boolean) => void;
  errorCount: number;
  focusedMatchId: string | undefined;
  focusedMatchIndex: number;
  nextMatch: () => void;
  prevMatch: () => void;
}

interface SearchSelection {
  spans?: TraceSpan[];
  selectedSpanId?: string;
  onNavigate?: (id: string) => void;
}

export function useSearch(trace: Trace | null | undefined, selection: SearchSelection = {}): SearchState {
  const [query, setQueryRaw] = useState('');
  const [showMatchesOnly, setShowMatchesOnly] = useState(false);
  const [errorsOnly, setErrorsOnlyRaw] = useState(false);
  const [focused, setFocused] = useState<string>();
  const spans = selection.spans ?? trace?.spans;
  const records = useMemo(() => createSpanSearchRecords(spans ?? []), [spans]);
  const errorIds = useMemo(() => new Set(spans?.filter(isErrorSpan).map(span => span.spanID)), [spans]);
  const { selectedSpanId, onNavigate } = selection;

  useEffect(() => {
    setQueryRaw(''); setErrorsOnlyRaw(false); setFocused(undefined); setShowMatchesOnly(false);
  }, [trace?.traceID]);

  const findMatches = useCallback((text: string, errors: boolean) => {
    if (!text.trim() && !errors) return undefined;
    const parsed = parseSpanSearch(text);
    return new Set(records.filter(record => parsed.matches(record) && (!errors || errorIds.has(record.span.spanID))).map(record => record.span.spanID));
  }, [records, errorIds]);
  const matches = useMemo(() => findMatches(query, errorsOnly), [findMatches, query, errorsOnly]);
  const ordered = useMemo(() => [...(matches ?? [])], [matches]);
  // With detail selection, the cursor follows that selection exclusively.
  // Selecting a non-match must report 0/N rather than revive an old match.
  const cursorId = onNavigate ? selectedSpanId : focused;
  const focusedMatchId = cursorId && matches?.has(cursorId) ? cursorId : undefined;
  const focusedMatchIndex = focusedMatchId ? ordered.indexOf(focusedMatchId) + 1 : 0;

  const navigate = useCallback((id: string | undefined) => {
    setFocused(id);
    if (id && id !== selectedSpanId) onNavigate?.(id);
  }, [selectedSpanId, onNavigate]);
  const commit = useCallback((text: string, errors: boolean) => {
    const next = findMatches(text, errors);
    const existing = selectedSpanId ?? focusedMatchId;
    navigate(existing && next?.has(existing) ? existing : next?.values().next().value);
  }, [findMatches, selectedSpanId, focusedMatchId, navigate]);
  const setQuery = useCallback((text: string) => {
    if (parseSpanSearch(text).error) return;
    setQueryRaw(text); commit(text, errorsOnly);
  }, [commit, errorsOnly]);
  const setErrorsOnly = useCallback((value: boolean) => {
    setErrorsOnlyRaw(value); commit(query, value);
  }, [commit, query]);
  const move = useCallback((direction: number) => {
    if (!ordered.length) return;
    const index = focusedMatchIndex === 0
      ? direction > 0 ? 0 : ordered.length - 1
      : (focusedMatchIndex - 1 + direction + ordered.length) % ordered.length;
    navigate(ordered[index]);
  }, [ordered, focusedMatchIndex, navigate]);

  return {
    query, setQuery, matches, matchCount: ordered.length, showMatchesOnly, setShowMatchesOnly,
    errorsOnly, setErrorsOnly, errorCount: errorIds.size, focusedMatchId, focusedMatchIndex,
    nextMatch: useCallback(() => move(1), [move]), prevMatch: useCallback(() => move(-1), [move]),
  };
}
