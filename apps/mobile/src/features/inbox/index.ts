/** The inbox feature's public surface. Import from here, never from a deep path. */
export { ApprovePendingScreen } from './screens/approve-pending-screen';
export { InboxScreen } from './screens/inbox-screen';
export { type PendingExpensesState, usePendingExpenses } from './hooks/use-pending-expenses';
export type { PendingExpense } from './model/approval';
export { InboxBadge } from './components/inbox-badge';
export { badgeCount } from './model/inbox-view';
