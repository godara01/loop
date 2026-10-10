/**
 * Building and changing personal expenses. See docs/03-expenses.md.
 *
 * Every v1 expense is personal but already group-shaped: paid by the user, one
 * allocation for the whole amount, no group. That keeps each one a valid
 * `ExpenseLike` for settle.ts, so groups can read existing data unchanged.
 *
 * `localDate` is derived here, from `occurredAt`, every time either is set —
 * never passed in — so the two cannot disagree.
 */

import type { Category } from './categories';
import { SYSTEM_CATEGORY_IDS } from './categories';
import type { Money } from './money';
import { localDateOf } from './streak';
import type { Expense, ExpenseSource, TransactionKind } from './types';

export class ExpenseError extends Error {}

export interface PersonalExpenseInput {
  readonly id: string;
  readonly uid: string;
  readonly total: Money;
  readonly categoryId: string;
  readonly description: string;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly now: string;
  readonly source?: ExpenseSource;
  readonly pendingId?: string | null;
  readonly accountId?: string | null;
  readonly kind?: TransactionKind;
}

export interface IncomeInput {
  readonly id: string;
  readonly uid: string;
  readonly total: Money;
  readonly categoryId: string;
  readonly description: string;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly now: string;
  readonly source?: ExpenseSource;
  readonly pendingId?: string | null;
  readonly accountId?: string | null;
  readonly merchant?: string | null;
  readonly merchantKey?: string | null;
}

export interface TransferInput {
  readonly id: string;
  readonly uid: string;
  readonly total: Money;
  readonly description: string;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly now: string;
  readonly accountId: string;
  readonly toAccountId: string;
  readonly source?: ExpenseSource;
  readonly pendingId?: string | null;
}

export interface RefundInput {
  readonly id: string;
  readonly uid: string;
  readonly total: Money;
  readonly categoryId: string;
  readonly description: string;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly now: string;
  readonly refundOf: string;
  readonly accountId?: string | null;
  readonly source?: ExpenseSource;
  readonly pendingId?: string | null;
}

export interface TransactionValidationInput {
  readonly kind?: TransactionKind;
  readonly categoryId: string;
  readonly accountId?: string | null;
  readonly toAccountId?: string | null;
  readonly refundOf?: string | null;
}

export const MAX_DESCRIPTION_LENGTH = 80;
export const MAX_NOTE_LENGTH = 500;

function checkAmount(total: Money): void {
  if (!Number.isInteger(total.minor) || total.minor <= 0) {
    throw new ExpenseError(`An expense must be a positive amount, got ${total.minor}`);
  }
}

function checkNotFuture(occurredAt: string, now: string): void {
  if (Date.parse(occurredAt) > Date.parse(now)) {
    // No forecasting in v1: a future expense would corrupt "today's spend".
    throw new ExpenseError('An expense cannot be in the future');
  }
}

export function validateTransaction(
  input: TransactionValidationInput,
  category?: Partial<Category> & { type?: 'expense' | 'income' },
): void {
  const kind = input.kind ?? 'expense';
  if (kind === 'transfer') {
    if (!input.accountId || !input.toAccountId) {
      throw new ExpenseError('Transfer requires both accountId and toAccountId');
    }
    if (input.accountId === input.toAccountId) {
      throw new ExpenseError('Transfer accounts must differ');
    }
  } else if (kind === 'income') {
    if (
      input.categoryId === SYSTEM_CATEGORY_IDS.transfer ||
      input.categoryId === SYSTEM_CATEGORY_IDS.settlement ||
      input.categoryId === SYSTEM_CATEGORY_IDS.loan ||
      (category && category.type === 'expense')
    ) {
      throw new ExpenseError('Income requires an income category');
    }
  } else if (kind === 'refund') {
    if (!input.refundOf) {
      throw new ExpenseError('Refund requires refundOf');
    }
  }
}

/** Empty strings are stored as null so "no note" has exactly one representation. */
function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, MAX_NOTE_LENGTH);
}

export function newPersonalExpense(input: PersonalExpenseInput): Expense {
  checkAmount(input.total);
  checkNotFuture(input.occurredAt, input.now);
  const kind = input.kind ?? 'expense';
  validateTransaction({ kind, categoryId: input.categoryId, accountId: input.accountId });
  return {
    id: input.id,
    ...(kind !== 'expense' ? { kind } : {}),
    categoryId: input.categoryId,
    total: input.total,
    description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    note: cleanNote(input.note),
    occurredAt: input.occurredAt,
    localDate: localDateOf(input.occurredAt),
    createdLocalDate: localDateOf(new Date(input.now)),
    source: input.source ?? 'manual',
    receiptPath: null,
    pendingId: input.pendingId ?? null,
    groupId: null,
    paidBy: input.uid,
    splitMode: 'even',
    allocations: [{ memberId: input.uid, amount: input.total }],
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
}

export function newIncome(input: IncomeInput, category?: Partial<Category> & { type?: 'expense' | 'income' }): Expense {
  checkAmount(input.total);
  checkNotFuture(input.occurredAt, input.now);
  validateTransaction(
    { kind: 'income', categoryId: input.categoryId, accountId: input.accountId },
    category,
  );
  return {
    id: input.id,
    kind: 'income',
    categoryId: input.categoryId,
    total: input.total,
    description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    note: cleanNote(input.note),
    occurredAt: input.occurredAt,
    localDate: localDateOf(input.occurredAt),
    createdLocalDate: localDateOf(new Date(input.now)),
    source: input.source ?? 'manual',
    receiptPath: null,
    pendingId: input.pendingId ?? null,
    groupId: null,
    paidBy: input.uid,
    splitMode: 'even',
    allocations: [{ memberId: input.uid, amount: input.total }],
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.merchant ? { merchant: input.merchant } : {}),
    ...(input.merchantKey ? { merchantKey: input.merchantKey } : {}),
  };
}

export function newTransfer(input: TransferInput): Expense {
  checkAmount(input.total);
  checkNotFuture(input.occurredAt, input.now);
  validateTransaction({
    kind: 'transfer',
    categoryId: SYSTEM_CATEGORY_IDS.transfer,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
  });
  return {
    id: input.id,
    kind: 'transfer',
    categoryId: SYSTEM_CATEGORY_IDS.transfer,
    total: input.total,
    description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    note: cleanNote(input.note),
    occurredAt: input.occurredAt,
    localDate: localDateOf(input.occurredAt),
    createdLocalDate: localDateOf(new Date(input.now)),
    source: input.source ?? 'manual',
    receiptPath: null,
    pendingId: input.pendingId ?? null,
    groupId: null,
    paidBy: input.uid,
    splitMode: 'even',
    allocations: [{ memberId: input.uid, amount: input.total }],
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
  };
}

export function newRefund(input: RefundInput): Expense {
  checkAmount(input.total);
  checkNotFuture(input.occurredAt, input.now);
  validateTransaction({
    kind: 'refund',
    categoryId: input.categoryId,
    refundOf: input.refundOf,
    accountId: input.accountId,
  });
  return {
    id: input.id,
    kind: 'refund',
    categoryId: input.categoryId,
    total: input.total,
    description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    note: cleanNote(input.note),
    occurredAt: input.occurredAt,
    localDate: localDateOf(input.occurredAt),
    createdLocalDate: localDateOf(new Date(input.now)),
    source: input.source ?? 'manual',
    receiptPath: null,
    pendingId: input.pendingId ?? null,
    groupId: null,
    paidBy: input.uid,
    splitMode: 'even',
    allocations: [{ memberId: input.uid, amount: input.total }],
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    refundOf: input.refundOf,
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
}

export interface ExpensePatch {
  readonly total?: Money;
  readonly categoryId?: string;
  readonly description?: string;
  readonly note?: string | null;
  readonly occurredAt?: string;
}

/**
 * Applies an edit. Currency can never change, `createdAt` is immutable, and the
 * allocation follows the new total so the expense stays balanced.
 */
export function editPersonalExpense(expense: Expense, patch: ExpensePatch, now: string): Expense {
  const total = patch.total ?? expense.total;
  if (total.currency !== expense.total.currency) {
    throw new ExpenseError('An expense cannot change currency');
  }
  checkAmount(total);
  const occurredAt = patch.occurredAt ?? expense.occurredAt;
  checkNotFuture(occurredAt, now);

  return {
    ...expense,
    total,
    categoryId: patch.categoryId ?? expense.categoryId,
    description:
      patch.description === undefined
        ? expense.description
        : patch.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    note: patch.note === undefined ? expense.note : cleanNote(patch.note),
    occurredAt,
    localDate: localDateOf(occurredAt),
    allocations: [{ memberId: expense.paidBy, amount: total }],
    updatedAt: now,
  };
}

/** Soft delete: the row stays, so undo is trivial and sync stays honest. */
export function softDeleteExpense(expense: Expense, now: string): Expense {
  return { ...expense, deletedAt: now, updatedAt: now };
}

export function restoreExpense(expense: Expense, now: string): Expense {
  return { ...expense, deletedAt: null, updatedAt: now };
}

/** A fresh expense with the same content, happening now. */
export function duplicateExpense(expense: Expense, id: string, now: string): Expense {
  return {
    ...expense,
    id,
    occurredAt: now,
    localDate: localDateOf(now),
    createdLocalDate: localDateOf(new Date(now)),
    source: 'manual',
    pendingId: null,
    receiptPath: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
