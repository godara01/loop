import { addDays, todayISO } from '@loop/shared';

export interface DayCell {
  readonly date: string;
  readonly day: number;
  readonly outOfMonth: boolean;
}

export interface MonthGrid {
  readonly year: number;
  readonly month: number;
  readonly weeks: readonly (readonly DayCell[])[];
}

export interface RangeState {
  readonly start: string | null;
  readonly end: string | null;
}

export type RangeTapResult =
  | { type: 'ok'; state: RangeState }
  | { type: 'tooLong'; state: RangeState };

export function monthGrid(year: number, month: number): MonthGrid {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();

  const firstDayOfWeek = firstDay.getDay();
  const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const weeks: DayCell[][] = [];
  let currentWeek: DayCell[] = [];

  for (let i = 0; i < mondayOffset; i += 1) {
    const prevMonthDay = new Date(year, month - 1, 1 - mondayOffset + i);
    currentWeek.push({
      date: todayISO(prevMonthDay),
      day: prevMonthDay.getDate(),
      outOfMonth: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    currentWeek.push({
      date: todayISO(date),
      day,
      outOfMonth: false,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    let nextDay = 1;
    while (currentWeek.length < 7) {
      const nextMonthDate = new Date(year, month, nextDay);
      currentWeek.push({
        date: todayISO(nextMonthDate),
        day: nextDay,
        outOfMonth: true,
      });
      nextDay += 1;
    }
    weeks.push(currentWeek);
  }

  return { year, month, weeks };
}

export function isSelectable(
  day: string,
  today: string,
  options: { allowFuture?: boolean; minDate?: string } = {},
): boolean {
  const { allowFuture = false, minDate = '2000-01-01' } = options;

  if (day < minDate) return false;
  if (!allowFuture && day > today) return false;

  return true;
}

export function applyRangeTap(
  state: RangeState,
  day: string,
  maxRangeDays: number,
): RangeTapResult {
  if (state.start === null) {
    return {
      type: 'ok',
      state: { start: day, end: null },
    };
  }

  if (state.end === null) {
    let start = state.start;
    let end = day;

    if (end < start) {
      [start, end] = [end, start];
    }

    const rangeDays = daysBetween(start, end) + 1;

    if (rangeDays > maxRangeDays) {
      return {
        type: 'tooLong',
        state,
      };
    }

    return {
      type: 'ok',
      state: { start, end },
    };
  }

  return {
    type: 'ok',
    state: { start: day, end: null },
  };
}

export function canStepMonth(
  direction: 1 | -1,
  viewMonth: { year: number; month: number },
  today: string,
  allowFuture: boolean,
  minDate: string,
): boolean {
  const nextYear = viewMonth.month + direction > 12 ? viewMonth.year + 1 :
                   viewMonth.month + direction < 1 ? viewMonth.year - 1 :
                   viewMonth.year;
  const nextMonth = viewMonth.month + direction > 12 ? 1 :
                    viewMonth.month + direction < 1 ? 12 :
                    viewMonth.month + direction;

  const targetFirstDay = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;

  if (direction === -1) {
    return targetFirstDay >= minDate.slice(0, 8) + '01';
  }

  if (direction === 1) {
    const todayYear = parseInt(today.slice(0, 4), 10);
    const todayMonth = parseInt(today.slice(5, 7), 10);
    
    if (!allowFuture) {
      return nextYear < todayYear || (nextYear === todayYear && nextMonth <= todayMonth);
    }
    
    return true;
  }

  return false;
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
