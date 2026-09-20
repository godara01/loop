# Task 12 — Phase 6 (M8): CSV export & Reset app

**Depends on:** Task 9 (Phase 5 closed); calls into Task 11's `onUserDelete`
for the reset path, so land Task 11 first if working sequentially — if working
in parallel, coordinate the `onUserDelete` callable's signature with whoever
has Task 11 before wiring the reset button to it.
**Independent of:** Tasks 10, 13

## Objective

Add the two **You** screen features `docs/13-build-plan.md` places in M8:
**Export CSV** (a pure builder/parser in `packages/shared`) and **Reset app**
(typed-confirmation destructive flow already specified in `docs/02-onboarding.md`).

## Context

Read [`docs/02-onboarding.md#re-onboarding-and-reset`](../02-onboarding.md)
for the exact reset behavior and confirmation pattern (typed "RESET", `error`
haptic on confirm, no silent path, anonymous user deleted / linked user signed
out). Read `docs/08-data-model.md` for the `Expense` shape the CSV export
walks. There's a precedent for the typed-confirmation UI pattern in
`docs/04-categories.md`'s destructive actions — match that pattern rather than
inventing a new confirmation component.

## Flow

### CSV export

1. `packages/shared/src/csv.ts` (new): a pure builder
   `buildExpensesCsv(expenses: Expense[]): string` and a matching parser
   `parseExpensesCsv(csv: string): Expense[]` used only by the round-trip
   test — the parser isn't a re-import feature in v1, it exists purely to
   prove the export is lossless.
2. Columns: everything needed to reconstruct an expense exactly —
   `occurredAt`, `localDate`, `amountMinor`, `currency`, `categoryId`,
   `description`, `note`, `source`. **Money stays in integer minor units in
   the CSV**, per `CLAUDE.md`'s "money is never a float" rule — do not export
   a formatted decimal amount as the source of truth column (a human-readable
   major-unit column alongside it is fine, but `amountMinor` must be the exact,
   round-trippable one).
3. **You → Export CSV**: builds the file from the user's full expense history
   (excluding soft-deleted), writes it via `expo-file-system`, and shares it
   via `expo-sharing` (both are Phase 6's native rebuild #3 per `docs/15`'s
   native rebuild schedule — confirm they're installed before this task
   starts writing code against them).

### Reset app

1. **You → Reset app**: typed confirmation requiring the user to type "RESET"
   exactly (case-sensitive per the pattern in `docs/02`), `error` haptic
   fires on confirm, no other path skips the typing step.
2. On confirm: call Task 11's `onUserDelete` Function to delete the Firestore
   subtree and Storage prefix, clear the local Firestore cache/persistence,
   and route back to `/onboarding` step 1.
3. **A linked account is signed out; an anonymous one is deleted outright** —
   branch on the auth state (`docs/02`'s exact wording) rather than always
   doing one or the other.

## Edge cases to handle

- **CSV round trip must be byte-identical in `amountMinor`** for every
  expense, including edge amounts (zero-fraction currencies like JPY, large
  lakh-range INR amounts, negative-impossible but boundary values near
  `Number.MAX_SAFE_INTEGER` if the money type allows it) — this is a named
  acceptance test in `docs/13`'s M8 test list.
- Export must exclude soft-deleted expenses and pending (unapproved) ones —
  the CSV should reflect exactly what the ledger shows, not the raw
  collection.
- Reset must be **complete**: after it, the app should look exactly like a
  fresh install — no residual local cache showing stale data, no residual
  Firestore documents (this is exactly what Task 11's `onUserDelete`
  enumeration exists to guarantee — this task's job is calling it correctly,
  not re-verifying its completeness, but do confirm the call actually
  succeeds and blocks navigation until it does, since a reset that navigates
  away before the delete finishes could look successful while data survives).
- No silent failure path: if the export or the reset Function call fails
  (offline, permission error), show a real error state, not a spinner that
  quietly gives up — reset in particular must never appear to succeed when it
  didn't, given how destructive it is.
- Reset while offline: decide and document the behavior (likely: reset
  requires connectivity, since it needs the server-side delete to actually
  run — surface a clear "reset needs a connection" state rather than clearing
  only the local cache and leaving server data behind).

## Files owned

`packages/shared/src/csv.ts`, `apps/mobile/src/features/you/screens/export-csv.tsx`
(or wherever the You screen's sub-screens live — check
`apps/mobile/src/features/` naming conventions before creating a new
directory), `apps/mobile/src/features/you/screens/reset-app.tsx`,
`e2e/flows/export-csv.yaml`, `e2e/flows/reset-app.yaml`.

## Testing

- L1: CSV round-trip test in `packages/shared/src/__tests__/csv.test.ts`,
  covering the edge-amount cases above.
- L4: `export-csv` flow — trigger export, pull the file (Maestro can read
  device files via `adb pull` in a `runScript` step), re-parse it, confirm
  amounts match the seeded fixture exactly. `reset-app` flow — reset, confirm
  landing back on onboarding step 1, confirm via the emulator's REST API that
  the user's Firestore subtree is empty.

## Definition of done

- [ ] `buildExpensesCsv`/`parseExpensesCsv` implemented, round-trip tested including edge amounts
- [ ] Export CSV wired into You, excludes soft-deleted and pending expenses
- [ ] Reset app requires typed "RESET", fires `error` haptic, branches correctly on anonymous vs linked auth
- [ ] Reset calls `onUserDelete` and blocks navigation until it completes or surfaces a real error
- [ ] `export-csv` and `reset-app` Maestro flows pass twice
- [ ] `npm test`, `npm run typecheck` green
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. Write `GATES.md` with the CSV round-trip
gate stated as an exact-equality check on `amountMinor` across every seeded
edge case, not a "looks right" spot check — money bugs are exactly the kind of
thing that survive a casual pass and this project's non-negotiable rule
(`CLAUDE.md`: "money is never a float") deserves a gate that can't be
satisfied by an off-by-rounding-error export.
