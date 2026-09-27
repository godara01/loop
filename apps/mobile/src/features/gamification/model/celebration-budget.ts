/**
 * docs/06 restraint rule 6: at most one celebration per app session. The
 * session is the JS runtime, so a module-level budget is exactly its lifetime.
 */

let spent = false;

/** True once per session: the caller may celebrate. False ever after. */
export function claimCelebration(): boolean {
  if (spent) return false;
  spent = true;
  return true;
}

/** Tests only. */
export function resetCelebrationBudget(): void {
  spent = false;
}
