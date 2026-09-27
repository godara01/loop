/** The expenses feature's public surface. Import from here, never from a deep path. */
export { type ApprovalFields, type ApprovalSource, ExpenseEntryScreen } from './screens/expense-entry-screen';
export { LedgerScreen } from './screens/ledger-screen';
export { OrbitScreen } from './screens/orbit-screen';
export { ExpenseRow } from './components/expense-row';
export type { ExpensesSnapshot } from './api/expense-repository';
export { useExpensesForLastDays, useExpensesForPeriod, useLedgerExpenses, useRecentExpenses } from './hooks/use-expenses';
