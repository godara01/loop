/**
 * Firestore paths. The only place a path string is assembled: call sites never
 * concatenate, so a mistyped collection name is one bug in one file, not a
 * silent read of an empty collection. See docs/11-firebase.md.
 *
 * Plain strings with no SDK import, shared by the app's repositories, the
 * security-rules tests and, later, Cloud Functions.
 */

function segment(value: string, label: string): string {
  // Firestore rejects these, but its error names the whole path, not which input
  // produced it. Failing here says which argument was wrong.
  if (value.length === 0 || value.includes('/') || value === '.' || value === '..' || /^__.*__$/.test(value)) {
    throw new Error(`Invalid ${label} for a Firestore path: ${JSON.stringify(value)}`);
  }
  return value;
}

const user = (uid: string) => `users/${segment(uid, 'uid')}`;

export const firestorePaths = {
  user,
  /** Singleton documents use fixed ids so there is never a query to find them. */
  settings: (uid: string) => `${user(uid)}/settings/app`,
  wallet: (uid: string) => `${user(uid)}/wallet/main`,
  streak: (uid: string) => `${user(uid)}/streak/main`,

  categories: (uid: string) => `${user(uid)}/categories`,
  category: (uid: string, categoryId: string) =>
    `${user(uid)}/categories/${segment(categoryId, 'categoryId')}`,

  expenses: (uid: string) => `${user(uid)}/expenses`,
  expense: (uid: string, expenseId: string) =>
    `${user(uid)}/expenses/${segment(expenseId, 'expenseId')}`,

  /** The document id IS the local date — that is what makes a check-in idempotent. */
  checkIns: (uid: string) => `${user(uid)}/checkIns`,
  checkIn: (uid: string, localDate: string) =>
    `${user(uid)}/checkIns/${segment(localDate, 'localDate')}`,

  coinLedger: (uid: string) => `${user(uid)}/coinLedger`,
  coinEntry: (uid: string, entryId: string) =>
    `${user(uid)}/coinLedger/${segment(entryId, 'entryId')}`,
} as const;
