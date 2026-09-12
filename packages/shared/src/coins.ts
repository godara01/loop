/**
 * The coin economy — small, legible, and never revoked.
 *
 * These are pure functions on purpose: the client runs them to predict an award
 * the instant a user acts, and the Cloud Function runs the same code to commit
 * it. Because it is one implementation, the optimistic number and the
 * authoritative one cannot drift. See docs/06-gamification.md.
 *
 * Two invariants hold everything together:
 *
 *   1. Entry ids are DETERMINISTIC. A retried Function, a double tap, or a
 *      replayed write produces the same id and therefore the same single row.
 *   2. Coins are only ever added. Deleting an expense, editing one, or
 *      archiving a category never debits — otherwise the ledger becomes
 *      something to game rather than something to trust.
 */

export type CoinRuleId =
  | 'check_in'
  | 'zero_spend'
  | 'expense_logged'
  | 'categorised'
  | 'week_complete'
  | 'first_expense'
  | 'first_custom_category';

export interface CoinRule {
  readonly id: CoinRuleId;
  readonly coins: number;
  /**
   * 'daily'  — at most once per local date, keyed by the date
   * 'object' — once per thing (an expense), capped per day
   * 'once'   — once in the lifetime of the account
   */
  readonly scope: 'daily' | 'object' | 'once';
  /** Max entries per local date. null for 'once' rules. */
  readonly dailyCap: number | null;
  readonly label: string;
}

export const COIN_RULES: Readonly<Record<CoinRuleId, CoinRule>> = {
  check_in: { id: 'check_in', coins: 5, scope: 'daily', dailyCap: 1, label: 'Daily check-in' },
  zero_spend: { id: 'zero_spend', coins: 3, scope: 'daily', dailyCap: 1, label: 'Zero-spend day' },
  expense_logged: { id: 'expense_logged', coins: 2, scope: 'object', dailyCap: 3, label: 'Expense logged' },
  categorised: { id: 'categorised', coins: 1, scope: 'object', dailyCap: 3, label: 'Categorised' },
  week_complete: { id: 'week_complete', coins: 25, scope: 'daily', dailyCap: 1, label: 'Seven-day run' },
  first_expense: { id: 'first_expense', coins: 10, scope: 'once', dailyCap: null, label: 'First expense' },
  first_custom_category: {
    id: 'first_custom_category',
    coins: 5,
    scope: 'once',
    dailyCap: null,
    label: 'First custom category',
  },
};

export interface CoinLedgerEntry {
  readonly id: string;
  readonly ruleId: CoinRuleId;
  /** Always positive. Nothing in Loop debits coins. */
  readonly coins: number;
  readonly localDate: string;
  /** The expense or category this came from, when the rule is about a thing. */
  readonly refId: string | null;
  readonly createdAt: string;
}

/**
 * Deterministic ids. Daily rules key on the date; object rules key on the thing;
 * once-rules key on nothing at all, because there is only ever one.
 */
export function coinEntryId(
  ruleId: CoinRuleId,
  keys: { readonly localDate?: string; readonly refId?: string | null },
): string {
  const rule = COIN_RULES[ruleId];
  switch (rule.scope) {
    case 'once':
      return `${ruleId}__once`;
    case 'object': {
      if (!keys.refId) {
        throw new Error(`Rule ${ruleId} needs a refId to build a stable id`);
      }
      return `${ruleId}__${keys.refId}`;
    }
    case 'daily': {
      if (!keys.localDate) {
        throw new Error(`Rule ${ruleId} needs a localDate to build a stable id`);
      }
      return `${ruleId}__${keys.localDate}`;
    }
  }
}

/** What just happened. The only inputs the economy reacts to. */
export type CoinEvent =
  /** The day was banked — by a check-in, an expense, or an SMS approval. */
  | { readonly kind: 'day_banked'; readonly zeroSpend: boolean }
  | {
      readonly kind: 'expense_logged';
      readonly expenseId: string;
      /** False when it landed in OTHER. */
      readonly categorised: boolean;
      readonly isFirstEver: boolean;
    }
  | { readonly kind: 'week_completed' }
  | { readonly kind: 'custom_category_created'; readonly categoryId: string; readonly isFirstEver: boolean };

export interface CoinContext {
  readonly localDate: string;
  readonly createdAt: string;
  /** Every entry already written for `localDate`. Used to apply caps. */
  readonly entriesToday: readonly CoinLedgerEntry[];
  /** Once-rules already awarded at any point in the account's life. */
  readonly onceRulesAwarded: readonly CoinRuleId[];
}

/**
 * Returns the entries an event should create — empty when a cap is already met,
 * so calling twice for the same event is harmless.
 *
 * The caller writes these with `set` (not `add`), so even a lost response and a
 * retry converge on one row per id.
 */
export function evaluateCoinEvent(event: CoinEvent, ctx: CoinContext): CoinLedgerEntry[] {
  const entries: CoinLedgerEntry[] = [];

  const propose = (ruleId: CoinRuleId, refId: string | null = null): void => {
    const rule = COIN_RULES[ruleId];

    if (rule.scope === 'once' && ctx.onceRulesAwarded.includes(ruleId)) return;

    const id = coinEntryId(ruleId, { localDate: ctx.localDate, refId });

    // Already written, or already proposed in this same evaluation.
    if (ctx.entriesToday.some((e) => e.id === id)) return;
    if (entries.some((e) => e.id === id)) return;

    if (rule.dailyCap !== null) {
      const usedToday =
        ctx.entriesToday.filter((e) => e.ruleId === ruleId).length +
        entries.filter((e) => e.ruleId === ruleId).length;
      if (usedToday >= rule.dailyCap) return;
    }

    entries.push({
      id,
      ruleId,
      coins: rule.coins,
      localDate: ctx.localDate,
      refId,
      createdAt: ctx.createdAt,
    });
  };

  switch (event.kind) {
    case 'day_banked':
      propose('check_in');
      if (event.zeroSpend) propose('zero_spend');
      break;

    case 'expense_logged':
      if (event.isFirstEver) propose('first_expense');
      propose('expense_logged', event.expenseId);
      if (event.categorised) propose('categorised', event.expenseId);
      break;

    case 'week_completed':
      propose('week_complete');
      break;

    case 'custom_category_created':
      if (event.isFirstEver) propose('first_custom_category');
      break;
  }

  return entries;
}

/** The balance is by definition the sum of the ledger. */
export function coinBalance(entries: readonly CoinLedgerEntry[]): number {
  return entries.reduce((total, entry) => total + entry.coins, 0);
}

/** A seven-day run closes on every 7th consecutive day, not only the first. */
export function completesWeek(streakCurrent: number): boolean {
  return streakCurrent > 0 && streakCurrent % 7 === 0;
}

/** Preview text for the `+N` chip, before the Function has confirmed anything. */
export function previewAward(entries: readonly CoinLedgerEntry[]): number {
  return coinBalance(entries);
}
