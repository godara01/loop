import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { linkErrorState, type LinkErrorState } from './link-errors';

describe('linkErrorState', () => {
  it('returns correct state for credential-already-in-use', () => {
    const result = linkErrorState('auth/credential-already-in-use');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'That Google account already has Loop data.',
      action: 'switch',
    });
  });

  it('returns correct state for provider-already-linked', () => {
    const result = linkErrorState('auth/provider-already-linked');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'Already linked.',
    });
  });

  it('returns correct state for invalid-verification-code', () => {
    const result = linkErrorState('auth/invalid-verification-code');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'That code did not match.',
      action: 'retry',
    });
  });

  it('returns correct state for code-expired', () => {
    const result = linkErrorState('auth/code-expired');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'Code expired — send a new one.',
      action: 'send-new',
    });
  });

  it('returns correct state for session-expired', () => {
    const result = linkErrorState('auth/session-expired');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'Code expired — send a new one.',
      action: 'send-new',
    });
  });

  it('returns correct state for too-many-requests', () => {
    const result = linkErrorState('auth/too-many-requests');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'Too many tries. Try again later.',
    });
  });

  it('returns correct state for network-request-failed', () => {
    const result = linkErrorState('auth/network-request-failed');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: 'Needs a connection.',
    });
  });

  it('returns idle state for SIGN_IN_CANCELLED', () => {
    const result = linkErrorState('SIGN_IN_CANCELLED');
    assert.deepStrictEqual(result, { status: 'idle' });
  });

  it('returns generic error state for unknown error codes', () => {
    const result = linkErrorState('auth/unknown-error');
    assert.deepStrictEqual(result, {
      status: 'error',
      message: "Couldn't link right now.",
    });
  });
});