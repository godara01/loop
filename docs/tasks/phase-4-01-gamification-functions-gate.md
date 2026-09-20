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
   ones unless a gap turns up while running them.
4. Manually walk the celebration and haptic table in `docs/06` on the
   emulator: day-banked spring + `streakAdvance`, 7-day milestone burst, coins
   `+N` chip rising after a save. Confirm no two haptics fire within 150ms of
   each other (`docs/07-haptics.md#sequencing`) and that a celebration never
   blocks a tap.
5. Confirm **Keep it plain** actually suppresses every gamification haptic,
   not just the visuals — read `apps/mobile/src/lib/haptics.ts` and the
   gamification hooks/components to verify the setting is checked at the
   haptic call site, not just at the component render.
6. Confirm zero push notification registration anywhere in the app (grep for
   any notifications permission request or FCM token registration — there
   should be none).
7. Tick every acceptance criterion in `docs/06-gamification.md`.

## Edge cases to handle

- Offline: the client's optimistic streak/coin prediction must update
  instantly and reconcile silently when the Function's write lands — if the
  server ever disagrees with the optimistic prediction in the normal case,
  that's a bug (both should run the same `packages/shared` code), not a UI
  state to design around.
- A backdated expense must not create a check-in for the backdated day or
  award that day's coins — `functions/src/handlers.ts` should already handle
  this (it's in the L3 test suite); confirm it holds when the client's
  optimistic UI is involved too, not just the server.
- Deleting every expense on a banked day must leave streak and coins
  untouched — same, confirm client UI doesn't show a clawback that the server
  never performed.

## Files owned

No feature code expected to change unless verification finds a real bug.
`docs/06-gamification.md` (tick criteria), `docs/13-build-plan.md` (M6 status
note, split or shared with Task 4 — coordinate so the note covers both the
Functions/coins half and the onboarding half).

## Testing

- `npm run typecheck`, `npm test`, `npm run test:rules`, `npm run test:functions`
- `check-in-zero-spend`, `check-in-offline-reconcile`, `keep-it-plain` Maestro
  flows, twice consecutively.
- Manual haptic/celebration walkthrough against `docs/06`'s tables — this is a
  manual gate (haptics aren't machine-observable on the emulator per
  `CLAUDE.md`'s environment notes), record what was checked and the result.

## Definition of done

- [ ] `test:functions` and `test:rules` reconfirmed green
- [ ] `check-in-zero-spend`, `check-in-offline-reconcile`, `keep-it-plain` green twice
- [ ] Haptic sequencing and celebration rules manually verified against `docs/06`/`docs/07`
- [ ] Zero push-notification registration confirmed
- [ ] Every acceptance criterion in `docs/06-gamification.md` ticked
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. Several of this task's gates are manual
(haptics can't be felt on the emulator) — mark them as manual gates per
`unlazy`'s gate-authoring rules rather than inventing a fake automated check
for something that genuinely needs a human or device judgment call, and record
what evidence a manual gate actually rests on.
