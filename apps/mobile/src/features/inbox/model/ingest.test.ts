import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePendingExpense, pendingExpenseToDoc } from '@loop/shared';

import { type IngestContext, type RawMessage, ingestMessage } from './ingest';

const RECEIVED = '2026-09-12T14:45:00.000Z';
const DEBIT_BODY =
  'Rs.450.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-12:20:15:11.Avl bal: Rs.84,550.00. Not you? Call 18002586161';
const debit: RawMessage = { body: DEBIT_BODY, sender: 'AD-HDFCBK', receivedAt: RECEIVED };

const ctx = (overrides: Partial<IngestContext> = {}): IngestContext => ({
  enabled: true,
  source: 'sms',
  existingPending: [],
  existingManual: [],
  ...overrides,
});

describe('ingestMessage', () => {
  it('returns null when auto-capture is disabled', () => {
    assert.equal(ingestMessage(debit, ctx({ enabled: false })), null);
  });

  it('returns null for an OTP', () => {
    const otp = { ...debit, body: '482913 is your OTP for a transaction of Rs 450.00 at SWIGGY on HDFC Bank Card x1234. Do not share.' };
    assert.equal(ingestMessage(otp, ctx()), null);
    assert.equal(ingestMessage({ ...otp, sender: null }, ctx({ source: 'pasted' })), null);
  });

  it('returns null for a non-bank sender', () => {
    assert.equal(ingestMessage({ ...debit, sender: 'AD-AMAZON' }, ctx()), null);
  });

  it('returns null for a duplicate of a pending item or a hand-typed expense', () => {
    const pendingTwin = { amountMinor: 45_000, accountLast4: '1234', occurredAt: RECEIVED, status: 'pending' as const };
    assert.equal(ingestMessage(debit, ctx({ existingPending: [pendingTwin] })), null);
    const typed = { amountMinor: 45_000, occurredAt: '2026-09-12T14:30:00.000Z', source: 'manual' as const };
    assert.equal(ingestMessage(debit, ctx({ existingManual: [typed] })), null);
  });

  it('turns a valid debit into a draft with no body anywhere in it', () => {
    const draft = ingestMessage(debit, ctx({ now: '2026-09-12T14:45:01.000Z' }));
    assert.ok(draft);
    assert.equal(draft.status, 'pending');
    assert.equal(draft.amountMinor, 45_000);
    assert.equal(draft.merchant, 'SWIGGY');
    assert.equal(draft.accountLast4, '1234');
    assert.equal(draft.displayHint, 'HDFC ••1234 · SWIGGY');
    assert.equal(draft.source, 'sms');
    assert.equal(draft.expenseId, null);
    assert.equal(draft.createdAt, '2026-09-12T14:45:01.000Z');

    assert.ok(!Object.keys(draft).includes('body'));
    const json = JSON.stringify(draft);
    assert.ok(!json.includes(DEBIT_BODY));
    for (let i = 0; i + 12 <= DEBIT_BODY.length; i += 1) {
      const window = DEBIT_BODY.slice(i, i + 12);
      if (window.includes('SWIGGY')) continue; // the merchant is the one field lifted on purpose
      assert.ok(!json.includes(window), `draft contains body text "${window}"`);
    }
  });

  it('produces exactly what the P1 converter and P2 rules accept', () => {
    const draft = ingestMessage(debit, ctx())!;
    const pending = { id: 'p1', ...draft };
    assert.deepEqual(parsePendingExpense('u', 'p1', pendingExpenseToDoc(pending)), pending);
  });

  it('parses pasted text with no sender through the pasted sender path', () => {
    const draft = ingestMessage({ ...debit, sender: null }, ctx({ source: 'pasted' }));
    assert.ok(draft);
    assert.equal(draft.source, 'pasted');
    assert.equal(draft.amountMinor, 45_000);
    assert.equal(draft.displayHint, 'HDFC ••1234 · SWIGGY');

    const upi = 'Dear UPI user A/C X4321 debited by 200.0 on date 12Sep26 trf to SWIGGY Refno 625812345678. -SBI';
    assert.equal(ingestMessage({ body: upi, sender: null, receivedAt: RECEIVED }, ctx({ source: 'pasted' }))?.displayHint, 'SBI ••4321 · SWIGGY');
  });

  it('returns null for pasted text that no bank template understands', () => {
    assert.equal(ingestMessage({ body: 'lunch was 450 bucks', sender: null, receivedAt: RECEIVED }, ctx({ source: 'pasted' })), null);
  });
});
