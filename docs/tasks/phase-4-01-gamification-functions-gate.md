# Task 3 — Phase 4 (M6): gamification & Cloud Functions gate
**Depends on:** Task 2 (Insights gated)
**Blocks:** Task 4
## Objective
The streak/check-in/coins system and its Cloud Functions already exist and
their automated tests already pass — as of 2026-09-20, `npm run test:functions`
is green (7/7: double check-in, week-complete, expense-cap, no-clawback-on-delete,
backdating, idempotency, first-custom-category) and `npm run test:rules` is
green (40/40, including the coin-ledger/wallet client-write denial). What's
missing is the L4 layer (the feature exercised as a real app, not just
Functions-against-emulator) and the doc sign-off. Confirm the L1–L3 evidence
is still current, then close the L4 gap.
## Context
Read [`docs/06-gamification.md`](../06-gamification.md) in full — the
restraint rules section (no shame, coins never bought or revoked, no
leaderboard, "Keep it plain" dismissibility, one celebration per session, no
push notifications) are hard constraints, not suggestions; if you find UI that
violates one, fix the UI, don't relax the constraint. Also skim
`functions/src/handlers.ts` and `functions/src/award-coins.ts` — these already
implement the rules; this task verifies them against real usage, it doesn't
rewrite them unless verification finds a bug.
## Flow
1. Re-run `npm run test:functions` and `npm run test:rules` yourself and
   confirm they're still green (don't trust this file's claim — code drifts).
2. Boot the emulators (`npm run firebase:emulators`) and the `Loop_API35`
   emulator with the app installed (same build as Task 1/2, no new native deps
   needed for this task).
3. Run the existing Maestro flows that already cover gamification:
   `check-in-zero-spend`, `check-in-offline-reconcile`, `keep-it-plain`. These
   files exist in `e2e/flows/` already — this task has not needed to write new
   ones unless a gap turns up while
   verifying the existing ones. If a gap appears, either fix the underlying
   implementation or, if the gap is due to a missing Maestro flow, write the
   missing flow.
4. Verify the UI follows the restraint rules (see `docs/06-gamification.md`
   restraints) by manual inspection of the app while running the Maestro
   flows.
5. If all gates are met, update `docs/06-gamification.md` to reflect that the
   L4 gate is satisfied (add a checkmark to the relevant box in the file).
## Acceptance Criteria
See `docs/06-gamification.md` for the full list of gamification-related
acceptance criteria. For this gate, we consider the following as the minimum
set that must be verified:
- [ ] Cloud Functions unit tests pass
- [ ] Firestore and Storage rules unit tests pass
- [ ] Check-in zero-spend Maestro flow passes on emulator/device
- [ ] Check-in offline reconcile Maestro flow passes on emulator/device
- [ ] Keep it plain Maestro flow passes on emulator/device
- [ ] Manual verification that UI respects restraint rules (no shame, coins never bought/revoked, no leaderboard, dismissible, one celebration per session, no push notifications)
## Notes
- This environment has no EAS authentication and no confirmed live Loop_API35
  Session — assume any Maestro/device-dependent gate will need to be handed off
  same way Task 2 handed off G6, unless you can boot emulator
  And confirm build is installed (try `npm run emulator` first and check
  Before assuming you can't run L4 flows).
- Use unlazy skill: write GATES.md (solo mode — one leaf, one ledger)
  Before implementing anything, re-confirm npm run test:functions and
  Npm run test:rules are still green before trusting this file's claim that
  They already pass, and don't report task done while any gate is unmet or
  Silently skipped. Commit only when task's Definition of Done is genuinely
  Met, one commit, following same "don't overclaim device-dependent
  Criteria" discipline as Task 2.
