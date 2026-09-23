/** Domain entities shared by the app, Cloud Functions, and the MCP server. */

import type { PeriodKind } from './insights';
import type { CurrencyCode, Money } from './money';
import type { Allocation, SplitMode } from './split';

export interface Member {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface UserProfile {
  readonly uid: string;
  readonly displayName: string;
  /** Chosen at onboarding. Effectively permanent — see docs/02-onboarding.md. */
  readonly currency: CurrencyCode;
  /** Null until onboarding completes. This is the gate. */
  readonly onboardedAt: string | null;
  /**
   * When the essential categories were written. The bootstrap seeds only while
   * this is null, so re-running it can never overwrite a category the user has
   * since renamed or recoloured.
   */
  readonly categoriesSeededAt: string | null;
  /** True until the anonymous account is linked to a real credential. */
  readonly isAnonymous: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserSettings {
  readonly hapticsEnabled: boolean;
  /** Hides coins, the streak capsule and celebrations. See docs/06-gamification.md. */
  readonly keepItPlain: boolean;
  readonly insightsPeriod: PeriodKind;
  /** Inclusive start / exclusive end for the user-selected custom Insights window. */
  readonly insightsCustomStartDate: string | null;
  readonly insightsCustomEndDate: string | null;
}

/** Where an expense came from. SMS-derived ones are approved, never automatic. */
export type ExpenseSource = 'manual' | 'sms' | 'shared' | 'group';

export interface Expense {
  readonly id: string;
  readonly categoryId: string;
  readonly total: Money;
  readonly description: string;
  readonly note: string | null;
  /** ISO instant. */
  readonly occurredAt: string;
  /**
   * The DEVICE-LOCAL date of `occurredAt`, stored rather than derived. Every
   * day-wise query filters on it, and deriving it at query time would both
   * defeat the index and get the timezone wrong.
   */
  readonly localDate: string;
  readonly source: ExpenseSource;
  /** Cloud Storage path, not a URL. */
  readonly receiptPath: string | null;
  /** Set when this was approved out of the SMS inbox. */
  readonly pendingId: string | null;

  /**
   * Group-ready from day one. In v1 every expense is personal: `groupId` is
   * null, `paidBy` is the local user, and there is one allocation for the whole
   * amount. That costs one field each and means every v1 row is already a valid
   * `ExpenseLike` for settle.ts when groups ship — no migration.
   */
  readonly groupId: string | null;
  readonly paidBy: string;
  readonly splitMode: SplitMode;
  readonly allocations: readonly Allocation[];

  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/**
 * An SMS-derived proposal. NOT an expense: excluded from every total, chart,
 * streak and coin award until a human approves it. See docs/12-sms-ingest.md.
 */
export interface PendingExpense {
  readonly id: string;
  readonly status: 'pending' | 'approved' | 'rejected' | 'expired';
  readonly total: Money;
  readonly merchant: string | null;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly localDate: string;
  readonly receivedAt: string;
  readonly source: 'sms' | 'shared' | 'pasted';
  readonly templateId: string;
  readonly confidence: number;
  /** Auto-categorisation writes these. Null in the MVP. */
  readonly suggestedCategoryId: string | null;
  readonly suggestionConfidence: number | null;
  readonly suggestionModelVersion: string | null;
  /** Set on approval. */
  readonly expenseId: string | null;
  /** Masked for recognition: "HDFC ••1234 · SWIGGY". Never the raw message. */
  readonly displayHint: string;
}

export interface Wallet {
  readonly coinBalance: number;
  readonly updatedAt: string;
}

/** Function-maintained aggregate stored at dailyRollups/{YYYY-MM-DD}. */
export interface DailyRollup {
  readonly totalMinor: number;
  readonly count: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

/** Function-maintained aggregate stored at monthlyRollups/{YYYY-MM}. */
export interface MonthlyRollup extends DailyRollup {
  readonly byDay: Readonly<Record<string, number>>;
}

export interface Squad {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyCode;
  readonly memberIds: readonly string[];
  readonly createdAt: string;
  readonly archivedAt: string | null;
}

export interface Settlement {
  readonly id: string;
  readonly squadId: string;
  readonly from: string;
  readonly to: string;
  readonly amount: Money;
  readonly settledAt: string;
  readonly method: 'cash' | 'upi' | 'bank' | 'other';
}

/** Sync bookkeeping carried by every stored record. */
export interface SyncMeta {
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
