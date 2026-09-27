import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUNDLED_REGISTRY,
  compileRegistry,
  mergeRegistry,
} from '../sms/templates';
import { parseTransactionSms } from '../sms/parser';

const receivedAt = new Date().toISOString();

describe('SMS template registry', () => {
  it('rejects an invalid pattern', () => {
    assert.throws(
      () => compileRegistry({ version: 1, templates: [{ id: 'bad', entity: 'BANK', pattern: '(', flags: '', fields: { amount: 'amount' } }] }),
      /invalid pattern/,
    );
  });

  it('rejects a spec without an amount group', () => {
    assert.throws(
      () => compileRegistry({ version: 1, templates: [{ id: 'bad', entity: 'BANK', pattern: '(?<value>\\d+)', flags: '', fields: { amount: 'amount' } }] }),
      /missing named group "amount"/,
    );
  });

  it('merges overrides by id and adds new ids', () => {
    const merged = mergeRegistry(
      { version: 1, templates: [{ id: 'one', entity: 'BANK', pattern: '(?<amount>\\d+)', flags: '', fields: { amount: 'amount' } }] },
      {
        version: 2,
        templates: [
          { id: 'one', entity: 'BANK2', pattern: '(?<amount>\\d+)', flags: '', fields: { amount: 'amount' } },
          { id: 'two', entity: 'BANK2', pattern: '(?<amount>\\d+)', flags: '', fields: { amount: 'amount' } },
        ],
      },
    );
    assert.equal(merged.version, 2);
    assert.deepEqual(merged.templates.map((template) => template.id), ['one', 'two']);
    assert.equal(merged.templates[0]?.entity, 'BANK2');
  });

  it('keeps the higher bundled version when override is older', () => {
    const bundled = { version: 3, templates: [] };
    assert.deepEqual(mergeRegistry(bundled, { version: 2, templates: [] }), bundled);
  });

  it('extracts rupee amounts as minor units', () => {
    assert.equal(parseTransactionSms('Amount Rs.1,00,000.00 debited from your account xxxx9876.', 'JD-SBIINB', receivedAt)?.amountMinor, 10000000);
    assert.equal(parseTransactionSms('Your account 5678 has been debited with INR 1,234.5.', 'VM-ICICIB', receivedAt)?.amountMinor, 123450);
    assert.equal(parseTransactionSms('Your account 5678 has been debited with ₹ 99.', 'VM-ICICIB', receivedAt)?.amountMinor, 9900);
  });

  it('compiles the JSON round trip with the same template ids', () => {
    const roundTripped = compileRegistry(JSON.parse(JSON.stringify(BUNDLED_REGISTRY)));
    assert.deepEqual(roundTripped.templates.map((template) => template.id), BUNDLED_REGISTRY.templates.map((template) => template.id));
  });
});
