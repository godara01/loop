/**
 * Unit tests for account.model.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isLinked,
  getMaskedEmail,
  getMaskedPhone,
  getOtpResendCountdown,
  canResendOtp,
  OTP_RESEND_COOLDOWN,
  confirmSwitch,
} from './account.model';

describe('account.model', () => {
  describe('isLinked', () => {
    it('returns false for empty providerData', () => {
      assert.strictEqual(isLinked([]), false);
    });

    it('returns true for non-empty providerData', () => {
      assert.strictEqual(isLinked(['google.com']), true);
      assert.strictEqual(isLinked(['password']), true);
      assert.strictEqual(isLinked(['google.com', 'password']), true);
    });
  });

  describe('getMaskedEmail', () => {
    it('returns empty string for empty input', () => {
      assert.strictEqual(getMaskedEmail(''), '');
      assert.strictEqual(getMaskedEmail(null as any), '');
      assert.strictEqual(getMaskedEmail(undefined as any), '');
    });

    it('returns email as-is for invalid format', () => {
      assert.strictEqual(getMaskedEmail('invalid'), 'invalid');
      assert.strictEqual(getMaskedEmail('@domain.com'), '@domain.com');
      assert.strictEqual(getMaskedEmail('user@'), 'user@');
    });

    it('masks email correctly', () => {
      assert.strictEqual(getMaskedEmail('test@example.com'), 't•••••t@example.com');
      assert.strictEqual(getMaskedEmail('a@b.co'), 'a•••••a@b.co');
      assert.strictEqual(getMaskedEmail('ab@cd.ef'), 'a•••••b@cd.ef');
      assert.strictEqual(getMaskedEmail('very.long.email@domain.com'), 'v•••••l@domain.com');
    });
  });

  describe('getMaskedPhone', () => {
    it('returns input for empty/null', () => {
      assert.strictEqual(getMaskedPhone(''), '');
      assert.strictEqual(getMaskedPhone(null as any), null);
      assert.strictEqual(getMaskedPhone(undefined as any), undefined);
    });

    it('handles Indian numbers with country code', () => {
      assert.strictEqual(getMaskedPhone('+919876543210'), '+91 ••••• 3210');
      assert.strictEqual(getMaskedPhone('919876543210'), '+91 ••••• 3210');
      assert.strictEqual(getMaskedPhone('+91 98765 43210'), '+91 ••••• 3210');
      assert.strictEqual(getMaskedPhone('00919876543210'), '+91 ••••• 3210');
    });

    it('handles numbers without country code', () => {
      assert.strictEqual(getMaskedPhone('9876543210'), '••••• 3210');
      assert.strictEqual(getMaskedPhone('1234567890'), '••••• 7890');
    });

    it('handles short numbers', () => {
      assert.strictEqual(getMaskedPhone('12345'), '••••• 2345');
      assert.strictEqual(getMaskedPhone('123'), '••••• 123');
      assert.strictEqual(getMaskedPhone('12'), '••••• 12');
      assert.strictEqual(getMaskedPhone('1'), '••••• 1');
    });
  });

  describe('getOtpResendCountdown', () => {
    it('returns correct countdown', () => {
      const now = Date.now();
      assert.strictEqual(getOtpResendCountdown(now), 30);
      assert.strictEqual(getOtpResendCountdown(now - 1000), 29);
      assert.strictEqual(getOtpResendCountdown(now - 15000), 15);
      assert.strictEqual(getOtpResendCountdown(now - 30000), 0);
      assert.strictEqual(getOtpResendCountdown(now - 31000), 0);
      assert.strictEqual(getOtpResendCountdown(now - 60000), 0);
    });

    it('accepts custom cooldown', () => {
      const now = Date.now();
      assert.strictEqual(getOtpResendCountdown(now, 60), 60);
      assert.strictEqual(getOtpResendCountdown(now - 30000, 60), 30);
      assert.strictEqual(getOtpResendCountdown(now - 61000, 60), 0);
    });
  });

  describe('canResendOtp', () => {
    it('returns false when on cooldown', () => {
      const now = Date.now();
      assert.strictEqual(canResendOtp(now), false);
      assert.strictEqual(canResendOtp(now - 1000), false);
      assert.strictEqual(canResendOtp(now - 29000), false);
    });

    it('returns true when off cooldown', () => {
      const now = Date.now();
      assert.strictEqual(canResendOtp(now - 30000), true);
      assert.strictEqual(canResendOtp(now - 31000), true);
      assert.strictEqual(canResendOtp(now - 60000), true);
    });

    it('accepts custom cooldown', () => {
      const now = Date.now();
      assert.strictEqual(canResendOtp(now - 15000, 60), false); // 45 seconds left
      assert.strictEqual(canResendOtp(now - 45000, 60), false); // 15 seconds left
      assert.strictEqual(canResendOtp(now - 61000, 60), true);  // 1 second over
    });
  });

  describe('OTP_RESEND_COOLDOWN', () => {
    it('is 30 seconds', () => {
      assert.strictEqual(OTP_RESEND_COOLDOWN, 30);
    });
  });

  describe('confirmSwitch', () => {
    it('returns true for exact SWITCH', async () => {
      assert.strictEqual(await confirmSwitch('SWITCH'), true);
    });

    it('returns false for lowercase switch', async () => {
      assert.strictEqual(await confirmSwitch('switch'), false);
    });

    it('returns false for SWITCH with extra space', async () => {
      assert.strictEqual(await confirmSwitch('SWITCH '), false);
      assert.strictEqual(await confirmSwitch(' SWITCH'), false);
      assert.strictEqual(await confirmSwitch(' SWITCH '), false);
    });

    it('returns false for partial matches', async () => {
      assert.strictEqual(await confirmSwitch('SWIT'), false);
      assert.strictEqual(await confirmSwitch('SWITCHX'), false);
      assert.strictEqual(await confirmSwitch('SWITCH_SWITCH'), false);
    });

    it('returns false for empty string', async () => {
      assert.strictEqual(await confirmSwitch(''), false);
    });

    it('returns false for null/undefined', async () => {
      assert.strictEqual(await confirmSwitch(null as any), false);
      assert.strictEqual(await confirmSwitch(undefined as any), false);
    });
  });
});