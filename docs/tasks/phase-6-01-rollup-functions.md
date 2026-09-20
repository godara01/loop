# Task 10 — Phase 6 (M8): rollup Cloud Functions

**Depends on:** Task 9 (Phase 5 closed)
**Blocks:** Task 14 (final polish/perf pass needs rollups in place to measure
against)
**Independent of:** Tasks 11, 12, 13 — can run in parallel with them once this
task itself is done, since it's the one Phase 6 task the others in this row
don't touch, but note Task 12 (CSV export) reads historical data too, so land
this one first if a single agent is doing Phase 6 sequentially.

## Objective

Add the `dailyRollups`/`monthlyRollups` maintenance Functions that
`docs/05-insights.md` and `docs/11-firebase.md` describe but which were
explicitly deferred out of Phase 3: *"Rollups deferred to Phase 6"*
(`docs/15`). As of 2026-09-20 there is no rollup code anywhere in
`functions/src/` or `packages/shared/src/`. Insights currently computes
everything from cached expense documents on-device, which is correct but
doesn't scale past roughly a year of data — this task adds the O(days) path
for historical periods.

## Context

Read [`docs/11-firebase.md`](../11-firebase.md) — the `dailyRollups`,
`monthlyRollups` schema is specified there (`totalMinor, count, byCategory{}`
daily; `totalMinor, count, byCategory{}, byDay{}` monthly), along with the
existing `onExpenseWrite` Function's responsibilities and the `rebuildRollups`
callable. Read
[`docs/05-insights.md#where-the-numbers-come-from`](../05-insights.md) for the
two-path design: cached documents for today/current-month, rollups for
anything older. Read `docs/08-data-model.md` for the `DailyRollup` TypeScript
interface. Read `functions/src/handlers.ts` and `award-coins.ts` to see the
existing pattern (idempotent Function handlers importing `packages/shared` for
the maths) before adding to it.

## Flow

1. Extend `onExpenseWrite` in `functions/src/handlers.ts` (it already exists
   and currently creates the day's check-in and evaluates coins — this task
   adds rollup maintenance to the same handler, since it already fires on
   every expense create/update/delete) to also update the affected day's
   `dailyRollups/{YYYY-MM-DD}` and month's `monthlyRollups/{YYYY-MM}`
   documents: increment/decrement `totalMinor`, `count`, and the
   `byCategory`/`byDay` maps as expenses are created, edited, or soft-deleted.
2. Add a new callable Function `rebuildRollups` (admin/debug, per
   `docs/11-firebase.md`'s Functions table) that regenerates a user's rollups
   from scratch by re-scanning their `expenses` collection — this is the
   escape hatch if a rollup and the underlying expenses ever disagree; "the
   expenses win and the rollup is rebuilt" per `docs/11`.
3. Wire the mobile app's Insights screen (built in Task 2 / Phase 3) to read
   rollups for any period that isn't the current month, per the two-path table
   in `docs/05`. This is the one piece of this task that touches
   `apps/mobile/` rather than just `functions/`.
4. Update `firestore.rules` if not already present: `dailyRollups` and
   `monthlyRollups` are Function-written only — `allow write: if false;` for
   both collections (the rule snippet already appears in `docs/11-firebase.md`
   as the intended shape; confirm it's actually in `firestore.rules`, add it
   if not, and cover it in `test:rules`).

## Edge cases to handle

- **Client-computed current-month totals and Function-computed rollups must
  agree exactly, to the minor unit, for the same period** — this is a
  standing acceptance criterion in `docs/05-insights.md`; write a test that
  computes both paths for the same synthetic data and diffs them.
- **A rollup is always rebuildable and never authoritative over the
  expenses** — if `onExpenseWrite`'s rollup update and the actual expense
  state ever diverge (e.g. a retried write), `rebuildRollups` must converge
  them, and running it twice must be a no-op (idempotent, same as every other
  M6 Function).
- Soft-deleted expenses must not count in rollups — same rule Insights already
  applies to cached data (`docs/05`: "soft-deleted expenses are excluded
  everywhere").
- Editing an expense's category or amount must correctly move its contribution
  between the old and new `byCategory` buckets in the same rollup document,
  not just add the new value.
- A rollup for a period with zero expenses should either not exist or read as
  all-zero — `totalsByDay`'s "no gaps" invariant (`docs/05`) must still hold
  when the Insights screen is reading rollup-backed data instead of cached
  documents; confirm the merge between the two data sources doesn't
  reintroduce gaps at the boundary between "current month, from cache" and
  "everything older, from rollups."

## Files owned

`functions/src/handlers.ts` (extend `onExpenseWrite`), new
`functions/src/rollups.ts` (rebuild logic + the callable),
`packages/shared/src/insights.ts` (only if a shared helper is needed to merge
cache-path and rollup-path results — keep it framework-free, per CLAUDE.md),
`apps/mobile/src/features/insights/*` (wire the past-period read path),
`firestore.rules` (rollup collections), `tests/functions/*`,
`tests/firestore-rules/*`.

## Testing

- L3 (`npm run test:functions`): rollup updates on expense create/edit/delete;
  `rebuildRollups` idempotency; client-vs-rollup parity for a synthetic
  dataset.
- L2 (`npm run test:rules`): client cannot write either rollup collection.
- L4: `insights-rollups-parity` flow (new — write it) seeding data across
  multiple months, confirming a past-period Insights view matches the values
  computed directly from the seeded expenses.

## Definition of done

- [ ] `onExpenseWrite` maintains `dailyRollups`/`monthlyRollups` on every expense write
- [ ] `rebuildRollups` callable implemented and idempotent
- [ ] Insights reads rollups for past periods, cache for the current month
- [ ] Client-vs-rollup parity proven exactly in minor units
- [ ] `firestore.rules` denies client writes to both rollup collections
- [ ] `test:functions`, `test:rules`, `test`, `typecheck` all green
- [ ] `insights-rollups-parity` Maestro flow passes twice
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode is likely sufficient (one Function plus one
wiring point in the mobile app). Write `GATES.md` with an explicit
parity gate comparing cache-path and rollup-path outputs on identical data —
this is the single highest-value gate in this task, since a silent divergence
here would quietly corrupt what Insights shows for anything beyond the current
month.
