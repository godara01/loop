import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyMessage } from './classify';

describe('classifyMessage (docs/17 § Credit SMS)', () => {
  it('a debit is an expense', () => {
    assert.deepEqual(classifyMessage('debit', 'Rs.450.00 spent on HDFC Bank Card x1234 at SWIGGY'), { kind: 'expense', incomeSlug: null });
  });
  it('a card bill payment is a transfer', () => {
    assert.equal(classifyMessage('credit', 'Payment of Rs 12,000 received towards your credit card xx1234').kind, 'transfer');
  });
  it('refunds, reversals and failed-transaction credits are refunds', () => {
    for (const body of [
      'Refund of Rs 1,299 from CODECADEMY has been credited back to your ICICI Bank Acct XX567.',
      'Amount Rs 2,500 credited as reversal',
      'Amount Rs 2,000 credited due to failed transaction',
    ]) assert.equal(classifyMessage('credit', body).kind, 'refund', body);
  });
  it('cashback and salary pick their income category; other credits are Other income', () => {
    assert.deepEqual(classifyMessage('credit', 'Rs 500.00 credited to account XX1234 towards cashback'), { kind: 'income', incomeSlug: 'CASHBACK' });
    assert.deepEqual(classifyMessage('credit', 'Acct XX987 credited with INR 50,000.00 on 11-09-26 from SALARY CREDIT'), { kind: 'income', incomeSlug: 'SALARY' });
    assert.deepEqual(classifyMessage('credit', 'Rs 25,000.00 credited to your A/c XX1234 on 01-09-26 by NEFT from ACME PVT LTD. -HDFC Bank'), { kind: 'income', incomeSlug: 'OTHER_IN' });
  });
  it('"sal" matches only as a word', () => {
    assert.equal(classifyMessage('credit', 'NEFT from SAL ARIES TECH').incomeSlug, 'SALARY');
    assert.equal(classifyMessage('credit', 'NEFT from SALSA DANCE CO').incomeSlug, 'OTHER_IN');
  });
});
