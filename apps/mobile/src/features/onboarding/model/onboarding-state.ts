/**
 * Pure state machine for the 5-step onboarding flow.
 * See docs/02-onboarding.md.
 */

import { type CurrencyCode, DEFAULT_DISPLAY_NAME } from '@loop/shared';

export type OnboardingStep =
  | 'welcome'
  | 'profile'
  | 'feel'
  | 'categories'
  | 'first-expense'
  | 'complete';

export interface OnboardingState {
  readonly step: OnboardingStep;
  readonly displayName: string;
  readonly currency: CurrencyCode;
  readonly hapticsEnabled: boolean;
  readonly selectedCategoryIds: readonly string[];
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  step: 'welcome',
  displayName: '',
  currency: 'INR',
  hapticsEnabled: true,
  selectedCategoryIds: [],
};

export type OnboardingAction =
  | { readonly type: 'START' }
  | { readonly type: 'SET_PROFILE'; readonly displayName: string; readonly currency: CurrencyCode }
  | { readonly type: 'SET_HAPTICS'; readonly enabled: boolean }
  | { readonly type: 'CONTINUE_FEEL' }
  | { readonly type: 'TOGGLE_CATEGORY'; readonly categoryId: string }
  | { readonly type: 'SET_CATEGORIES'; readonly categoryIds: readonly string[] }
  | { readonly type: 'CONTINUE_CATEGORIES' }
  | { readonly type: 'COMPLETE' };

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case 'START':
      return { ...state, step: 'profile' };
    case 'SET_PROFILE':
      return {
        ...state,
        displayName: action.displayName.trim(),
        currency: action.currency,
        step: 'feel',
      };
    case 'SET_HAPTICS':
      return { ...state, hapticsEnabled: action.enabled };
    case 'CONTINUE_FEEL':
      return { ...state, step: 'categories' };
    case 'TOGGLE_CATEGORY': {
      const exists = state.selectedCategoryIds.includes(action.categoryId);
      if (exists) {
        if (state.selectedCategoryIds.length <= 1) return state; // At least one required
        return {
          ...state,
          selectedCategoryIds: state.selectedCategoryIds.filter((id) => id !== action.categoryId),
        };
      }
      return {
        ...state,
        selectedCategoryIds: [...state.selectedCategoryIds, action.categoryId],
      };
    }
    case 'SET_CATEGORIES':
      return { ...state, selectedCategoryIds: action.categoryIds };
    case 'CONTINUE_CATEGORIES':
      return { ...state, step: 'first-expense' };
    case 'COMPLETE':
      return { ...state, step: 'complete' };
    default:
      return state;
  }
}

export function determineResumeStep(profile: {
  displayName?: string | null;
  currency?: string | null;
  onboardedAt?: string | null;
}): OnboardingStep {
  if (profile.onboardedAt) return 'complete';
  // A new account's profile carries the placeholder name; the user hasn't done step 1 yet.
  const name = profile.displayName?.trim() ?? '';
  if (name === '' || name === DEFAULT_DISPLAY_NAME) return 'welcome';
  return 'feel';
}
