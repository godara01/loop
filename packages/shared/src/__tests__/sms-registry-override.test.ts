import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseTransactionSms } from '../sms/parser';
import { parseTemplateOverride } from '../sms/registry-override';
import { BUNDLED_REGISTRY, COMPILED_BUNDLED_REGISTRY } from '../sms/templates';

const newBankTemplate = {
  id: 'newbnk_debit',
  entity: 'NEWBNK',
  pattern: 'Rs\\.?\\s*(?<amount>[0-9,]+(?:\\.\\d{1,2})?) debited from a/c (?<last4>\\d{4}) at (?<merchant>[A-Z ]+)\\.',
  flags: 'i',
  fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
  confidence: 0.9,
};

describe('parseTemplateOverride', () => {
  it('missing key (empty string) -> the bundled registry', () => {
    assert.equal(parseTemplateOverride(''), COMPILED_BUNDLED_REGISTRY);
    assert.equal(parseTemplateOverride('   '), COMPILED_BUNDLED_REGISTRY);
  });

  it('invalid JSON -> null', () => {
    for (const json of ['{', 'not json', '{"version": 3, "templates": [}']) {
      assert.equal(parseTemplateOverride(json), null, json);
    }
  });

  it('wrong shape -> null', () => {
    for (const value of [
      null,
      [],
      { version: '3', templates: [] },
      { version: 3 },
      { version: 3, templates: [{ id: 'x' }] },
      { version: 3, templates: [{ ...newBankTemplate, fields: {} }] },
    ]) {
      assert.equal(parseTemplateOverride(JSON.stringify(value)), null, JSON.stringify(value));
    }
  });

  it('a regex that does not compile, or lacks its amount group -> null', () => {
    const bad = [{ ...newBankTemplate, pattern: '(' }, { ...newBankTemplate, pattern: '(?<value>\\d+)' }];
    for (const template of bad) {
      assert.equal(parseTemplateOverride(JSON.stringify({ version: 3, templates: [template] })), null);
    }
  });

  it('a valid override -> compiled registry with the new template alongside the bundled ones', () => {
    const registry = parseTemplateOverride(JSON.stringify({ version: 3, templates: [newBankTemplate] }));
    assert.ok(registry);
    assert.equal(registry.version, 3);
    assert.ok(registry.templates.some((t) => t.id === 'newbnk_debit' && t.pattern instanceof RegExp));
    assert.equal(registry.templates.length, BUNDLED_REGISTRY.templates.length + 1);

    const parsed = parseTransactionSms('Rs.99.50 debited from a/c 4321 at BLUE TOKAI.', 'AD-NEWBNK', '2026-09-12T10:00:00.000Z', {
      registry,
      extraEntities: ['NEWBNK'],
    });
    assert.equal(parsed?.amountMinor, 9950);
  });

  it('an older override leaves the newer bundle in charge', () => {
    const registry = parseTemplateOverride(JSON.stringify({ version: 1, templates: [newBankTemplate] }));
    assert.ok(registry);
    assert.equal(registry.version, BUNDLED_REGISTRY.version);
    assert.ok(!registry.templates.some((t) => t.id === 'newbnk_debit'));
  });
});
