/**
 * When Loop may ask to read SMS. See docs/12-sms-ingest.md#permissions-ux.
 * Never at launch; from the explainer at any time; from the Orbit card once,
 * after the third hand-typed expense, when the value is already obvious.
 */

import type { SmsCaptureState } from '@loop/shared';

/** Hand-typed expenses before the Orbit card may appear. */
export const CAPTURE_PROMPT_AFTER = 3;

/** Verbatim from docs/12-sms-ingest.md#permissions-ux. */
export const CAPTURE_EXPLAINER =
  'Loop reads only transaction messages from banks, on your device. Nothing is uploaded, and nothing is added without your approval.';

/** Days of inbox read in one pass right after the permission is granted. */
export const BACKFILL_DAYS = 30;

/** The Orbit card: at the 3rd manual expense, and only if it has never been shown or answered. */
export function shouldShowCapturePrompt(manualCount: number, state: SmsCaptureState): boolean {
  return manualCount >= CAPTURE_PROMPT_AFTER && state === 'unseen';
}
