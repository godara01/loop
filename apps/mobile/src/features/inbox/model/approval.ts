/**
 * Turning pending expenses into real ones. Pure: the repository writes what
 * this returns, in one batch. See docs/12-sms-ingest.md#the-inbox.
 *
 * Approval adds no coin or streak logic of its own. The expense it creates is
 * an ordinary expense, and `onExpenseWrite` treats it like any other.
 */

import {
  type Expense,
  type ExpenseSource,
  type Money,
  money,
  newPersonalExpense,
  type parsePendingExpense,
} from '@loop/shared';

/** The stored pending-expense shape, as the converter returns it. */
export type PendingExpense = ReturnType<typeof parsePendingExpense>;

/** The category the user picked on each card, keyed by pending id. */
export type CategoryChoices = Readonly<Record<string, string | undefined>>;

/** "Edit & approve": what the entry sheet may change before saving. */
export interface ApprovalEdits {
  readonly total?: Money;
  readonly description?: string;
  readonly note?: string | null;
  readonly occurredAt?: string;
}

export interface PendingApprovedUpdate {
  readonly status: 'approved';
  readonly expenseId: string;
  readonly updatedAt: string;
}

export interface Approval {
  readonly expense: Expense;
  readonly pendingUpdate: PendingApprovedUpdate;
}

export class ApprovalError extends Error {}

export class MissingCategoryError extends ApprovalError {
  constructor(readonly pendingIds: readonly string[]) {
    super(`Pick a category before approving: ${pendingIds.join(', ')}`);
    this.name = 'MissingCategoryError';
  }
}

/**
 * `ExpenseSource` has no 'pasted': a pasted message is still a bank SMS, parsed
 * by the same parser. The pending doc keeps the finer source, reachable
 * through `expense.pendingId`.
 */
const EXPENSE_SOURCE: Readonly<Record<PendingExpense['source'], ExpenseSource>> = {
  sms: 'sms',
  pasted: 'sms',
  shared: 'shared',
};

/**
 * The expense id is the pending id. Approving the same item twice — a double
 * tap, or a retry while offline — rewrites one expense instead of creating two.
 */
export function approvalExpenseId(pending: PendingExpense): string {
  return pending.id;
}

export function buildApproval(
  uid: string,
  pending: PendingExpense,
  categoryId: string | undefined,
  edits: ApprovalEdits = {},
  now: string,
): Approval {
  if (pending.status !== 'pending') {
    throw new ApprovalError(`Only a pending item can be approved; ${pending.id} is ${pending.status}`);
  }
  if (!categoryId) throw new MissingCategoryError([pending.id]);

  const total = edits.total ?? money(pending.amountMinor, pending.currency);
  if (total.currency !== pending.currency) {
    throw new ApprovalError('Approval cannot change the currency');
  }

  const expense = newPersonalExpense({
    id: approvalExpenseId(pending),
    uid,
    total,
    categoryId,
    description: edits.description ?? pending.merchant ?? '',
    note: edits.note ?? null,
    occurredAt: edits.occurredAt ?? pending.occurredAt,
    now,
    source: EXPENSE_SOURCE[pending.source],
    pendingId: pending.id,
  });

  return {
    expense,
    pendingUpdate: { status: 'approved', expenseId: expense.id, updatedAt: now },
  };
}

/** All or nothing: one missing category stops the whole batch, naming every gap. */
export function buildApproveAll(
  uid: string,
  items: readonly PendingExpense[],
  choices: CategoryChoices,
  now: string,
): Approval[] {
  const missing = items.filter((item) => !choices[item.id]).map((item) => item.id);
  if (missing.length > 0) throw new MissingCategoryError(missing);
  return items.map((item) => buildApproval(uid, item, choices[item.id], {}, now));
}
