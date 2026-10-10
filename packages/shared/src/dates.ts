export interface TimeOfDay {
  readonly h: number;
  readonly m: number;
  readonly s: number;
}

export function timeOfDayOf(iso: string): TimeOfDay {
  const d = new Date(iso);
  return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
}

/**
 * The instant for an expense on `localDate` at `timeOfDay`, built from LOCAL
 * calendar parts (never `now − n days`, which drifts by an hour across DST).
 * docs/03-expenses.md § "What a picked date writes":
 * - `localDate` is today → `now`.
 * - The wall-clock time falls in a spring-forward gap → the first valid minute
 *   after it (the top of the next hour).
 * - The time occurs twice (fall-back) → the first occurrence (what the JS
 *   engine picks for an ambiguous local time).
 * - Never in the future: clamped to `now`.
 */
export function composeOccurredAt(localDate: string, timeOfDay: TimeOfDay, now: Date): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  if (y === now.getFullYear() && m - 1 === now.getMonth() && d === now.getDate()) {
    return now.toISOString();
  }

  const s = timeOfDay.s ?? 0;
  let candidate = new Date(y, m - 1, d, timeOfDay.h, timeOfDay.m, s);
  // In a DST gap the engine shifts the time forward by the gap length (02:30 →
  // 03:30). Detect it and use the first valid minute instead.
  if (candidate.getHours() !== timeOfDay.h || candidate.getMinutes() !== timeOfDay.m) {
    candidate = new Date(y, m - 1, d, timeOfDay.h + 1, 0, 0);
  }

  if (candidate.getTime() > now.getTime()) return now.toISOString();
  return candidate.toISOString();
}
