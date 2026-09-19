/**
 * The converter layer's promise: a valid document round-trips exactly, and an
 * invalid one fails loudly, naming the path and field, instead of rendering wrong.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { essentialCategoriesToSeed, seedEssentialCategories, type Category } from '../categories';
import {
  DEFAULT_SETTINGS,
  DocumentShapeError,
  categoryToDoc,
  newProfile,
  parseCategory,
  parseProfile,
  parseSettings,
  profileToDoc,
  settingsToDoc,
} from '../firestore/documents';
import { firestorePaths } from '../firestore/paths';

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
  it('seeds all eight essentials exactly once', () => {
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
  });

  it('round-trips', () => {
    const settings = {
      hapticsEnabled: false,
      keepItPlain: true,
      insightsPeriod: 'custom',
      insightsCustomStartDate: '2026-08-01',
      insightsCustomEndDate: '2026-08-31',
    } as const;
    assert.deepEqual(parseSettings(UID, settingsToDoc(settings, NOW)), settings);
  });
});
