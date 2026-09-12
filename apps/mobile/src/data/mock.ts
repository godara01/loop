/**
 * Seed data for the shell. Deleted at M3 when the Firestore repositories land —
 * see docs/13-build-plan.md. The shapes here are the real domain types, so
 * screens built against this will not need rewriting.
 */

import {
  type Category,
  type CurrencyCode,
  type Expense,
  type Member,
  type Squad,
  allocate,
  money,
  seedEssentialCategories,
  splitEvenly,
} from '@loop/shared';

export const CURRENCY: CurrencyCode = 'INR';

export const ME = 'm-sanket';

export const MEMBERS: Record<string, Member> = {
  'm-sanket': { id: 'm-sanket', displayName: 'You', avatarUrl: null },
  'm-aisha': { id: 'm-aisha', displayName: 'Aisha', avatarUrl: null },
  'm-ravi': { id: 'm-ravi', displayName: 'Ravi', avatarUrl: null },
  'm-neha': { id: 'm-neha', displayName: 'Neha', avatarUrl: null },
};

/** Exactly what a fresh account is seeded with at first launch. */
export const CATEGORIES: Category[] = seedEssentialCategories('2026-01-01T00:00:00.000Z');

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryOf(categoryId: string): Category {
  // Orphans fall back rather than rendering a blank tag.
  return byId.get(categoryId) ?? byId.get('cat-other')!;
}

export const SQUADS: Squad[] = [
  {
    id: 's-tokyo',
    name: 'Tokyo Trip',
    currency: CURRENCY,
    memberIds: ['m-sanket', 'm-aisha', 'm-ravi', 'm-neha'],
    createdAt: '2026-08-14T09:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 's-flat',
    name: 'Flat 402',
    currency: CURRENCY,
    memberIds: ['m-sanket', 'm-ravi'],
    createdAt: '2026-01-04T09:00:00.000Z',
    archivedAt: null,
  },
];

/** Fills in the fields every expense carries but this shell does not vary. */
function expense(
  fields: Pick<Expense, 'id' | 'categoryId' | 'description' | 'total' | 'paidBy' | 'occurredAt' | 'localDate' | 'allocations'> &
    Partial<Expense>,
): Expense {
  return {
    note: null,
    source: 'manual',
    receiptPath: null,
    pendingId: null,
    groupId: null,
    splitMode: 'even',
    createdAt: fields.occurredAt,
    updatedAt: fields.occurredAt,
    deletedAt: null,
    ...fields,
  };
}

export const EXPENSES: Expense[] = [
  expense({
    id: 'e-001',
    groupId: 's-tokyo',
    description: 'Izakaya dinner',
    categoryId: 'cat-food',
    total: money(1248000, CURRENCY),
    paidBy: 'm-sanket',
    allocations: splitEvenly(money(1248000, CURRENCY), [
      'm-sanket',
      'm-aisha',
      'm-ravi',
      'm-neha',
    ]),
    occurredAt: '2026-09-03T13:20:00.000Z',
    localDate: '2026-09-03',
  }),
  expense({
    id: 'e-002',
    groupId: 's-tokyo',
    description: 'Shinkansen tickets',
    categoryId: 'cat-transport',
    total: money(3360000, CURRENCY),
    paidBy: 'm-aisha',
    allocations: splitEvenly(money(3360000, CURRENCY), [
      'm-sanket',
      'm-aisha',
      'm-ravi',
      'm-neha',
    ]),
    occurredAt: '2026-09-02T07:05:00.000Z',
    localDate: '2026-09-02',
  }),
  expense({
    id: 'e-003',
    groupId: 's-tokyo',
    // 1000 does not divide by 3 evenly — the largest-remainder split gives
    // 333.34 / 333.33 / 333.33, which is exactly what the ledger should show.
    description: 'Airport taxi',
    categoryId: 'cat-transport',
    total: money(100000, CURRENCY),
    paidBy: 'm-ravi',
    splitMode: 'shares',
    allocations: allocate(money(100000, CURRENCY), 'shares', [
      { memberId: 'm-sanket', shares: 1 },
      { memberId: 'm-ravi', shares: 1 },
      { memberId: 'm-neha', shares: 1 },
    ]),
    occurredAt: '2026-09-01T18:40:00.000Z',
    localDate: '2026-09-01',
  }),
  expense({
    id: 'e-004',
    groupId: 's-flat',
    description: 'September rent',
    categoryId: 'cat-bills',
    total: money(4800000, CURRENCY),
    paidBy: 'm-sanket',
    allocations: splitEvenly(money(4800000, CURRENCY), ['m-sanket', 'm-ravi']),
    occurredAt: '2026-09-01T05:00:00.000Z',
    localDate: '2026-09-01',
  }),
  expense({
    id: 'e-005',
    description: 'Filter coffee',
    categoryId: 'cat-food',
    total: money(18000, CURRENCY),
    paidBy: ME,
    allocations: splitEvenly(money(18000, CURRENCY), [ME]),
    occurredAt: '2026-09-05T03:30:00.000Z',
    localDate: '2026-09-05',
  }),
];

export function nameOf(memberId: string): string {
  return MEMBERS[memberId]?.displayName ?? memberId;
}

export function expensesForSquad(squadId: string): Expense[] {
  return EXPENSES.filter((e) => e.groupId === squadId);
}
