/**
 * The paged filter scan: how an unbounded ledger filter is answered without an
 * unbounded query. docs/03-expenses.md § "Ledger filters" → Query strategy (4):
 * without a date range we load a page at a time, newest first, keep the rows
 * `matches` accepts, and stop at 50 matches or 10 pages (500 rows). Whatever is
 * left over is reported, not hidden: `complete` says whether the source ran out,
 * and `scannedBackTo` is the date the ledger shows in "Scanned back to …".
 *
 * Pure: the cursor type is a parameter, so the Firestore snapshot never leaks in
 * here and the scan is testable with plain arrays.
 */

import { type Expense } from '@loop/shared';

import { type LedgerFilter, type MatchContext, matches } from './ledger-filter';

/** One page from the source, newest first. `next` is null when the source is exhausted. */
export interface Page<C> {
  readonly items: readonly Expense[];
  readonly next: C | null;
}

export interface ScanResult<C> {
  /** Every match found in the pages this scan fetched — not capped at `targetMatches`. */
  readonly matches: Expense[];
  /** True when the source ran out, so counts and totals are exact. */
  readonly complete: boolean;
  /** Local date of the oldest row read, for "Scanned back to 12 Mar 2026". */
  readonly scannedBackTo: string | null;
  /** Cursor to resume from; pass it back as `startCursor` for "load more". */
  readonly next: C | null;
}

export interface ScanOptions<C> {
  readonly targetMatches?: number;
  readonly maxPages?: number;
  readonly startCursor?: C | null;
}

const DEFAULT_TARGET_MATCHES = 50;
const DEFAULT_MAX_PAGES = 10;

/**
 * Fetches pages until enough matches are found, the page budget is spent, or the
 * source ends. `fetchPage` is called with null first (or `startCursor`), then
 * with the previous page's `next`.
 */
export async function scanPages<C>(
  fetchPage: (cursor: C | null) => Promise<Page<C>>,
  filter: LedgerFilter,
  ctx: MatchContext,
  opts: ScanOptions<C> = {},
): Promise<ScanResult<C>> {
  const targetMatches = opts.targetMatches ?? DEFAULT_TARGET_MATCHES;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  let cursor: C | null = opts.startCursor ?? null;

  const found: Expense[] = [];
  let scannedBackTo: string | null = null;
  let complete = false;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchPage(cursor);
    pages += 1;
    for (const item of page.items) {
      if (matches(filter, item, ctx)) found.push(item);
    }
    const last = page.items.at(-1);
    if (last !== undefined) scannedBackTo = last.localDate;
    cursor = page.next;
    complete = page.next === null;
    if (complete || found.length >= targetMatches) break;
  }

  return { matches: found, complete, scannedBackTo, next: cursor };
}
