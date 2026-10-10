export interface TimeOfDay {
  readonly h: number;
  readonly m: number;
  readonly s: number;
}

export function timeOfDayOf(iso: string): TimeOfDay {
  const d = new Date(iso);
  return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
}

export function composeOccurredAt(localDate: string, timeOfDay: TimeOfDay, now: Date): string {
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const parts = localDate.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const targetLocal = new Date(y, m - 1, d).getTime();

  if (targetLocal === todayLocal) {
    return now.toISOString();
  }

  const s = timeOfDay.s ?? 0;
  let candidate = new Date(y, m - 1, d, timeOfDay.h, timeOfDay.m, s);

  if (
    candidate.getDate() !== d ||
    candidate.getMonth() !== m - 1 ||
    candidate.getFullYear() !== y
  ) {
    candidate = new Date(y, m - 1, d, timeOfDay.h + 1, 0, 0);
  }

  if (candidate.getHours() !== timeOfDay.h && candidate.getMinutes() === 0) {
    const hourDiff = candidate.getHours() - timeOfDay.h;
    if (hourDiff === 1) {
      return candidate.toISOString();
    }
  }

  if (candidate.getTime() > now.getTime()) {
    return now.toISOString();
  }

  return candidate.toISOString();
}
