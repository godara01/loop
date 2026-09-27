/**
 * Every empty-state line, in one place, word for word from
 * docs/02-onboarding.md#empty-states-after-onboarding. Screens import from here
 * instead of hard-coding copy, and a unit test holds each string to the doc.
 */
export const EMPTY_STATES = {
  orbit: 'Nothing logged today.',
  ledger: 'Your ledger starts here.',
  insights: 'Log a few days and this fills in.',
  /** Shown under real data when fewer than 3 days have spending — never a fake chart. */
  insightsThinData: 'Trends need about a week.',
  inbox: 'Transaction messages will show up here for you to approve.',
} as const;

export type EmptyStateSurface = keyof typeof EMPTY_STATES;
