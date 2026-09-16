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

import type { Money } from './money';
import { localDateOf } from './streak';
import type { Expense, ExpenseSource } from './types';

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

/** Empty strings are stored as null so "no note" has exactly one representation. */
function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, MAX_NOTE_LENGTH);
}

export function newPersonalExpense(input: PersonalExpenseInput): Expense {
  checkAmount(input.total);
  checkNotFuture(input.occurredAt, input.now);
  return {
    id: input.id,
    categoryId: input.categoryId,
    total: input.total,
    description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
    note: cleanNote(input.note),
    occurredAt: input.occurredAt,
    localDate: localDateOf(input.occurredAt),
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
    source: 'manual',
    pendingId: null,
    receiptPath: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
