import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { money } from '@loop/shared';

import {
  type AmountInput,
  type AmountKey,
  EMPTY_AMOUNT,
  MAX_WHOLE_DIGITS,
  amountOf,
  canSave,
  displayAmount,
  inputFromMoney,
  pressKey,
} from './amount-input';

const type = (keys: string, currency: 'INR' | 'JPY' = 'INR'): { input: AmountInput; refused: number } => {
  let input = EMPTY_AMOUNT;
  let refused = 0;
  for (const key of keys) {
    const result = pressKey(input, (key === '<' ? 'backspace' : key) as AmountKey, currency);
    input = result.input;
    if (!result.accepted) refused += 1;
  }
  return { input, refused };
};

describe('amount pad', () => {
  it('accumulates digits and converts to exact minor units', () => {
    const { input } = type('120.5');
    assert.equal(input.text, '120.5');
    assert.deepEqual(amountOf(input, 'INR'), money(12050, 'INR'));
  });

  it('refuses a second decimal point', () => {
    const { input, refused } = type('1.2.');
    assert.equal(input.text, '1.2');
    assert.equal(refused, 1);
  });

  it('refuses more fraction digits than the currency has', () => {
    const { input, refused } = type('9.999');
    assert.equal(input.text, '9.99');
    assert.equal(refused, 1);
  });

  it('has no decimal point at all for a zero-decimal currency', () => {
    const { input, refused } = type('500.', 'JPY');
    assert.equal(input.text, '500');
    assert.equal(refused, 1);
    assert.deepEqual(amountOf(input, 'JPY'), money(500, 'JPY'));
  });

  it('starts a leading decimal at zero and never keeps leading zeros', () => {
    assert.equal(type('.5').input.text, '0.5');
    assert.equal(type('05').input.text, '5');
    assert.equal(type('00').refused, 1);
  });

  it('caps the whole part', () => {
    const { input, refused } = type('1'.repeat(MAX_WHOLE_DIGITS + 2));
    assert.equal(input.text.length, MAX_WHOLE_DIGITS);
    assert.equal(refused, 2);
  });

  it('backspaces, and reports a backspace on an empty pad as refused', () => {
    assert.equal(type('12<').input.text, '1');
    assert.equal(pressKey(EMPTY_AMOUNT, 'backspace', 'INR').accepted, false);
  });

  it('cannot save nothing, and cannot save zero', () => {
    assert.equal(canSave(EMPTY_AMOUNT, 'INR'), false);
    assert.equal(canSave(type('0').input, 'INR'), false);
    assert.equal(canSave(type('0.0').input, 'INR'), false);
    assert.equal(canSave(type('0.01').input, 'INR'), true);
  });

  it('displays Indian grouping without disturbing the typed fraction', () => {
    assert.equal(displayAmount(type('120000.5').input, 'INR'), '₹1,20,000.5');
    assert.equal(displayAmount(EMPTY_AMOUNT, 'INR'), '₹0');
  });

  it('pre-fills an edit with visible cents that parse back to the same money', () => {
    for (const minor of [1, 99, 12050, 100000]) {
      const input = inputFromMoney(money(minor, 'INR'));
      assert.deepEqual(amountOf(input, 'INR'), money(minor, 'INR'));
    }
    assert.equal(inputFromMoney(money(12050, 'INR')).text, '120.50');
    assert.equal(inputFromMoney(money(5, 'INR')).text, '0.05');
    assert.equal(inputFromMoney(money(500, 'JPY')).text, '500');
  });
});
