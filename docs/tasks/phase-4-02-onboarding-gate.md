# Task 4 — Phase 4 (M6): onboarding gate verification

**Depends on:** Task 3 (gamification/Functions gated — onboarding's last step
awards `first_expense`/`check_in` coins through the same Functions)
**Blocks:** Task 5

## Objective

The 5-step onboarding flow (`apps/mobile/src/features/onboarding/`) has code
and a passing unit test (`onboarding-state.test.ts`), plus three existing
Maestro flows (`onboarding-full`, `onboarding-resume`, `onboarding-skip`). It
has not been run against a real build, and `docs/02-onboarding.md`'s
acceptance criteria are unticked. This task closes that gap.

## Context

Read [`docs/02-onboarding.md`](../02-onboarding.md) in full. Pay particular
attention to: the bootstrap gate (no profile or null `onboardedAt` → forced
onto `/onboarding`, reachable through no other route), the 2-second splash
budget before degraded-mode fallback, and the currency-is-permanent decision
(typed confirmation required to change later — this task doesn't build that
settings-screen confirmation, that's `docs/04`-style destructive-pattern work
tracked elsewhere, but it does verify onboarding's copy warns about it).

## Flow

1. Run the three existing Maestro flows against the real build on
   `Loop_API35`: `onboarding-full`, `onboarding-resume`, `onboarding-skip`.
2. Manually verify the bootstrap gate: fresh install lands on `/onboarding`
   and cannot reach `/(tabs)` by deep-linking, back-button, or any other route
   until `profile.onboardedAt` is set. Try to break it — that's the point of
   this check, not just confirming the happy path.
3. Kill the app mid-onboarding at each of the 5 steps and relaunch; confirm it
   resumes at the same step with earlier answers preserved (name, currency,
   haptics toggle, category selections).
4. Complete the full flow with no skips and confirm the exact outcome
   `docs/02`'s acceptance criteria describe: a profile doc, 8 active
   categories, one expense, streak of 1, and a coin balance that settles
   non-zero once the Function runs (this exercises Task 3's Functions, so
   confirm those are genuinely wired here, not just tested in isolation).
5. Complete the flow skipping steps 3–5 and confirm it produces a usable app
   with haptics on (the default) and 8 categories still seeded.
6. Time the full flow (someone who has seen it once, under 90 seconds) and do
   the whole thing in airplane mode, confirming it syncs once reconnected.
7. Confirm no permission dialog appears anywhere in onboarding — grep for any
   permission-request call reachable from the onboarding routes; there should
   be none (SMS, notifications, camera are all requested later, in context,
   per `docs/12-sms-ingest.md#permissions-ux`).
8. Tick every acceptance criterion in `docs/02-onboarding.md`.

## Edge cases to handle

- Deselecting the last active category in step 4 must fire `warning` and
  refuse — at least one category must remain active.
- An emulator or a device with no vibrator must show the "This device can't do
  haptics" copy in step 3 and skip the demo plates rather than firing silent
  no-ops — confirm this against the actual `Loop_API35` emulator, which is
  exactly this case.
- The disabled Continue button on step 2 (empty name) must fire `warning`, not
  silently do nothing.

## Files owned

No feature code expected to change unless verification finds a real bug.
`docs/02-onboarding.md` (tick criteria), `docs/13-build-plan.md` (complete the
shared M6 status note started in Task 3).

## Testing

- `npm run typecheck && npm test`
- `onboarding-full`, `onboarding-resume`, `onboarding-skip` Maestro flows,
  twice consecutively from clean state.
- Manual: bootstrap-gate escape attempts, mid-flow kill/resume at each step,
  90-second timing, airplane-mode completion, permission-dialog grep.

## Definition of done

- [ ] All three onboarding Maestro flows green twice in a row
- [ ] Bootstrap gate confirmed unbreakable (no route reaches tabs pre-onboarding)
- [ ] Mid-flow kill/resume confirmed at every step
- [ ] Full-flow and skip-flow outcomes match `docs/02`'s acceptance criteria exactly
- [ ] No permission dialog anywhere in onboarding, confirmed by code inspection
- [ ] Every acceptance criterion in `docs/02-onboarding.md` ticked
- [ ] `docs/13-build-plan.md` M6 status note complete (covers both Task 3 and this task)
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. This closes out M6 as a whole (together
with Task 3) — before reporting done, reread both `docs/02` and `docs/06`
acceptance-criteria lists side by side and confirm every item across both is
either ticked with evidence or explicitly abandoned with a reason; don't let
the split across two tasks become a gap where an item quietly gets missed by
both.
