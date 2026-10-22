/**
 * What the inbox screen and the Orbit badge show. Pure.
 * See docs/12-sms-ingest.md#the-inbox.
 */

import { type Account, type Expense, type TransferPair, matchAccount, pairTransfers } from '@loop/shared';

import type { CategoryChoices, PendingExpense } from './approval';

export interface InboxDay {
  /** YYYY-MM-DD in the viewer's time zone. */
  readonly date: string;
  readonly items: readonly PendingExpense[];
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day an instant falls on in `timeZone` (an IANA name). */
export function localDateIn(instant: string, timeZone: string): string {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, formatter);
  }
  // formatToParts, not format: the joined string's order varies by engine.
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Days newest first, and items newest first within a day, by when the money moved. */
export function groupByDay(items: readonly PendingExpense[], timeZone: string): InboxDay[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const days: { date: string; items: PendingExpense[] }[] = [];
  for (const item of sorted) {
    const date = localDateIn(item.occurredAt, timeZone);
    const last = days[days.length - 1];
    if (last?.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }
  return days;
}

/** Only items still waiting on the user. Approved, rejected and expired never count. */
export function badgeCount(items: readonly PendingExpense[]): number {
  return items.filter((item) => item.status === 'pending').length;
}

/**
 * The items "Approve all" covers: pending expenses and income. Refunds,
 * transfers and pairs each need a decision of their own (docs/12 § The inbox).
 */
export function bulkApprovable(items: readonly PendingExpense[]): PendingExpense[] {
  return items.filter((item) => item.status === 'pending' && (item.kind === undefined || item.kind === 'expense' || item.kind === 'income'));
}

/** "Approve all" is offered only when there is something to approve and every such card has a category. */
export function canApproveAll(items: readonly PendingExpense[], choices: CategoryChoices): boolean {
  const pending = bulkApprovable(items);
  return pending.length > 0 && pending.every((item) => Boolean(choices[item.id]));
}

// ── Cards per kind (v1.2, docs/12 § The inbox, docs/17 § Credit SMS) ────────

export type InboxCard =
  /** A purchase: category chip, account chip, Approve / Edit / Dismiss. */
  | { readonly type: 'expense'; readonly id: string; readonly item: PendingExpense; readonly account: Account | null }
  /** Money in: a lime `+`. */
  | { readonly type: 'income'; readonly id: string; readonly item: PendingExpense; readonly account: Account | null }
  /** "Refund for ₹499 AMAZON on 12 Mar?" — Yes / Different purchase / It's income. `original` null = no match. */
  | { readonly type: 'refund'; readonly id: string; readonly item: PendingExpense; readonly account: Account | null; readonly original: Expense | null }
  /** A card-bill payment: to the matched card, from an account the user picks. */
  | { readonly type: 'transfer'; readonly id: string; readonly item: PendingExpense; readonly toAccount: Account | null }
  /** "Looks like a transfer: HDFC ••1234 → SBI ••9876" — Merge / Keep separate. */
  | { readonly type: 'pair'; readonly id: string; readonly pair: TransferPair; readonly from: Account; readonly to: Account };

export interface CardContext {
  readonly accounts: readonly Account[];
  /** Expenses the refund suggestions point at, by id (live ones; a deleted original shows as no match). */
  readonly expensesById: ReadonlyMap<string, Expense>;
  /** Pairs the user chose to keep separate this session. */
  readonly keptSeparate?: ReadonlySet<string>;
}

const accountFor = (item: PendingExpense, accounts: readonly Account[]): Account | null =>
  (item.suggestedAccountId ? accounts.find((a) => a.id === item.suggestedAccountId && a.archivedAt === null) : undefined) ??
  matchAccount(item.accountLast4, accounts);

/** `pairKey` for keep-separate bookkeeping: order-free. */
export const pairKey = (pair: TransferPair) => `${pair.debit.id}|${pair.credit.id}`;

/**
 * Pending items as cards, newest first. A debit and a same-amount credit on two
 * known accounts within 10 minutes become ONE pair card (`pairTransfers`),
 * unless the user kept them separate.
 */
export function inboxCards(items: readonly PendingExpense[], ctx: CardContext): InboxCard[] {
  const pending = items.filter((item) => item.status === 'pending');
  const pairs = pairTransfers(pending, ctx.accounts).filter((pair) => !ctx.keptSeparate?.has(pairKey(pair)));
  const paired = new Set(pairs.flatMap((pair) => [pair.debit.id, pair.credit.id]));

  const cards: { at: number; card: InboxCard }[] = pairs.map((pair) => ({
    at: Math.max(Date.parse(pair.debit.occurredAt), Date.parse(pair.credit.occurredAt)),
    card: {
      type: 'pair',
      id: pairKey(pair),
      pair,
      from: matchAccount(pair.debit.accountLast4, ctx.accounts)!,
      to: matchAccount(pair.credit.accountLast4, ctx.accounts)!,
    },
  }));

  for (const item of pending) {
    if (paired.has(item.id)) continue;
    const account = accountFor(item, ctx.accounts);
    const kind = item.kind ?? 'expense';
    const card: InboxCard =
      kind === 'income'
        ? { type: 'income', id: item.id, item, account }
        : kind === 'refund'
          ? { type: 'refund', id: item.id, item, account, original: (item.suggestedRefundOf && ctx.expensesById.get(item.suggestedRefundOf)) || null }
          : kind === 'transfer'
            ? { type: 'transfer', id: item.id, item, toAccount: account }
            : { type: 'expense', id: item.id, item, account };
    cards.push({ at: Date.parse(item.occurredAt), card });
  }

  return cards.sort((a, b) => b.at - a.at).map(({ card }) => card);
}

/**
 * What "Approve all" covers once cards are built: the expense and income cards.
 * Halves of a transfer pair are left out — approving them one by one would log
 * a transfer as an expense plus an income.
 */
export function bulkFromCards(cards: readonly InboxCard[]): PendingExpense[] {
  return cards.flatMap((card) => (card.type === 'expense' || card.type === 'income' ? [card.item] : []));
}
