/** The inbox feature's public surface. Import from here, never from a deep path. */
export { ApprovePendingScreen } from './screens/approve-pending-screen';
export { INBOX_EMPTY_COPY, InboxScreen } from './screens/inbox-screen';
export { type PendingExpensesState, usePendingExpenses } from './hooks/use-pending-expenses';
export type { PendingExpense } from './model/approval';
export { badgeCount } from './model/inbox-view';
