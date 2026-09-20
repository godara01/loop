# Task 8 — Phase 5 (M7): inbox UI, Orbit badge, permissions UX

**Depends on:** Task 5 (parser), Task 6 (native module + Remote Config), Task 7
(rules + repository) — this is the integration leaf, it needs all three
contracts in place.
**Blocks:** Task 9

## Objective

Build the user-facing half of SMS ingestion: the inbox screen, the Orbit badge
that surfaces it, and the permission explainer flow. The empty
`apps/mobile/src/features/inbox/` directory exists but has no files — this
task fills it in.

## Context

Read [`docs/12-sms-ingest.md`](../12-sms-ingest.md) sections "The inbox" and
"Permissions UX" in full. Read
[`docs/01-information-architecture.md`](../01-information-architecture.md) for
where `/inbox` sits in navigation. Read `apps/mobile/src/lib/haptics.ts` for
the semantic haptic layer — **never import `expo-haptics` directly in a
component**, per `CLAUDE.md`.

## Flow

1. **Route:** `/(tabs)/index` (Orbit) shows a badge with a count when pending
   items exist, linking to `/inbox`.
2. **Inbox screen** (`app/inbox.tsx` + `features/inbox/screens/*`): cards
   newest-first, grouped by day. Each card shows amount (large, mono),
   merchant, masked account (`displayHint`), time, and a required category
   chip the user must pick before approving (MVP has no
   auto-suggestion — `suggestedCategoryId` is always null).
3. **Card actions**, each backed by Task 7's repository functions:

   | Action | Result | Haptic |
   |---|---|---|
   | Approve | `approvePendingExpense` | `expenseSaved` |
   | Edit & approve | opens the normal entry sheet pre-filled, then saves | `expenseSaved` |
   | Dismiss | `dismissPendingExpense` | `destructive` |
   | Approve all | only enabled when every card has a category chosen; confirms with a count first | `expenseSaved`, once |

4. **Empty state**: *"Transaction messages will show up here for you to
   approve."*
5. **Permissions UX** (`app/settings/auto-capture.tsx` or equivalent under
   **You**): an explainer screen stating plainly *"Loop reads only transaction
   messages from banks, on your device. Nothing is uploaded, and nothing is
   added without your approval."* — only from here, or from a one-time card on
   Orbit shown after the third manual expense, does `requestPermissions()`
   (Task 6) actually get called. **Never at launch.**
6. **On grant**: kick off the 30-day backfill (`getRecentSms` from Task 6),
   run each message through Task 5's parser + dedupe, write surviving results
   as pending expenses via Task 7's `createPendingExpense`.
7. **Paste to parse**: an affordance in the inbox to paste a copied transaction
   message as text, run it through the same `parseTransactionSms`, and create
   a pending expense the same way as a live SMS (`source: 'pasted'`). This is
   the primary manual path and the one path that also works on iOS builds
   (which have no SMS access at all — see `docs/12`'s platform table). Android
   share-intent and the iOS share extension are explicitly out of scope here
   (stretch goal / post-MVP per `docs/12`).

## Edge cases to handle

- **Denial is permanent-friendly**: the explainer/card never asks twice, and
  everything else keeps working. Don't add a "remind me later" nag loop.
- **Approving a backdated message must not fill in a past streak day** — this
  is enforced server-side by the M6 `onExpenseWrite`/`onCheckInCreate`
  Functions already (Task 3 verified it), so this task just needs to not add
  any client-side streak/coin logic that could disagree with the server.
- **Approving several at once uses the same daily coin cap as manual entry**
  — again enforced server-side; this task must not try to compute or preview
  a different cap for the batch case.
- **iOS builds must contain zero SMS code or permission declarations** — gate
  any import of Task 6's native module behind a platform check so an iOS
  bundle never references it; the paste-to-parse path is what iOS gets
  instead.
- The Orbit badge count must reflect only `status: 'pending'` items, never
  approved/rejected/expired ones.
- "Approve all" must be disabled (not just silently no-op) until every visible
  card has a category chosen — this mirrors the contract Task 7's repository
  already enforces server-side; the UI should match it, not rely on the
  repository call failing as the only signal.

## Files owned

`apps/mobile/src/app/inbox.tsx`,
`apps/mobile/src/features/inbox/{screens,hooks,components}/*`,
`apps/mobile/src/app/(tabs)/index.tsx` (Orbit badge only — don't restructure
the rest of Orbit), `apps/mobile/src/app/settings/auto-capture.tsx`. Do not
touch `packages/shared/src/sms/*`, `apps/mobile/modules/sms-reader/*`, or
`apps/mobile/src/features/inbox/api/*` — those are Tasks 5/6/7's ownership;
import from them, don't duplicate their logic.

## Testing

- L1: any pure UI-state logic (e.g. "which cards are eligible for approve
  all") as a pure model file under `features/inbox/model/`, tested with
  `npm test`.
- L4 flows (write these; none exist yet in `e2e/flows/` for SMS):
  - `sms-debit-approve` — inject a debit SMS via `adb emu sms send`, approve
    from the inbox, confirm ledger + server doc with `source: 'sms'`.
  - `sms-otp-ignored` — inject an OTP message, confirm no pending item appears.
  - `sms-duplicate-single-card` — inject bank + card-network duplicates,
    confirm one card.
  - `sms-manual-suppresses` — log a manual expense, then inject a matching
    SMS within 30 minutes, confirm no duplicate pending item.
  - `sms-dismiss` — dismiss a card, confirm it never reappears and the
    ledger/totals are unaffected.
  - `sms-kill-switch` — flip `smsIngestEnabled` off, confirm capture stops.
  - `sms-paste-parse` — paste a transaction message text, confirm the same
    pending-expense flow as a live SMS.
  - `sms-privacy` — after a full session, scan every document in the emulator
    (via its REST API) and assert none contains the raw SMS text anywhere.
  First verify `adb emu sms send` accepts the alphanumeric DLT sender format
  before writing these — if it doesn't (see Task 6's note), use the
  `__DEV__`-only numeric-sender fallback consistently across all these flows.

## Definition of done

- [ ] Inbox screen, Orbit badge, and permissions explainer implemented per the flow above
- [ ] Paste-to-parse works and is exercised by `sms-paste-parse`
- [ ] All 8 Maestro flows listed above pass twice consecutively
- [ ] iOS build path confirmed to reference zero SMS-native code (build or grep-based check)
- [ ] `npm run typecheck && npm test` green
- [ ] One commit

## Working method

Use the `unlazy` skill, orchestrated mode is optional here (this is one
integration leaf pulling together three finished dependencies, likely small
enough for solo mode with one `GATES.md`) — but given 8 Maestro flows, budget
a gate per flow rather than one combined "e2e passes" gate, so a single flaky
flow doesn't hide behind an aggregate pass.
