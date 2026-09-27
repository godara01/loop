/**
 * Pure scrubbing layer for crash reports. No Firebase, no React Native — so it
 * is unit-testable and the rules below are the single place that decides what
 * may leave the device.
 *
 * Two hard rules, because a crash report leaves the device and we never control
 * where it lands:
 *   1. Only an allowlisted key may be attached. Anything else is dropped, so a
 *      future caller can't invent `phone` or `accountId` and have it ship.
 *   2. Every value is truncated and every run of 5+ digits is masked. That
 *      covers account numbers, card numbers, phone numbers, OTPs and
 *      amount-with-reference strings. Runs of <= 4 digits survive, so error
 *      codes, HTTP statuses, years and small counts stay readable.
 *
 * Never pass an SMS body or an expense description through here. The digit mask
 * is a backstop against leaked identifiers, not a licence to log free text.
 */

/** The only keys Crashlytics is ever allowed to carry. */
export const CRASH_KEYS = ['screen', 'errorCode'] as const;

export type CrashKey = (typeof CRASH_KEYS)[number];

/** Values longer than this are cut; crash keys are labels, not payloads. */
export const MAX_VALUE_LENGTH = 100;

/** Stands in for any run of 5 or more digits. */
export const DIGIT_MASK = '[num]';

const LONG_DIGIT_RUN = /\d{5,}/g;

export function isCrashKey(key: string): key is CrashKey {
  return (CRASH_KEYS as readonly string[]).includes(key);
}

/**
 * Replace every run of 5+ digits with {@link DIGIT_MASK}. Runs of 4 or fewer
 * digits are left alone.
 */
export function maskDigits(input: string): string {
  return input.replace(LONG_DIGIT_RUN, DIGIT_MASK);
}

/**
 * Scrub a crash key value: mask long digit runs, then truncate. Masking runs
 * first so truncation can't split a number into two short, unmasked halves.
 */
export function scrubValue(value: string): string {
  return maskDigits(value).slice(0, MAX_VALUE_LENGTH);
}

/**
 * Scrub an error message with the same digit rule as values. Newlines and tabs
 * collapse to single spaces so a multi-line stack fragment stays one line in
 * the Crashlytics console.
 */
export function scrubMessage(message: string): string {
  return scrubValue(message.replace(/\s+/g, ' ').trim());
}

/**
 * The message for an unknown throw. Accepts `unknown` because `catch` gives us
 * `unknown` and non-Error values (strings, rejected objects) are common.
 */
export function messageFromError(err: unknown): string {
  if (err instanceof Error) return scrubMessage(err.message);
  if (typeof err === 'string') return scrubMessage(err);
  if (typeof err === 'number' || typeof err === 'boolean') return scrubMessage(String(err));
  if (err === null) return 'null';
  if (err === undefined) return 'undefined';
  return 'non-error thrown';
}
