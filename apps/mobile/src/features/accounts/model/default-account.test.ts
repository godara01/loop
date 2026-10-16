import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Account, money } from '@loop/shared';

import { defaultAccountId, rememberAccount, showAccountRow } from './default-account';

const NOW = '2026-10-16T10:00:00.000Z';
const account = (id: string, archivedAt: string | null = null): Account => ({
  id,
  name: id,
  type: 'bank',
  last4: null,
  openingBalance: money(0, 'INR'),
  openingDate: '2026-10-01',
  colorToken: 'lime',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt,
});

describe('default account', () => {
  const accounts = [account('bank'), account('card'), account('old', NOW)];

  it('is the account last used for this kind', () => {
    assert.equal(defaultAccountId('expense', { expense: 'card', income: 'bank' }, accounts), 'card');
    assert.equal(defaultAccountId('income', { expense: 'card', income: 'bank' }, accounts), 'bank');
  });
  it('is None when that account is archived', () => {
    assert.equal(defaultAccountId('expense', { expense: 'old' }, accounts), null);
  });
  it('is None when that account was deleted', () => {
    assert.equal(defaultAccountId('expense', { expense: 'gone' }, accounts), null);
  });
  it('is None with nothing remembered, or nothing for this kind', () => {
    assert.equal(defaultAccountId('expense', undefined, accounts), null);
    assert.equal(defaultAccountId('income', { expense: 'card' }, accounts), null);
  });
  it('shows the account row only with an active account', () => {
    assert.equal(showAccountRow([]), false);
    assert.equal(showAccountRow([account('old', NOW)]), false);
    assert.equal(showAccountRow(accounts), true);
  });
  it('remembers a new choice per kind, forgets on None, and writes nothing when unchanged', () => {
    assert.deepEqual(rememberAccount('expense', 'card', undefined), { expense: 'card' });
    assert.deepEqual(rememberAccount('income', 'bank', { expense: 'card' }), { expense: 'card', income: 'bank' });
    assert.deepEqual(rememberAccount('expense', null, { expense: 'card', income: 'bank' }), { income: 'bank' });
    assert.equal(rememberAccount('expense', 'card', { expense: 'card' }), null);
    assert.equal(rememberAccount('expense', null, undefined), null);
  });
});
