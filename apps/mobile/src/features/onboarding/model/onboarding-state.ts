/**
 * Pure state machine for the 5-step onboarding flow.
 * See docs/02-onboarding.md.
 */

import { type CurrencyCode, DEFAULT_DISPLAY_NAME, type OnboardingStep } from '@loop/shared';

export type { OnboardingStep };

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

/** The route each resumable step lives at. */
export const ONBOARDING_ROUTES: Record<Exclude<OnboardingStep, 'complete'>, string> = {
  welcome: '/onboarding',
  profile: '/onboarding/profile',
  feel: '/onboarding/feel',
  categories: '/onboarding/categories',
  'first-expense': '/onboarding/first-expense',
};

/**
 * Where a relaunch resumes (docs/02: "resumes at the same step"). `recorded` is
 * settings.onboardingStep, written as each step is left; null for accounts from
 * before it existed, which fall back to what the profile shows.
 */
export function determineResumeStep(
  profile: {
    displayName?: string | null;
    currency?: string | null;
    onboardedAt?: string | null;
  },
  recorded: OnboardingStep | null = null,
): OnboardingStep {
  if (profile.onboardedAt) return 'complete';
  // A new account's profile carries the placeholder name; the user hasn't done step 1 yet.
  const name = profile.displayName?.trim() ?? '';
  const named = name !== '' && name !== DEFAULT_DISPLAY_NAME;
  if (recorded === null) return named ? 'feel' : 'welcome';
  // onboardedAt is written with 'complete'; if only the step landed, finish step 5.
  if (recorded === 'complete') return 'first-expense';
  // Past the profile step without a name means that write never landed.
  if (!named && recorded !== 'welcome' && recorded !== 'profile') return 'profile';
  return recorded;
}
