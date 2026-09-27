import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_RESET_STATE,
  RESET_OFFLINE_MESSAGE,
  type ResetEvent,
  type ResetState,
  isResetConfirmed,
  resetPlan,
  resetReducer,
} from './reset';

const run = (events: readonly ResetEvent[], from: ResetState = INITIAL_RESET_STATE) =>
  events.reduce(resetReducer, from);

describe('isResetConfirmed', () => {
  it('accepts only the exact, case-sensitive word', () => {
    assert.equal(isResetConfirmed('RESET'), true);
    for (const input of ['reset', 'RESET ', ' RESET', 'Reset', 'RESETT', '']) {
      assert.equal(isResetConfirmed(input), false, JSON.stringify(input));
    }
  });
});

describe('resetPlan', () => {
  it('deletes an anonymous user and signs out a linked one', () => {
    assert.equal(resetPlan({ isAnonymous: true }), 'delete-user');
    assert.equal(resetPlan({ isAnonymous: false }), 'sign-out');
  });
});

describe('resetReducer', () => {
  it('goes idle → confirming → deleting → done', () => {
    const states = [INITIAL_RESET_STATE];
    for (const event of [
      { type: 'start' },
      { type: 'type', input: 'RESET' },
      { type: 'confirm', online: true },
      { type: 'succeeded' },
    ] as const) {
      states.push(resetReducer(states.at(-1)!, event));
    }
    assert.deepEqual(states.map((s) => s.status), ['idle', 'confirming', 'confirming', 'deleting', 'done']);
  });

  it('offline goes to the error state with the connection message and never reaches done', () => {
    const offline = run([{ type: 'start' }, { type: 'type', input: 'RESET' }, { type: 'confirm', online: false }]);
    assert.deepEqual(offline, { status: 'error', message: RESET_OFFLINE_MESSAGE });
    assert.equal(RESET_OFFLINE_MESSAGE, 'Reset needs a connection');
    // Nothing that arrives afterwards can complete the reset.
    const after = run([{ type: 'succeeded' }, { type: 'confirm', online: true }, { type: 'succeeded' }], offline);
    assert.notEqual(after.status, 'done');
  });

  it('does not delete until the word is typed exactly', () => {
    const state = run([{ type: 'start' }, { type: 'type', input: 'reset' }, { type: 'confirm', online: true }]);
    assert.equal(state.status, 'confirming');
  });

  it('reports a failed deletion and lets the user start again or cancel', () => {
    const failed = run([
      { type: 'start' },
      { type: 'type', input: 'RESET' },
      { type: 'confirm', online: true },
      { type: 'failed', message: 'Server said no' },
    ]);
    assert.deepEqual(failed, { status: 'error', message: 'Server said no' });
    assert.deepEqual(resetReducer(failed, { type: 'start' }), { status: 'confirming', input: '' });
    assert.deepEqual(resetReducer(failed, { type: 'cancel' }), INITIAL_RESET_STATE);
  });

  it('ignores events that do not apply, so a double tap cannot skip a step', () => {
    assert.deepEqual(resetReducer(INITIAL_RESET_STATE, { type: 'confirm', online: true }), INITIAL_RESET_STATE);
    assert.deepEqual(resetReducer({ status: 'deleting' }, { type: 'cancel' }), { status: 'deleting' });
    assert.deepEqual(resetReducer({ status: 'done' }, { type: 'start' }), { status: 'done' });
  });
});
