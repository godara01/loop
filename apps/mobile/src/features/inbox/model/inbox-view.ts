/**
 * What the inbox screen and the Orbit badge show. Pure.
 * See docs/12-sms-ingest.md#the-inbox.
 */

import type { CategoryChoices, PendingExpense } from './approval';

export interface InboxDay {
  /** YYYY-MM-DD in the viewer's time zone. */
  readonly date: string;
  readonly items: readonly PendingExpense[];
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day an instant falls on in `timeZone` (an IANA name). */
export function localDateIn(instant: string, timeZone: string): string {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, formatter);
  }
  // formatToParts, not format: the joined string's order varies by engine.
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Days newest first, and items newest first within a day, by when the money moved. */
export function groupByDay(items: readonly PendingExpense[], timeZone: string): InboxDay[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const days: { date: string; items: PendingExpense[] }[] = [];
  for (const item of sorted) {
    const date = localDateIn(item.occurredAt, timeZone);
    const last = days[days.length - 1];
    if (last?.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }
  return days;
}

/** Only items still waiting on the user. Approved, rejected and expired never count. */
export function badgeCount(items: readonly PendingExpense[]): number {
  return items.filter((item) => item.status === 'pending').length;
}

/** "Approve all" is offered only when there is something to approve and every card has a category. */
export function canApproveAll(items: readonly PendingExpense[], choices: CategoryChoices): boolean {
  const pending = items.filter((item) => item.status === 'pending');
  return pending.length > 0 && pending.every((item) => Boolean(choices[item.id]));
}
