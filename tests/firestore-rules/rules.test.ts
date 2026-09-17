/**
 * Security rules, tested like code. See docs/11-firebase.md#security-rules.
 *
 * Run with `npm run test:rules`, which starts the Firestore emulator, points
 * these tests at it, and shuts it down. The project id is a `demo-` id, so
 * nothing here can ever touch a real Firebase project.
 *
 * Valid documents are built with the same converters and path builders the app
 * uses. So these tests prove two things at once: the rules deny what they should,
 * and what the app actually writes is accepted.
 */

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

import { editCategory, newCustomCategory, seedEssentialCategories } from '../../packages/shared/src/categories';
import { newPersonalExpense, softDeleteExpense } from '../../packages/shared/src/expenses';
import { money } from '../../packages/shared/src/money';
import {
  DEFAULT_SETTINGS,
  categoryToDoc,
  expenseToDoc,
  newProfile,
  profileToDoc,
  settingsToDoc,
} from '../../packages/shared/src/firestore/documents';
import { firestorePaths as p } from '../../packages/shared/src/firestore/paths';

const NOW = '2026-09-13T10:00:00.000Z';
const ALICE = 'alice';
const BOB = 'bob';

let env: RulesTestEnvironment;

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

/** Writes that only a Cloud Function could make, done with the rules switched off. */
async function seedAsServer(path: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const validExpense = (overrides: Record<string, unknown> = {}) => ({
  amountMinor: 18000,
  currency: 'INR',
  localDate: '2026-09-13',
  categoryId: 'cat-food',
  description: 'Filter coffee',
  occurredAt: NOW,
  deletedAt: null,
  ...overrides,
});

before(async () => {
  // Every assertFails provokes a PERMISSION_DENIED that the SDK logs as an error.
  // Those are the expected outcome, and dozens of them bury the one real failure.
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-loop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env.cleanup();
});

describe('signed-out access', () => {
  it('cannot read or write any user data', async () => {
    await assertFails(getDoc(doc(anonymous(), p.user(ALICE))));
    await assertFails(setDoc(doc(anonymous(), p.user(ALICE)), profileToDoc(newProfile(ALICE, true, NOW))));
  });

  it('cannot read the catalogue either', async () => {
    await assertFails(getDoc(doc(anonymous(), 'catalog/meta')));
  });
});

describe('profile', () => {
  it('lets a user create, read and update their own profile', async () => {
    const ref = doc(as(ALICE), p.user(ALICE));
    await assertSucceeds(setDoc(ref, profileToDoc(newProfile(ALICE, true, NOW))));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { categoriesSeededAt: NOW, updatedAt: NOW }));
  });

  it("keeps one user out of another's profile", async () => {
    await seedAsServer(p.user(ALICE), { ...profileToDoc(newProfile(ALICE, true, NOW)) });
    await assertFails(getDoc(doc(as(BOB), p.user(ALICE))));
    await assertFails(setDoc(doc(as(BOB), p.user(ALICE)), profileToDoc(newProfile(ALICE, true, NOW))));
  });

  it('refuses a client-side profile delete — that goes through a Function', async () => {
    const ref = doc(as(ALICE), p.user(ALICE));
    await setDoc(ref, profileToDoc(newProfile(ALICE, true, NOW)));
    await assertFails(deleteDoc(ref));
  });
});

describe('settings', () => {
  it('lets a user write their own settings, and no one else', async () => {
    const data = settingsToDoc(DEFAULT_SETTINGS, NOW);
    await assertSucceeds(setDoc(doc(as(ALICE), p.settings(ALICE)), data));
    await assertFails(setDoc(doc(as(BOB), p.settings(ALICE)), data));
  });
});

describe('categories', () => {
  it('accepts every essential exactly as the app seeds it', async () => {
    const db = as(ALICE);
    for (const category of seedEssentialCategories(NOW)) {
      await assertSucceeds(setDoc(doc(db, p.category(ALICE, category.id)), categoryToDoc(category, NOW)));
    }
  });

  it('rejects a slug too long for the mono tag', async () => {
    const category = { ...seedEssentialCategories(NOW)[0]!, slug: 'EXTRAORDINARILY' };
    await assertFails(setDoc(doc(as(ALICE), p.category(ALICE, category.id)), categoryToDoc(category, NOW)));
  });

  it("refuses to write into someone else's categories", async () => {
    const category = seedEssentialCategories(NOW)[0]!;
    await assertFails(setDoc(doc(as(BOB), p.category(ALICE, category.id)), categoryToDoc(category, NOW)));
  });

  it('accepts a custom category and an edit to it', async () => {
    const custom = newCustomCategory(
      { name: 'Gym', slug: 'GYM', icon: { kind: 'glyph', name: 'barbell' }, colorToken: 'lime' },
      { id: 'cat-gym', sortOrder: 9, createdAt: NOW },
    );
    const ref = doc(as(ALICE), p.category(ALICE, custom.id));
    await assertSucceeds(setDoc(ref, categoryToDoc(custom, NOW)));
    const edited = editCategory(custom, { name: 'Fitness' });
    await assertSucceeds(setDoc(ref, categoryToDoc(edited, NOW)));
  });

  it('lets the owner delete their own category, but no one else', async () => {
    const custom = newCustomCategory(
      { name: 'Gym', slug: 'GYM', icon: { kind: 'glyph', name: 'barbell' }, colorToken: 'lime' },
      { id: 'cat-gym', sortOrder: 9, createdAt: NOW },
    );
    const ref = doc(as(ALICE), p.category(ALICE, custom.id));
    await setDoc(ref, categoryToDoc(custom, NOW));
    await assertFails(deleteDoc(doc(as(BOB), p.category(ALICE, custom.id))));
    await assertSucceeds(deleteDoc(ref));
  });
});

describe('expenses', () => {
  const ref = () => doc(as(ALICE), p.expense(ALICE, 'e-1'));

  it('accepts a well-formed expense', async () => {
    await assertSucceeds(setDoc(ref(), validExpense()));
  });

  it('accepts an expense and its soft delete exactly as the app writes them', async () => {
    const expense = newPersonalExpense({
      id: 'e-1',
      uid: ALICE,
      total: money(12000, 'INR'),
      categoryId: 'cat-food',
      description: 'Filter coffee',
      note: null,
      occurredAt: NOW,
      now: NOW,
    });
    await assertSucceeds(setDoc(ref(), expenseToDoc(expense)));
    await assertSucceeds(setDoc(ref(), expenseToDoc(softDeleteExpense(expense, NOW))));
  });

  it('rejects a fractional amount — money is never a float', async () => {
    await assertFails(setDoc(ref(), validExpense({ amountMinor: 180.5 })));
  });

  it('rejects zero and negative amounts', async () => {
    await assertFails(setDoc(ref(), validExpense({ amountMinor: 0 })));
    await assertFails(setDoc(ref(), validExpense({ amountMinor: -500 })));
  });

  it('rejects an amount sent as a string', async () => {
    await assertFails(setDoc(ref(), validExpense({ amountMinor: '18000' })));
  });

  it('rejects a missing or malformed local date', async () => {
    const { localDate: _omit, ...withoutDate } = validExpense();
    await assertFails(setDoc(ref(), withoutDate));
    await assertFails(setDoc(ref(), validExpense({ localDate: '13/09/2026' })));
  });

  it('allows a soft delete, never a hard one', async () => {
    await setDoc(ref(), validExpense());
    await assertSucceeds(updateDoc(ref(), { deletedAt: NOW }));
    await assertFails(deleteDoc(ref()));
  });

  it("keeps one user out of another's expenses", async () => {
    await assertFails(setDoc(doc(as(BOB), p.expense(ALICE, 'e-1')), validExpense()));
  });
});

describe('check-ins', () => {
  it('creates one check-in keyed by the local date', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), p.checkIn(ALICE, '2026-09-13')), { source: 'manual', createdAt: NOW }));
  });

  it('rejects a document id that is not a date', async () => {
    await assertFails(setDoc(doc(as(ALICE), p.checkIn(ALICE, 'today')), { source: 'manual', createdAt: NOW }));
  });

  it('never lets a check-in be edited or removed — that would rewrite a streak', async () => {
    const ref = doc(as(ALICE), p.checkIn(ALICE, '2026-09-13'));
    await setDoc(ref, { source: 'manual', createdAt: NOW });
    await assertFails(updateDoc(ref, { source: 'expense' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('server-authoritative data', () => {
  const serverOnly: Array<[string, string]> = [
    ['wallet', p.wallet(ALICE)],
    ['streak', p.streak(ALICE)],
    ['coin ledger entry', p.coinEntry(ALICE, 'check_in__2026-09-13')],
    ['daily rollup', `${p.user(ALICE)}/dailyRollups/2026-09-13`],
    ['monthly rollup', `${p.user(ALICE)}/monthlyRollups/2026-09`],
  ];

  for (const [label, path] of serverOnly) {
    it(`lets the owner read their ${label} but never write it`, async () => {
      await seedAsServer(path, { value: 1 });
      const ref = doc(as(ALICE), path);
      await assertSucceeds(getDoc(ref));
      await assertFails(setDoc(ref, { value: 999 }));
      await assertFails(updateDoc(ref, { value: 999 }));
      await assertFails(deleteDoc(ref));
    });
  }

  it('does not let another user read them either', async () => {
    await seedAsServer(p.wallet(ALICE), { coinBalance: 40 });
    await assertFails(getDoc(doc(as(BOB), p.wallet(ALICE))));
  });
});

describe('catalogue', () => {
  it('is readable by any signed-in user and writable by none', async () => {
    await seedAsServer('catalog/meta', { version: 1 });
    await assertSucceeds(getDoc(doc(as(ALICE), 'catalog/meta')));
    await assertFails(setDoc(doc(as(ALICE), 'catalog/meta'), { version: 2 }));
  });
});

describe('groups (v1.1 shape)', () => {
  it('lets members read a group and nobody write it from the client', async () => {
    await seedAsServer('groups/g-1', { name: 'Flat 402', memberIds: [ALICE] });
    await assertSucceeds(getDoc(doc(as(ALICE), 'groups/g-1')));
    await assertFails(getDoc(doc(as(BOB), 'groups/g-1')));
    await assertFails(setDoc(doc(as(ALICE), 'groups/g-1'), { name: 'Hijacked', memberIds: [ALICE] }));
  });
});

describe('everything else', () => {
  it('is denied by the catch-all', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'scratch/anything'), { x: 1 }));
    await assertFails(getDoc(doc(as(ALICE), 'scratch/anything')));
  });
});
