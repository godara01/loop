# 03 — Expenses

The core loop. Everything else in the app exists to make this happen more often.

## Target

**Under 10 seconds** from app foreground to a saved expense, on a mid-range
Android. That budget shapes every decision below: the amount pad is the first
thing focused, the category is one tap, and the date defaults to today.

## The expense record

Fields, as stored. Full schema in [08-data-model.md](08-data-model.md).

| Field | Required | Notes |
|---|---|---|
| `amount` | Yes | Integer minor units + currency. Must be **> 0**. |
| `categoryId` | Yes | FK to `categories`. Defaults to the most-used category of the last 30 days, else `OTHER`. |
| `occurredAt` | Yes | ISO instant. Defaults to now. The **local** date derived from it is what day-wise insights group on. |
| `description` | No | ≤ 80 chars. Empty renders as the category name in the ledger. |
| `note` | No | ≤ 500 chars, multiline. |
| `receiptUri` | No | Local file URI from `expo-image-picker`. Copied into app storage; the picker's cache URI is not durable. |
| `squadId` | — | Always `null` in v1. The column exists so Squads needs no migration. |
| `paidBy` | — | Always the local user in v1. |

v1 writes `splitMode: 'even'` with a single allocation to the local user, so
every row is already a valid `ExpenseLike` for
[`settle.ts`](../packages/shared/src/settle.ts) when Squads arrives.

## Add expense

**Route:** `/expense/new`, presented as a modal sheet over the current tab.

### Layout, top to bottom

1. **Amount display** — huge, `type.displayLg`, JetBrains Mono, currency symbol
   fixed at the left. This is the focal point.
2. **Category strip** — horizontally scrolling `MonoTag` chips, most-recently-used
   first, ending in a **+** chip that opens [the catalogue or a custom category](04-categories.md#tier-2--the-catalogue).
3. **Description** — single line, placeholder *"What was it?"*.
4. **Date** — a chip reading `TODAY`; tapping opens a compact picker with
   `Today` / `Yesterday` / pick-a-date.
5. **More** — collapsed by default, containing note and receipt.
6. **Save plate** — full-width `TactileButton`, accent `credit`.

### The number pad

A custom pad, not the system keyboard. Reasons: no layout shift, monospace
digits, and every key can carry its own haptic.

- Keys `0–9`, `.`, backspace, and a `⌫`-long-press to clear.
- Input is accumulated as a **string** and parsed with `parseAmount()` from
  [`money.ts`](../packages/shared/src/money.ts). Never accumulate a float.
- The decimal key is **hidden entirely for zero-decimal currencies** (`JPY`).
- Typing a second `.` is rejected with `warning`, not swallowed.
- More than `MINOR_DIGITS` fractional digits is rejected with `warning`.
- Amount `0` cannot be saved; pressing Save fires `warning` and shakes the
  amount (Reanimated, UI thread, ≤ 300ms).
- Haptics: `tap` per digit, `selection` on backspace, `warning` on rejection.

### Save

On Save, in order, in one Firestore batch:

1. Validate. Any failure aborts before writing and fires `error`.
2. Write the expense document.
3. Write today's check-in document (id = the local date, so it is idempotent).
4. Commit.

The batch resolves against the **local cache first**, so this completes with no
network. Coins are awarded by a Cloud Function reacting to those writes
([06-gamification.md](06-gamification.md)); the UI shows its own optimistic
prediction immediately and reconciles when the award lands.

Then: fire `expenseSaved`, dismiss the sheet, and let
the destination screen animate the new row in. If the streak advanced as a
result, fire `streakAdvance` **after** the sheet has dismissed — never stack two
haptics inside 150ms, they read as one mushy buzz.

If validation or the local write throws, the sheet stays open with everything the user typed
intact, an inline error appears, and `error` fires. Never dismiss on failure.

### Quick-add behaviours

- **Repeat last** — if an expense was logged in the last 10 minutes, a ghost chip
  offers *"Same as ₹120 · COFFEE"*; one tap prefills everything but the amount.
- **Amount memory** — reopening the sheet within 60s of an aborted entry restores
  the typed amount.

## Edit expense

**Route:** `/expense/[id]`, same sheet, pre-filled, primary action **Update**.

- Every field is editable **except** the currency.
- Editing `occurredAt` across a day boundary moves the expense in day-wise
  insights and MAY change a past day from zero-spend to spend. It MUST NOT
  retroactively change the streak or coins — see
  [06-gamification.md](06-gamification.md#backdating).
- Editing never awards coins.
- `updated_at` is bumped; `created_at` is immutable.
- Haptic: `expenseSaved` on update.

## Duplicate

From the detail sheet's overflow: copies every field, sets `occurredAt` to now,
opens as a new unsaved entry. Saves as a normal new expense (and so does award
coins). Haptic: `tap` to open, then the normal save path.

## Delete

**Soft delete.** Sets `deleted_at`; the row stays. This keeps a future sync layer
honest and makes undo trivial.

- Confirmation is required: a sheet with the amount and category restated.
- Deleted expenses vanish from ledger, insights and all totals immediately.
- A snackbar offers **Undo** for 6 seconds. Undo clears `deleted_at` and fires
  `tap`.
- **Deleting does not claw back coins**, and does not break a streak, even if it
  was the only expense on that day. Coins already earned are never revoked —
  see [06-gamification.md](06-gamification.md#restraint-rules).
- Hard deletion of documents soft-deleted over 90 days ago happens in a scheduled
  Cloud Function, which also removes their receipt files.
- Haptic: `warning` when the confirm sheet opens, `error` on the destructive
  confirm.

## Discarding

Dragging the sheet down or hitting back with **any** field dirty prompts
*"Discard this expense?"* with Discard / Keep editing. A pristine sheet dismisses
silently. Haptic: `warning` on the prompt, `tap` on discard.

## Receipts

- `expo-image-picker`, camera or library. Permission is requested **at the moment
  of use**, never at launch.
- The file is copied to app storage and uploaded to Cloud Storage at
  `receipts/{uid}/{expenseId}`; the document stores the **path**, not a URL.
  The local copy renders until the upload completes, so this works offline.
- One receipt per expense in v1.
- Deleting the expense (hard delete, after 90 days) deletes the file.
- Denied permission shows an inline note with a link to settings; it never blocks
  saving the expense.

## The Ledger

**Route:** `/(tabs)/activity`.

- Reverse-chronological, **grouped by local day**, with a sticky day header
  showing the date and that day's total in mono.
- Each row: category tag, description, time, amount. Amount is `colors.text` for
  personal spend — coral is reserved for debt, not for ordinary spending.
- Row tap → detail sheet. Row swipe-left → delete with the confirmation above.
- Search filters on description and category name. Filters: category, date range.
- Paginates 50 rows at a time; the list must stay smooth at 5,000 expenses.
- Haptics: `tap` on row, `dragStart` when a swipe passes the action threshold.

## Validation summary

| Rule | Failure behaviour |
|---|---|
| Amount > 0 | `warning`, shake, Save stays disabled-looking but pressable |
| Amount parses via `parseAmount` | Reject the keystroke, `warning` |
| Category exists and is not archived | Fall back to `OTHER`, silent |
| `occurredAt` not in the future | Clamp to now, `warning` |
| Description ≤ 80, note ≤ 500 | Hard-stop input at the limit, `warning` at the boundary |

Future-dated expenses are rejected outright in v1 — there is no forecasting, and
allowing them would corrupt "today's spend" on the Orbit screen.

## Implementation notes (Phase 1)

**The check-in does not share a batch with the expense.** The original plan
here batched them together, but check-ins are create-only in the security rules
([11-firebase.md](11-firebase.md)) — a *second* expense on the same day would
try to create an already-existing check-in document and fail the whole batch,
taking the expense down with it. The expense write stands alone; the check-in
and coins follow from the `onExpenseWrite` Cloud Function in Phase 4
([13-build-plan.md](13-build-plan.md)). Until that Function exists, saving an
expense does not yet bank a streak day.

**The entry sheet needs `KeyboardAvoidingView`, not just a bounded
`ScrollView`.** `app.json` sets `edgeToEdgeEnabled: true`, which stops Android
from auto-resizing the window when the keyboard opens — so a fixed footer
button (Save) can end up rendered off-screen, below the keyboard, with no
scroll able to reach it. Any screen with a fixed element below a text input
needs this. See [10-architecture.md](10-architecture.md#dev-build-only-hazards)
for the second, unrelated hazard this surfaced.

## Acceptance criteria

- [ ] Cold launch → saved expense in under 10s, measured on a mid-range Android.
- [ ] `1000 / 3` style inputs and every currency in `CurrencyCode` round-trip
      through `parseAmount` → store → `formatMoney` with zero drift.
- [ ] Force-quitting mid-entry loses the draft but never corrupts stored data.
- [ ] The whole add / edit / delete flow works in airplane mode, with no spinner.
- [ ] A failed save keeps the sheet open with input intact.
- [ ] Deleting the last expense of a day leaves the streak and coins untouched.
- [ ] Ledger scrolls at 60fps with 5,000 seeded expenses.
- [ ] No two haptics fire within 150ms of each other on any path in this doc.
