import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('returns null for empty or invalid inputs', () => {
    assert.strictEqual(normalizePhone(''), null);
    assert.strictEqual(normalizePhone('   '), null);
    assert.strictEqual(normalizePhone(null as any), null);
    assert.strictEqual(normalizePhone(undefined as any), null);
  });

  it('normalizes valid Indian numbers without country code', () => {
    assert.strictEqual(normalizePhone('9876543210'), '+919876543210');
    assert.strictEqual(normalizePhone(' 9876543210 '), '+919876543210');
    assert.strictEqual(normalizePhone('9876-543-210'), '+919876543210');
    assert.strictEqual(normalizePhone('(987) 654-3210'), '+919876543210');
  });

  it('normalizes valid Indian numbers with country code', () => {
    assert.strictEqual(normalizePhone('919876543210'), '+919876543210');
    assert.strictEqual(normalizePhone('+919876543210'), '+919876543210');
    assert.strictEqual(normalizePhone('+91 98765 43210'), '+919876543210');
  });

  it('handles numbers with default country IN explicitly', () => {
    assert.strictEqual(normalizePhone('9876543210', 'IN'), '+919876543210');
    assert.strictEqual(normalizePhone('+919876543210', 'IN'), '+919876543210');
  });

  it('returns null for unsupported default countries', () => {
    assert.strictEqual(normalizePhone('9876543210', 'US'), null);
    assert.strictEqual(normalizePhone('9876543210', 'GB'), null);
  });

  it('validates length constraints', () => {
    // Too short
    assert.strictEqual(normalizePhone('123'), null);
    assert.strictEqual(normalizePhone('91123'), null);
    
    // Too long
    assert.strictEqual(normalizePhone('91987654321012345'), null); // 16 digits
    assert.strictEqual(normalizePhone('987654321012345'), null); // 15 digits with default IN = 17 total
    
  // Valid lengths
  assert.strictEqual(normalizePhone('91' + '1'.repeat(10)), '+91' + '1'.repeat(10)); // 12 digits
  assert.strictEqual(normalizePhone('1'.repeat(15)), null); // 15 digits with default IN = 17 total (too long)
});

  it('preserves existing plus signs correctly', () => {
    assert.strictEqual(normalizePhone('+919876543210'), '+919876543210');
    assert.strictEqual(normalizePhone('+1234567890'), '+1234567890');
    assert.strictEqual(normalizePhone('+999123456789012'), '+999123456789012'); // Max length
  });

  it('rejects invalid characters when plus is present', () => {
    assert.strictEqual(normalizePhone('+91-98765-43210'), '+919876543210');
    assert.strictEqual(normalizePhone('+91 98765 43210'), '+919876543210');
  });

  // D10 bug: the field starts as "+91", so typing a full "+91…" number gave
  // "+91+919999900001", which normalised to "+91919999900001" (a 14-digit number).
  it('collapses a country code typed after the prefilled +91', () => {
    assert.strictEqual(normalizePhone('+91+919999900001'), '+919999900001');
    assert.strictEqual(normalizePhone('+91 +91 99999 00001'), '+919999900001');
    assert.strictEqual(normalizePhone('+91919999900001'), '+919999900001');
    assert.strictEqual(normalizePhone('91919999900001'), '+919999900001');
    assert.strictEqual(normalizePhone('+9109999900001'), null);
  });

  it('keeps a real number whose national part starts with 91', () => {
    assert.strictEqual(normalizePhone('9123456789'), '+919123456789');
    assert.strictEqual(normalizePhone('+919123456789'), '+919123456789');
  });

  it('refuses a second plus anywhere but right after the prefix', () => {
    assert.strictEqual(normalizePhone('+9198765+43210'), null);
  });
});
