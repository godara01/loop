import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CRASH_KEYS,
  DIGIT_MASK,
  MAX_VALUE_LENGTH,
  isCrashKey,
  maskDigits,
  messageFromError,
  scrubMessage,
  scrubValue,
} from './crash-keys';

describe('crash key allowlist', () => {
  it('allows exactly screen and errorCode', () => {
    assert.deepEqual([...CRASH_KEYS], ['screen', 'errorCode']);
  });

  it('accepts the two allowlisted keys', () => {
    assert.equal(isCrashKey('screen'), true);
    assert.equal(isCrashKey('errorCode'), true);
  });

  it('rejects keys that could carry user data', () => {
    for (const key of ['userId', 'uid', 'phone', 'phoneNumber', 'email', 'accountId', 'smsBody', 'description', 'amount']) {
      assert.equal(isCrashKey(key), false, `${key} must not be allowlisted`);
    }
  });

  it('rejects the empty string and near-misses', () => {
    for (const key of ['', ' screen', 'Screen', 'SCREEN', 'screens', 'errorcode']) {
      assert.equal(isCrashKey(key), false, `${JSON.stringify(key)} must not be allowlisted`);
    }
  });
});

describe('maskDigits', () => {
  it('masks a run of exactly 5 digits', () => {
    assert.equal(maskDigits('12345'), DIGIT_MASK);
  });

  it('keeps runs of 4 or fewer digits', () => {
    assert.equal(maskDigits('1'), '1');
    assert.equal(maskDigits('12'), '12');
    assert.equal(maskDigits('123'), '123');
    assert.equal(maskDigits('1234'), '1234');
  });

  it('keeps an HTTP status and a year readable', () => {
    assert.equal(maskDigits('request failed with 503'), 'request failed with 503');
    assert.equal(maskDigits('expired in 2026'), 'expired in 2026');
  });

  it('masks a 10-digit phone number', () => {
    assert.equal(maskDigits('sent to 9876543210'), `sent to ${DIGIT_MASK}`);
  });

  it('masks a 16-digit card number', () => {
    assert.equal(maskDigits('4111111111111111'), DIGIT_MASK);
  });

  it('masks a card number written in 4-digit groups only where runs are long', () => {
    // Space-separated groups of 4 stay, because no single run reaches 5.
    assert.equal(maskDigits('4111 1111 1111 1111'), '4111 1111 1111 1111');
    // Unseparated, it is one long run and gets masked.
    assert.equal(maskDigits('4111111111111111'), DIGIT_MASK);
  });

  it('masks an account number inside surrounding text', () => {
    assert.equal(maskDigits('debit from acct 000123456789 ok'), `debit from acct ${DIGIT_MASK} ok`);
  });

  it('masks every run, not just the first', () => {
    assert.equal(maskDigits('12345 then 67890 then 11111'), `${DIGIT_MASK} then ${DIGIT_MASK} then ${DIGIT_MASK}`);
  });

  it('masks an amount-with-reference without losing the short parts', () => {
    assert.equal(maskDigits('INR 250 ref 887766554433'), `INR 250 ref ${DIGIT_MASK}`);
  });

  it('masks a 6-digit OTP', () => {
    assert.equal(maskDigits('otp 483920'), `otp ${DIGIT_MASK}`);
  });

  it('leaves digit-free text untouched', () => {
    assert.equal(maskDigits('plain screen name'), 'plain screen name');
  });

  it('handles the empty string', () => {
    assert.equal(maskDigits(''), '');
  });
});

describe('scrubValue', () => {
  it('truncates to MAX_VALUE_LENGTH', () => {
    const long = 'a'.repeat(MAX_VALUE_LENGTH + 50);
    assert.equal(scrubValue(long).length, MAX_VALUE_LENGTH);
  });

  it('leaves a short value at its own length', () => {
    assert.equal(scrubValue('orbit'), 'orbit');
  });

  it('masks before truncating, so a long number cannot survive at the cut', () => {
    // The digit run straddles the truncation boundary. Masking first means the
    // boundary lands inside the mask, not inside the number: truncating first
    // would have left '9876' (4 digits) as unmasked residue.
    const padded = `${'x'.repeat(MAX_VALUE_LENGTH - 6)}9876543210`;
    const out = scrubValue(padded);
    assert.equal(/\d{5,}/.test(out), false);
    assert.equal(/\d/.test(out), false, `no digit should survive, got ${out}`);
    assert.equal(out, `${'x'.repeat(MAX_VALUE_LENGTH - 6)}${DIGIT_MASK}`);
  });

  it('masks a digit run that starts beyond the truncation point', () => {
    const out = scrubValue(`${'x'.repeat(MAX_VALUE_LENGTH)}9876543210`);
    assert.equal(/\d/.test(out), false);
    assert.equal(out, 'x'.repeat(MAX_VALUE_LENGTH));
  });

  it('never returns a 5+ digit run for numeric input of any length', () => {
    for (const len of [5, 8, 12, 20, 64, 200]) {
      const out = scrubValue('7'.repeat(len));
      assert.equal(/\d{5,}/.test(out), false, `leaked at length ${len}`);
    }
  });

  it('handles the empty string', () => {
    assert.equal(scrubValue(''), '');
  });
});

describe('scrubMessage', () => {
  it('applies the same digit rule as values', () => {
    assert.equal(scrubMessage('failed for 9876543210'), `failed for ${DIGIT_MASK}`);
    assert.equal(scrubMessage('failed with 404'), 'failed with 404');
  });

  it('truncates a long message', () => {
    assert.equal(scrubMessage('e'.repeat(MAX_VALUE_LENGTH + 10)).length, MAX_VALUE_LENGTH);
  });

  it('collapses newlines and tabs to single spaces', () => {
    assert.equal(scrubMessage('line one\n\tline two'), 'line one line two');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(scrubMessage('  padded  '), 'padded');
  });

  it('handles the empty string', () => {
    assert.equal(scrubMessage(''), '');
  });
});

describe('messageFromError', () => {
  it('scrubs an Error message', () => {
    assert.equal(messageFromError(new Error('token fetch failed for 9876543210')), `token fetch failed for ${DIGIT_MASK}`);
  });

  it('keeps a short code in an Error message', () => {
    assert.equal(messageFromError(new Error('app-check failed: 403')), 'app-check failed: 403');
  });

  it('scrubs a thrown string', () => {
    assert.equal(messageFromError('raw 123456789 failure'), `raw ${DIGIT_MASK} failure`);
  });

  it('handles thrown numbers and booleans', () => {
    assert.equal(messageFromError(42), '42');
    assert.equal(messageFromError(1234567), DIGIT_MASK);
    assert.equal(messageFromError(false), 'false');
  });

  it('handles null and undefined', () => {
    assert.equal(messageFromError(null), 'null');
    assert.equal(messageFromError(undefined), 'undefined');
  });

  it('does not stringify arbitrary objects, which could hold user data', () => {
    const out = messageFromError({ phone: '9876543210', body: 'secret sms text' });
    assert.equal(out, 'non-error thrown');
    assert.equal(out.includes('9876543210'), false);
    assert.equal(out.includes('secret'), false);
  });

  it('never returns a 5+ digit run for any of these shapes', () => {
    const inputs: unknown[] = [
      new Error('acct 000123456789'),
      'card 4111111111111111',
      98765432109876,
      { nested: { phone: '9876543210' } },
      ['9876543210'],
    ];
    for (const input of inputs) {
      assert.equal(/\d{5,}/.test(messageFromError(input)), false, `leaked for ${String(input)}`);
    }
  });
});
