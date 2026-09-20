# Task 14 — Phase 6 (M8): empty states, accessibility, perf re-check

**Depends on:** Tasks 10, 11, 12, 13 (this is the sweep across everything M8
added, plus a final pass over the whole app)

## Objective

The last non-manual item in M8 before the final integration gate (Task 15):
empty states, accessibility labels, font scaling, error states, and a
full-app performance re-check at 3,000 expenses, per
`docs/13-build-plan.md#m8--hardening-and-release`.

## Context

Read `docs/02-onboarding.md#empty-states-after-onboarding` for the canonical
empty-state copy table (Orbit, Ledger, Insights, Insights-thin-data, Inbox) —
this task confirms every one of those still renders correctly after all of
Phase 5/6's changes, and extends the same pattern to any new surfaces Phase 5
added (the SMS inbox already has its empty state from Task 8; verify it
matches the copy in `docs/12`). Read `CLAUDE.md`'s "Tactile Neo-Fin" design
rules — JetBrains Mono for every number, 1.5px borders, no blurred shadows —
accessibility work must not violate the fixed design system (e.g. don't
introduce a light-mode fallback for accessibility; the product is dark-mode
only by design).

## Flow

1. **Empty states**: walk every screen (Orbit, Ledger, Insights, Inbox,
   Categories catalogue/manage, Coins history, You) with a fresh/empty
   account and confirm each shows real, on-brand copy — not a spinner, not a
   blank screen, not placeholder Lorem-ipsum-style text.
2. **Accessibility labels**: every interactive element needs both a `testID`
   (already a stated convention per `docs/15`'s groundwork section — "testID
   on every interactive element") and a proper accessibility label/role for
   screen readers. Audit the whole `apps/mobile/src/app` and
   `apps/mobile/src/features/*` tree for missing ones, prioritizing anything
   built in Phase 4/5/6 (onboarding, gamification, inbox) since those are the
   newest and least likely to have been audited yet.
3. **Font scaling**: verify the app remains usable (no clipped text, no
   overlapping elements) at the largest system font-scale setting on the
   emulator — JetBrains Mono numeric columns must not shift or truncate.
4. **Error states**: every network-dependent action (expense save while
   genuinely offline past the cache boundary, SMS backfill failure, CSV
   export failure, reset failure) must show a real error state, not a silent
   failure or an infinite spinner. Cross-reference Task 12's reset-app error
   handling and Task 6's SMS backfill — confirm both have one.
5. **Perf re-check**: re-run the M3 ledger-scroll perf test (5,000 expenses)
   and the M5 Insights perf test (3,000 expenses, <300ms) against the
   fully-loaded M8 build (with rollups, App Check, Crashlytics all active) to
   confirm none of Phase 6's additions regressed them. App Check token
   fetching in particular is a plausible source of new latency on cold start —
   measure cold-start time before and after this task's changes if it wasn't
   already measured in Task 13.

## Edge cases to handle

- Long category names / long merchant names (from SMS `displayHint`) must not
  break any card layout — check the specific 1.5px-border, hard-offset-shadow
  card components with intentionally long strings.
- RTL is out of scope (not in `docs/00-product.md`'s v1 scope) — don't build
  for it, but don't let font-scaling or accessibility changes accidentally
  assume LTR-only layout math that would make RTL harder later than it needs
  to be; this is a "don't paint into a corner," not a "build it now."
- A screen reader walking the entry sheet, the inbox cards, and the onboarding
  steps must be able to complete each flow — these are the three most
  interaction-dense surfaces in the app and the most likely to have
  accessibility gaps.

## Files owned

Broad but shallow — small edits (accessibility props, empty-state copy fixes,
error-state components) across many files rather than new features. Don't use
this task as cover for a larger refactor; if a genuine structural fix is
needed, note it and keep the diff to what's actually required for this task's
Definition of Done.

## Testing

- Manual walkthroughs: empty-state audit, font-scale audit, screen-reader
  audit on the three flows named above — these are manual gates, record what
  was checked.
- Perf: `test:perf` (existing ledger-scroll perf script) and the Insights perf
  measurement from Task 2, both re-run and confirmed against their original
  budgets.
- `npm run typecheck && npm test` after any code changes.

## Definition of done

- [ ] Every empty state from `docs/02`'s table (plus Inbox) verified correct on a fresh account
- [ ] `testID` and accessibility label/role present on every interactive element added since M3
- [ ] App usable at maximum system font scale, no clipping or overlap
- [ ] Every network-dependent action has a real error state, none silently fail
- [ ] 5,000-expense ledger scroll and 3,000-expense Insights render perf both re-confirmed against budget
- [ ] `npm run typecheck && npm test` green
- [ ] One commit

## Working method

Use the `unlazy` skill. This task is broad (many small checks across the
whole app) — orchestrated mode with a few leaves (e.g. one leaf per audit
type: empty-states, accessibility, perf) is reasonable if the scope feels too
large for one `GATES.md`; otherwise solo mode with one gate per bullet in the
Definition of Done above is fine. Either way, don't let "walked most of the
screens" count as done for the accessibility gate — the gate is "every
interactive element," so audit against an actual enumerated list of screens,
not a sample.
