/**
 * The glyph grid offered when creating or editing a category. Derived from the
 * glyphs already used across the essentials and the catalogue — every option
 * shown is guaranteed to already render correctly somewhere in the app, and
 * this list can never drift from that set out of sync.
 */

import { CATEGORY_CATALOGUE, ESSENTIAL_CATEGORIES } from '@loop/shared';

export const CATEGORY_GLYPHS: readonly string[] = Array.from(
  new Set([...ESSENTIAL_CATEGORIES, ...CATEGORY_CATALOGUE].map((t) => t.glyph)),
).sort();
