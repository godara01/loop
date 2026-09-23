/**
 * Types for SMS ingestion and pending transactions.
 * See docs/12-sms-ingest.md.
 */

import type { CurrencyCode } from '../money';

export type TransactionDirection = 'debit' | 'credit';

export type PendingExpenseStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type PendingExpenseSource = 'sms' | 'shared' | 'pasted';

export interface ParsedTransaction {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly direction: TransactionDirection;
  readonly merchant: string | null;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly templateId: string;
  readonly confidence: number;
}

export interface PendingExpense {
  readonly id: string;
  readonly status: PendingExpenseStatus;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly merchant: string | null;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly source: PendingExpenseSource;
  readonly templateId: string;
  readonly confidence: number;
  /** Post-MVP auto-categorisation writes these. Null in MVP. */
  readonly suggestedCategoryId: string | null;
  readonly suggestionConfidence: number | null;
  readonly suggestionModelVersion: string | null;
  /** Set on approval. */
  readonly expenseId: string | null;
  /** Masked for user recognition: "HDFC ••1234 · SWIGGY". Never the raw body. */
  readonly displayHint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TemplateFields {
  readonly amount: string;
  readonly merchant?: string;
  readonly last4?: string;
}

export interface TemplateSpec {
  readonly id: string;
  readonly entity: string;
  readonly pattern: string;
  readonly flags: string;
  readonly fields: TemplateFields;
}

export interface TemplateRegistry {
  readonly version: number;
  readonly templates: readonly TemplateSpec[];
}

export interface CompiledTemplate extends Omit<TemplateSpec, 'pattern'> {
  readonly pattern: RegExp;
}

export interface CompiledRegistry {
  readonly version: number;
  readonly templates: readonly CompiledTemplate[];
}

// Document types for Firestore
export interface PendingExpenseDoc {
  readonly id: string;
  readonly status: PendingExpenseStatus;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly merchant: string | null;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly source: PendingExpenseSource;
  readonly templateId: string;
  readonly confidence: number;
  readonly suggestedCategoryId: string | null;
  readonly suggestionConfidence: number | null;
  readonly suggestionModelVersion: string | null;
  readonly expenseId: string | null;
  readonly displayHint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
