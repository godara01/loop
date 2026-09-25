import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PendingExpense } from './approval';
import { badgeCount, canApproveAll, groupByDay, localDateIn } from './inbox-view';

const item = (id: string, occurredAt: string, status: PendingExpense['status'] = 'pending'): PendingExpense => ({
  id,
  status,
  amountMinor: 10_000,
  currency: 'INR',
  merchant: 'SWIGGY',
  accountLast4: '1234',
  occurredAt,
  receivedAt: occurredAt,
  source: 'sms',
  templateId: 'hdfc-card-debit-v1',
  confidence: 0.9,
  suggestedCategoryId: null,
  suggestionConfidence: null,
  suggestionModelVersion: null,
  expenseId: null,
  displayHint: 'HDFC ••1234 · SWIGGY',
  createdAt: occurredAt,
  updatedAt: occurredAt,
});

describe('badgeCount', () => {
  it('counts pending items only, ignoring approved, rejected and expired', () => {
    const items = [
      item('a', '2026-09-16T04:00:00.000Z'),
      item('b', '2026-09-16T05:00:00.000Z'),
      item('c', '2026-09-16T06:00:00.000Z', 'approved'),
      item('d', '2026-09-16T07:00:00.000Z', 'rejected'),
      item('e', '2026-09-16T08:00:00.000Z', 'expired'),
    ];
    assert.equal(badgeCount(items), 2);
  });

  it('is zero for an empty inbox', () => {
    assert.equal(badgeCount([]), 0);
  });
});

describe('groupByDay', () => {
  it('splits at local midnight, not UTC midnight', () => {
    // Asia/Kolkata is UTC+05:30: 18:29Z is 23:59 IST, 18:30Z is 00:00 the next day.
    const before = item('before', '2026-09-15T18:29:00.000Z');
    const after = item('after', '2026-09-15T18:30:00.000Z');
    const days = groupByDay([before, after], 'Asia/Kolkata');
    assert.deepEqual(
      days.map((d) => [d.date, d.items.map((i) => i.id)]),
      [
        ['2026-09-16', ['after']],
        ['2026-09-15', ['before']],
      ],
    );
    // The same two instants share a day in UTC.
    assert.deepEqual(groupByDay([before, after], 'UTC').map((d) => d.date), ['2026-09-15']);
  });

  it('orders days newest first and items newest first within a day', () => {
    const days = groupByDay(
      [
        item('old', '2026-09-14T04:00:00.000Z'),
        item('morning', '2026-09-16T03:00:00.000Z'),
        item('evening', '2026-09-16T12:00:00.000Z'),
      ],
      'Asia/Kolkata',
    );
    assert.deepEqual(days.map((d) => d.date), ['2026-09-16', '2026-09-14']);
    assert.deepEqual(days[0]!.items.map((i) => i.id), ['evening', 'morning']);
  });

  it('handles a zone behind UTC', () => {
    assert.equal(localDateIn('2026-09-16T03:00:00.000Z', 'America/New_York'), '2026-09-15');
  });

  it('returns no days for an empty inbox', () => {
    assert.deepEqual(groupByDay([], 'UTC'), []);
  });
});

describe('canApproveAll', () => {
  const items = [item('a', '2026-09-16T04:00:00.000Z'), item('b', '2026-09-16T05:00:00.000Z')];

  it('is true when every pending item has a category', () => {
    assert.equal(canApproveAll(items, { a: 'cat-food', b: 'cat-transport' }), true);
  });

  it('is false when any category is missing', () => {
    assert.equal(canApproveAll(items, { a: 'cat-food' }), false);
    assert.equal(canApproveAll(items, { a: 'cat-food', b: '' }), false);
  });

  it('is false when the list is empty', () => {
    assert.equal(canApproveAll([], {}), false);
  });

  it('ignores items that are no longer pending', () => {
    const mixed = [...items, item('done', '2026-09-16T06:00:00.000Z', 'approved')];
    assert.equal(canApproveAll(mixed, { a: 'cat-food', b: 'cat-food' }), true);
    assert.equal(canApproveAll([item('done', '2026-09-16T06:00:00.000Z', 'approved')], {}), false);
  });
});
