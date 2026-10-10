import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskPhone } from './mask';

describe('maskEmail', () => {
  it('masks standard email addresses', () => {
    assert.strictEqual(maskEmail('test@gmail.com'), 't•••••t@gmail.com');
    assert.strictEqual(maskEmail('john.doe@example.com'), 'j•••••e@example.com');
    assert.strictEqual(maskEmail('a@b.co'), 'a•••••a@b.co');
  });

  it('handles very short local parts', () => {
    assert.strictEqual(maskEmail('ab@gmail.com'), 'a•••••b@gmail.com');
    assert.strictEqual(maskEmail('a@gmail.com'), 'a•••••a@gmail.com');
  });

  it('returns invalid emails as-is', () => {
    assert.strictEqual(maskEmail('invalid'), 'invalid');
    assert.strictEqual(maskEmail('@domain.com'), '@domain.com');
    assert.strictEqual(maskEmail('user@'), 'user@');
    assert.strictEqual(maskEmail(''), '');
  });
});

describe('maskPhone', () => {
  it('masks Indian phone numbers with country code', () => {
    assert.strictEqual(maskPhone('+919876543210'), '+91 ••••• 3210');
    assert.strictEqual(maskPhone('919876543210'), '+91 ••••• 3210');
    assert.strictEqual(maskPhone('9876543210'), '••••• 3210');
  });

  it('masks phone numbers with various formats', () => {
    assert.strictEqual(maskPhone('(987) 654-3210'), '••••• 3210');
    assert.strictEqual(maskPhone('987-654-3210'), '••••• 3210');
    assert.strictEqual(maskPhone('9876543210'), '••••• 3210');
  });

  it('handles international numbers', () => {
    assert.strictEqual(maskPhone('+123456789012345'), '+123 ••••• 9012345');
    assert.strictEqual(maskPhone('00123456789012345'), '+123 ••••• 9012345');
  });

  it('returns empty/invalid inputs as-is', () => {
    assert.strictEqual(maskPhone(''), '');
    assert.strictEqual(maskPhone('abc'), 'abc');
    assert.strictEqual(maskPhone('!@#'), '!@#');
  });
});