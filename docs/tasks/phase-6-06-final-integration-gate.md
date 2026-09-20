# Task 15 — Final gate: full MVP integration test

**Depends on:** Task 14 (everything through Phase 6 built and individually gated)

## Objective

Run the single continuous journey `docs/15-mvp-completion-plan.md` defines as
the exit criteria for the whole MVP, from a clean slate, and tag the release.
This is the last task in the backlog — everything before it verified one
phase at a time; this one verifies the seams between all of them at once.

**Parts of this task are not agent-executable** — a physical-device haptic
pass and a live Blaze-plan deploy both require the user directly (EAS account
actions, physical device in hand, billing upgrade). Do the parts that are
agent-executable, then hand off clearly for the rest. Don't simulate or assume
the outcome of the manual parts.

## Context

Read [`docs/15-mvp-completion-plan.md#final-gate--full-mvp-integration-test`](../15-mvp-completion-plan.md)
in full — the journey script is specified there step by step. Read
[`docs/13-build-plan.md#definition-of-done-per-milestone`](../13-build-plan.md)
one more time; this task is that definition applied to the entire app, not
one milestone.

## Flow

1. **Automated suite from a clean slate**: `npm run test:all`
   (`scripts/test-all.sh` — check it exists; if this script was never written,
   write it now per `docs/15`'s spec: typecheck → `npm test` → `test:rules` →
   `test:functions` → start emulators with no imported data → `pm clear` the
   app → every phase's Maestro flows → the journey below → teardown and
   summary).
2. **The journey** (`e2e/journeys/mvp-day-in-the-life.yaml` — write it if
   missing), one continuous run on a fresh install, exactly as `docs/15`
   specifies:
   1. Onboarding: name, INR, haptics on, add COFFEE from the catalogue, first
      expense → Orbit shows streak 1; server wallet > 0
   2. Four more expenses (one backdated), edit one, delete one, undo, delete again
   3. Custom category created from inside the entry sheet; amount survives
   4. Debit SMS injected → inbox → approve; OTP injected → nothing; duplicate → one card
   5. Airplane mode → add expense → kill + relaunch → still there → reconnect → synced
   6. Insights: totals/percentages equal `insights.ts`-computed values from the
      journey's own data; day detail matches
   7. Server invariants: 1 user; `wallet == sum(coinLedger)`; one check-in per
      active day; no raw SMS text in any document; rollups equal client totals
   8. Export CSV → re-parse → identical amounts
   9. Keep it plain → no capsule/coins/celebrations
   10. Reset app → onboarding; server subtree empty
3. Run `test:all` **twice consecutively**, both green, per the exit criteria.
4. Reconcile every acceptance-criteria checklist across `docs/02`–`docs/12`
   against the Android build — reread each one; this is the last chance to
   catch a criterion that was ticked prematurely in an earlier task.
5. Update `docs/13-build-plan.md` with an "MVP complete" status line.
6. **Hand off to the user** for the parts that need them directly, per
   `docs/15`'s "User actions" section:
   - Physical-device haptic pass on the Redmi Note 10 Pro — every event in
     `docs/07-haptics.md`, felt and tuned, not just triggered on the emulator.
   - Blaze plan upgrade + a budget alert, then the live preview-build smoke
     test (`eas build --profile preview`, deploy rules/indexes/Functions to
     the live `loop-app-0403` project).
   - Confirm the Play Store SMS permission declaration (`docs/13`'s longest-
     lead blocker) has been submitted — it should have been submitted early
     per that doc's note, independent of this backlog's progress; check its
     status and flag if it was never actually submitted.
7. Once the manual items are confirmed done by the user, tag the release:
   `git tag v1.0.0-mvp` on the final commit.

## Edge cases to handle

- If `test:all` fails on the first of the two required consecutive runs,
  fix the root cause and restart the two-in-a-row count — a "pass, fail,
  pass" sequence does not satisfy "twice consecutively."
- If any acceptance criterion across `docs/02`–`docs/12` turns out to still be
  unticked or was ticked without real evidence, this task is not done — go
  back and either fix the gap or clearly hand it off; do not tag `v1.0.0-mvp`
  with known-open criteria.
- The journey's server invariant checks (step 7) need to run against the
  emulator's REST API mid-flow, not just eyeballed in the emulator UI — reuse
  the pattern from earlier phases' Maestro flows that already do this
  (`runScript` + `http` per `docs/15`'s groundwork section).

## Files owned

`scripts/test-all.sh` (if missing), `e2e/journeys/mvp-day-in-the-life.yaml`
(if missing), `docs/13-build-plan.md` (final status line). No feature code
should need to change at this point — if this task finds a real bug, fix it
narrowly and note which earlier task's Definition of Done should have caught
it (useful signal for tightening this backlog's gates going forward).

## Testing

Everything: `npm run test:all`, twice green, plus the manual physical-device
and live-deploy items handed off to the user.

## Definition of done

- [ ] `test:all` exists and runs the full clean-slate sequence
- [ ] `mvp-day-in-the-life` journey exists and passes as part of `test:all`
- [ ] `test:all` green twice consecutively
- [ ] Every acceptance criterion across `docs/02`–`docs/12` reconciled and genuinely ticked
- [ ] `docs/13-build-plan.md` marks the MVP complete
- [ ] Physical haptic pass and live preview-build smoke either done or clearly handed off to the user with exact remaining steps
- [ ] `v1.0.0-mvp` tag created once every item above is actually closed (not before)
- [ ] One commit

## Working method

Use the `unlazy` skill, orchestrated mode fits well here (the journey itself
has ten independently-checkable stages, each mappable to a gate) — write the
contract and tree before running anything, and treat the two manual items as
explicit `ABANDON`-with-reason entries in the ledger if this session genuinely
cannot execute them (no physical device, no EAS/Blaze credentials in this
environment), rather than silently omitting them from the final report.
