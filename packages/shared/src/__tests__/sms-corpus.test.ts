import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { senderEntity } from '../sms/sender';
import { parseTransactionSms } from '../sms/parser';
import type { ParsedTransaction } from '../sms/types';
import { SMS_CORPUS } from './fixtures/sms-corpus';

const RECEIVED = '2026-09-12T14:45:00.000Z';
const PARSED_KEYS: readonly (keyof ParsedTransaction)[] = [
  'accountLast4',
  'amountMinor',
  'confidence',
  'currency',
  'direction',
  'merchant',
  'occurredAt',
  'templateId',
];

describe('SMS corpus', () => {
  it('has at least 40 entries covering at least 4 banks', () => {
    assert.ok(SMS_CORPUS.length >= 40, `corpus has ${SMS_CORPUS.length}`);
    const banks = new Set(SMS_CORPUS.filter((e) => e.expect).map((e) => senderEntity(e.sender)));
    assert.ok(banks.size >= 4, `debits from ${[...banks].join(', ')}`);
  });

  SMS_CORPUS.forEach((entry, index) => {
    it(`#${index} ${entry.sender}: ${entry.expect === null ? 'dropped' : 'parsed'}`, () => {
      const result = parseTransactionSms(entry.body, entry.sender, RECEIVED);
      if (entry.expect === null) return assert.equal(result, null);
      assert.ok(result, 'expected a result');
      assert.ok(Number.isInteger(result.amountMinor));
      assert.equal(result.direction, 'debit');
      for (const [key, value] of Object.entries(entry.expect)) {
        assert.deepEqual(result[key as keyof ParsedTransaction], value, key);
      }
    });
  });
});

describe('SMS privacy', () => {
  it('returns exactly the ParsedTransaction keys and nothing lifted from the body but the merchant', () => {
    for (const entry of SMS_CORPUS) {
      const result = parseTransactionSms(entry.body, entry.sender, RECEIVED);
      if (!result) continue;
      assert.deepEqual(Object.keys(result).sort(), [...PARSED_KEYS].sort(), entry.body);

      for (const [key, value] of Object.entries(result)) {
        if (key === 'merchant' || typeof value !== 'string') continue;
        for (let i = 0; i + 12 <= entry.body.length; i += 1) {
          const window = entry.body.slice(i, i + 12);
          assert.ok(!value.includes(window), `${key} contains body text "${window}"`);
        }
      }
    }
  });
});
