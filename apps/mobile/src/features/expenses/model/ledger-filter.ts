/**
 * The ledger filter: a pure predicate model the filter sheet, the chips row and
 * the query planner all share. docs/03-expenses.md § "Ledger filters".
 *
 * P1 facets: text, date range, categories, amount, source. Later releases fill
 * in kinds (v1.2), accounts (v1.2), tags (v1.3) and merchant (v1.3); until then
 * those fields stay empty and `matches` ignores them.
 */

import { type Category, type CurrencyCode, type Expense, type ExpenseSource, addDays, formatMoney, money } from '@loop/shared';

import { matchesText } from './ledger';

export interface LedgerFilter {
  readonly text: string;
  /** Inclusive on both ends, local YYYY-MM-DD. */
  readonly dateRange: { readonly start: string; readonly end: string } | null;
  /** Empty = all. */
  readonly categoryIds: readonly string[];
  /** Minor units, inclusive. */
  readonly amountMin: number | null;
  readonly amountMax: number | null;
  /** Empty = all. */
  readonly sources: readonly ExpenseSource[];
  /** v1.2 — ignored while empty. */
  readonly kinds: readonly string[];
  /** v1.2 — ignored while empty. 'none' = no account. */
  readonly accountIds: readonly (string | 'none')[];
  /** v1.3 — ignored while empty. */
  readonly tagIds: readonly string[];
  /** v1.3 — ignored while null. */
  readonly merchantKey: string | null;
}

export const EMPTY_FILTER: LedgerFilter = {
  text: '',
  dateRange: null,
  categoryIds: [],
  amountMin: null,
  amountMax: null,
  sources: [],
  kinds: [],
  accountIds: [],
  tagIds: [],
  merchantKey: null,
};

export interface MatchContext {
  readonly categoriesById: ReadonlyMap<string, Category>;
}

export function matches(filter: LedgerFilter, expense: Expense, ctx: MatchContext): boolean {
  if (!matchesText(expense, filter.text.trim().toLowerCase(), ctx.categoriesById)) return false;
  if (filter.dateRange !== null) {
    if (expense.localDate < filter.dateRange.start || expense.localDate > filter.dateRange.end) return false;
  }
  if (filter.categoryIds.length > 0 && !filter.categoryIds.includes(expense.categoryId)) return false;
  if (filter.amountMin !== null && expense.total.minor < filter.amountMin) return false;
  if (filter.amountMax !== null && expense.total.minor > filter.amountMax) return false;
  if (filter.sources.length > 0 && !filter.sources.includes(expense.source)) return false;
  return true;
}

export interface ServerQuery {
  /** Half-open, for the existing `localDate` range query. */
  readonly dateRange: { readonly start: string; readonly endExclusive: string } | null;
  /** At most ONE equality constraint — Firestore index budget, docs/03 § Query strategy. */
  readonly equality: { readonly field: 'categoryId'; readonly value: string } | null;
}

/**
 * The bounded server query for a filter. Everything it doesn't cover is
 * filtered on the client with `matches`. The date range always wins when set,
 * because it is what bounds the read; in P1 the only equality is a single
 * category (index: deletedAt, categoryId, localDate DESC).
 */
export function serverQueryFor(filter: LedgerFilter): ServerQuery {
  const dateRange = filter.dateRange === null ? null : { start: filter.dateRange.start, endExclusive: addDays(filter.dateRange.end, 1) };
  const only = filter.categoryIds.length === 1 ? filter.categoryIds[0] : undefined;
  const equality = only === undefined ? null : ({ field: 'categoryId', value: only } as const);
  return { dateRange, equality };
}

export function isEmpty(filter: LedgerFilter): boolean {
  return (
    filter.text.trim() === '' &&
    filter.dateRange === null &&
    filter.categoryIds.length === 0 &&
    filter.amountMin === null &&
    filter.amountMax === null &&
    filter.sources.length === 0 &&
    filter.kinds.length === 0 &&
    filter.accountIds.length === 0 &&
    filter.tagIds.length === 0 &&
    filter.merchantKey === null
  );
}

export type ValidationResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'amountRange' };

export function validate(filter: LedgerFilter): ValidationResult {
  if (filter.amountMin !== null && filter.amountMax !== null && filter.amountMin > filter.amountMax) {
    return { ok: false, reason: 'amountRange' };
  }
  return { ok: true };
}

/** The route params Insights and the day screen used to pass to the ledger. */
export interface DrillDownParams {
  readonly categoryId?: string;
  readonly date?: string;
  /** Insights periods are half-open: endDate is exclusive. */
  readonly startDate?: string;
  readonly endDate?: string;
}

export function fromDrillDown(params: DrillDownParams): LedgerFilter {
  let dateRange: LedgerFilter['dateRange'] = null;
  if (params.date) dateRange = { start: params.date, end: params.date };
  else if (params.startDate && params.endDate) dateRange = { start: params.startDate, end: addDays(params.endDate, -1) };
  return { ...EMPTY_FILTER, categoryIds: params.categoryId ? [params.categoryId] : [], dateRange };
}

/** One chip per active facet; removing a chip clears that whole facet. */
export type FilterFacet = 'text' | 'dateRange' | 'categoryIds' | 'amount' | 'sources' | 'kinds' | 'accountIds' | 'tagIds' | 'merchantKey';

export function withoutFacet(filter: LedgerFilter, facet: FilterFacet): LedgerFilter {
  switch (facet) {
    case 'text':
      return { ...filter, text: '' };
    case 'dateRange':
      return { ...filter, dateRange: null };
    case 'amount':
      return { ...filter, amountMin: null, amountMax: null };
    case 'merchantKey':
      return { ...filter, merchantKey: null };
    default:
      return { ...filter, [facet]: [] };
  }
}

export interface FilterChip {
  readonly facet: FilterFacet;
  readonly label: string;
}

export interface ChipContext extends MatchContext {
  /** The ledger currency — amounts are labelled with formatMoney, never `minor / 100`. */
  readonly currency: CurrencyCode;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SOURCE_LABELS: Record<ExpenseSource, string> = { manual: 'Manual', sms: 'SMS', shared: 'Shared', group: 'Squad' };

/** `2026-03-12` → `12 MAR` (the Insights custom-chip format). */
function shortDate(date: string): string {
  return `${date.slice(8, 10)} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

export function activeChips(filter: LedgerFilter, ctx: ChipContext): FilterChip[] {
  const chips: FilterChip[] = [];
  const text = filter.text.trim();
  if (text !== '') chips.push({ facet: 'text', label: `"${text}"` });

  if (filter.dateRange !== null) {
    const { start, end } = filter.dateRange;
    chips.push({ facet: 'dateRange', label: start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}` });
  }

  if (filter.categoryIds.length === 1) {
    const id = filter.categoryIds[0] as string;
    chips.push({ facet: 'categoryIds', label: ctx.categoriesById.get(id)?.name ?? 'Unknown category' });
  } else if (filter.categoryIds.length > 1) {
    chips.push({ facet: 'categoryIds', label: `${filter.categoryIds.length} categories` });
  }

  const fmt = (minor: number) => formatMoney(money(minor, ctx.currency));
  if (filter.amountMin !== null && filter.amountMax !== null) {
    chips.push({ facet: 'amount', label: `${fmt(filter.amountMin)} – ${fmt(filter.amountMax)}` });
  } else if (filter.amountMin !== null) {
    chips.push({ facet: 'amount', label: `≥ ${fmt(filter.amountMin)}` });
  } else if (filter.amountMax !== null) {
    chips.push({ facet: 'amount', label: `≤ ${fmt(filter.amountMax)}` });
  }

  if (filter.sources.length > 0) {
    chips.push({ facet: 'sources', label: filter.sources.map((s) => SOURCE_LABELS[s]).join(', ') });
  }
  return chips;
}
