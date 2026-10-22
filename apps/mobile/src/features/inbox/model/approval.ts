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
  apportionRefund,
  expenseToDoc,
  firestorePaths,
  money,
  newIncome,
  newPersonalExpense,
  newRefund,
  newTransfer,
  type parsePendingExpense,
  refundableRemainder,
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
  /** v1.2: the account chosen on the card; absent = the suggested one. `null` = none. */
  readonly accountId?: string | null;
  /** v1.2: approve a credit as income although it was proposed as a refund ("It's income"). */
  readonly asIncome?: boolean;
}

export interface PendingApprovedUpdate {
  readonly status: 'approved';
  readonly expenseId: string;
  readonly updatedAt: string;
}

export interface Approval {
  readonly expense: Expense;
  readonly pendingUpdate: PendingApprovedUpdate;
  /**
   * Other pendings this one document settles — the credit half of a merged
   * transfer pair. Written in the SAME batch with the same update.
   */
  readonly alsoApproves?: readonly string[];
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

  // v1.2: income (or a refund the user called income) becomes an income doc.
  // A refund or transfer proposal has its own builder below.
  const kind = pending.kind ?? 'expense';
  if ((kind === 'refund' || kind === 'transfer') && !edits.asIncome) {
    throw new ApprovalError(`A ${kind} is approved with build${kind === 'refund' ? 'Refund' : 'Transfer'}Approval`);
  }
  const fields = {
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
    accountId: edits.accountId !== undefined ? edits.accountId : (pending.suggestedAccountId ?? null),
  };
  const expense = kind === 'expense' && !edits.asIncome ? newPersonalExpense(fields) : newIncome(fields);

  return {
    expense,
    pendingUpdate: { status: 'approved', expenseId: expense.id, updatedAt: now },
  };
}

/**
 * "Yes" on a refund card (or a purchase picked under "Different purchase"): a
 * refund linked to `original`, apportioned over its lines, refused above the
 * refundable remainder (docs/17 § Refunds). The account is the card's choice,
 * else the one the SMS matched, else the original's.
 */
export function buildRefundApproval(
  uid: string,
  pending: PendingExpense,
  original: Expense,
  refundsOfOriginal: readonly Expense[],
  now: string,
  accountId?: string | null,
): Approval {
  if (pending.status !== 'pending') {
    throw new ApprovalError(`Only a pending item can be approved; ${pending.id} is ${pending.status}`);
  }
  const total = money(pending.amountMinor, pending.currency);
  const remainder = refundableRemainder(original, refundsOfOriginal);
  if (total.minor > remainder.minor) {
    throw new ApprovalError(`Refund of ${total.minor} exceeds the ${remainder.minor} left to refund on ${original.id}`);
  }
  const expense = newRefund({
    id: approvalExpenseId(pending),
    uid,
    total,
    categoryId: original.categoryId,
    description: pending.merchant ?? original.description,
    note: null,
    occurredAt: pending.occurredAt,
    now,
    refundOf: original.id,
    accountId: accountId !== undefined ? accountId : (pending.suggestedAccountId ?? original.accountId ?? null),
    source: EXPENSE_SOURCE[pending.source],
    pendingId: pending.id,
    lines: apportionRefund(original, total),
    refundableRemainder: remainder,
  });
  return { expense, pendingUpdate: { status: 'approved', expenseId: expense.id, updatedAt: now } };
}

/** A card-bill payment: money from `fromAccountId` (picked by the user) to the card. */
export function buildTransferApproval(
  uid: string,
  pending: PendingExpense,
  fromAccountId: string,
  toAccountId: string,
  now: string,
): Approval {
  if (pending.status !== 'pending') {
    throw new ApprovalError(`Only a pending item can be approved; ${pending.id} is ${pending.status}`);
  }
  const expense = newTransfer({
    id: approvalExpenseId(pending),
    uid,
    total: money(pending.amountMinor, pending.currency),
    description: pending.merchant ?? 'Card payment',
    note: null,
    occurredAt: pending.occurredAt,
    now,
    accountId: fromAccountId,
    toAccountId,
    source: EXPENSE_SOURCE[pending.source],
    pendingId: pending.id,
  });
  return { expense, pendingUpdate: { status: 'approved', expenseId: expense.id, updatedAt: now } };
}

/**
 * "Merge" on a transfer pair (docs/17 § Transfer pairing): ONE transfer doc,
 * id = the debit's pending id, from the debit's account to the credit's, and
 * both pendings approved pointing at it — written in one batch.
 */
export function buildMergeApproval(
  uid: string,
  pair: { readonly debit: PendingExpense; readonly credit: PendingExpense },
  fromAccountId: string,
  toAccountId: string,
  now: string,
): Approval {
  const { debit, credit } = pair;
  if (debit.status !== 'pending' || credit.status !== 'pending') {
    throw new ApprovalError('Both halves of a transfer must still be pending');
  }
  if (debit.amountMinor !== credit.amountMinor || debit.currency !== credit.currency) {
    throw new ApprovalError('A merged transfer needs the same amount on both sides');
  }
  const approval = buildTransferApproval(uid, debit, fromAccountId, toAccountId, now);
  return { ...approval, alsoApproves: [credit.id] };
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

// ── The write plan ─────────────────────────────────────────────────────────

export type WriteOp =
  | { readonly op: 'set'; readonly path: string; readonly data: Readonly<Record<string, unknown>> }
  | { readonly op: 'update'; readonly path: string; readonly data: Readonly<Record<string, unknown>> };

/** Firestore's batch limit. */
const MAX_OPS_PER_BATCH = 500;

/**
 * The batches that write `approvals`. Each approval's ops — the document and
 * every pending update it settles — stay in ONE batch, so a merged transfer
 * can never land with one half still pending. Batches fill up to 500 ops.
 */
export function planApprovalWrites(uid: string, approvals: readonly Approval[]): WriteOp[][] {
  const batches: WriteOp[][] = [];
  let current: WriteOp[] = [];
  for (const { expense, pendingUpdate, alsoApproves = [] } of approvals) {
    const ops: WriteOp[] = [
      { op: 'set', path: firestorePaths.expense(uid, expense.id), data: expenseToDoc(expense) as unknown as Record<string, unknown> },
      { op: 'update', path: firestorePaths.pendingExpense(uid, expense.pendingId!), data: { ...pendingUpdate } },
      ...alsoApproves.map((pendingId): WriteOp => ({ op: 'update', path: firestorePaths.pendingExpense(uid, pendingId), data: { ...pendingUpdate } })),
    ];
    if (current.length + ops.length > MAX_OPS_PER_BATCH) {
      batches.push(current);
      current = [];
    }
    current.push(...ops);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
