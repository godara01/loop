# 19 — Budgets

> **Release:** v1.4 (Phase P4 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `B*` in [`TASKS.md`](../TASKS.md).

A budget is a monthly ceiling the user sets, overall or per category, and Loop
shows how close this month's spending is to it. That is all. No envelopes, no
rollover, no zero-based budgeting. Those are different products.

## Principles applied

- **No shame.** Going over is stated plainly in neutral copy: *"₹1,240 over"*. No
  red flash, no haptic, no notification, no change to the streak or coins
  ([06](06-gamification.md#restraint-rules), rule 1).
- **Honest numbers.** Progress is real net spend: expenses minus refunds, plus your
  squad shares. It is never smoothed and never projected into the bar. The
  projection lives in Insights with its formula shown ([05](05-insights.md#month-end-projection)).
- **Offline.** This month's progress is computed on device from cached
  transactions. It is the same source the Orbit *Today* number uses, so it updates
  the moment an expense is saved, offline included.

## The budget

`users/{uid}/budgets/{budgetId}`, written by the client:

```ts
interface Budget {
  readonly id: string;
  readonly scope: 'overall' | 'category';
  readonly categoryId: string | null;     // required for 'category', null for 'overall'
  /** Amount per month, keyed by the first month it applies from. */
  readonly amounts: Readonly<Record<string /* YYYY-MM */, number /* minor */>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}
```

- **At most one overall budget**, with the id `overall`, so the id enforces it.
- **At most one budget per category**, with the id `cat_{categoryId}`, likewise.
- **`amounts` is a map, not an array.** Changing the budget writes the field path
  `amounts.2026-11`, which merges safely with an offline edit from another device.
  The amount for month `M` is the value at the greatest key ≤ `M`
  (`budgetFor(budget, month)`, pure).
- **Changes apply from the current month forward.** Past months keep the amount
  that applied then, so October's history still says *"₹20,000 budget, ₹21,300
  spent"* after November's budget is raised.
- Currency is the ledger currency. Amounts are integer minor units > 0.

## What counts

`budgetProgress(budget, month, transactions, categories)` in
`packages/shared/src/budgets.ts`:

| Transaction | Counts toward budget |
|---|---|
| `expense` (manual, SMS, recurring, import) | + amount, in its category (per line if split) |
| `refund` | − amount, in its category |
| Squad mirror (`source: 'group'`, kind `expense`) | + **your share**, in its mapped category, unless the mirror has `excludeFromSpend` (the squad's "Count my share" is off, [23](23-squads.md#mirrors)) |
| `income`, `transfer`, `settlement`, `loan` | Nothing |

**Category scope includes sub-categories.** A budget on `FOOD` counts `FOOD` plus
every child (`FOOD › COFFEE`, `FOOD › DELIVERY`) ([04](04-categories.md#sub-categories)).

**Parent and child budgets nest; they are never added together.** With FOOD at
₹10,000 and COFFEE (a child of FOOD) at ₹2,000, a ₹300 coffee counts toward
**both**. The overall budget is not the sum of category budgets.

## States

| State | Condition | Display |
|---|---|---|
| **Under** | spent < 80% | Gauge segments in the category colour (or lime for overall). *"₹6,200 left"* |
| **Close** | 80% ≤ spent < 100% | Segments switch to `amber`. *"₹1,100 left"* |
| **Over** | spent ≥ 100% | Segments full in `debit` coral. *"₹1,240 over"*. **No haptic** |
| **Refunded back under** | Was over, now under | Just shows Under. No "recovered" celebration |

The gauge is the existing Skia segmented gauge (`gaugeSegments()` in
[`streak.ts`](../packages/shared/src/streak.ts)) with **10 segments**, matching the
arcade language.

Percentages are `floor(spent × 100 / amount)`, in integer maths. A display of
`100%` means fully used. *Over* is checked with `spent >= amount` on minor units,
not on the rounded percentage.

## Screens

### `/budgets` (You → Budgets, and tapping the Orbit gauge)

- **Overall**: a large card with the gauge, spent / budget, and left or over.
- **Categories**: one row per category budget, sorted by % used descending. Each
  row has a tag, a thin gauge, spent / budget and a state word.
- **Categories without a budget that had spend this month**: a muted list with
  **+ Budget** on each. This is the fastest way to set budgets from real data.
- A month stepper at the top (◀ Oct 2026 ▶). Past months show the amounts that
  applied then. Future months are not reachable.

### `/budgets/edit/[id]` (modal sheet)

- The amount pad. Below it a hint: *"Last 3 months: ₹18,400 · ₹21,050 · ₹19,700"*,
  shown as data, never as a suggested number.
- **Category budgets summing above the overall budget**: a muted warning on the
  overall card, *"Category budgets add up to ₹24,000, above your ₹20,000 overall"*.
  It never blocks saving.
- **Remove budget** archives it (`archivedAt`). Its history stays readable in past
  months.

### Orbit

- When an overall budget exists, a compact **Month budget** gauge sits under the
  hero: *"₹13,800 of ₹20,000 · 17 days left"*. Tapping it opens `/budgets`.
- **Keep it plain** does **not** hide it. Budgets are data, not gamification.

### Insights

Budget versus actual, per month, in the trend view ([05](05-insights.md#trend)): a
thin horizontal line at the budget amount over each month's bar. Months with no
budget have no line.

## Month boundaries

- "This month" is the **local** calendar month of today (`periodOf('month', today)`).
- At local midnight on the 1st, the Orbit gauge resets. No animation, no
  "new month" banner.
- A budget created on the 20th applies to **the whole month**, including
  spending already logged. The alternative, prorating, invents a number the user
  never set.

## Data and rules

| Path | Writer | Rules |
|---|---|---|
| `users/{uid}/budgets/{id}` | Client | Owner read/write. `scope` in the set. `categoryId` is a string when `scope == 'category'`. `amounts` is a map whose values are ints > 0. Delete is denied; use `archivedAt` |

There are no Functions. Progress is computed client-side from data already
cached for Orbit. Past months use `monthlyRollups` (net = `totalMinor −
refundMinor`, per category from `byCategory − refundByCategory`), the same as
Insights.

Squad shares follow each squad's **Count my share** setting through the mirror's
`excludeFromSpend` flag ([23](23-squads.md#mirrors)). When the setting changes, the
Function re-flags every mirror of that squad, and rollups skip excluded mirrors. So
current and past months stay exact, with no client-side filtering.

## Haptics

| Action | Event |
|---|---|
| Save budget | `splitConfirm` |
| Remove budget | `warning`, then `destructive` |
| Crossing 80% or 100% | **None.** Deliberate |
| Month stepper | `selection` |

## Edge cases

| Case | Behaviour |
|---|---|
| Budget on a category that is later archived | The budget is archived with it, in the same batch as the category archive. Unarchiving the category does not restore the budget. The user re-adds it |
| Budget on a category that becomes a child of another | Still counts that category (and it has no children itself, because only one level of nesting is allowed) |
| Category moved under a parent that has a budget | The parent's budget now includes it, for the current and past months, because rollups are by leaf and parents are combined at read time. Documented in [04](04-categories.md#sub-categories) |
| Budget on an income category | Not offered. Income categories are excluded from the picker |
| Refund larger than the month's spend in a category | Spent is clamped at 0 **for budget display only**. The gauge can't go negative |
| Overall budget but zero spend | *"₹20,000 left"*, gauge empty |
| Edits on two offline devices to the same month | Last write wins on `amounts.YYYY-MM`. Edits to different months merge |
| Month with no budget in history | No budget for that month. Past views show *"No budget"* |
| Squad share in another currency | Excluded, because there is no mirror ([23](23-squads.md#currency)) |

## Acceptance criteria

- [ ] `budgetFor` returns the right amount for months before, at and after each key
      in `amounts` (pure tests, including an empty map).
- [ ] `budgetProgress` counts refunds negatively, includes children, includes squad
      shares and excludes income and transfers (pure tests).
- [ ] FOOD ₹10,000 and COFFEE ₹2,000: a ₹300 coffee moves both gauges, and the
      overall gauge is unaffected by category budgets.
- [ ] Crossing 100% fires no haptic and no notification (grep plus a Maestro
      assertion that no toast appears).
- [ ] Raising November's budget leaves October's history unchanged.
- [ ] Logging an expense offline moves the Orbit gauge immediately.
- [ ] Archiving a category archives its budget in the same batch.
