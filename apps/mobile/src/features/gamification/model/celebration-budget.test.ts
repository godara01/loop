import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { claimCelebration, resetCelebrationBudget } from './celebration-budget';

describe('claimCelebration', () => {
  beforeEach(() => resetCelebrationBudget());

  it('allows the first celebration of a session', () => {
    assert.equal(claimCelebration(), true);
  });

  it('refuses every celebration after the first', () => {
    claimCelebration();
    assert.equal(claimCelebration(), false);
    assert.equal(claimCelebration(), false);
  });
});
