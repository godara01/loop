/**
 * The only way the app talks to Crashlytics.
 *
 * The surface is deliberately one function. Everything that leaves the device
 * goes through `crash-keys.ts`, so there is a single, unit-tested place that
 * decides what a crash report may contain:
 *   - the key must be `screen` or `errorCode` — nothing else exists
 *   - the value and the error message are truncated and stripped of digit runs
 *     longer than 4
 *
 * What this module never does:
 *   - identify the user: a crash report is never tied to a Loop account, so the
 *     Crashlytics user-id call is deliberately not imported here
 *   - set attributes from user data — only the two scrubbed keys above
 *   - carry an SMS body or an expense description. Callers pass a screen name
 *     or a short error code, never free text from a message or a user's note.
 *
 * Reporting is best-effort: it must never be the reason a screen breaks, so
 * every call is wrapped and failures are swallowed (surfaced only in __DEV__).
 */
import {
  getCrashlytics,
  recordError as fbRecordError,
  setAttribute,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';

import { type CrashKey, isCrashKey, messageFromError, scrubValue } from './crash-keys';

/**
 * Reporting failures are not the app's problem. Attached to the returned
 * promises so a rejection can't escape as an unhandled rejection.
 */
function swallow(error: unknown): void {
  if (__DEV__) console.warn('[crashlytics] report dropped', error);
}

/**
 * Collection is off in development so local crashes and Fast Refresh noise
 * never reach the console. Safe to call more than once.
 */
export function initCrashlytics(): void {
  try {
    setCrashlyticsCollectionEnabled(getCrashlytics(), !__DEV__).catch(swallow);
  } catch (error) {
    if (__DEV__) console.warn('[crashlytics] could not set collection state', error);
  }
}

/**
 * Report a non-fatal error with exactly one scrubbed context key.
 *
 * @param err   the caught value, of any shape — only its message is kept
 * @param key   `'screen'` or `'errorCode'`; anything else is dropped
 * @param value a screen name or short error code, never free user text
 */
export function recordError(err: unknown, key: CrashKey, value: string): void {
  try {
    const crashlytics = getCrashlytics();
    // Runtime guard as well as the compile-time type: this module is the last
    // line of defence, and an untyped caller must not be able to widen the key.
    if (isCrashKey(key)) {
      setAttribute(crashlytics, key, scrubValue(value)).catch(swallow);
    }
    const error = new Error(messageFromError(err));
    error.name = err instanceof Error ? err.name : 'NonError';
    fbRecordError(crashlytics, error);
  } catch (reportingError) {
    if (__DEV__) console.warn('[crashlytics] could not record error', reportingError);
  }
}
