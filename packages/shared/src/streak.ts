/**
 * Gamification rules. Kept as pure functions so the same logic drives the
 * arcade dashboard, the nightly reminder job, and the MCP server's answers
 * about a user's progress.
 */

export interface StreakState {
  readonly current: number;
  readonly longest: number;
  /** ISO date (YYYY-MM-DD) of the last day the user logged an expense. */
  readonly lastLoggedOn: string | null;
}

export const EMPTY_STREAK: StreakState = { current: 0, longest: 0, lastLoggedOn: null };

/** A day counts once the user logs at least one expense. */
export function recordActivity(state: StreakState, today: string): StreakState {
  if (state.lastLoggedOn === today) return state;

  const continues = state.lastLoggedOn !== null && daysBetween(state.lastLoggedOn, today) === 1;
  const current = continues ? state.current + 1 : 1;

  return {
    current,
    longest: Math.max(state.longest, current),
    lastLoggedOn: today,
  };
}

/** A streak survives one missed day only if it is still the same day or the next. */
export function isStreakBroken(state: StreakState, today: string): boolean {
  if (state.lastLoggedOn === null) return false;
  return daysBetween(state.lastLoggedOn, today) > 1;
}

export function settleProgress(settled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, settled / total));
}

/** Segment count for the arcade progress gauge (discrete pill blocks, not a bar). */
export function gaugeSegments(progress: number, segments = 8): number {
  return Math.round(Math.max(0, Math.min(1, progress)) * segments);
}

export function todayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
