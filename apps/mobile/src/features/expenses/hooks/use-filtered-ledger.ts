/**
 * The ledger's rows for the current filter, from whichever source answers it
 * (docs/03-expenses.md § "Ledger filters" → Query strategy). `ledgerSource`
 * makes the choice; this hook only runs it:
 *
 * - `recent` — the live paged listener, exactly as the unfiltered v1 ledger.
 * - `range`  — `observeExpensesInRange` loads the whole range, so the summary
 *              is exact.
 * - `scan`   — `scanPages` walks back a page at a time and may stop early;
 *              "Load more" continues from the cursor it stopped on.
 *
 * Rows come back **unfiltered for the listener sources**: the caller applies
 * `matches` to every row either way, which is idempotent on the scan's rows and
 * keeps the facets the server cannot express in one place.
 *
 * Pages already read are kept for the life of the screen, so retyping a search
 * term re-scans from memory instead of re-reading hundreds of documents. A scan
 * is a one-shot read, so an expense saved on another screen while a filter is
 * active appears when the filter is cleared (which returns to the live listener).
 */

import { type Expense } from '@loop/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import {
  type ExpenseCursor,
  type ExpensesSnapshot,
  fetchExpensesPage,
  observeExpensesInRange,
  observeRecentExpenses,
} from '../api/expense-repository';
import { type Page, scanPages } from '../model/filter-scan';
import { type LedgerFilter, type MatchContext } from '../model/ledger-filter';
import { ledgerSource } from '../model/ledger-view';

/** One scan page, and the page budget a single scan (or "Load more") spends. */
const SCAN_PAGE = 50;
const SCAN_MAX_PAGES = 10;

interface LedgerRows {
  readonly expenses: readonly Expense[];
  /** False when the scan stopped early: counts and totals are lower bounds. */
  readonly complete: boolean;
  /** Oldest local date read, for "Scanned back to 12 Mar 2026". */
  readonly scannedBackTo: string | null;
  readonly fromCache: boolean;
  readonly pendingIds: ReadonlySet<string>;
  /** Null unless a stopped scan has somewhere left to continue. */
  readonly loadMore: (() => void) | null;
  readonly loadingMore: boolean;
}

export type FilteredLedgerState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | ({ readonly status: 'ready' } & LedgerRows);

const NO_PENDING: ReadonlySet<string> = new Set();

const fromSnapshot = (snapshot: ExpensesSnapshot): FilteredLedgerState => ({
  status: 'ready',
  expenses: snapshot.expenses,
  complete: true,
  scannedBackTo: null,
  fromCache: snapshot.fromCache,
  pendingIds: snapshot.pendingIds,
  loadMore: null,
  loadingMore: false,
});

export function useFilteredLedger(filter: LedgerFilter, ctx: MatchContext, pageSize: number): FilteredLedgerState {
  const { uid } = useSession();
  const source = useMemo(() => ledgerSource(filter), [filter]);
  const [state, setState] = useState<FilteredLedgerState>({ status: 'loading' });

  // Read at the start of a run, so a listener never restarts on a keystroke.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  /** Pages read so far, in order from the newest row; the resume index follows them. */
  const readRef = useRef<{ uid: string; pages: Page<ExpenseCursor>[] }>({ uid, pages: [] });
  /** Where the live scan stopped: the cursor to continue from and its page index. */
  const resumeRef = useRef<{ cursor: ExpenseCursor | null; index: number } | null>(null);
  /** Bumped by every run so a run that has been superseded cannot write state. */
  const runRef = useRef(0);
  const loadingMoreRef = useRef(false);

  /**
   * A page reader for a scan starting at absolute page `startIndex`. Pages are
   * fetched in order from `null`, so the index identifies a page uniquely and a
   * repeat scan is served from memory.
   */
  const pageReader = useCallback(
    (startIndex: number) => {
      const at = { index: startIndex };
      const fetchPage = async (cursor: ExpenseCursor | null): Promise<Page<ExpenseCursor>> => {
        const cached = readRef.current.pages[at.index];
        if (cached !== undefined) {
          at.index += 1;
          return cached;
        }
        const page = await fetchExpensesPage(uid, SCAN_PAGE, cursor);
        readRef.current.pages[at.index] = page;
        at.index += 1;
        return page;
      };
      return { fetchPage, at };
    },
    [uid],
  );

  /**
   * The effect key leaves the filter out for the listener sources, which do not
   * use it, and includes it for a scan, whose stopping point depends on it. The
   * category count is in it because a text facet can match a category name.
   */
  const effectKey =
    source.kind === 'scan'
      ? `scan:${JSON.stringify(filter)}:${ctx.categoriesById.size}`
      : source.kind === 'range'
        ? `range:${source.start}:${source.endExclusive}`
        : `recent:${pageSize}`;

  useEffect(() => {
    if (readRef.current.uid !== uid) readRef.current = { uid, pages: [] };
    const run = runRef.current + 1;
    runRef.current = run;
    resumeRef.current = null;
    loadingMoreRef.current = false;
    const live = () => runRef.current === run;

    const onChange = (snapshot: ExpensesSnapshot) => {
      if (live()) setState(fromSnapshot(snapshot));
    };
    const onError = (error: Error) => {
      if (live()) setState({ status: 'error', message: error.message });
    };

    const current = sourceRef.current;
    if (current.kind === 'range') return observeExpensesInRange(uid, current.start, current.endExclusive, onChange, onError);
    if (current.kind === 'recent') return observeRecentExpenses(uid, pageSize, onChange, onError);

    // Rows already on screen stay while the new scan runs: the caller re-applies
    // `matches` with the new filter, so what is shown is always a subset of the
    // new result — briefly incomplete, never wrong, and it does not flicker on
    // every keystroke.
    // `complete` drops to false until the new scan lands, so the summary says
    // "≥" rather than claiming a total this scan has not actually read yet.
    setState((previous) => (previous.status === 'ready' ? { ...previous, complete: false } : { status: 'loading' }));
    const { fetchPage, at } = pageReader(0);
    scanPages(fetchPage, filterRef.current, ctxRef.current, { targetMatches: SCAN_PAGE, maxPages: SCAN_MAX_PAGES })
      .then((result) => {
        if (!live()) return;
        resumeRef.current = { cursor: result.next, index: at.index };
        setState({
          status: 'ready',
          expenses: result.matches,
          complete: result.complete,
          scannedBackTo: result.scannedBackTo,
          fromCache: false,
          pendingIds: NO_PENDING,
          loadMore: null,
          loadingMore: false,
        });
      })
      .catch((error: unknown) => onError(error instanceof Error ? error : new Error(String(error))));
    return undefined;
    // `effectKey` stands in for the source and the parts of the filter it reads;
    // both are read through refs so a keystroke cannot restart a listener.
  }, [uid, pageSize, effectKey, pageReader]);

  /** Continues the stopped scan for another page budget and appends what it finds. */
  const loadMore = useCallback(() => {
    const resume = resumeRef.current;
    if (resume === null || resume.cursor === null || loadingMoreRef.current) return;
    const run = runRef.current;
    loadingMoreRef.current = true;
    setState((previous) => (previous.status === 'ready' ? { ...previous, loadingMore: true } : previous));

    const { fetchPage, at } = pageReader(resume.index);
    scanPages(fetchPage, filterRef.current, ctxRef.current, {
      targetMatches: SCAN_PAGE,
      maxPages: SCAN_MAX_PAGES,
      startCursor: resume.cursor,
    })
      .then((result) => {
        if (runRef.current !== run) return;
        loadingMoreRef.current = false;
        resumeRef.current = { cursor: result.next, index: at.index };
        setState((previous) =>
          previous.status === 'ready'
            ? {
                ...previous,
                expenses: [...previous.expenses, ...result.matches],
                complete: result.complete,
                scannedBackTo: result.scannedBackTo ?? previous.scannedBackTo,
                loadingMore: false,
              }
            : previous,
        );
      })
      .catch((error: unknown) => {
        loadingMoreRef.current = false;
        if (runRef.current === run) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
  }, [pageReader]);

  if (state.status !== 'ready' || state.complete) return state;
  const canLoadMore = resumeRef.current !== null && resumeRef.current.cursor !== null;
  return { ...state, loadMore: canLoadMore ? loadMore : null };
}
