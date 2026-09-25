import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORY_GLYPHS } from './glyphs';

describe('category glyph grid', () => {
  it('has no duplicates and is non-empty', () => {
    assert.ok(CATEGORY_GLYPHS.length > 20);
    assert.equal(new Set(CATEGORY_GLYPHS).size, CATEGORY_GLYPHS.length);
  });

  it('is sorted, so the grid does not reorder between renders', () => {
    assert.deepEqual(CATEGORY_GLYPHS, [...CATEGORY_GLYPHS].sort());
  });
});
