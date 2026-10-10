# 20 — Recurring Transactions and Subscriptions

> **Release:** v1.4 (Phase P4 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `RC*` in [`TASKS.md`](../TASKS.md).

Rent, Netflix, a gym membership, an EMI and salary repeat on a schedule. Loop
remembers the schedule and **proposes** each occurrence in the inbox when it is
due. The user approves it with one tap, exactly like an SMS proposal.

## The rule this doc never breaks

**Nothing enters the ledger without a human tap**
([00](00-product.md#design-principles), principle 5). A recurring rule never
writes a transaction by itself. Auto-logging would remove the habit the app
exists to build, and would put money into the ledger that the user never saw.
Rent that was not paid this month must not appear as paid.

## The rule document

`users/{uid}/recurring/{ruleId}`, written by the client:

```ts
interface RecurringRule {
  readonly id: string;
  readonly template: {
    readonly kind: 'expense' | 'income';    // transfers MAY come later; not v1.4
    readonly amountMinor: number;           // > 0, ledger currency
    readonly categoryId: string;
    readonly accountId: string | null;
    readonly description: string;           // ≤ 80, e.g. "Rent"
    readonly merchant: string | null;
    readonly tagIds: readonly string[];
  };
  readonly frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  readonly interval: number;                // 1..12 — "every 2 weeks" = weekly × 2
  readonly startDate: string;               // YYYY-MM-DD, the first occurrence, also the anchor
  readonly endDate: string | null;          // inclusive; null = forever
  /** Local date the rule was paused; null = active. */
  readonly pausedAt: string | null;
  /** Occurrences the user dismissed, as a map so offline writes merge. */
  readonly skipped: Readonly<Record<string /* YYYY-MM-DD */, true>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
```

## Occurrences are computed, not stored

There is **no stored proposal document** for a recurring occurrence. The inbox
derives what is due on every render, from the rules plus the ledger. The function
is pure:

```ts
// packages/shared/src/recurring.ts
function occurrences(rule, fromDate, toDate): string[];            // local dates, inclusive
function dueOccurrences(rules, today, existingIds: Set<string>): DueItem[];
function occurrenceId(ruleId, localDate): string;                  // `rec_${ruleId}_${localDate}`
```

`dueOccurrences` returns, for each rule with `pausedAt == null` and `deletedAt == null`, every
occurrence date `d` where:
- `today − 30 days < d ≤ today`, and
- `d ≥ startDate`, and `d ≤ endDate` if one is set, and
- `skipped[d]` is not set, and
- no transaction with id `rec_{ruleId}_{d}` exists. That transaction could be
  live or soft-deleted. Both count as "handled".

### Why not store proposals in `pendingExpenses`?

Generating stored documents on the client creates multi-device races. Two offline
phones would both create the same proposal, or one phone would re-create a
proposal that the other already approved. Deterministic ids can't fix that,
because the documents carry device timestamps and diverge. Virtual proposals have
no such state:

- **Approve** writes the transaction with the **deterministic id**
  `rec_{ruleId}_{d}`. If two devices approve the same occurrence offline, both
  write the same document id. The second sync is an update, last write wins, and
  there is exactly one transaction. Coins fire only on the Function's *create*
  path, so they fire once.
- **Dismiss** writes the field path `skipped.{d}: true` on the rule. It is a merge
  on a map, so it is safe offline and idempotent.
- A 30-day window means anything older is never proposed. That lines up with the
  30-day expiry of SMS proposals ([12](12-sms-ingest.md)).

The "existing ids" set comes from a bounded query: transactions where
`recurringId != null` and `localDate` is in the window. It uses the
`deletedAt`-independent index `recurringId, localDate`, so a soft-deleted
occurrence still counts as handled. **Deleting an approved recurring transaction
does not bring the proposal back.**

## Schedule maths

All arithmetic is on **local `YYYY-MM-DD` dates**. There are no instants and no
time zones, so DST can never move an occurrence.

| Frequency | Occurrence `n` (n = 0, 1, 2…) |
|---|---|
| `daily` | `startDate + n × interval` days |
| `weekly` | `startDate + n × 7 × interval` days |
| `monthly` | Month `startMonth + n × interval`, day = **min(anchorDay, last day of that month)** |
| `yearly` | Year `startYear + n × interval`, same month, day = min(anchorDay, last day of the month) |

**The anchor is `startDate`'s day, every time. It never drifts.** A rule starting
Jan 31 gives Jan 31 → Feb 28 (or 29) → **Mar 31** → Apr 30. Computing each month
from the previous occurrence would drift to the 28th forever.

Yearly on Feb 29 gives Feb 28 in non-leap years and Feb 29 in leap years.

Unit tests MUST cover: month-end anchoring across a whole year, leap and non-leap
Feb 29, `interval > 1`, the `endDate` boundary (inclusive), `startDate` in the
future (nothing due), and a window that spans a year boundary.

## The inbox

Recurring proposals appear in the existing inbox ([12](12-sms-ingest.md#the-inbox))
in their own **Due** group, above SMS items:

```
DUE
┌──────────────────────────────────────────┐
│ RENT · HDFC                   ₹25,000.00 │
│ Due today · monthly                      │
│ [ Approve ]  [ Edit amount ]  [ Skip ]   │
└──────────────────────────────────────────┘
```

| Action | Effect | Haptic |
|---|---|---|
| **Approve** | Writes the transaction `rec_{ruleId}_{d}` from the template, with `recurringId`, `localDate = d`, `occurredAt = d at 12:00 local` (local noon, never inside a DST gap) and `source: 'manual'` | `expenseSaved` |
| **Edit amount** | Opens the entry sheet in `approve` mode, pre-filled. Saving writes the same deterministic id. The rule's template is **not** changed. The sheet offers *"Also update the rule from now on"* as an unchecked box | `tap` |
| **Skip** | Writes `skipped.{d}: true` | `destructive` |

- The inbox badge ([U3](../TASKS.md)) counts due recurring items plus pending SMS.
- **Approve all** includes due recurring items. It writes one batch, and fires
  `expenseSaved` once.

### When it shows up

`dueOccurrences` runs whenever the inbox or the Orbit badge renders. The rules are
cached and the window query is bounded, so it costs no network. Nothing is
scheduled in the background. If the phone is off for a week, the due items are
there when the user next opens the app.

The optional **"Recurring due" local notification** is in
[25-notifications.md](25-notifications.md#recurring-due).

## Coins and streak

| Event | Banks the day | `expense_logged` coins |
|---|---|---|
| Approve a recurring occurrence | **Yes**, it was a deliberate tap | **No**, otherwise a daily rule would farm coins |
| Approve an occurrence dated in the past | No, the [backdating rule](06-gamification.md#backdating) applies | No |
| Skip | No | No |

The `onExpenseWrite` trigger knows a doc is recurring from `recurringId != null`
([06](06-gamification.md#what-counts)).

## Screens

### `/recurring` (You → Recurring)

- Two sections: **Subscriptions & bills** (kind `expense`) and **Income**.
- Each row shows description, tag, amount, a human schedule (*"Monthly on the
  31st"*, *"Every 2 weeks"*) and the next due date.
- Header: **Monthly equivalent**, the sum of expense rules normalised to a month.
  `monthlyEquivalent(rule)`: daily ×365/12, weekly ×52/12, monthly ÷interval,
  yearly ÷(12×interval). Each is computed in minor units with **largest-remainder
  rounding over the set**, so the sum of the parts equals the displayed total.
  The label reads *"≈ ₹4,312 / month"*. The ≈ is honest about the averaging.
- Paused rules are listed dimmed, with a `PAUSED` tag.

### `/recurring/new` and `/recurring/[id]`

- The template fields use the same controls as the entry sheet: amount pad,
  category strip, account chip, description, and tags under More.
- **Repeats**: four plates (daily / weekly / monthly / yearly) and an "every N"
  stepper.
- **Starts**: `DatePickerSheet` with **`allowFuture: true`**, so a rule can start
  next month.
- **Ends**: Never / On date (`allowFuture: true`, ≥ start).
- A preview line: *"Next: 31 Oct, 30 Nov, 31 Dec"*.
- Overflow: **Pause / Resume**, **Delete** (soft, `deletedAt`).

### Creating a rule from an existing transaction

The expense detail overflow menu has **Make recurring…**, which opens
`/recurring/new` pre-filled with the template, and `startDate` set to the
transaction's date plus one interval. This is the main way rules get created.
The transaction itself is not linked to the rule, because it was not approved
from it.

## Data and rules

| Path | Writer | Rules |
|---|---|---|
| `users/{uid}/recurring/{id}` | Client | Owner read/write. `frequency` in the set. `pausedAt` is null or a local date. `interval` is an int from 1 to 12. `startDate`/`endDate` are local dates, with `endDate >= startDate` when set. `template.amountMinor` is an int > 0. `template.kind` is in `['expense','income']`. `skipped` is a map. Delete is denied; use `deletedAt` |
| `users/{uid}/expenses/rec_*` | Client | The normal transaction rules, plus: when `recurringId` is present it must be a string, and the doc id must equal `'rec_' + recurringId + '_' + localDate` |

New index: `expenses` on `recurringId ASC, localDate ASC`. It deliberately has no
`deletedAt`, see above.

## Haptics

| Action | Event |
|---|---|
| Save rule | `splitConfirm` |
| Approve due item | `expenseSaved` |
| Skip due item | `destructive` |
| Pause / resume | `toggleOff` / `toggleOn` |
| Delete rule | `warning`, then `destructive` |

## Edge cases

| Case | Behaviour |
|---|---|
| Editing a rule's amount | Affects occurrences **not yet approved**, including due ones still in the inbox, because they're virtual. Approved transactions never change |
| Editing `startDate` or frequency | The anchor moves, and old due dates may disappear from the inbox. Approved occurrences stay, since they're real transactions |
| Pausing | Nothing is due while `pausedAt` is set. On resume, the client writes `skipped.{d}: true` for every occurrence from `pausedAt` up to the resume date, then clears `pausedAt`, all in one write. Occurrences that fell due during the pause are never proposed, because the user paused for a reason |
| Deleting a rule | Its due items vanish. Approved transactions keep their `recurringId`, and the detail sheet shows *"From a deleted rule"* |
| Approved occurrence then soft-deleted | Not re-proposed |
| Phone off for 45 days | Only the last 30 days are proposed. The inbox Due header says *"2 older occurrences weren't shown"* (count from `occurrences(rule, startOfWindow − 365, startOfWindow)` minus handled ids). No backfill |
| The user travels across time zones | Local dates follow the device. An occurrence can appear a day earlier or later than at home. Accepted: it matches how a calendar behaves |
| A rule's category is archived | The due item still uses it, because approval is allowed into an archived category from a rule. The rule editor shows the category dimmed with *"Archived — pick another?"* |
| A rule's account is archived | The due item falls back to *None* |
| Two devices approve the same occurrence offline | One transaction (same id). The later write wins on content. Coins fire once |
| One device skips while another approves | Both writes land. The transaction exists, so the item is handled regardless of `skipped` |
| Rule `startDate` in the future | Nothing due until then. The list shows *"Starts 1 Nov"* |
| Daily rule × 30-day window after a long absence | Up to 30 due items. The Due group collapses to *"Daily coffee · 30 due"* with **Approve all 30** / **Skip all** |

## Acceptance criteria

- [ ] `occurrences` passes the month-end, leap-year, interval, end-date and future-start
      tests listed above.
- [ ] `dueOccurrences` excludes skipped dates, handled ids (live **and**
      soft-deleted), paused rules and dates outside the window.
- [ ] Approving on two emulator instances offline, then syncing both, leaves exactly
      one transaction and one `expense_logged` evaluation, which awards zero coins
      (recurring).
- [ ] Rules reject a `rec_` document whose id doesn't match `recurringId` + `localDate`.
- [ ] The monthly-equivalent header equals the sum of its row values exactly.
- [ ] A recurring approval banks the day and awards no `expense_logged` coins
      (Functions test).
- [ ] Nothing in the codebase writes a transaction from a rule without a user
      action (grep: the only writer of `rec_` ids is the approve handler).
