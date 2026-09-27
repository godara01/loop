import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bankLabel, buildDisplayHint } from '../sms/display-hint';

describe('buildDisplayHint — the four null combinations', () => {
  it('merchant and account both present', () => {
    assert.equal(
      buildDisplayHint({ merchant: 'SWIGGY', accountLast4: '1234' }, 'HDFCBK'),
      'HDFC ••1234 · SWIGGY',
    );
  });

  it('account present, merchant null — drops the merchant tail', () => {
    assert.equal(
      buildDisplayHint({ merchant: null, accountLast4: '1234' }, 'HDFCBK'),
      'HDFC ••1234',
    );
  });

  it('merchant present, account null — drops the masked digits', () => {
    assert.equal(
      buildDisplayHint({ merchant: 'SWIGGY', accountLast4: null }, 'HDFCBK'),
      'HDFC · SWIGGY',
    );
  });

  it('both null — the bank label alone', () => {
    assert.equal(buildDisplayHint({ merchant: null, accountLast4: null }, 'HDFCBK'), 'HDFC');
  });
});

describe('buildDisplayHint — bank labels', () => {
  const known: ReadonlyArray<[entity: string, label: string]> = [
    ['HDFCBK', 'HDFC'],
    ['ICICIB', 'ICICI'],
    ['SBIINB', 'SBI'],
    ['AXISBK', 'Axis'],
    ['KOTAKB', 'Kotak'],
  ];

  for (const [entity, label] of known) {
    it(`maps ${entity} to ${label}`, () => {
      assert.equal(bankLabel(entity), label);
      assert.equal(
        buildDisplayHint({ merchant: 'SWIGGY', accountLast4: '1234' }, entity),
        `${label} ••1234 · SWIGGY`,
      );
    });
  }

  it('falls back to the entity itself for an unknown bank', () => {
    assert.equal(bankLabel('YESBNK'), 'YESBNK');
    assert.equal(
      buildDisplayHint({ merchant: 'AMAZON', accountLast4: '9876' }, 'YESBNK'),
      'YESBNK ••9876 · AMAZON',
    );
  });

  it('falls back to the entity alone when merchant and account are both null', () => {
    assert.equal(buildDisplayHint({ merchant: null, accountLast4: null }, 'YESBNK'), 'YESBNK');
  });
});

describe('buildDisplayHint — never more than 4 account digits', () => {
  it('takes the last 4 of a full account number', () => {
    const hint = buildDisplayHint(
      { merchant: 'SWIGGY', accountLast4: '123456789012' },
      'HDFCBK',
    );
    assert.equal(hint, 'HDFC ••9012 · SWIGGY');
    assert.ok(!/\d{5,}/.test(hint), `run of 5+ digits leaked: ${hint}`);
    const digitsAfterMask = /••(\d+)/.exec(hint)?.[1] ?? '';
    assert.ok(digitsAfterMask.length <= 4, `${digitsAfterMask.length} digits after the mask`);
  });

  it('holds for a 16-digit card number', () => {
    const hint = buildDisplayHint(
      { merchant: 'UBER', accountLast4: '4111111111111111' },
      'ICICIB',
    );
    assert.equal(hint, 'ICICI ••1111 · UBER');
    assert.ok(!/\d{5,}/.test(hint), `run of 5+ digits leaked: ${hint}`);
    assert.equal((/••(\d+)/.exec(hint)?.[1] ?? '').length, 4);
  });

  it('holds with no merchant to hide behind', () => {
    const hint = buildDisplayHint({ merchant: null, accountLast4: '987654321' }, 'SBIINB');
    assert.equal(hint, 'SBI ••4321');
    assert.ok(!/\d{5,}/.test(hint), `run of 5+ digits leaked: ${hint}`);
    assert.equal((/••(\d+)/.exec(hint)?.[1] ?? '').length, 4);
  });

  it('strips non-digits before taking the last 4', () => {
    const hint = buildDisplayHint(
      { merchant: 'SWIGGY', accountLast4: 'XXXX-5678' },
      'HDFCBK',
    );
    assert.equal(hint, 'HDFC ••5678 · SWIGGY');
    assert.ok(!/\d{5,}/.test(hint), `run of 5+ digits leaked: ${hint}`);
  });

  it('shows exactly what it was given when that is already 4 digits', () => {
    assert.equal(
      buildDisplayHint({ merchant: null, accountLast4: '1234' }, 'AXISBK'),
      'Axis ••1234',
    );
  });

  it('shows fewer than 4 digits rather than padding', () => {
    const hint = buildDisplayHint({ merchant: null, accountLast4: '78' }, 'KOTAKB');
    assert.equal(hint, 'Kotak ••78');
    assert.ok((/••(\d+)/.exec(hint)?.[1] ?? '').length <= 4);
  });

  it('treats an account with no digits at all as absent', () => {
    assert.equal(
      buildDisplayHint({ merchant: 'SWIGGY', accountLast4: 'XXXX' }, 'HDFCBK'),
      'HDFC · SWIGGY',
    );
  });
});

describe('buildDisplayHint — signature and inputs', () => {
  it('takes exactly two parameters, so no raw body can be passed', () => {
    assert.equal(buildDisplayHint.length, 2);
  });

  it('accepts a lowercase entity', () => {
    assert.equal(
      buildDisplayHint({ merchant: 'SWIGGY', accountLast4: '1234' }, 'hdfcbk'),
      'HDFC ••1234 · SWIGGY',
    );
  });

  it('treats a blank merchant as absent', () => {
    assert.equal(
      buildDisplayHint({ merchant: '   ', accountLast4: '1234' }, 'HDFCBK'),
      'HDFC ••1234',
    );
  });

  it('keeps a merchant name with spaces intact', () => {
    assert.equal(
      buildDisplayHint({ merchant: 'BIG BAZAAR', accountLast4: '1234' }, 'HDFCBK'),
      'HDFC ••1234 · BIG BAZAAR',
    );
  });
});
