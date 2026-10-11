import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Category } from '@loop/shared';

import type { ExpenseDraft } from '@/core/state/draft-store';

import {
  applyKindSwitch,
  categoriesForKind,
  entryKindFromParam,
  fallbackSlugForKind,
  preselectForKind,
  saveLabelForKind,
  switchKindState,
} from './entry-kind';

function cat(id: string, slug: string, type?: 'expense' | 'income', archived = false): Category {
  return {
    id,
    slug,
    name: slug,
    icon: { kind: 'glyph', name: 'cube' },
    colorToken: 'ice',
    kind: 'essential',
    type,
    catalogueSlug: null,
    sortOrder: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    archivedAt: archived ? '2026-09-02T00:00:00.000Z' : null,
  };
}

describe('entryKindFromParam', () => {
  it('defaults to expense', () => {
    assert.equal(entryKindFromParam(undefined), 'expense');
    assert.equal(entryKindFromParam(null), 'expense');
    assert.equal(entryKindFromParam(''), 'expense');
    assert.equal(entryKindFromParam('expense'), 'expense');
    assert.equal(entryKindFromParam('bogus'), 'expense');
  });

  it('reads income', () => {
    assert.equal(entryKindFromParam('income'), 'income');
    assert.equal(entryKindFromParam(['income']), 'income');
  });
});

describe('fallbackSlugForKind', () => {
  it('matches slugs', () => {
    assert.equal(fallbackSlugForKind('expense'), 'OTHER');
    assert.equal(fallbackSlugForKind('income'), 'OTHER_IN');
  });
});

describe('categoriesForKind', () => {
  it('filters by archiving and type', () => {
    const cats = [
      cat('e1', 'FOOD', 'expense'),
      cat('i1', 'SALARY', 'income'),
      cat('legacy', 'OTHER', undefined),
      cat('arch', 'ARCH', 'expense', true),
    ];
    assert.deepEqual(categoriesForKind(cats, 'expense').map((c) => c.id), ['e1', 'legacy']);
    assert.deepEqual(categoriesForKind(cats, 'income').map((c) => c.id), ['i1']);
  });
});

describe('preselectForKind', () => {
  it('prefers most-used in 90-day window', () => {
    const cats = [
      cat('sal', 'SALARY', 'income'),
      cat('other', 'OTHER_IN', 'income'),
      cat('gift', 'GIFTS', 'income'),
    ];
    const counts = new Map([['gift' as string, 3]]);
    assert.equal(preselectForKind(cats, 'income', counts), 'gift');
  });

  it('falls back to SALARY, then OTHER_IN, else first', () => {
    const cats = [cat('sal', 'SALARY', 'income'), cat('other', 'OTHER_IN', 'income')];
    assert.equal(preselectForKind(cats, 'income', new Map()), 'sal');
    const withoutSalary = [cat('other', 'OTHER_IN', 'income'), cat('bonus', 'BONUS', 'income')];
    assert.equal(preselectForKind(withoutSalary, 'income', new Map()), 'other');
  });

  it('returns expense fallback OTHER', () => {
    const cats = [cat('food', 'FOOD', 'expense'), cat('other', 'OTHER', 'expense')];
    assert.equal(preselectForKind(cats, 'expense', new Map()), 'other');
  });

  it('returns null when no categories match kind', () => {
    const cats = [cat('food', 'FOOD', 'expense')];
    assert.equal(preselectForKind(cats, 'income', new Map()), null);
  });
});

describe('switchKindState', () => {
  it('keeps amount and description and resets the category', () => {
    const draft: ExpenseDraft = {
      amount: { text: '12.50' },
      categoryId: 'c-expense',
      description: 'Brunch',
      note: 'extra',
      localDate: '2026-09-04',
    };
    const next = switchKindState(draft, 'income', 'c-income');
    assert.equal(next.categoryId, 'c-income');
    assert.equal(draft.amount.text, '12.50');
    assert.equal(draft.description, 'Brunch');
  });
});

describe('applyKindSwitch', () => {
  it('keeps amount/description/note/localDate and resets category', () => {
    const draft: ExpenseDraft = {
      amount: { text: '99.00' },
      categoryId: 'old',
      description: 'Salary',
      note: 'note',
      localDate: '2026-09-04',
    };
    const switched = applyKindSwitch(draft, 'income', 'new-cat');
    assert.equal(switched.amount.text, '99.00');
    assert.equal(switched.description, 'Salary');
    assert.equal(switched.note, 'note');
    assert.equal(switched.localDate, '2026-09-04');
    assert.equal(switched.categoryId, 'new-cat');
  });
});

describe('saveLabelForKind', () => {
  it('labels correctly', () => {
    assert.equal(saveLabelForKind('expense'), 'Save');
    assert.equal(saveLabelForKind('income'), 'Save income');
  });
});
