/**
 * The converter layer's promise: a valid document round-trips exactly, and an
 * invalid one fails loudly, naming the path and field, instead of rendering wrong.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { essentialCategoriesToSeed, seedEssentialCategories, type Category } from '../categories';
import fsModule from 'node:fs';
import { newPersonalExpense } from '../expenses';
import { money } from '../money';
import {
  DEFAULT_SETTINGS,
  DocumentShapeError,
  accountToDoc,
  categoryToDoc,
  expenseToDoc,
  newProfile,
  parseAccount,
  parseAccountBalance,
  parseCategory,
  parseExpense,
  parseMarkerFlows,
  parsePendingExpense,
  pendingExpenseToDoc,
  parseProfile,
  parseSettings,
  profileToDoc,
  settingsToDoc,
} from '../firestore/documents';
import { firestorePaths } from '../firestore/paths';
import type { Account } from '../accounts';
import type { PendingExpense } from '../sms/types';

const UID = 'user-1';
const NOW = '2026-09-13T10:00:00.000Z';

describe('firestore paths', () => {
  it('builds every path from the uid', () => {
    assert.equal(firestorePaths.user(UID), 'users/user-1');
    assert.equal(firestorePaths.settings(UID), 'users/user-1/settings/app');
    assert.equal(firestorePaths.category(UID, 'cat-food'), 'users/user-1/categories/cat-food');
    assert.equal(firestorePaths.checkIn(UID, '2026-09-13'), 'users/user-1/checkIns/2026-09-13');
    assert.equal(firestorePaths.wallet(UID), 'users/user-1/wallet/main');
  });

  it('refuses a segment that would change the shape of the path', () => {
    assert.throws(() => firestorePaths.user(''), /uid/);
    assert.throws(() => firestorePaths.category(UID, 'a/b'), /categoryId/);
    assert.throws(() => firestorePaths.user('__name__'), /uid/);
  });
});

describe('profile documents', () => {
  it('round-trips a new profile exactly', () => {
    const profile = newProfile(UID, true, NOW);
    assert.deepEqual(parseProfile(UID, true, profileToDoc(profile)), profile);
  });

  it('never stores the uid or anonymity inside the document', () => {
    const doc = profileToDoc(newProfile(UID, true, NOW)) as unknown as Record<string, unknown>;
    assert.ok(!('uid' in doc));
    assert.ok(!('isAnonymous' in doc));
  });

  it('starts un-onboarded and un-seeded', () => {
    const profile = newProfile(UID, true, NOW);
    assert.equal(profile.onboardedAt, null);
    assert.equal(profile.categoriesSeededAt, null);
  });

  it('rejects an unknown currency, naming the path and field', () => {
    const doc = { ...profileToDoc(newProfile(UID, true, NOW)), currency: 'BTC' };
    assert.throws(
      () => parseProfile(UID, true, doc),
      (error: unknown) =>
        error instanceof DocumentShapeError &&
        error.path === 'users/user-1' &&
        error.field === 'currency',
    );
  });

  it('rejects a timestamp that is not an ISO instant', () => {
    const doc = { ...profileToDoc(newProfile(UID, true, NOW)), createdAt: 'yesterday' };
    assert.throws(() => parseProfile(UID, true, doc), /createdAt/);
  });

  it('rejects a document that is not an object at all', () => {
    assert.throws(() => parseProfile(UID, true, null), DocumentShapeError);
    assert.throws(() => parseProfile(UID, true, ['x']), DocumentShapeError);
  });
});

describe('category documents', () => {
  it('round-trips every essential exactly', () => {
    for (const category of seedEssentialCategories(NOW)) {
      const doc = categoryToDoc(category, NOW);
      assert.deepEqual(parseCategory(UID, category.id, doc), category);
    }
  });

  it('round-trips an uploaded-logo icon', () => {
    const base = seedEssentialCategories(NOW)[0]!;
    const custom: Category = {
      ...base,
      id: 'cat-gym',
      slug: 'GYM',
      kind: 'custom',
      icon: { kind: 'image', path: 'users/user-1/categoryLogos/cat-gym', fallbackGlyph: 'barbell' },
    };
    assert.deepEqual(parseCategory(UID, custom.id, categoryToDoc(custom, NOW)), custom);
  });

  it('keeps sync bookkeeping out of the domain object', () => {
    const category = seedEssentialCategories(NOW)[0]!;
    const parsed = parseCategory(UID, category.id, categoryToDoc(category, NOW)) as unknown as Record<string, unknown>;
    assert.ok(!('updatedAt' in parsed));
  });

  it('rejects a colour outside the palette', () => {
    const category = seedEssentialCategories(NOW)[0]!;
    const doc = { ...categoryToDoc(category, NOW), colorToken: 'hotpink' };
    assert.throws(() => parseCategory(UID, category.id, doc), /colorToken/);
  });

  it('rejects a fractional sort order rather than rounding it', () => {
    const category = seedEssentialCategories(NOW)[0]!;
    const doc = { ...categoryToDoc(category, NOW), sortOrder: 1.5 };
    assert.throws(() => parseCategory(UID, category.id, doc), /sortOrder/);
  });

  it('names the nested field when an icon is malformed', () => {
    const category = seedEssentialCategories(NOW)[0]!;
    const doc = { ...categoryToDoc(category, NOW), icon: { kind: 'emoji' } };
    assert.throws(() => parseCategory(UID, category.id, doc), /#icon.*kind/);
  });
});

describe('seeding', () => {
  // Per docs/02 and docs/04, fresh onboarding seeds the 8 expense essentials,
  // while existing v1 users get income categories via the versioned seed step.
  it('seeds all eight expense essentials exactly once', () => {
    assert.equal(essentialCategoriesToSeed(null, NOW).length, 8);
    assert.deepEqual(essentialCategoriesToSeed(NOW, NOW), []);
  });

  it('produces the same ids on every run, so racing launches converge', () => {
    const a = essentialCategoriesToSeed(null, NOW).map((c) => c.id);
    const b = essentialCategoriesToSeed(null, '2027-01-01T00:00:00.000Z').map((c) => c.id);
    assert.deepEqual(a, b);
  });
});

describe('settings documents', () => {
  it('falls back to defaults when the document does not exist yet', () => {
    assert.deepEqual(parseSettings(UID, undefined), DEFAULT_SETTINGS);
  });

  it('fills keys added after the document was written', () => {
    assert.deepEqual(parseSettings(UID, { hapticsEnabled: false }), {
      ...DEFAULT_SETTINGS,
      hapticsEnabled: false,
    });
  });

  it('treats a present-but-wrong value as corruption, not age', () => {
    assert.throws(() => parseSettings(UID, { hapticsEnabled: 'yes' }), /hapticsEnabled/);
    assert.throws(() => parseSettings(UID, { insightsPeriod: 'decade' }), /insightsPeriod/);
    assert.throws(() => parseSettings(UID, { smsCapture: 'maybe' }), /smsCapture/);
    assert.throws(() => parseSettings(UID, { onboardingStep: 'step-9' }), /onboardingStep/);
  });

  it('reads a missing or null onboardingStep as unknown (an older account)', () => {
    assert.equal(parseSettings(UID, {}).onboardingStep, null);
    assert.equal(parseSettings(UID, { onboardingStep: null }).onboardingStep, null);
  });

  it('round-trips', () => {
    const settings = {
      hapticsEnabled: false,
      keepItPlain: true,
      insightsPeriod: 'custom',
      insightsCustomStartDate: '2026-08-01',
      insightsCustomEndDate: '2026-08-31',
      smsCapture: 'denied',
      onboardingStep: 'categories',
    } as const;
    assert.deepEqual(parseSettings(UID, settingsToDoc(settings, NOW)), settings);
  });
});

describe('pending expense documents', () => {
  const pending: PendingExpense = {
    id: 'pending-1',
    status: 'pending',
    amountMinor: 45_000,
    currency: 'INR',
    merchant: 'SWIGGY',
    accountLast4: '1234',
    occurredAt: '2026-09-13T09:58:00.000Z',
    receivedAt: NOW,
    source: 'sms',
    templateId: 'hdfc-card-debit-v1',
    confidence: 0.92,
    suggestedCategoryId: null,
    suggestionConfidence: null,
    suggestionModelVersion: null,
    expenseId: null,
    displayHint: 'HDFC ••1234 · SWIGGY',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const doc = pendingExpenseToDoc(pending);

  it('builds its path from the uid', () => {
    assert.equal(firestorePaths.pendingExpenses(UID), 'users/user-1/pendingExpenses');
    assert.equal(firestorePaths.pendingExpense(UID, 'pending-1'), 'users/user-1/pendingExpenses/pending-1');
    assert.throws(() => firestorePaths.pendingExpense(UID, 'a/b'), /pendingExpenseId/);
  });

  it('round-trips exactly', () => {
    assert.deepEqual(parsePendingExpense(UID, 'pending-1', doc), pending);
  });

  it('round-trips an approved item with every optional field set', () => {
    const approved: PendingExpense = {
      ...pending,
      status: 'approved',
      merchant: null,
      accountLast4: null,
      source: 'pasted',
      suggestedCategoryId: 'cat-food',
      suggestionConfidence: 0.7,
      suggestionModelVersion: 'v1',
      expenseId: 'expense-9',
    };
    assert.deepEqual(parsePendingExpense(UID, 'pending-1', pendingExpenseToDoc(approved)), approved);
  });

  it('never stores the id inside the document', () => {
    assert.equal('id' in doc, false);
  });

  it('rejects a status outside the enum', () => {
    assert.throws(
      () => parsePendingExpense(UID, 'pending-1', { ...doc, status: 'maybe' }),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'status',
    );
  });

  it('rejects a fractional amountMinor rather than rounding it', () => {
    assert.throws(
      () => parsePendingExpense(UID, 'pending-1', { ...doc, amountMinor: 450.5 }),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'amountMinor',
    );
  });

  it('rejects a raw message body, so it can never be read back into the app', () => {
    assert.throws(
      () => parsePendingExpense(UID, 'pending-1', { ...doc, body: 'Rs.450 spent on card 1234 at SWIGGY' }),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'body',
    );
  });

  it('rejects any other unknown key', () => {
    assert.throws(
      () => parsePendingExpense(UID, 'pending-1', { ...doc, sender: 'AD-HDFCBK' }),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'sender',
    );
  });
});

describe('firestore v2 paths', () => {
  it('builds rollup, account, and meta paths from the uid', () => {
    assert.equal(firestorePaths.dailyRollup(UID, '2026-09-13'), 'users/user-1/dailyRollups/2026-09-13');
    assert.equal(firestorePaths.monthlyRollup(UID, '2026-09'), 'users/user-1/monthlyRollups/2026-09');
    assert.equal(firestorePaths.rollupApplied(UID, 'exp-1'), 'users/user-1/rollupApplied/exp-1');
    assert.equal(firestorePaths.accounts(UID), 'users/user-1/accounts');
    assert.equal(firestorePaths.account(UID, 'acc-1'), 'users/user-1/accounts/acc-1');
    assert.equal(firestorePaths.meta(UID, 'schema'), 'users/user-1/meta/schema');
    assert.equal(firestorePaths.metaSchema(UID), 'users/user-1/meta/schema');
  });

  it('refuses segments that would change the shape of the new paths', () => {
    assert.throws(() => firestorePaths.dailyRollup(UID, 'a/b'), /date/);
    assert.throws(() => firestorePaths.account(UID, 'a/b'), /accountId/);
    assert.throws(() => firestorePaths.meta(UID, 'a/b'), /docId/);
  });
});

describe('v1 fixture suite', () => {
  it('parses every v1 doc in the fixture with no v2 fields', () => {
    const raw = fsModule.readFileSync(new URL('./fixtures/v1-docs.json', import.meta.url), 'utf8');
    const docs = JSON.parse(raw) as unknown[];
    assert.ok(docs.length > 0, 'v1-docs.json must contain at least one document');
    for (const [i, doc] of docs.entries()) {
      const parsed = parseExpense(UID, `exp-${i}`, doc);
      assert.equal(parsed.id, `exp-${i}`);
      assert.equal(parsed.kind, undefined);
      assert.equal(parsed.accountId, undefined);
      assert.equal(parsed.tagIds, undefined);
      assert.equal(parsed.schemaVersion, undefined);
    }
  });
});

describe('v2 transaction round-trips', () => {
  const base = newPersonalExpense({
    id: 'exp-v2',
    uid: UID,
    total: money(10000, 'INR'),
    categoryId: 'cat-food',
    description: 'Lunch',
    note: null,
    occurredAt: NOW,
    now: NOW,
  });

  it('round-trips an income kind with every new field', () => {
    const expense = {
      ...base,
      kind: 'income' as const,
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      refundOf: 'exp-0',
      merchant: 'Acme',
      merchantKey: 'acme',
      tagIds: ['food', 'lunch'],
      lines: [{ categoryId: 'cat-food', amountMinor: 10000 }],
      categoryIds: ['cat-food'],
      recurringId: 'rec-1',
      importId: 'imp-1',
      groupRefId: 'grp-1',
      paidMinor: 10000,
      direction: 'in' as const,
      excludeFromSpend: true,
      schemaVersion: 2 as const,
    };
    const doc = expenseToDoc(expense);
    const parsed = parseExpense(UID, 'exp-v2', doc);
    assert.deepEqual(parsed, expense);
  });

  it('round-trips a transfer kind', () => {
    const expense = {
      ...base,
      kind: 'transfer' as const,
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      merchant: null,
      merchantKey: null,
      tagIds: [],
      lines: null,
      categoryIds: ['cat-food'],
      recurringId: null,
      importId: null,
      groupRefId: null,
      paidMinor: null,
      direction: null,
      excludeFromSpend: false,
      schemaVersion: 1 as const,
    };
    const doc = expenseToDoc(expense);
    const parsed = parseExpense(UID, 'exp-v2', doc);
    assert.deepEqual(parsed, expense);
  });

  it('round-trips a refund kind', () => {
    const expense = {
      ...base,
      kind: 'refund' as const,
      accountId: 'acc-1',
      toAccountId: null,
      refundOf: 'exp-0',
      merchant: null,
      merchantKey: null,
      tagIds: [],
      lines: null,
      categoryIds: ['cat-food'],
      recurringId: null,
      importId: null,
      groupRefId: null,
      paidMinor: null,
      direction: null,
      excludeFromSpend: false,
      schemaVersion: 1 as const,
    };
    const doc = expenseToDoc(expense);
    const parsed = parseExpense(UID, 'exp-v2', doc);
    assert.deepEqual(parsed, expense);
  });

  it('rejects an unknown kind', () => {
    const doc = expenseToDoc({ ...base, kind: 'unknown' as any });
    assert.throws(
      () => parseExpense(UID, 'exp-v2', doc),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'kind',
    );
  });

  it('rejects an unknown schemaVersion', () => {
    const doc = expenseToDoc({ ...base, schemaVersion: 3 as any });
    assert.throws(
      () => parseExpense(UID, 'exp-v2', doc),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'schemaVersion',
    );
  });

  it('rejects a non-boolean excludeFromSpend', () => {
    const doc = expenseToDoc({ ...base, excludeFromSpend: 'yes' as any });
    assert.throws(
      () => parseExpense(UID, 'exp-v2', doc),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'excludeFromSpend',
    );
  });

  it('rejects malformed tagIds', () => {
    const doc = expenseToDoc({ ...base, tagIds: [123] as any });
    assert.throws(
      () => parseExpense(UID, 'exp-v2', doc),
      (e: unknown) => e instanceof DocumentShapeError && (e as DocumentShapeError).field.startsWith('tagIds'),
    );
  });

  it('rejects a group source as a mirror branch stub', () => {
    const doc = expenseToDoc({ ...base, source: 'group' as any });
    assert.throws(
      () => parseExpense(UID, 'exp-v2', doc),
      (e: unknown) => e instanceof DocumentShapeError && e.field === 'source',
    );
  });
});

describe('undefined value omission', () => {
  it('omits undefined keys from v1-shaped Expense documents', () => {
    const expense = newPersonalExpense({
      id: 'exp-v1',
      uid: UID,
      total: money(10000, 'INR'),
      categoryId: 'cat-food',
      description: 'Lunch',
      note: null,
      occurredAt: NOW,
      now: NOW,
    });
    // Explicitly set v2 fields to undefined to simulate v1 shape
    const v1Expense = {
      ...expense,
      kind: undefined,
      accountId: undefined,
      toAccountId: undefined,
      refundOf: undefined,
      merchant: undefined,
      merchantKey: undefined,
      tagIds: undefined,
      lines: undefined,
      categoryIds: undefined,
      recurringId: undefined,
      importId: undefined,
      groupRefId: undefined,
      paidMinor: undefined,
      direction: undefined,
      excludeFromSpend: undefined,
      schemaVersion: undefined,
    };
    const doc = expenseToDoc(v1Expense);
    const values = Object.values(doc);
    assert.equal(values.includes(undefined), false);
  });

  it('omits undefined keys from v1-shaped PendingExpense documents', () => {
    const pending = {
      id: 'pending-v1',
      status: 'pending',
      amountMinor: 45_000,
      currency: 'INR',
      merchant: 'SWIGGY',
      accountLast4: '1234',
      occurredAt: '2026-09-13T09:58:00.000Z',
      receivedAt: NOW,
      source: 'sms',
      templateId: 'hdfc-card-debit-v1',
      confidence: 0.92,
      suggestedCategoryId: null,
      suggestionConfidence: null,
      suggestionModelVersion: null,
      expenseId: null,
      displayHint: 'HDFC ••1234 · SWIGGY',
      createdAt: NOW,
      updatedAt: NOW,
    };
    // Explicitly set optional v2 fields to undefined to simulate v1 shape
    const v1Pending = {
      ...pending,
      kind: undefined,
      merchantKey: undefined,
      suggestedAccountId: undefined,
    };
    const doc = pendingExpenseToDoc(v1Pending as unknown as PendingExpense);
    const values: unknown[] = Object.values(doc);
    assert.equal(values.includes(undefined), false);
  });
});

describe('account documents (v1.2)', () => {
  const account: Account = {
    id: 'acc-hdfc',
    name: 'HDFC card',
    type: 'card',
    last4: '1234',
    openingBalance: money(-250000, 'INR'),
    openingDate: '2026-10-01',
    colorToken: 'violet',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  };

  it('round-trips exactly, including a negative opening balance', () => {
    const stored = accountToDoc(account, NOW);
    assert.deepEqual(stored.openingBalance, { amountMinor: -250000, currency: 'INR' });
    assert.deepEqual(parseAccount(UID, account.id, stored), account);
  });

  it('round-trips a cash account with no last4', () => {
    const cash: Account = { ...account, id: 'acc-cash', type: 'cash', last4: null };
    assert.deepEqual(parseAccount(UID, cash.id, accountToDoc(cash, NOW)), cash);
  });

  it('refuses a bad last4, type, float balance or missing opening date', () => {
    const stored = accountToDoc(account, NOW);
    assert.throws(() => parseAccount(UID, account.id, { ...stored, last4: '12a4' }), DocumentShapeError);
    assert.throws(() => parseAccount(UID, account.id, { ...stored, type: 'crypto' }), DocumentShapeError);
    assert.throws(() => parseAccount(UID, account.id, { ...stored, openingBalance: { amountMinor: 1.5, currency: 'INR' } }), DocumentShapeError);
    assert.throws(() => parseAccount(UID, account.id, { ...stored, openingDate: null }), DocumentShapeError);
  });

  it('reads an account balance, a missing one as zero', () => {
    assert.deepEqual(parseAccountBalance(UID, 'acc-hdfc', { flowMinor: -1300 }), { accountId: 'acc-hdfc', deltaMinor: -1300 });
    assert.deepEqual(parseAccountBalance(UID, 'acc-hdfc', undefined), { accountId: 'acc-hdfc', deltaMinor: 0 });
    assert.throws(() => parseAccountBalance(UID, 'acc-hdfc', { flowMinor: '12' }), DocumentShapeError);
  });

  it('reads marker flows; a v1 marker applied none', () => {
    const v2 = { localDate: '2026-10-02', kind: 'transfer', contributions: [], flows: [{ accountId: 'a', deltaMinor: -500 }, { accountId: 'b', deltaMinor: 500 }] };
    assert.deepEqual(parseMarkerFlows(UID, 'e1', v2), [{ accountId: 'a', deltaMinor: -500 }, { accountId: 'b', deltaMinor: 500 }]);
    assert.deepEqual(parseMarkerFlows(UID, 'e1', { localDate: '2026-10-02', categoryId: 'food', amountMinor: 100, currency: 'INR' }), []);
    assert.deepEqual(parseMarkerFlows(UID, 'e1', undefined), []);
  });
});

describe('settings: lastAccountByKind (v1.2)', () => {
  it('round-trips, and a v1 settings doc parses without it', () => {
    const settings = { ...DEFAULT_SETTINGS, lastAccountByKind: { expense: 'acc-card', income: 'acc-bank' } };
    assert.deepEqual(parseSettings(UID, settingsToDoc(settings, NOW)), settings);
    const v1 = parseSettings(UID, settingsToDoc(DEFAULT_SETTINGS, NOW));
    assert.equal('lastAccountByKind' in v1, false);
  });
  it('drops unknown kinds and refuses a non-string id', () => {
    assert.deepEqual(parseSettings(UID, { lastAccountByKind: { expense: 'a', squad: 'b' } }).lastAccountByKind, { expense: 'a' });
    assert.throws(() => parseSettings(UID, { lastAccountByKind: { expense: 42 } }), DocumentShapeError);
  });
});

describe('pending expense documents: v1.2 fields (SM3)', () => {
  const v1: PendingExpense = {
    id: 'p-1',
    status: 'pending',
    amountMinor: 49_900,
    currency: 'INR',
    merchant: 'AMAZON',
    accountLast4: '1234',
    occurredAt: '2026-10-12T09:58:00.000Z',
    receivedAt: NOW,
    source: 'sms',
    templateId: 'icici_refund_credited',
    confidence: 0.9,
    suggestedCategoryId: null,
    suggestionConfidence: null,
    suggestionModelVersion: null,
    expenseId: null,
    displayHint: 'ICICI ••1234 · AMAZON',
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('round-trips the v1.2 fields', () => {
    const v2: PendingExpense = { ...v1, kind: 'refund', merchantKey: 'AMAZON', suggestedAccountId: 'acc-1', suggestedRefundOf: 'e-9', pairedPendingId: null };
    assert.deepEqual(parsePendingExpense(UID, v2.id, pendingExpenseToDoc(v2)), v2);
  });

  it('keeps a v1 doc free of the new keys, and parses it', () => {
    const stored = pendingExpenseToDoc(v1);
    for (const key of ['kind', 'merchantKey', 'suggestedAccountId', 'suggestedRefundOf', 'pairedPendingId']) assert.equal(key in stored, false);
    assert.deepEqual(parsePendingExpense(UID, v1.id, stored), v1);
  });

  it('refuses a kind that never comes from SMS', () => {
    assert.throws(() => parsePendingExpense(UID, v1.id, { ...pendingExpenseToDoc(v1), kind: 'settlement' }), DocumentShapeError);
  });
});
