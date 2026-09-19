/**
 * L1 SMS parser tests against real Indian bank message corpus.
 * See docs/12-sms-ingest.md#tests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTransactionSms } from './templates';

describe('SMS Parser — Transaction Detection', () => {
  it('parses HDFC Bank debit with account last4', () => {
    const sms = 'Dear Customer, your account xxxx1234 has been debited for Rs. 500/- at Swiggy on 19-Sep-2026 12:30.';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
    assert.ok(result);
    assert.equal(result.amountMinor, 50000);
    assert.equal(result.direction, 'debit');
    assert.equal(result.accountLast4, '1234');
    assert.equal(result.templateId, 'hdfc_debit');
  });

  it('parses ICICI Bank debit', () => {
    const sms = 'Your account 5678 has been debited with Rs 1,50,000 on 19-Sep-2026 14:15.';
    const result = parseTransactionSms(sms, 'VM-ICICIB', new Date().toISOString());
    assert.ok(result);
    assert.equal(result.amountMinor, 15000000); // 1,50,000 rupees
    assert.equal(result.accountLast4, '5678');
  });

  it('parses SBI Bank debit with lakh grouping', () => {
    const sms = 'Amount Rs.2,00,000/- debited from your account xxxx9876 for online transfer.';
    const result = parseTransactionSms(sms, 'JD-SBIINB', new Date().toISOString());
    assert.ok(result);
    assert.equal(result.amountMinor, 20000000); // 2,00,000 rupees
    assert.equal(result.accountLast4, '9876');
  });

  it('rejects OTP messages', () => {
    const sms = 'Your OTP is 123456. Do not share this with anyone.';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
    assert.equal(result, null);
  });

  it('rejects promotional messages', () => {
    const sms = 'Limited offer! Get 50% cashback on your next transaction. Apply now!';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
    assert.equal(result, null);
  });

  it('rejects declined transaction messages', () => {
    const sms = 'Your transaction for Rs 500 has been declined. Please try again.';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
    assert.equal(result, null);
  });

  it('rejects reversal messages', () => {
    const sms = 'Rs 500 has been reversed to your account xxxx1234.';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
    assert.equal(result, null);
  });

  it('handles decimal amounts', () => {
    const sms = 'Dear Customer, your account xxxx1111 has been debited for Rs. 250.50 at Coffee Shop.';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
    assert.ok(result);
    assert.equal(result.amountMinor, 25050);
  });

  it('respects confidence threshold', () => {
    const sms = 'Your account xxxx1234 has something about Rs 100.';
    const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString(), 0.95);
    // Low confidence, rejected by high threshold
    assert.equal(result, null);
  });

  it('handles multiple message formats from same bank', () => {
    const formats = [
      'Dear Customer, your account xxxx1234 has been debited for Rs. 500/-',
      'Amount Rs.500/- debited from your account xxxx1234',
      'Rs 500 has been debited from your account xxxx1234',
    ];

    for (const sms of formats) {
      const result = parseTransactionSms(sms, 'AD-HDFCBK', new Date().toISOString());
      assert.ok(result, `Should parse: ${sms}`);
      assert.equal(result.amountMinor, 50000);
    }
  });
});
