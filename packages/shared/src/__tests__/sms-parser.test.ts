import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_PARSE_CONFIDENCE, parseTransactionSms } from '../sms/parser';
import { compileRegistry } from '../sms/templates';
import type { ParsedTransaction } from '../sms/types';

const RECEIVED = '2026-09-12T14:45:00.000Z';
const HDFC_DEBIT = 'Dear Customer, your account xxxx1234 has been debited for Rs. 1,250.75 at Swiggy on 12-Sep-2026.';

/** Every result, in every test, must carry an integer amount. */
function parse(...args: Parameters<typeof parseTransactionSms>): ParsedTransaction | null {
  const result = parseTransactionSms(...args);
  if (result) assert.ok(Number.isInteger(result.amountMinor), `amountMinor ${result.amountMinor} is not an integer`);
  return result;
}

const fixtureRegistry = (confidence: number) =>
  compileRegistry({
    version: 1,
    templates: [
      {
        id: 'fixture_debit',
        entity: 'TESTBK',
        pattern: 'Rs\\.?\\s*(?<amount>[0-9,]+(?:\\.\\d{1,2})?) debited from a/c (?<last4>\\d{4}) at (?<merchant>[A-Z ]+)\\.',
        flags: 'i',
        fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
        confidence,
      },
    ],
  });
const FIXTURE_BODY = 'Rs.99.50 debited from a/c 4321 at BLUE TOKAI.';

describe('parseTransactionSms', () => {
  it('parses an allowlisted debit into integer minor units', () => {
    const result = parse(HDFC_DEBIT, 'AD-HDFCBK', RECEIVED);
    assert.ok(result);
    assert.equal(result.amountMinor, 125075);
    assert.equal(result.currency, 'INR');
    assert.equal(result.direction, 'debit');
    assert.equal(result.accountLast4, '1234');
  });

  it('returns null for a non-allowlisted sender, even with a perfect body', () => {
    for (const sender of ['AD-AMAZON', '+919876543210', 'HDFCBK', '']) {
      assert.equal(parse(HDFC_DEBIT, sender, RECEIVED), null, sender);
    }
  });

  it('returns null for an OTP from an allowlisted bank', () => {
    const otp = '482913 is your OTP for a transaction of Rs 1,250.75 at SWIGGY on account xxxx1234 to be debited. Do not share.';
    assert.equal(parse(otp, 'AD-HDFCBK', RECEIVED), null);
  });

  it('returns null for declined and reversed payments that still say "debited"', () => {
    assert.equal(parse('Rs 500 to be debited from your account xxxx1234 was declined.', 'AD-HDFCBK', RECEIVED), null);
    assert.equal(parse('Rs 500 debited from your account xxxx1234 has been reversed.', 'AD-HDFCBK', RECEIVED), null);
  });

  it('returns null for a credit', () => {
    const credit = 'Rs 25,000.00 credited to your account xxxx1234 on 01-09-26 by NEFT. -HDFC Bank';
    assert.equal(parse(credit, 'AD-HDFCBK', RECEIVED), null);
  });

  it('rejects confidence 0.59 and accepts exactly 0.6', () => {
    assert.equal(MIN_PARSE_CONFIDENCE, 0.6);
    const opts = { extraEntities: ['TESTBK'] };
    assert.equal(parse(FIXTURE_BODY, 'AD-TESTBK', RECEIVED, { ...opts, registry: fixtureRegistry(0.59) }), null);
    const result = parse(FIXTURE_BODY, 'AD-TESTBK', RECEIVED, { ...opts, registry: fixtureRegistry(0.6) });
    assert.ok(result);
    assert.equal(result.confidence, 0.6);
    assert.equal(result.amountMinor, 9950);
    assert.equal(result.merchant, 'BLUE TOKAI');
  });

  it('needs the entity allowlisted even when a registry template names it', () => {
    assert.equal(parse(FIXTURE_BODY, 'AD-TESTBK', RECEIVED, { registry: fixtureRegistry(0.9) }), null);
  });

  it("only tries the sender's own bank's templates", () => {
    // An SBI-shaped body sent by ICICI matches no ICICI template.
    assert.equal(parse('Amount Rs.500 debited from your account xxxx9876 for transfer.', 'AD-ICICIB', RECEIVED), null);
  });

  it('defaults occurredAt to receivedAt when the message has no timestamp', () => {
    assert.equal(parse(HDFC_DEBIT, 'VM-HDFCBK', RECEIVED)?.occurredAt, RECEIVED);
  });

  it('refuses a template confidence outside 0–1 at compile time', () => {
    assert.throws(() => fixtureRegistry(1.2), /confidence/);
  });
});
