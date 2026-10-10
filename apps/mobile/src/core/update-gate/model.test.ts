import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isBuildSupported } from './model';

describe('isBuildSupported', () => {
  it('returns true when minSupported is null (never fetched)', () => {
    assert.equal(isBuildSupported(100, null), true);
    assert.equal(isBuildSupported(1, null), true);
  });

  it('returns true when current equals minSupported', () => {
    assert.equal(isBuildSupported(100, 100), true);
  });

  it('returns true when current is higher than minSupported', () => {
    assert.equal(isBuildSupported(101, 100), true);
    assert.equal(isBuildSupported(200, 100), true);
  });

  it('returns false when current is lower than minSupported', () => {
    assert.equal(isBuildSupported(99, 100), false);
    assert.equal(isBuildSupported(1, 100), false);
  });

  it('returns true when current is NaN (treats non-numeric builds as supported)', () => {
    assert.equal(isBuildSupported(NaN, 100), true);
  });
});
