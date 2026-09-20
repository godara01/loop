# Task 2 — Phase 3 (M5): Insights gate verification

**Depends on:** Task 1 (device-verified M4)
**Blocks:** Task 3

## Objective

The Insights feature (category-wise and day-wise) already has code in the tree
(`apps/mobile/src/app/(tabs)/insights.tsx` if present, `packages/shared/src/insights.ts`)
and passing unit tests, but it was never taken through the Phase 3 gate in
`docs/15-mvp-completion-plan.md`: no Maestro flows beyond `insights-fixture`
exist, `docs/05-insights.md`'s acceptance criteria are all unticked, and the
300ms perf budget at 3,000 expenses has not been measured. This task closes
that gap — it is verification and gap-filling, not new feature work. If you
find the feature is materially incomplete (not just untested), stop and record
that as a blocker in `docs/05` rather than quietly rebuilding it — that's out
of this task's scope.

## Context

Read [`docs/05-insights.md`](../05-insights.md) in full — it's short and
precise about the invariants (`displayPercentages` sums to exactly 100,
category totals sum to `periodTotal` exactly, `totalsByDay` has no gaps, local
day boundaries not UTC). Read the Phase 3 section of
[`docs/15-mvp-completion-plan.md`](../15-mvp-completion-plan.md#phase-3--insights-category-wise-and-day-wise-m5)
for the exact test list this task must produce evidence for.

## Flow

1. Confirm `packages/shared/src/insights.ts` exports `intensityStep()` (Phase 3
   adds this per `docs/15`) alongside the existing `periodOf`, `previousPeriod`,
   `totalsByCategory`, `totalsByDay`, `periodStats`, `weekdayAverages`,
   `compareToPrevious`, `collapseLongTail`. If missing, implement it: 5
   discrete steps relative to the period's max, per `docs/05`'s calendar-strip
   spec.
2. Run the existing `insights-fixture` Maestro flow — it seeds a deterministic
   fixture and asserts the screen matches totals computed by the same shared
   functions the seed script uses.
3. Write the three flows `docs/15` calls for that don't yet exist in
   `e2e/flows/`:
   - `insights-day-detail` — tap a day, land on `/day/[date]`, category
     breakdown matches, swipe to adjacent day works.
   - `insights-timezone` — change the emulator's timezone, log an expense at
     23:59 and one at 00:01 local, confirm they land on different local days
     (not split by UTC).
   - `insights-period-persist` — change the period control, relaunch the app,
     confirm the choice persisted (`settings.insightsPeriod`).
4. Measure the perf budget: seed 3,000 expenses (there should already be a
   seeding path from M3's 5,000-expense ledger-scroll test — reuse or extend
   `scripts/seed-emulator.ts`), open Insights, confirm it renders under 300ms.
   Log a `[perf]` marker readable from `logcat`, matching the pattern M3
   already established for the ledger-scroll perf test.
5. Tick every acceptance criterion in `docs/05-insights.md` as you produce
   evidence for it. Don't tick one you haven't actually verified.

## Edge cases to handle

- Fewer than 3 days of history: real numbers shown plus a muted "trends need
  about a week" note — never a fabricated trend or a hidden chart.
- Zero expenses in the period: "Nothing logged in this window." with the
  period control still usable to widen the range.
- Archived categories must still appear in periods containing their (already
  logged) expenses — don't let an archive filter leak into historical totals.
- Pending (unapproved) SMS expenses must appear in no total — there's no SMS
  feature yet (that's Phase 5), so this is a forward-looking check: confirm
  the query that feeds Insights filters on something that will naturally
  exclude `pendingExpenses` documents (they live in a different subcollection),
  not on an ad hoc status flag that Phase 5 could bypass.

## Files owned

`e2e/flows/insights-day-detail.yaml`, `e2e/flows/insights-timezone.yaml`,
`e2e/flows/insights-period-persist.yaml`, `packages/shared/src/insights.ts`
(only `intensityStep` if missing), `docs/05-insights.md` (tick criteria),
`docs/13-build-plan.md` (add M5 status note in the same style as M2–M4's).

## Testing

- `npm test` — insights suite in `packages/shared/src/__tests__/insights.test.ts`
  must cover `intensityStep` if you add it.
- `npm run typecheck`
- All Insights Maestro flows, twice consecutively from clean state.
- Perf: 3,000-expense seed, render time logged and confirmed under 300ms.

## Definition of done

- [ ] `intensityStep()` exists and is tested
- [ ] `insights-fixture`, `insights-day-detail`, `insights-timezone`,
      `insights-period-persist` all green twice in a row
- [ ] 300ms perf budget measured and met at 3,000 expenses
- [ ] Every acceptance criterion in `docs/05-insights.md` ticked with real evidence
- [ ] `docs/13-build-plan.md` M5 status note added
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. Write `GATES.md` before touching code: one
gate per new Maestro flow, one gate for the perf measurement, one gate per
acceptance-criteria item. Treat "the flow exists and is green" and "the
acceptance criterion is true" as separate gates even when they overlap —
a flow passing once is not the same claim as a criterion being ticked from
twice-green evidence.
