import {
  FALLBACK_CATEGORY_SLUG,
  FALLBACK_INCOME_CATEGORY_SLUG,
  type Category,
} from '@loop/shared';

import type { ExpenseDraft } from '@/core/state/draft-store';

export type EntryKind = 'expense' | 'income';

export const ENTRY_KINDS: readonly EntryKind[] = ['expense', 'income'] as const;

export function entryKindFromParam(param: string | undefined | string[] | null): EntryKind {
  const normalized = Array.isArray(param) ? param[0] : param;
  return normalized === 'income' ? 'income' : 'expense';
}

export function fallbackSlugForKind(kind: EntryKind): string {
  return kind === 'income' ? FALLBACK_INCOME_CATEGORY_SLUG : FALLBACK_CATEGORY_SLUG;
}

export function categoriesForKind(categories: readonly Category[], kind: EntryKind): Category[] {
  return categories.filter((c) => {
    if (c.archivedAt !== null) return false;
    const t = c.type ?? 'expense';
    return t === kind;
  });
}

export function preselectForKind(
  categories: readonly Category[],
  kind: EntryKind,
  usageCounts: ReadonlyMap<string, number>,
): string | null {
  const pool = categoriesForKind(categories, kind);
  if (pool.length === 0) return null;
  const mostUsed = pool.find((c) => (usageCounts.get(c.id) ?? 0) > 0);
  if (mostUsed) return mostUsed.id;
  const preferred = kind === 'income' ? pool.find((c) => c.slug === 'SALARY') : undefined;
  if (preferred) return preferred.id;
  const fallback = pool.find((c) => c.slug === fallbackSlugForKind(kind));
  return fallback?.id ?? pool[0].id;
}

export function switchKindState(
  draft: ExpenseDraft,
  nextKind: EntryKind,
  preselectId: string | null,
): Pick<ExpenseDraft, 'categoryId'> {
  return { categoryId: preselectId };
}

export function applyKindSwitch(
  draft: ExpenseDraft,
  nextKind: EntryKind,
  preselectId: string | null,
): ExpenseDraft {
  return { ...draft, categoryId: preselectId };
}

export function saveLabelForKind(kind: EntryKind): string {
  return kind === 'income' ? 'Save income' : 'Save';
}
