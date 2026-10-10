/**
 * What the filtered ledger shows, as pure functions: which data source answers
 * a filter, and the summary line under the chips.
 * docs/03-expenses.md § "Ledger filters" → Query strategy / In the ledger.
 *
 * The screen keeps none of this: the source decision is a switch over the
 * bounded server query, and the summary is a string built from a count and a
 * `Money`. Both are testable without Firestore or a device.
 */

import { type CurrencyCode, type Expense, type Money, formatMoney, sum } from '@loop/shared';

import { type LedgerFilter, isEmpty, serverQueryFor } from './ledger-filter';

/**
 * Where the rows come from.
 *
 * - `recent` — no filter at all: the live paged listener, exactly as v1.
 * - `range` — a date range bounds the read, so `observeExpensesInRange` loads
 *   every row in it and counts are exact.
 * - `scan` — a filter with no date range: the paged scan walks back page by
 *   page (`scanPages`) and may stop before the collection ends.
 */
export type LedgerSource =
  | { readonly kind: 'recent' }
  /** Half-open, matching the existing `localDate` range query. */
  | { readonly kind: 'range'; readonly start: string; readonly endExclusive: string }
  | { readonly kind: 'scan' };

export function ledgerSource(filter: LedgerFilter): LedgerSource {
  if (isEmpty(filter)) return { kind: 'recent' };
  const { dateRange } = serverQueryFor(filter);
  if (dateRange !== null) return { kind: 'range', start: dateRange.start, endExclusive: dateRange.endExclusive };
  return { kind: 'scan' };
}

export interface LedgerSummary {
  readonly count: number;
  readonly total: Money;
  /** False when the scan stopped early, so the numbers are lower bounds. */
  readonly complete: boolean;
}

export function ledgerSummary(rows: readonly Expense[], currency: CurrencyCode, complete: boolean): LedgerSummary {
  return { count: rows.length, total: sum(rows.map((row) => row.total), currency), complete };
}

/**
 * `42 transactions · ₹18,240.00 spent`. An incomplete scan prefixes **both**
 * numbers with `≥ `, because neither the count nor the total is final — the
 * ledger must never state a number it has not actually read.
 */
export function summaryLine(summary: LedgerSummary): string {
  const atLeast = summary.complete ? '' : '≥ ';
  const noun = summary.count === 1 ? 'transaction' : 'transactions';
  return `${atLeast}${summary.count} ${noun} · ${atLeast}${formatMoney(summary.total)} spent`;
}

const SCANNED_BACK_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `Scanned back to 12 Mar 2026` — how far the paged scan actually read. */
export function scannedBackLabel(localDate: string | null): string | null {
  if (localDate === null) return null;
  return `Scanned back to ${SCANNED_BACK_FORMAT.format(new Date(`${localDate}T00:00:00Z`))}`;
}
