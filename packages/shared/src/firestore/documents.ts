import type { CoinRuleId } from '../coins';
/**
 * Stored document shapes, and the converters between them and domain types.
 *
 * This is the one place a Firestore document becomes a `Category` or a
 * `UserProfile`, and it VALIDATES rather than coerces. A malformed document
 * throws `DocumentShapeError` naming the path and the field. It never quietly
 * yields NaN, an unknown colour, or a half-built object that renders wrong three
 * screens later. See docs/08-data-model.md.
 *
 * Timestamps are ISO-8601 strings generated on the device, not Firestore server
 * timestamps. A server timestamp reads as null in the local snapshot until the
 * write syncs, and every document here must be complete and renderable the
 * instant it is written offline.
 *
 * Reads are strict about types and enums but lenient about lengths: a length
 * limit is a rule for writing new data, and tightening one later must not make
 * existing documents unreadable.
 */

import type { Category, CategoryIcon, CategoryKind } from '../categories';
import type { PeriodKind } from '../insights';
import { CURRENCY_SYMBOL, type CurrencyCode, money } from '../money';
import type { PendingExpense, PendingExpenseSource, PendingExpenseStatus } from '../sms/types';
import type { SplitMode } from '../split';
import { CATEGORY_COLOR_TOKENS } from '../theme';
import type { Expense, ExpenseSource, SmsCaptureState, UserProfile, UserSettings } from '../types';
import { firestorePaths } from './paths';

export class DocumentShapeError extends Error {
  constructor(
    readonly path: string,
    readonly field: string,
    readonly problem: string,
  ) {
    super(`${path}: field "${field}" ${problem}`);
    this.name = 'DocumentShapeError';
  }
}

type Fields = Readonly<Record<string, unknown>>;

const CURRENCIES = Object.keys(CURRENCY_SYMBOL) as CurrencyCode[];
const CATEGORY_KINDS: readonly CategoryKind[] = ['essential', 'catalogue', 'custom'];
const ICON_KINDS = ['glyph', 'image'] as const;
const PERIOD_KINDS: readonly PeriodKind[] = ['week', 'month', 'rolling30', 'custom'];
const SMS_CAPTURE_STATES: readonly SmsCaptureState[] = ['unseen', 'shown', 'dismissed', 'denied', 'granted'];
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function record(path: string, field: string, value: unknown): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DocumentShapeError(path, field, 'must be an object');
  }
  return value as Fields;
}

function text(path: string, d: Fields, field: string): string {
  const value = d[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocumentShapeError(path, field, 'must be a non-empty string');
  }
  return value;
}

function optionalText(path: string, d: Fields, field: string): string | null {
  return d[field] === null || d[field] === undefined ? null : text(path, d, field);
}

function instant(path: string, d: Fields, field: string): string {
  const value = d[field];
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DocumentShapeError(path, field, 'must be an ISO-8601 instant');
  }
  return value;
}

function optionalInstant(path: string, d: Fields, field: string): string | null {
  return d[field] === null || d[field] === undefined ? null : instant(path, d, field);
}

function optionalLocalDate(path: string, d: Fields, field: string): string | null {
  const value = d[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !ISO_LOCAL_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new DocumentShapeError(path, field, 'must be a YYYY-MM-DD date or null');
  }
  return value;
}

function integer(path: string, d: Fields, field: string): number {
  const value = d[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DocumentShapeError(path, field, 'must be an integer');
  }
  return value;
}

function oneOf<T extends string>(path: string, d: Fields, field: string, allowed: readonly T[]): T {
  const value = d[field];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new DocumentShapeError(path, field, `must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function flag(path: string, d: Fields, field: string, fallback: boolean): boolean {
  const value = d[field];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new DocumentShapeError(path, field, 'must be a boolean');
  return value;
}

// ── Profile ────────────────────────────────────────────────────────────────

export interface ProfileDoc {
  readonly displayName: string;
  readonly currency: CurrencyCode;
  readonly onboardedAt: string | null;
  readonly categoriesSeededAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The profile a brand-new account starts with. Currency defaults to INR until
 * onboarding (M6) asks; `onboardedAt` stays null so that onboarding still runs.
 */
export function newProfile(uid: string, isAnonymous: boolean, now: string): UserProfile {
  return {
    uid,
    displayName: 'You',
    currency: 'INR',
    onboardedAt: null,
    categoriesSeededAt: null,
    isAnonymous,
    createdAt: now,
    updatedAt: now,
  };
}

/** `uid` is the document id and `isAnonymous` comes from auth; neither is stored. */
export function profileToDoc(profile: UserProfile): ProfileDoc {
  return {
    displayName: profile.displayName,
    currency: profile.currency,
    onboardedAt: profile.onboardedAt,
    categoriesSeededAt: profile.categoriesSeededAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function parseProfile(uid: string, isAnonymous: boolean, data: unknown): UserProfile {
  const path = firestorePaths.user(uid);
  const d = record(path, '(document)', data);
  return {
    uid,
    isAnonymous,
    displayName: text(path, d, 'displayName'),
    currency: oneOf(path, d, 'currency', CURRENCIES),
    onboardedAt: optionalInstant(path, d, 'onboardedAt'),
    categoriesSeededAt: optionalInstant(path, d, 'categoriesSeededAt'),
    createdAt: instant(path, d, 'createdAt'),
    updatedAt: instant(path, d, 'updatedAt'),
  };
}

// ── Categories ─────────────────────────────────────────────────────────────

export interface CategoryDoc {
  readonly slug: string;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly colorToken: Category['colorToken'];
  readonly kind: CategoryKind;
  readonly catalogueSlug: string | null;
  readonly sortOrder: number;
  readonly createdAt: string;
  /** Sync bookkeeping. Not part of the domain `Category`. */
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

/** `id` is the document id, so it is not stored inside the document. */
export function categoryToDoc(category: Category, updatedAt: string): CategoryDoc {
  return {
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    colorToken: category.colorToken,
    kind: category.kind,
    catalogueSlug: category.catalogueSlug,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt,
    archivedAt: category.archivedAt,
  };
}

function parseIcon(path: string, value: unknown): CategoryIcon {
  const iconPath = `${path}#icon`;
  const icon = record(path, 'icon', value);
  const kind = oneOf(iconPath, icon, 'kind', ICON_KINDS);
  return kind === 'glyph'
    ? { kind, name: text(iconPath, icon, 'name') }
    : { kind, path: text(iconPath, icon, 'path'), fallbackGlyph: text(iconPath, icon, 'fallbackGlyph') };
}

export function parseCategory(uid: string, categoryId: string, data: unknown): Category {
  const path = firestorePaths.category(uid, categoryId);
  const d = record(path, '(document)', data);
  return {
    id: categoryId,
    slug: text(path, d, 'slug'),
    name: text(path, d, 'name'),
    icon: parseIcon(path, d.icon),
    colorToken: oneOf(path, d, 'colorToken', CATEGORY_COLOR_TOKENS),
    kind: oneOf(path, d, 'kind', CATEGORY_KINDS),
    catalogueSlug: optionalText(path, d, 'catalogueSlug'),
    sortOrder: integer(path, d, 'sortOrder'),
    createdAt: instant(path, d, 'createdAt'),
    archivedAt: optionalInstant(path, d, 'archivedAt'),
  };
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface SettingsDoc extends UserSettings {
  readonly updatedAt: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  hapticsEnabled: true,
  keepItPlain: false,
  insightsPeriod: 'month',
  insightsCustomStartDate: null,
  insightsCustomEndDate: null,
  smsCapture: 'unseen',
};

/**
 * Settings gain keys over time, so a MISSING key takes its default. A key that
 * is present with the wrong type still throws — that is corruption, not age.
 */
export function parseSettings(uid: string, data: unknown): UserSettings {
  if (data === undefined || data === null) return DEFAULT_SETTINGS;
  const path = firestorePaths.settings(uid);
  const d = record(path, '(document)', data);
  return {
    hapticsEnabled: flag(path, d, 'hapticsEnabled', DEFAULT_SETTINGS.hapticsEnabled),
    keepItPlain: flag(path, d, 'keepItPlain', DEFAULT_SETTINGS.keepItPlain),
    insightsPeriod:
      d.insightsPeriod === undefined
        ? DEFAULT_SETTINGS.insightsPeriod
        : oneOf(path, d, 'insightsPeriod', PERIOD_KINDS),
    insightsCustomStartDate: optionalLocalDate(path, d, 'insightsCustomStartDate'),
    insightsCustomEndDate: optionalLocalDate(path, d, 'insightsCustomEndDate'),
    smsCapture:
      d.smsCapture === undefined ? DEFAULT_SETTINGS.smsCapture : oneOf(path, d, 'smsCapture', SMS_CAPTURE_STATES),
  };
}

export function settingsToDoc(settings: UserSettings, updatedAt: string): SettingsDoc {
  return { ...settings, updatedAt };
}

// ── Expenses ───────────────────────────────────────────────────────────────

export interface AllocationDoc {
  readonly memberId: string;
  readonly amountMinor: number;
}

/**
 * Money is flattened to `amountMinor` + `currency` because the security rules
 * check `amountMinor is int` directly — a nested map would put the one
 * invariant that matters most out of the rules' reach.
 */
export interface ExpenseDoc {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly categoryId: string;
  readonly description: string;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly localDate: string;
  readonly source: ExpenseSource;
  readonly receiptPath: string | null;
  readonly pendingId: string | null;
  readonly groupId: string | null;
  readonly paidBy: string;
  readonly splitMode: SplitMode;
  readonly allocations: readonly AllocationDoc[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

const EXPENSE_SOURCES: readonly ExpenseSource[] = ['manual', 'sms', 'shared', 'group'];
const SPLIT_MODES: readonly SplitMode[] = ['even', 'shares', 'exact', 'percentage'];
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A string that may legitimately be empty, such as an expense description. */
function anyString(path: string, d: Fields, field: string): string {
  const value = d[field];
  if (typeof value !== 'string') throw new DocumentShapeError(path, field, 'must be a string');
  return value;
}

function localDate(path: string, d: Fields, field: string): string {
  const value = d[field];
  if (typeof value !== 'string' || !LOCAL_DATE.test(value)) {
    throw new DocumentShapeError(path, field, 'must be a YYYY-MM-DD date');
  }
  return value;
}

export function expenseToDoc(expense: Expense): ExpenseDoc {
  return {
    amountMinor: expense.total.minor,
    currency: expense.total.currency,
    categoryId: expense.categoryId,
    description: expense.description,
    note: expense.note,
    occurredAt: expense.occurredAt,
    localDate: expense.localDate,
    source: expense.source,
    receiptPath: expense.receiptPath,
    pendingId: expense.pendingId,
    groupId: expense.groupId,
    paidBy: expense.paidBy,
    splitMode: expense.splitMode,
    allocations: expense.allocations.map((a) => ({ memberId: a.memberId, amountMinor: a.amount.minor })),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    deletedAt: expense.deletedAt,
  };
}

export function parseExpense(uid: string, expenseId: string, data: unknown): Expense {
  const path = firestorePaths.expense(uid, expenseId);
  const d = record(path, '(document)', data);

  const currency = oneOf(path, d, 'currency', CURRENCIES);
  const amountMinor = integer(path, d, 'amountMinor');
  if (amountMinor <= 0) throw new DocumentShapeError(path, 'amountMinor', 'must be greater than zero');

  const rawAllocations = d.allocations;
  if (!Array.isArray(rawAllocations) || rawAllocations.length === 0) {
    throw new DocumentShapeError(path, 'allocations', 'must be a non-empty array');
  }
  const allocations = rawAllocations.map((raw: unknown, index: number) => {
    const entryPath = `${path}#allocations[${index}]`;
    const entry = record(path, `allocations[${index}]`, raw);
    return {
      memberId: text(entryPath, entry, 'memberId'),
      amount: money(integer(entryPath, entry, 'amountMinor'), currency),
    };
  });
  const allocated = allocations.reduce((sum, a) => sum + a.amount.minor, 0);
  if (allocated !== amountMinor) {
    // The ledger must balance. Rendering an unbalanced expense would put a wrong
    // number on screen and, later, into settlement.
    throw new DocumentShapeError(path, 'allocations', `sum to ${allocated}, but amountMinor is ${amountMinor}`);
  }

  return {
    id: expenseId,
    total: money(amountMinor, currency),
    categoryId: text(path, d, 'categoryId'),
    description: anyString(path, d, 'description'),
    note: d.note === null || d.note === undefined ? null : anyString(path, d, 'note'),
    occurredAt: instant(path, d, 'occurredAt'),
    localDate: localDate(path, d, 'localDate'),
    source: oneOf(path, d, 'source', EXPENSE_SOURCES),
    receiptPath: optionalText(path, d, 'receiptPath'),
    pendingId: optionalText(path, d, 'pendingId'),
    groupId: optionalText(path, d, 'groupId'),
    paidBy: text(path, d, 'paidBy'),
    splitMode: oneOf(path, d, 'splitMode', SPLIT_MODES),
    allocations,
    createdAt: instant(path, d, 'createdAt'),
    updatedAt: instant(path, d, 'updatedAt'),
    deletedAt: optionalInstant(path, d, 'deletedAt'),
  };
}

// ============ STREAK ============

export interface StreakDoc {
  readonly current: number;
  readonly longest: number;
  readonly lastLoggedOn: string | null;
}

export function streakToDoc(streak: StreakDoc): Record<string, unknown> {
  return {
    current: streak.current,
    longest: streak.longest,
    lastLoggedOn: streak.lastLoggedOn,
  };
}

export function parseStreak(uid: string, data: unknown): StreakDoc {
  const path = firestorePaths.streak(uid);
  const d = record(path, '(document)', data);
  return {
    current: integer(path, d, 'current'),
    longest: integer(path, d, 'longest'),
    lastLoggedOn: optionalLocalDate(path, d, 'lastLoggedOn'),
  };
}

// ============ WALLET ============

export interface WalletDoc {
  readonly coinBalance: number;
}

export function walletToDoc(wallet: WalletDoc): Record<string, unknown> {
  return {
    coinBalance: wallet.coinBalance,
  };
}

export function parseWallet(uid: string, data: unknown): WalletDoc {
  const path = firestorePaths.wallet(uid);
  const d = record(path, '(document)', data);
  return {
    coinBalance: integer(path, d, 'coinBalance'),
  };
}

// ============ CHECK-IN ============

export interface CheckInDoc {
  readonly localDate: string;
}

export function checkInToDoc(checkIn: CheckInDoc): Record<string, unknown> {
  return {
    localDate: checkIn.localDate,
  };
}

export function parseCheckIn(uid: string, date: string, data: unknown): CheckInDoc {
  const path = firestorePaths.checkIn(uid, date);
  const d = record(path, '(document)', data);
  return {
    localDate: localDate(path, d, 'localDate'),
  };
}

// ============ COIN LEDGER ENTRY ============

export interface CoinLedgerEntryDoc {
  readonly id: string;
  readonly ruleId: CoinRuleId;
  readonly coins: number;
  readonly localDate: string;
  readonly refId: string | null;
  readonly createdAt: string;
}

export function coinLedgerEntryToDoc(entry: CoinLedgerEntryDoc): Record<string, unknown> {
  return {
    id: entry.id,
    ruleId: entry.ruleId,
    coins: entry.coins,
    localDate: entry.localDate,
    refId: entry.refId,
    createdAt: entry.createdAt,
  };
}

export function parseCoinLedgerEntry(uid: string, entryId: string, data: unknown): CoinLedgerEntryDoc {
  const path = firestorePaths.coinEntry(uid, entryId);
  const d = record(path, '(document)', data);
  return {
    id: entryId,
    ruleId: oneOf(path, d, 'ruleId', ['check_in', 'zero_spend', 'expense_logged', 'categorised', 'week_complete', 'first_expense', 'first_custom_category']),
    coins: integer(path, d, 'coins'),
    localDate: localDate(path, d, 'localDate'),
    refId: optionalText(path, d, 'refId'),
    createdAt: instant(path, d, 'createdAt'),
  };
}

// ============ PENDING EXPENSE ============

/**
 * An SMS-derived proposal as stored. Money is flat for the same reason as
 * `ExpenseDoc`. The raw message body is never stored, so the parser rejects any
 * key it does not know — including `body` — rather than carrying it along.
 */
export type PendingExpenseDoc = Omit<PendingExpense, 'id'>;

const PENDING_STATUSES: readonly PendingExpenseStatus[] = ['pending', 'approved', 'rejected', 'expired'];
const PENDING_SOURCES: readonly PendingExpenseSource[] = ['sms', 'shared', 'pasted'];
const PENDING_KEYS: ReadonlySet<string> = new Set<keyof PendingExpenseDoc>([
  'status',
  'amountMinor',
  'currency',
  'merchant',
  'accountLast4',
  'occurredAt',
  'receivedAt',
  'source',
  'templateId',
  'confidence',
  'suggestedCategoryId',
  'suggestionConfidence',
  'suggestionModelVersion',
  'expenseId',
  'displayHint',
  'createdAt',
  'updatedAt',
]);

function unit(path: string, d: Fields, field: string): number {
  const value = d[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DocumentShapeError(path, field, 'must be a number between 0 and 1');
  }
  return value;
}

function optionalUnit(path: string, d: Fields, field: string): number | null {
  return d[field] === null || d[field] === undefined ? null : unit(path, d, field);
}

/** `id` is the document id, so it is not stored inside the document. */
export function pendingExpenseToDoc(pending: PendingExpense): PendingExpenseDoc {
  return {
    status: pending.status,
    amountMinor: pending.amountMinor,
    currency: pending.currency,
    merchant: pending.merchant,
    accountLast4: pending.accountLast4,
    occurredAt: pending.occurredAt,
    receivedAt: pending.receivedAt,
    source: pending.source,
    templateId: pending.templateId,
    confidence: pending.confidence,
    suggestedCategoryId: pending.suggestedCategoryId,
    suggestionConfidence: pending.suggestionConfidence,
    suggestionModelVersion: pending.suggestionModelVersion,
    expenseId: pending.expenseId,
    displayHint: pending.displayHint,
    createdAt: pending.createdAt,
    updatedAt: pending.updatedAt,
  };
}

export function parsePendingExpense(uid: string, pendingExpenseId: string, data: unknown): PendingExpense {
  const path = firestorePaths.pendingExpense(uid, pendingExpenseId);
  const d = record(path, '(document)', data);

  for (const key of Object.keys(d)) {
    if (!PENDING_KEYS.has(key)) throw new DocumentShapeError(path, key, 'is not a pending-expense field');
  }

  const amountMinor = integer(path, d, 'amountMinor');
  if (amountMinor <= 0) throw new DocumentShapeError(path, 'amountMinor', 'must be greater than zero');

  return {
    id: pendingExpenseId,
    status: oneOf(path, d, 'status', PENDING_STATUSES),
    amountMinor,
    currency: oneOf(path, d, 'currency', CURRENCIES),
    merchant: optionalText(path, d, 'merchant'),
    accountLast4: optionalText(path, d, 'accountLast4'),
    occurredAt: instant(path, d, 'occurredAt'),
    receivedAt: instant(path, d, 'receivedAt'),
    source: oneOf(path, d, 'source', PENDING_SOURCES),
    templateId: text(path, d, 'templateId'),
    confidence: unit(path, d, 'confidence'),
    suggestedCategoryId: optionalText(path, d, 'suggestedCategoryId'),
    suggestionConfidence: optionalUnit(path, d, 'suggestionConfidence'),
    suggestionModelVersion: optionalText(path, d, 'suggestionModelVersion'),
    expenseId: optionalText(path, d, 'expenseId'),
    displayHint: text(path, d, 'displayHint'),
    createdAt: instant(path, d, 'createdAt'),
    updatedAt: instant(path, d, 'updatedAt'),
  };
}
