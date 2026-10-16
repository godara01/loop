/** The accounts feature's public surface. Import from here, never from a deep path. */
export {
  type AccountBalancesSnapshot,
  type AccountsSnapshot,
  archiveAccount,
  deleteAccount,
  newAccountId,
  saveAccount,
} from './api/account-repository';
export {
  type AccountBalancesState,
  type AccountWithBalance,
  type AccountsState,
  useAccountBalances,
  useAccounts,
} from './hooks/use-accounts';
