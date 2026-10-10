/**
 * The filter sheet's date presets (docs/03-expenses.md § "The filter sheet").
 *
 * Every range is inclusive on both ends and expressed as a local `YYYY-MM-DD`
 * string, the same key the ledger groups on. The arithmetic is string- and
 * calendar-based — `addDays` from @loop/shared for day steps, slicing for month
 * and year boundaries — so a DST shift or a device timezone change can never
 * move a boundary by an hour's worth of milliseconds.
 */

import { addDays } from '@loop/shared';

export type DatePresetId = 'this-month' | 'last-month' | 'last-30' | 'this-year' | 'custom';

export interface DateRange {
  readonly start: string;
  readonly end: string;
}

/** The four computed presets, in the order the sheet lays them out. */
export const PRESET_IDS = ['this-month', 'last-month', 'last-30', 'this-year'] as const;

export const PRESET_LABELS: Record<DatePresetId, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30': 'Last 30 days',
  'this-year': 'This year',
  custom: 'Custom',
};

/** The first of `today`'s calendar month through today. */
export function thisMonth(today: string): DateRange {
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

/**
 * The whole previous calendar month. Its end is the day before this month's
 * first, which lands on 28/29/30/31 without a days-in-month table and handles
 * January rolling back to the previous December.
 */
export function lastMonth(today: string): DateRange {
  const end = addDays(`${today.slice(0, 7)}-01`, -1);
  return { start: `${end.slice(0, 7)}-01`, end };
}

/** Today plus the 29 days before it — 30 days inclusive. */
export function last30(today: string): DateRange {
  return { start: addDays(today, -29), end: today };
}

/** January 1st of `today`'s year through today. */
export function thisYear(today: string): DateRange {
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}

/** The range for a computed preset. `custom` has no range of its own. */
export function presetRange(id: Exclude<DatePresetId, 'custom'>, today: string): DateRange {
  switch (id) {
    case 'this-month':
      return thisMonth(today);
    case 'last-month':
      return lastMonth(today);
    case 'last-30':
      return last30(today);
    case 'this-year':
      return thisYear(today);
  }
}

/**
 * Which preset chip a range should light up, or `custom` for a range no preset
 * produces. Null when no date facet is set, so nothing is selected.
 */
export function matchingPreset(range: DateRange | null, today: string): DatePresetId | null {
  if (range === null) return null;
  for (const id of PRESET_IDS) {
    const candidate = presetRange(id, today);
    if (candidate.start === range.start && candidate.end === range.end) return id;
  }
  return 'custom';
}
