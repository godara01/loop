/**
 * Categories are user data now, so the rules that used to be enforced by a
 * string union have to be enforced here instead.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CATEGORY_CATALOGUE,
  ESSENTIAL_CATEGORIES,
  FALLBACK_CATEGORY_SLUG,
  MAX_LOGO_BYTES,
  type Category,
  archiveCategory,
  canArchive,
  canDelete,
  catalogueFor,
  categoryFromTemplate,
  editCategory,
  newCustomCategory,
  orderForEntry,
  reorderCategories,
  seedEssentialCategories,
  slugifyCategoryName,
  unarchiveCategory,
  validateCategoryDraft,
  validateLogoFile,
} from '../categories';
import { CATEGORY_COLOR_TOKENS } from '../theme';

const NOW = '2026-09-05T10:00:00.000Z';

describe('category seeding', () => {
  it('installs exactly the eight essentials, in strip order', () => {
    const seeded = seedEssentialCategories(NOW);
    assert.equal(seeded.length, 8);
    assert.deepEqual(
      seeded.map((c) => c.sortOrder),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
    assert.ok(seeded.every((c) => c.kind === 'essential'));
    assert.ok(seeded.every((c) => c.archivedAt === null));
  });

  it('gives every seeded category a glyph, so nothing needs the network to render', () => {
    for (const category of seedEssentialCategories(NOW)) {
      assert.equal(category.icon.kind, 'glyph');
    }
  });

  it('includes the fallback category, which must always exist', () => {
    const slugs = seedEssentialCategories(NOW).map((c) => c.slug);
    assert.ok(slugs.includes(FALLBACK_CATEGORY_SLUG));
  });
});

describe('the catalogue', () => {
  it('has unique slugs that never collide with an essential', () => {
    const essentials = new Set(ESSENTIAL_CATEGORIES.map((t) => t.slug));
    const seen = new Set<string>();

    for (const entry of CATEGORY_CATALOGUE) {
      assert.ok(!essentials.has(entry.slug), `${entry.slug} duplicates an essential`);
      assert.ok(!seen.has(entry.slug), `${entry.slug} appears twice in the catalogue`);
      seen.add(entry.slug);
    }
  });

  it('only uses colour tokens the palette actually defines', () => {
    for (const entry of [...ESSENTIAL_CATEGORIES, ...CATEGORY_CATALOGUE]) {
      assert.ok(
        CATEGORY_COLOR_TOKENS.includes(entry.colorToken),
        `${entry.slug} uses an unknown token ${entry.colorToken}`,
      );
      assert.ok(entry.slug.length <= 12, `${entry.slug} is too long for a mono tag`);
    }
  });

  it('hides entries the user has already installed', () => {
    const installed = [
      ...seedEssentialCategories(NOW),
      categoryFromTemplate(CATEGORY_CATALOGUE[0]!, {
        id: 'cat-coffee',
        kind: 'catalogue',
        sortOrder: 8,
        createdAt: NOW,
      }),
    ];

    const offered = [...catalogueFor(installed).values()].flat();
    assert.ok(!offered.some((t) => t.slug === CATEGORY_CATALOGUE[0]!.slug));
    assert.ok(offered.length > 0);
  });

  it('adds from the catalogue as an independent copy, not a reference', () => {
    const template = CATEGORY_CATALOGUE.find((t) => t.slug === 'COFFEE')!;
    const added = categoryFromTemplate(template, {
      id: 'cat-1',
      kind: 'catalogue',
      sortOrder: 9,
      createdAt: NOW,
    });

    // The link is remembered for future matching, but the data is the user's.
    assert.equal(added.catalogueSlug, 'COFFEE');
    const renamed: Category = { ...added, name: 'Filter kaapi' };
    assert.equal(template.name, 'Coffee & tea');
    assert.equal(renamed.name, 'Filter kaapi');
  });
});

describe('slugs', () => {
  it('derives an uppercase alphanumeric tag', () => {
    assert.equal(slugifyCategoryName('Coffee & tea'), 'COFFEETEA');
    assert.equal(slugifyCategoryName('  date night  '), 'DATENIGHT');
  });

  it('truncates rather than letting a tag shift a ledger column', () => {
    assert.equal(slugifyCategoryName('Extraordinarily long name').length, 12);
  });
});

describe('validation', () => {
  const existing = [
    { id: 'a', slug: 'FOOD' },
    { id: 'b', slug: 'RENT' },
  ];

  it('rejects an empty or oversized name', () => {
    assert.equal(validateCategoryDraft({ name: '  ', slug: 'X' }, existing), 'name_empty');
    assert.equal(
      validateCategoryDraft({ name: 'x'.repeat(25), slug: 'X' }, existing),
      'name_too_long',
    );
  });

  it('rejects a duplicate slug case-insensitively', () => {
    assert.equal(validateCategoryDraft({ name: 'Food', slug: 'food' }, existing), 'slug_taken');
  });

  it('lets a category keep its own slug while being edited', () => {
    assert.equal(validateCategoryDraft({ name: 'Food', slug: 'FOOD' }, existing, 'a'), null);
  });

  it('accepts a genuinely new category', () => {
    assert.equal(validateCategoryDraft({ name: 'Coffee', slug: 'COFFEE' }, existing), null);
  });
});

describe('archiving and deleting', () => {
  const seeded = seedEssentialCategories(NOW);
  const other = seeded.find((c) => c.slug === FALLBACK_CATEGORY_SLUG)!;
  const food = seeded.find((c) => c.slug === 'FOOD')!;

  it('never archives the fallback category', () => {
    assert.equal(canArchive(other), false);
    assert.equal(canArchive(food), true);
  });

  it('never deletes an essential, and never deletes anything with expenses', () => {
    const custom: Category = { ...food, id: 'c-1', kind: 'custom', slug: 'DATENIGHT' };
    assert.equal(canDelete(food, 0), false);
    assert.equal(canDelete(custom, 3), false);
    assert.equal(canDelete(custom, 0), true);
  });
});

describe('entry-strip order', () => {
  const seeded = seedEssentialCategories(NOW);

  it('puts the most-used first when the user has never reordered', () => {
    const usage = new Map([
      ['cat-fun', 9],
      ['cat-transport', 4],
    ]);
    const ordered = orderForEntry(seeded, usage, false);
    assert.deepEqual(
      ordered.slice(0, 2).map((c) => c.id),
      ['cat-fun', 'cat-transport'],
    );
  });

  it('respects a manual order over usage once the user has dragged anything', () => {
    const usage = new Map([['cat-fun', 99]]);
    const ordered = orderForEntry(seeded, usage, true);
    assert.equal(ordered[0]!.id, 'cat-food');
  });

  it('never offers an archived category for entry', () => {
    const archived = seeded.map((c) =>
      c.slug === 'FUN' ? { ...c, archivedAt: NOW } : c,
    );
    const ordered = orderForEntry(archived, new Map(), false);
    assert.ok(!ordered.some((c) => c.slug === 'FUN'));
  });
});

describe('creating a custom category', () => {
  it('builds a category with no catalogue link', () => {
    const category = newCustomCategory(
      { name: '  Gym  ', slug: 'gym', icon: { kind: 'glyph', name: 'barbell' }, colorToken: 'lime' },
      { id: 'cat-1', sortOrder: 9, createdAt: NOW },
    );
    assert.equal(category.name, 'Gym');
    assert.equal(category.slug, 'GYM');
    assert.equal(category.kind, 'custom');
    assert.equal(category.catalogueSlug, null);
    assert.equal(category.archivedAt, null);
  });
});

describe('editing a category', () => {
  it('changes name, icon and colour but never the slug or kind', () => {
    const original = seedEssentialCategories(NOW)[0]!;
    const edited = editCategory(original, { name: '  Snacks  ', colorToken: 'amber' });
    assert.equal(edited.name, 'Snacks');
    assert.equal(edited.colorToken, 'amber');
    assert.equal(edited.slug, original.slug);
    assert.equal(edited.kind, original.kind);
  });

  it('leaves anything not in the patch untouched', () => {
    const original = seedEssentialCategories(NOW)[0]!;
    assert.deepEqual(editCategory(original, {}), original);
  });
});

describe('archive / unarchive round trip', () => {
  it('sets and clears archivedAt', () => {
    const original = seedEssentialCategories(NOW)[1]!;
    const archived = archiveCategory(original, '2026-09-17T00:00:00.000Z');
    assert.equal(archived.archivedAt, '2026-09-17T00:00:00.000Z');
    assert.equal(unarchiveCategory(archived).archivedAt, null);
  });
});

describe('reordering', () => {
  it('assigns sortOrder 0-based in the given order', () => {
    const seeded = seedEssentialCategories(NOW);
    const ids = seeded.map((c) => c.id).reverse();
    const reordered = reorderCategories(ids, seeded);
    assert.deepEqual(
      reordered.map((c) => c.id),
      ids,
    );
    reordered.forEach((c, i) => assert.equal(c.sortOrder, i));
  });

  it('drops an id that does not exist rather than crashing', () => {
    const seeded = seedEssentialCategories(NOW);
    const reordered = reorderCategories(['does-not-exist', seeded[0]!.id], seeded);
    assert.equal(reordered.length, 1);
    assert.equal(reordered[0]!.id, seeded[0]!.id);
  });

  it('feeds directly into orderForEntry as a manual order', () => {
    const seeded = seedEssentialCategories(NOW);
    const flipped = reorderCategories([seeded[1]!.id, seeded[0]!.id], seeded.slice(0, 2));
    const ordered = orderForEntry(flipped, new Map(), true);
    assert.deepEqual(
      ordered.map((c) => c.id),
      [seeded[1]!.id, seeded[0]!.id],
    );
  });
});

describe('uploaded logo limits', () => {
  it('accepts a small PNG/JPEG/WebP', () => {
    assert.equal(validateLogoFile({ size: 1000, mimeType: 'image/png' }), null);
    assert.equal(validateLogoFile({ size: MAX_LOGO_BYTES, mimeType: 'image/jpeg' }), null);
    assert.equal(validateLogoFile({ size: 1000, mimeType: 'image/webp' }), null);
  });

  it('rejects anything over the ceiling the Storage rules also enforce', () => {
    assert.equal(validateLogoFile({ size: MAX_LOGO_BYTES + 1, mimeType: 'image/png' }), 'too_large');
  });

  it('rejects a type that is not an image the app renders', () => {
    assert.equal(validateLogoFile({ size: 1000, mimeType: 'application/pdf' }), 'wrong_type');
    assert.equal(validateLogoFile({ size: 1000, mimeType: 'image/gif' }), 'wrong_type');
  });
});
