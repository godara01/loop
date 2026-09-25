import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_ONBOARDING_STATE,
  determineResumeStep,
  onboardingReducer,
} from './onboarding-state';

describe('onboarding reducer', () => {
  it('transitions from welcome to profile on START', () => {
    const next = onboardingReducer(INITIAL_ONBOARDING_STATE, { type: 'START' });
    assert.equal(next.step, 'profile');
  });

  it('sets profile display name and currency and moves to feel', () => {
    const s1 = onboardingReducer(INITIAL_ONBOARDING_STATE, { type: 'START' });
    const s2 = onboardingReducer(s1, {
      type: 'SET_PROFILE',
      displayName: '  Alice  ',
      currency: 'USD',
    });
    assert.equal(s2.displayName, 'Alice');
    assert.equal(s2.currency, 'USD');
    assert.equal(s2.step, 'feel');
  });

  it('updates haptics setting and advances to categories', () => {
    let state = onboardingReducer(INITIAL_ONBOARDING_STATE, { type: 'START' });
    state = onboardingReducer(state, {
      type: 'SET_PROFILE',
      displayName: 'Alice',
      currency: 'INR',
    });
    state = onboardingReducer(state, { type: 'SET_HAPTICS', enabled: false });
    assert.equal(state.hapticsEnabled, false);
    state = onboardingReducer(state, { type: 'CONTINUE_FEEL' });
    assert.equal(state.step, 'categories');
  });

  it('toggles categories and refuses to remove the last one', () => {
    let state = onboardingReducer(INITIAL_ONBOARDING_STATE, {
      type: 'SET_CATEGORIES',
      categoryIds: ['cat-food', 'cat-bills'],
    });
    // Remove cat-bills
    state = onboardingReducer(state, { type: 'TOGGLE_CATEGORY', categoryId: 'cat-bills' });
    assert.deepEqual(state.selectedCategoryIds, ['cat-food']);

    // Attempt to remove cat-food (the last one)
    state = onboardingReducer(state, { type: 'TOGGLE_CATEGORY', categoryId: 'cat-food' });
    assert.deepEqual(state.selectedCategoryIds, ['cat-food'], 'refuses removing the last category');

    // Add another category
    state = onboardingReducer(state, { type: 'TOGGLE_CATEGORY', categoryId: 'cat-transit' });
    assert.deepEqual(state.selectedCategoryIds, ['cat-food', 'cat-transit']);
  });

  it('completes the flow', () => {
    let state = onboardingReducer(INITIAL_ONBOARDING_STATE, { type: 'CONTINUE_CATEGORIES' });
    assert.equal(state.step, 'first-expense');
    state = onboardingReducer(state, { type: 'COMPLETE' });
    assert.equal(state.step, 'complete');
  });
});

describe('determineResumeStep', () => {
  it('resumes complete when onboardedAt is present', () => {
    assert.equal(determineResumeStep({ onboardedAt: '2026-09-01T10:00:00Z' }), 'complete');
  });

  it('resumes welcome when no display name is set', () => {
    assert.equal(determineResumeStep({ displayName: '' }), 'welcome');
    assert.equal(determineResumeStep({ displayName: null }), 'welcome');
  });

  it('resumes feel when display name is set but onboardedAt is null', () => {
    assert.equal(determineResumeStep({ displayName: 'Alice', onboardedAt: null }), 'feel');
  });
});
