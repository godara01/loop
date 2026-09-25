/**
 * Cloud Storage paths — the bucket-side counterpart to `firestore/paths.ts`.
 * Kept separate because a Storage path has no even/odd segment constraint the
 * way a Firestore document path does; mixing the two builders would blur that.
 * Must match `storage.rules` exactly.
 */

function segment(value: string, label: string): string {
  if (value.length === 0 || value.includes('/') || value === '.' || value === '..') {
    throw new Error(`Invalid ${label} for a Storage path: ${JSON.stringify(value)}`);
  }
  return value;
}

export const storagePaths = {
  categoryLogo: (uid: string, categoryId: string) =>
    `users/${segment(uid, 'uid')}/categoryLogos/${segment(categoryId, 'categoryId')}`,
  receipt: (uid: string, expenseId: string) =>
    `users/${segment(uid, 'uid')}/receipts/${segment(expenseId, 'expenseId')}`,
} as const;
