/**
 * Debt simplification for the Settle Up flow.
 *
 * Given every expense in a squad, we first net each member down to a single
 * balance, then greedily match the largest creditor against the largest debtor.
 * This is the standard heuristic: it does not always find the theoretical
 * minimum number of transfers (that problem is NP-hard), but it never exceeds
 * n-1 transfers and is what users intuitively expect to see.
 */

import { type CurrencyCode, type Money, formatMoney, money } from './money';
import type { Allocation } from './split';

export interface ExpenseLike {
  readonly id: string;
  /** Who actually paid the bill. */
  readonly paidBy: string;
  readonly total: Money;
  /** What each member owes for this expense. Must sum to `total`. */
  readonly allocations: readonly Allocation[];
}

export interface Balance {
  readonly memberId: string;
  /** Positive: the squad owes them. Negative: they owe the squad. */
  readonly net: Money;
}

export interface Transfer {
  readonly from: string;
  readonly to: string;
  readonly amount: Money;
}

/** Nets everyone down to one number each. Balances always sum to zero. */
export function computeBalances(
  expenses: readonly ExpenseLike[],
  currency: CurrencyCode,
): Balance[] {
  const net = new Map<string, number>();
  const bump = (memberId: string, delta: number) =>
    net.set(memberId, (net.get(memberId) ?? 0) + delta);

  for (const expense of expenses) {
    if (expense.total.currency !== currency) {
      throw new Error(
        `Expense ${expense.id} is ${expense.total.currency}, expected ${currency}`,
      );
    }
    // The payer fronted the whole bill…
    bump(expense.paidBy, expense.total.minor);
    // …and each member owes back their share.
    for (const allocation of expense.allocations) {
      bump(allocation.memberId, -allocation.amount.minor);
    }
  }

  return [...net.entries()]
    .map(([memberId, minor]) => ({ memberId, net: money(minor, currency) }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}

/** Greedy largest-creditor / largest-debtor matching. */
export function simplifyDebts(balances: readonly Balance[]): Transfer[] {
  const currency = balances[0]?.net.currency;
  if (!currency) return [];

  const creditors = balances
    .filter((b) => b.net.minor > 0)
    .map((b) => ({ memberId: b.memberId, amount: b.net.minor }))
    .sort((a, b) => b.amount - a.amount || a.memberId.localeCompare(b.memberId));

  const debtors = balances
    .filter((b) => b.net.minor < 0)
    .map((b) => ({ memberId: b.memberId, amount: -b.net.minor }))
    .sort((a, b) => b.amount - a.amount || a.memberId.localeCompare(b.memberId));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    if (!creditor || !debtor) break;

    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) {
      transfers.push({
        from: debtor.memberId,
        to: creditor.memberId,
        amount: money(amount, currency),
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return transfers;
}

/** One call for the Settle Up screen. */
export function settleUp(
  expenses: readonly ExpenseLike[],
  currency: CurrencyCode,
): { balances: Balance[]; transfers: Transfer[] } {
  const balances = computeBalances(expenses, currency);
  return { balances, transfers: simplifyDebts(balances) };
}

/** "Aisha pays Ravi ₹420.00" — used in the ledger and by the MCP server. */
export function describeTransfer(
  transfer: Transfer,
  nameOf: (memberId: string) => string = (id) => id,
): string {
  return `${nameOf(transfer.from)} pays ${nameOf(transfer.to)} ${formatMoney(transfer.amount)}`;
}
