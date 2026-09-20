# Task 11 — Phase 6 (M8): scheduled cleanup Functions

**Depends on:** Task 10 (rollups in place — cleanup of soft-deleted expenses
must not corrupt rollups that reference them)
**Independent of:** Tasks 12, 13 (different files)

## Objective

Add the scheduled maintenance Functions `docs/13-build-plan.md` places in M8:
`cleanupSoftDeleted` (90-day retention), pending-expense expiry (the 30-day
`pendingExpenses` sweep that Task 7 in Phase 5 deferred to here — see that
task's file for the exact deferral note), and `onUserDelete`.

## Context

Read [`docs/13-build-plan.md#m8--hardening-and-release`](../13-build-plan.md)
for the feature list. Read
[`docs/tasks/phase-5-03-sms-inbox-repository.md`](phase-5-03-sms-inbox-repository.md)'s
"Edge cases" section — it explicitly left the actual `pendingExpenses` expiry
sweep to this task; the client-side filtering it built stays as a
belt-and-suspenders UI safeguard, not a replacement for the real Firestore
field update. Read [`docs/02-onboarding.md#re-onboarding-and-reset`](../02-onboarding.md)
for what `onUserDelete` (invoked by the reset-app flow, Task 12) must actually
remove: the user's Firestore subtree and Storage prefix.

## Flow

1. **`cleanupSoftDeleted`** (scheduled, e.g. daily): find expenses with
   `deletedAt` older than 90 days and hard-delete them. Confirm this doesn't
   touch rollups (a soft-deleted expense is already excluded from rollup
   totals per Task 10 — hard-deleting it later must be a pure storage cleanup,
   not a rollup-affecting event).
2. **Pending-expense expiry** (scheduled, e.g. daily): find
   `pendingExpenses` with `status: 'pending'` and `receivedAt` older than 30
   days, set `status: 'expired'`. Never delete these documents — same
   never-delete-a-decision-record rule as `rejected` items in Task 7.
3. **`onUserDelete`**: a Function (callable or Auth-triggered, decide based on
   how the anonymous-user deletion path in `docs/02`'s reset flow actually
   calls it) that deletes the user's entire Firestore subtree
   (`users/{uid}/**`) and their Storage prefix
   (`users/{uid}/categoryLogos/**` and any receipts path from `docs/08`). This
   is what Task 12's "Reset app" feature calls, and also what a genuine
   account deletion needs.

## Edge cases to handle

- `cleanupSoftDeleted` must never touch an expense that's referenced by a
  still-`pending` `pendingExpenses.expenseId` link (shouldn't be possible by
  construction — `expenseId` is only set on approval, which makes the expense
  real — but write a test confirming a 90-day-old soft-deleted expense that
  somehow still has an inbound reference doesn't leave a dangling pointer).
- `onUserDelete` must be complete: partial deletion (e.g. Firestore subtree
  gone but a Storage logo orphaned) is a privacy bug, not just an untidy
  cleanup. Enumerate every subcollection and storage path a user can have
  (`profile`, `settings`, `categories`, `expenses`, `checkIns`, `streak`,
  `wallet`, `coinLedger`, `pendingExpenses`, `dailyRollups`, `monthlyRollups`,
  `categoryLogos/`) before writing the delete, rather than deleting only the
  ones that come to mind.
- Scheduled Functions run against every user — make sure the query used to
  find candidates is indexed and bounded (a full collection-group scan across
  all users' expenses every day is the kind of thing `docs/11-firebase.md`'s
  indexing rules exist to prevent); add whatever composite index this needs
  to `firestore.indexes.json`.
- Test idempotency: running `cleanupSoftDeleted` twice in a row on the same
  data must be a no-op the second time, not an error and not a double-delete
  attempt.

## Files owned

New `functions/src/cleanup.ts` (all three Functions),
`firebase.json` (scheduled Function config), `firestore.indexes.json` (if a
new composite index is needed), `tests/functions/*`.

## Testing

- L3 (`npm run test:functions`, via `emulators:exec`): seed soft-deleted
  expenses at various ages, run `cleanupSoftDeleted`, confirm only >90-day-old
  ones are hard-deleted; seed pending expenses at various ages, run the expiry
  sweep, confirm only >30-day-old `pending` ones flip to `expired` and nothing
  else changes; call `onUserDelete` for a fully-populated synthetic user,
  confirm every listed subcollection and storage path is empty afterward.
- Idempotency: run each Function twice back to back in the test, assert the
  second run is a no-op.

## Definition of done

- [ ] `cleanupSoftDeleted` implemented, scheduled, tested at the 90-day boundary
- [ ] Pending-expense expiry implemented, scheduled, tested at the 30-day boundary
- [ ] `onUserDelete` removes every Firestore subcollection and Storage path a user can have
- [ ] All three Functions proven idempotent under a double-run test
- [ ] `test:functions`, `typecheck` green
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. Write `GATES.md` with one gate per Function
and an explicit "enumerate every user path, confirm all are empty" gate for
`onUserDelete` — don't let that one collapse into a vaguer "user data is
gone" gate, since the failure mode here (one orphaned subcollection) is
exactly the kind of thing a loose gate would miss.
