import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Account, money } from '@loop/shared';

import {
  accountFromForm,
  accountsTotal,
  balanceDisplay,
  cashSuggestion,
  formFromAccount,
  orbitAccounts,
  reorderAccounts,
  splitAccounts,
} from './accounts-view';

const NOW = '2026-10-16T10:00:00.000Z';
const account = (id: string, overrides: Partial<Account> = {}): Account => ({
  id,
  name: id.toUpperCase(),
  type: 'bank',
  last4: null,
  openingBalance: money(0, 'INR'),
  openingDate: '2026-10-01',
  colorToken: 'lime',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  ...overrides,
});
const row = (a: Account, minor: number) => ({ account: a, balance: money(minor, 'INR') });

describe('balance display', () => {
  it('labels a card owed as OUTSTANDING with a positive amount, in coral', () => {
    assert.deepEqual(balanceDisplay(account('c', { type: 'card' }), money(-1300, 'INR')), { label: 'OUTSTANDING', amount: money(1300, 'INR'), tone: 'debit' });
  });
  it('labels an overpaid card as CREDIT', () => {
    assert.deepEqual(balanceDisplay(account('c', { type: 'card' }), money(500, 'INR')), { label: 'CREDIT', amount: money(500, 'INR'), tone: 'credit' });
  });
  it('shows a negative cash balance in coral with no label (Loop does not scold)', () => {
    assert.deepEqual(balanceDisplay(account('cash', { type: 'cash' }), money(-200, 'INR')), { label: null, amount: money(-200, 'INR'), tone: 'debit' });
  });
});

describe('list and total', () => {
  const rows = [
    row(account('b', { sortOrder: 1 }), 10_000),
    row(account('a', { sortOrder: 0, type: 'card' }), -1_300),
    row(account('old', { sortOrder: 2, archivedAt: NOW }), 99_999),
    row(account('c', { sortOrder: 3 }), 50),
    row(account('d', { sortOrder: 4 }), 1),
  ];
  it('orders active by sortOrder and keeps archived apart', () => {
    const { active, archived } = splitAccounts(rows);
    assert.deepEqual(active.map((r) => r.account.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(archived.map((r) => r.account.id), ['old']);
  });
  it('totals active accounts only, card outstanding as negative', () => {
    assert.deepEqual(accountsTotal(rows, 'INR'), money(10_000 - 1_300 + 50 + 1, 'INR'));
  });
  it('gives Orbit the first three active accounts and the total, and nothing without accounts', () => {
    const card = orbitAccounts(rows, 'INR')!;
    assert.deepEqual(card.rows.map((r) => r.account.id), ['a', 'b', 'c']);
    assert.deepEqual(card.total, money(8_751, 'INR'));
    assert.equal(orbitAccounts([], 'INR'), null);
    assert.equal(orbitAccounts([rows[2]!], 'INR'), null);
  });
  it('rewrites sortOrder from a drag result', () => {
    const out = reorderAccounts(['c', 'a'], rows.map((r) => r.account));
    assert.deepEqual(out.map((a) => [a.id, a.sortOrder]), [['c', 0], ['a', 1]]);
  });
});

describe('the form', () => {
  it('stores a card owed at the start as a negative opening balance and round-trips', () => {
    const form = { name: ' HDFC Regalia ', type: 'card' as const, last4: '1234', openingMinor: 250_000, openingOwed: true, openingDate: '2026-10-01', colorToken: 'violet' as const };
    const result = accountFromForm(form, 'INR', { id: 'acc-1', now: NOW, sortOrder: 2 });
    assert.ok('account' in result);
    assert.deepEqual(result.account.openingBalance, money(-250_000, 'INR'));
    assert.equal(result.account.name, 'HDFC Regalia');
    assert.equal(result.account.sortOrder, 2);
    assert.deepEqual(formFromAccount(result.account), { ...form, name: 'HDFC Regalia' });
  });
  it('drops last4 for cash and wallet, and ignores the owed toggle off cards', () => {
    const result = accountFromForm({ ...cashSuggestion('2026-10-16'), last4: '9999', openingMinor: 500, openingOwed: true }, 'INR', { id: 'cash', now: NOW, sortOrder: 0 });
    assert.ok('account' in result);
    assert.equal(result.account.last4, null);
    assert.deepEqual(result.account.openingBalance, money(500, 'INR'));
  });
  it('reports a bad last4 and an empty name', () => {
    const base = { name: 'Bank', type: 'bank' as const, last4: '12a4', openingMinor: 0, openingOwed: false, openingDate: '2026-10-01', colorToken: 'ice' as const };
    assert.deepEqual(accountFromForm(base, 'INR', { id: 'x', now: NOW, sortOrder: 0 }), { error: 'last4_invalid' });
    assert.deepEqual(accountFromForm({ ...base, last4: '', name: '  ' }, 'INR', { id: 'x', now: NOW, sortOrder: 0 }), { error: 'name_empty' });
  });
  it('keeps id, createdAt, sortOrder and archivedAt when editing', () => {
    const existing = account('acc-9', { sortOrder: 7, archivedAt: NOW, createdAt: '2026-01-01T00:00:00.000Z' });
    const result = accountFromForm({ ...formFromAccount(existing), name: 'Renamed' }, 'INR', { id: 'ignored', now: NOW, existing, sortOrder: 0 });
    assert.ok('account' in result);
    assert.deepEqual([result.account.id, result.account.sortOrder, result.account.createdAt, result.account.archivedAt], ['acc-9', 7, '2026-01-01T00:00:00.000Z', NOW]);
  });
});
