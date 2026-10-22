/**
 * What a parsed bank message proposes (docs/17 § Credit SMS). Pure. Reads the
 * body on device only, the same moment ingest does; nothing here is stored.
 *
 * | Shape                                  | Kind     | Income category |
 * |----------------------------------------|----------|-----------------|
 * | Debit                                  | expense  | —               |
 * | Card bill payment received             | transfer | —               |
 * | Refund / reversal / failed txn credit  | refund   | —               |
 * | Cashback                               | income   | CASHBACK        |
 * | Salary                                 | income   | SALARY          |
 * | Any other credit                       | income   | OTHER_IN        |
 */

import type { TransactionDirection } from '@loop/shared';

export type PendingKind = 'expense' | 'income' | 'refund' | 'transfer';
export type IncomeSlug = 'SALARY' | 'CASHBACK' | 'OTHER_IN';

export interface MessageKind {
  readonly kind: PendingKind;
  /** Income only: the category to pre-select by slug (merchant memory comes in v1.3). */
  readonly incomeSlug: IncomeSlug | null;
}

const CARD_BILL = /received towards your credit card|credit card (?:bill )?payment (?:of .* )?(?:has been )?received|payment .* received .* credit card/i;
const REFUND = /\brefund|\brevers(?:al|ed)|failed transaction|credited back/i;
const CASHBACK = /cash\s?back/i;
const SALARY = /salary|\bsal\b/i;

export function classifyMessage(direction: TransactionDirection, body: string): MessageKind {
  if (direction === 'debit') return { kind: 'expense', incomeSlug: null };
  if (CARD_BILL.test(body)) return { kind: 'transfer', incomeSlug: null };
  if (REFUND.test(body)) return { kind: 'refund', incomeSlug: null };
  if (CASHBACK.test(body)) return { kind: 'income', incomeSlug: 'CASHBACK' };
  if (SALARY.test(body)) return { kind: 'income', incomeSlug: 'SALARY' };
  return { kind: 'income', incomeSlug: 'OTHER_IN' };
}
