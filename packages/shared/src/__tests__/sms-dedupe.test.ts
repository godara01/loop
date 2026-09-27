import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDuplicatePendingExpense,
  type DedupeCandidate,
  type DedupeManualExpense,
  type DedupePendingExpense,
} from '../sms/dedupe';

/** Fixed anchor so nothing depends on the clock. */
const ANCHOR_MS = Date.parse('2026-03-01T12:00:00.000Z');

/** ISO instant `seconds` after the anchor. Negative values are before it. */
const at = (seconds: number): string => new Date(ANCHOR_MS + seconds * 1000).toISOString();

const MIN = 60;

const candidate = (over: Partial<DedupeCandidate> = {}): DedupeCandidate => ({
  amountMinor: 45_000,
  accountLast4: '1234',
  occurredAt: at(0),
  ...over,
});

const pending = (over: Partial<DedupePendingExpense> = {}): DedupePendingExpense => ({
  amountMinor: 45_000,
  accountLast4: '1234',
  occurredAt: at(0),
  status: 'pending',
  ...over,
});

const manual = (over: Partial<DedupeManualExpense> = {}): DedupeManualExpense => ({
  amountMinor: 45_000,
  occurredAt: at(0),
  source: 'pasted',
  ...over,
});

describe('isDuplicatePendingExpense — pending/approved window (±10 min, inclusive)', () => {
  // The existing item sits at the anchor; the candidate moves around it, so a
  // negative offset is "candidate arrived before the stored one".
  const cases: ReadonlyArray<[label: string, offsetSeconds: number, expected: boolean]> = [
    ['9:59 before', -(9 * MIN + 59), true],
    ['exactly 10:00 before', -(10 * MIN), true],
    ['10:01 before', -(10 * MIN + 1), false],
    ['9:59 after', 9 * MIN + 59, true],
    ['exactly 10:00 after', 10 * MIN, true],
    ['10:01 after', 10 * MIN + 1, false],
  ];

  for (const [label, offset, expected] of cases) {
    it(`${label} → ${expected ? 'duplicate' : 'not a duplicate'}`, () => {
      assert.equal(
        isDuplicatePendingExpense(candidate({ occurredAt: at(offset) }), [pending()], []),
        expected,
      );
    });
  }

  it('treats an approved item exactly like a pending one', () => {
    assert.equal(
      isDuplicatePendingExpense(
        candidate({ occurredAt: at(5 * MIN) }),
        [pending({ status: 'approved' })],
        [],
      ),
      true,
    );
  });

  it('is not a duplicate when the amount differs by a single minor unit', () => {
    assert.equal(
      isDuplicatePendingExpense(candidate({ amountMinor: 45_001 }), [pending()], []),
      false,
    );
  });
});

describe('isDuplicatePendingExpense — manual window (±30 min, inclusive)', () => {
  const cases: ReadonlyArray<[label: string, offsetSeconds: number, expected: boolean]> = [
    ['29:59 before', -(29 * MIN + 59), true],
    ['exactly 30:00 before', -(30 * MIN), true],
    ['30:01 before', -(30 * MIN + 1), false],
    ['29:59 after', 29 * MIN + 59, true],
    ['exactly 30:00 after', 30 * MIN, true],
    ['30:01 after', 30 * MIN + 1, false],
  ];

  for (const [label, offset, expected] of cases) {
    it(`${label} → ${expected ? 'duplicate' : 'not a duplicate'}`, () => {
      assert.equal(
        isDuplicatePendingExpense(candidate({ occurredAt: at(offset) }), [], [manual()]),
        expected,
      );
    });
  }

  it('matches a manual expense on amount alone, with no account number in play', () => {
    assert.equal(
      isDuplicatePendingExpense(
        candidate({ accountLast4: null, occurredAt: at(20 * MIN) }),
        [],
        [manual()],
      ),
      true,
    );
  });

  it('is not a duplicate when the manual amount differs', () => {
    assert.equal(
      isDuplicatePendingExpense(candidate(), [], [manual({ amountMinor: 45_100 })]),
      false,
    );
  });
});

describe('isDuplicatePendingExpense — account matching', () => {
  it('is not a duplicate when the amount matches but the last4 differs', () => {
    assert.equal(
      isDuplicatePendingExpense(
        candidate({ accountLast4: '1234' }),
        [pending({ accountLast4: '9876' })],
        [],
      ),
      false,
    );
  });

  it('is not a duplicate when the stored item has no last4', () => {
    assert.equal(
      isDuplicatePendingExpense(candidate(), [pending({ accountLast4: null })], []),
      false,
    );
  });

  it('is not a duplicate when the candidate has no last4', () => {
    assert.equal(
      isDuplicatePendingExpense(candidate({ accountLast4: null }), [pending()], []),
      false,
    );
  });
});

describe('isDuplicatePendingExpense — dismissed items never count', () => {
  it('ignores a rejected item that otherwise matches exactly', () => {
    assert.equal(
      isDuplicatePendingExpense(candidate(), [pending({ status: 'rejected' })], []),
      false,
    );
  });

  it('ignores an expired item that otherwise matches exactly', () => {
    assert.equal(
      isDuplicatePendingExpense(candidate(), [pending({ status: 'expired' })], []),
      false,
    );
  });

  it('still finds a live match sitting behind a rejected one', () => {
    assert.equal(
      isDuplicatePendingExpense(
        candidate({ occurredAt: at(2 * MIN) }),
        [pending({ status: 'rejected' }), pending({ status: 'pending' })],
        [],
      ),
      true,
    );
  });
});

describe('isDuplicatePendingExpense — the two-message swipe', () => {
  it('collapses a bank SMS and a card-network SMS 2 minutes apart', () => {
    // Same swipe: HDFC's own alert, then the VISA/RuPay network alert.
    const bankAlert = pending({
      amountMinor: 129_900,
      accountLast4: '4321',
      occurredAt: at(0),
      status: 'pending',
    });
    const networkAlert = candidate({
      amountMinor: 129_900,
      accountLast4: '4321',
      occurredAt: at(2 * MIN),
    });

    assert.equal(isDuplicatePendingExpense(networkAlert, [bankAlert], []), true);
  });
});

describe('isDuplicatePendingExpense — empty inputs', () => {
  it('is not a duplicate when there is nothing to compare against', () => {
    assert.equal(isDuplicatePendingExpense(candidate(), [], []), false);
  });
});
