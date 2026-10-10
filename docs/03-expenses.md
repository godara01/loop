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

### Fields added after v1

All are **optional**, read with defaults, so v1 documents stay valid. The full
schema is in [08](08-data-model.md#transactions).

| Field | Release | Notes |
|---|---|---|
| `kind` | v1.2 | `expense` (default) / `income` / `refund` / `transfer` / mirror-only `settlement`, `loan`. See [17](17-money-in-and-out.md) |
| `accountId`, `toAccountId` | v1.2 | See [18](18-accounts.md). `toAccountId` is for transfers only |
| `refundOf` | v1.2 | The original expense id, for refunds |
| `createdLocalDate` | v1.1 | The device-local date **when the document was created**. The backdating rule uses it ([06](06-gamification.md#backdating)) |
| `merchant`, `merchantKey` | v1.2 (key) / v1.3 (field UI) | See [22](22-merchants-and-suggestions.md) |
| `tagIds` | v1.3 | ≤ 10 stable tag ids. See [21](21-tags.md) |
| `lines`, `categoryIds` | v1.3 | Split across categories, see [below](#split-across-categories) |
| `recurringId` | v1.4 | Set when approved from a recurring rule. The doc id is `rec_{ruleId}_{localDate}` ([20](20-recurring.md)) |
| `importId` | v1.6 | Set for imported rows. The doc id is `imp_{importId}_{row}` ([24](24-import.md)) |
| `groupId`, `groupRefId`, `paidMinor`, `direction`, `excludeFromSpend` | v1.5 | Squad mirrors only, server-written ([23](23-squads.md#mirrors)) |
| `schemaVersion` | v1.2 | `2` on every new write. Missing means 1 |

## Add expense

**Route:** `/expense/new`, presented as a modal sheet over the current tab.

### Layout, top to bottom

0. **Kind switch** (v1.2) — `Spend · Income · Transfer`, default Spend
   ([17](17-money-in-and-out.md#entry-the-kind-switch)).
1. **Amount display** — huge, `type.displayLg`, JetBrains Mono, currency symbol
   fixed at the left. This is the focal point.
2. **Category strip** — horizontally scrolling `MonoTag` chips, most-recently-used
   first, ending in a **+** chip that opens [the catalogue or a custom category](04-categories.md#tier-2--the-catalogue).
   From v1.3 the strip shows leaf categories by usage ([04](04-categories.md#sub-categories)).
3. **Account chip** (v1.2) — one chip, `HDFC ▾`, hidden until the user has an
   account ([18](18-accounts.md#entry-sheet-integration)).
4. **Description** — single line, placeholder *"What was it?"*.
5. **Date** — chips `TODAY` / `YESTERDAY` / `📅`; the last opens the
   [`DatePickerSheet`](#date) (v1.1).
6. **More** — collapsed by default. Contains the note, plus from v1.3 the
   merchant ([22](22-merchants-and-suggestions.md)), tags ([21](21-tags.md)) and
   **Split across categories** ([below](#split-across-categories)). The receipt
   photo is deferred.
7. **Save plate** — full-width `TactileButton`, accent `credit`.

Items 0, 3 and everything under More are optional, with defaults. The 10-second
path is still: amount → category → Save.

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

## Date

**v1.1.** It replaces the v1 chevron stepper over `daysAgo`.

### Chips

`TODAY` (default) · `YESTERDAY` · `📅 <date>`. The selected chip is lime with
Deep Void text. Haptic: `selection`.

### `DatePickerSheet`

A design-system component in `components/ui/date-picker-sheet.tsx`, with its pure
model in `components/ui/date-picker-model.ts`. It is used by entry, the ledger
filter, the Insights custom period, accounts' opening date and recurring rules.

```ts
interface DatePickerSheetProps {
  mode: 'single' | 'range';
  value: string | { start: string; end: string };   // YYYY-MM-DD, local
  onChange(value): void;
  allowFuture?: boolean;          // default false; true only for recurring rules
  minDate?: string;               // default '2000-01-01'
  maxRangeDays?: number;          // range mode; Insights passes 366
}
```

- A month grid, 7 columns, Monday first. Day numbers and the month title are in
  JetBrains Mono. Every cell has the 1.5px border; the selected day is a lime plate.
- ◀ ▶ step months, and a swipe does the same. Haptic: `selection`. The ▶ is
  disabled past the current month unless `allowFuture`.
- Future days are dimmed and not tappable unless `allowFuture`. Today has a lime
  1.5px outline.
- **Range mode:** the first tap sets the start, the second tap sets the end (and
  they swap if the end is before the start). The days in between are tinted. A
  range longer than `maxRangeDays` is refused with `warning`.
- **Jump:** tapping the month title opens a year/month grid (12 months × years
  from `minDate` to the current year).
- **Done** confirms and **Cancel** discards. Dragging the sheet down cancels.

### What a picked date writes

The draft stores **`localDate`** (`YYYY-MM-DD`), not `daysAgo`. On save,
`occurredAt` is built by `composeOccurredAt(localDate, timeOfDay)`:

- **New entry, date = today:** `occurredAt = now`.
- **New entry, past date:** that local date at the **current local wall-clock
  time**. It is built from local `y, m, d, h, min` with the platform's local-time
  constructor, never as `now − n × 86_400_000`, which drifts by an hour across DST.
- **Edit, date unchanged:** the original `occurredAt` is kept.
- **Edit, date changed:** the new date with the **original time of day**.
- **Nonexistent local time** (a spring-forward DST gap): it moves forward to the
  first valid minute. **Repeated local time** (fall-back): the first occurrence.
- `localDate` is always re-derived from the final `occurredAt` with `localDateOf`,
  so the two can never disagree.

The rule *"`occurredAt` not in the future → clamp to now, `warning`"* still holds
for entry. `allowFuture` exists only for recurring rule dates, which are not
transactions.

### Edge cases

| Case | Behaviour |
|---|---|
| A date before `minDate` | Not reachable in the grid |
| Device date or time zone changes while the sheet is open | `today` is computed once when the sheet opens. Re-validated on Save |
| An entry dated 3 years ago | Allowed. Backdating means no coins or streak ([06](06-gamification.md#backdating)) |
| JPY or other currencies | Not relevant here. Dates are currency-agnostic |

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

> **Deferred (owner decision, 2026-10-10).** Not built in v1 or in v1.1–v1.6. The
> `receiptPath` field, the Storage rules and the 90-day cleanup stay, so this
> section can be built later as written. OCR is out of scope with it
> ([00](00-product.md#explicit-non-goals)).

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
- Search filters on description and category name, plus merchant and tag name
  from v1.3. The filters are specified in [Ledger filters](#ledger-filters) (v1.1).
- Rows render per kind ([17](17-money-in-and-out.md)): income with a lime `+`,
  transfers as `HDFC → Cash` with `MOVE`, refunds with `REFUND`, and squad mirrors
  with a `◇ SQUAD` badge.
- Paginates 50 rows at a time; the list must stay smooth at 5,000 expenses.
- Haptics: `tap` on row, `dragStart` when a swipe passes the action threshold.

## Split across categories

**v1.3.** One receipt often covers several categories, like a supermarket run of
groceries plus household items. **More → Split across categories** turns the
single category into **lines**:

- Each line has a category chip and an amount, edited on the same amount pad
  through a line selector. The first line starts with the full amount in the
  category already chosen.
- **+ Line** adds a line with ₹0 (max **10** lines). A mono *"₹120 left to
  assign"* counter shows `total − sum(lines)`. **Save is disabled until it reads
  ₹0.** Pressing Save anyway fires `warning` and shakes the counter.
- **Fill remainder** on a line puts the whole remaining amount on it.
- Removing lines back down to one collapses to a normal single-category
  transaction (`lines: null`).

Stored as:

```ts
lines: { categoryId: string; amountMinor: number }[] | null;   // null when single
categoryIds: string[];   // derived: the distinct line categories, for array-contains queries
categoryId: string;      // derived: the line with the largest amount; ties → the earliest line
```

- `sum(lines.amountMinor) == amountMinor` exactly. `validateLines()` in shared
  throws otherwise, the converter rejects it on read, and rules check
  `lines.size() <= 10`. Rules can't sum.
- `categoryId` stays meaningful, so every v1 query, index and screen that reads a
  single category still works. It shows the "main" category.
- **Rollups and Insights apply per line** ([05](05-insights.md), [11](11-firebase.md#rollups-v2)).
  Filtering the ledger by a category matches any line, using `categoryIds
  array-contains`.
- **Editing the total** of a split transaction scales the lines proportionally with
  `allocate()` (largest-remainder), and shows a hint to check them.
- **Refunds** of a split transaction are apportioned across its lines
  ([17](17-money-in-and-out.md#refunds)).
- **Income** can't be split in v1.3. Transfers have no category.
- The ledger row shows the main category tag plus `+N`, and the detail sheet lists
  every line.

Haptics: `selection` on line focus, `warning` on Save with a remainder,
`expenseSaved` on Save.

## Ledger filters

**v1.1.** Facets are added in later releases. It replaces the route-param-only
filtering of v1, where Insights drill-downs passed `categoryId`, `date`,
`startDate` and `endDate`.

### Model

A pure, extensible predicate model in `features/expenses/model/ledger-filter.ts`:

```ts
interface LedgerFilter {
  readonly text: string;                         // search: description, merchant, category name, tag name
  readonly dateRange: { start: string; end: string } | null;
  readonly categoryIds: readonly string[];       // empty = all; a parent includes its children (v1.3)
  readonly amountMin: number | null;             // minor units, inclusive
  readonly amountMax: number | null;
  readonly sources: readonly ExpenseSource[];    // manual, sms, group, import (+ recurring derived from recurringId)
  readonly kinds: readonly TransactionKind[];    // v1.2
  readonly accountIds: readonly (string | 'none')[];  // v1.2
  readonly tagIds: readonly string[];            // v1.3
  readonly merchantKey: string | null;           // v1.3
}
function matches(filter, tx, ctx): boolean;      // pure
function serverQueryFor(filter): ServerQuery;    // picks the ONE indexed constraint (below)
function isEmpty(filter): boolean;
```

The filter lives in a Zustand store (`core/state/ledger-filter-store.ts`) and
persists for the session. It is not saved across launches, because a ledger that
opens filtered would confuse people.

### The filter sheet (`/ledger/filter`)

- Sections: **Date** (presets: This month, Last month, Last 30 days, This year,
  Custom → `DatePickerSheet` range), **Category** (multi-select tags, parents
  expandable), **Amount** (min/max mono fields), **Source**, then in later releases
  **Type**, **Account**, **Tags** and **Merchant**.
- **Apply** shows a live count where it can be computed (date range set). **Reset**
  clears all.
- Haptics: `selection` per toggle, `press` on Apply.

### In the ledger

- A row of **active filter chips** under the search field. Each chip has ✕ to
  remove that facet, and **Clear all** sits at the end.
- A summary line: *"42 transactions · ₹18,240 spent · ₹5,000 in"*. It shows spend
  and income separately and never adds them together.
- **Insights drill-downs** (category row, day cell, tag) set the store and
  navigate to the Ledger, instead of passing route params.

### Query strategy

Firestore can use **one** `array-contains` per query, `in` and
`array-contains-any` take at most 30 values, and inequality filters on more than
one field need composite indexes that multiply quickly. So:

1. **The server query** always has `deletedAt == null` and **at most one** of the
   following, chosen in this priority order by `serverQueryFor`:
   - `localDate` range (when a date range is set). This is always picked if
     present, because it bounds the read;
   - plus **one** equality or array constraint from: a single `categoryIds
     array-contains`, `kind ==`, `accountId ==`, a single `tagIds array-contains`.
2. **Everything else runs on the client** with `matches()`.
3. **With a date range:** the range query loads every match in the range, using
   the existing `observeExpensesInRange`. Counts and totals are **exact**.
4. **Without a date range:** paged scan. Load 50 at a time, newest first, keep the
   rows that match, and continue until **50 matches** or **10 pages (500 rows)**.
   Then stop and show *"Scanned back to 12 Mar 2026 — load more"*. Counts and
   totals are prefixed with **≥** because they are incomplete. This keeps the
   no-unbounded-queries rule ([11](11-firebase.md#cost-and-scale)).

Indexes needed: `expenses` on `deletedAt, categoryIds (array), localDate DESC`;
`deletedAt, kind, localDate DESC`; `deletedAt, accountId, localDate DESC`;
`deletedAt, tagIds (array), localDate DESC` ([11](11-firebase.md#indexes)).

### Edge cases

| Case | Behaviour |
|---|---|
| A filtered category is archived | Still filterable. It shows in the sheet under *Archived* |
| A parent category selected | Matches the parent and all its children |
| `amountMin > amountMax` | Apply is disabled, with an inline note |
| Search text with a filter | Both apply (AND) |
| Filter result is empty | *"Nothing matches these filters."* + **Clear all** |
| A transaction edited out of the filter while viewed | It disappears on the next snapshot. No ghost row |

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
- [x] `1000 / 3` style inputs and every currency in `CurrencyCode` round-trip
      through `parseAmount` → store → `formatMoney` with zero drift.
      (proof: packages/shared/src/__tests__/money-roundtrip.test.ts — all five
      currencies, parse → Firestore doc → formatMoney → parse, plus 1000 split three ways)
- [ ] Force-quitting mid-entry loses the draft but never corrupts stored data.
- [ ] The whole add / edit / delete flow works in airplane mode, with no spinner.
- [ ] A failed save keeps the sheet open with input intact.
- [ ] Deleting the last expense of a day leaves the streak and coins untouched.
- [ ] Ledger scrolls at 60fps with 5,000 seeded expenses.
      *(2026-09-28, Loop_API35, dev build `6d928d7b`: 23ms median / 31ms p90 /
      46ms p99 frames, 2.3% janky, over 20 flings. The emulator's own Settings app
      scrolls at 20ms median (GPU 18ms), so 60fps is unmeasurable here — needs
      the mid-range phone.)*
- [x] No two haptics fire within 150ms of each other on any path in this doc.
      (proof: apps/mobile/src/lib/haptic-schedule.ts, applied to every `haptic()` call;
      haptic-schedule.test.ts › "never lets any two starts be closer than the gap")

### Acceptance criteria added after v1

- [ ] (v1.1) Any past date back to 2000-01-01 can be picked, and the future can't,
      in entry.
- [ ] (v1.1) Editing an expense's date keeps its time of day, including across a
      DST change (pure test in a DST time zone).
- [ ] (v1.1) `localDate` always equals `localDateOf(occurredAt)` for every write
      path (property test).
- [ ] (v1.1) Every filter facet narrows the ledger correctly (pure tests for
      `matches`), and a date-ranged filter's count and total equal `insights.ts`
      for the same range.
- [ ] (v1.1) A filter with no date range never reads more than 500 documents
      before asking to load more.
- [ ] (v1.3) Split lines always sum to the total. Editing the total rescales the
      lines exactly. Rollups count each line in its own category.
- [ ] (v1.3) Categories in a split transaction are matched by the ledger
      category filter.
