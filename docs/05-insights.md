# 05 — Insights

Two questions, answered honestly and fast: **where did it go** (category) and
**when did it go** (day). Nothing else in v1.

## Where the logic lives

All aggregation is pure functions in a new `packages/shared/src/insights.ts`,
framework-free like the rest of the package. The screen does no arithmetic. This
is what lets the same numbers back the MCP server later without a second
implementation drifting from the first.

```ts
/** Half-open [startDate, endDate) over LOCAL dates — 'YYYY-MM-DD'. */
export interface Period { readonly startDate: string; readonly endDate: string; }

export interface CategoryTotal {
  readonly categoryId: string;
  readonly total: Money;
  readonly count: number;
  /** 0–1, share of the period's total. Sums to 1 across the result. */
  readonly share: number;
}

export interface DayTotal {
  readonly date: string;   // YYYY-MM-DD, local
  readonly total: Money;
  readonly count: number;
}

export function totalsByCategory(records, period, currency): CategoryTotal[];
export function totalsByDay(records, period, currency): DayTotal[];
export function periodTotal(records, period, currency): Money;
export function periodStats(records, period, currency): PeriodStats;
export function weekdayAverages(records, period, currency): Money[];
export function displayPercentages(totals): number[];   // sums to exactly 100
export function compareToPrevious(current: Money, previous: Money): Delta;
export function periodOf(kind, today): Period;
export function previousPeriod(period): Period;
export function collapseLongTail(totals, threshold?): { visible; collapsed };
```

Rules that these functions MUST hold:

- **Shares are computed from integer minor units** and rounded for display only.
  Displayed percentages MUST sum to 100, via `displayPercentages` — which calls
  the *same* `distributeLargestRemainder` helper that
  [`split.ts`](../packages/shared/src/split.ts) uses to divide money. One
  implementation of the invariant, not two.
- Functions take `SpendRecord`, the minimal shape `{ localDate, categoryId,
  total, deletedAt }`. `Expense` satisfies it and so does a rollup row, so both
  paths feed the same code.
- `totalsByDay` returns **every** day in the period, including zero-spend days,
  with `total = 0`. Gaps are meaningful and must not be dropped.
- Soft-deleted expenses are excluded everywhere.
- Day bucketing uses the **device-local** date derived from `occurredAt`, not UTC.
  A ₹200 coffee at 00:30 IST belongs to that local day.

## Period selection

One shared control at the top of the Insights tab, and it drives both views.

| Option | Range |
|---|---|
| **Week** | Last 7 local days, inclusive of today |
| **Month** (default) | Current calendar month to date |
| **30 days** | Rolling 30 local days |
| **Custom** | Any start/end, max 366 days |

- The selection persists across app launches (`settings.insights_period`).
- Swiping left/right on the period chip steps to the previous/next period
  (e.g. last month). Future periods are not reachable.
- Haptic: `selection` on each change.

### Custom period (v1.1)

v1 shipped the `custom` kind without a UI: `periodOf('custom')` falls back to the
last 30 days. v1.1 adds the UI:

- Tapping **Custom** opens the `DatePickerSheet` in **range** mode
  ([03](03-expenses.md#date)) with `maxRangeDays: 366` and no future dates.
- **Done** validates with the existing `customPeriod(start, endInclusive, today)`
  and persists `settings.insightsCustomStartDate` / `insightsCustomEndDate`. These
  fields already exist.
- The chip reads `12 MAR – 03 APR` in mono. Tapping the chip again re-opens the
  sheet.
- Stepping ◀ ▶ moves a custom period by its own length (`stepPeriod`, which already
  exists), and stops at today.
- On launch with a saved custom period whose end is in the past, the saved range
  is kept. It doesn't slide to today.

## Category insights

**Section:** top half of `/(tabs)/insights`.

### Content

1. **Period total** — one large mono number, `type.displayLg`, with a delta chip
   against the previous equivalent period (`+18%` in coral, `−12%` in lime —
   *less spending is the good direction*, and that colour choice must not be
   accidentally inverted).
2. **Ranked list** — every category with spend in the period, descending:
   - `MonoTag` in the category's colour token
   - Amount, mono, right-aligned
   - Share as a percentage, mono
   - A horizontal bar in the category colour, width = share, drawn with the same
     1.5px border + hard plate treatment as every other surface. No gradients.
3. **Tap a category** → filtered ledger for that category and period.

### The chart

A **ranked bar list**, not a pie or donut. Reasons: shares are read by length far
more accurately than by angle, a bar list handles 20 categories where a pie
cannot, and it needs no legend.

If a Skia visual is wanted for the arcade feel, it goes on the **period total**
as a segmented gauge (reuse `gaugeSegments()` from
[`streak.ts`](../packages/shared/src/streak.ts)), not on the breakdown itself.

### Long tail

Categories below **3%** of the period total collapse into a single `OTHER SMALL`
row that expands on tap. The collapsed row is visually distinct from the real
`OTHER` category — it is a UI grouping, never a data change.

### Empty and thin data

- Zero expenses in the period: *"Nothing logged in this window."* plus the period
  control, so the user can widen it. Never a zeroed chart.
- Fewer than 3 days of history: show the real numbers and a muted note that
  trends need about a week. **Never hide real data, never fabricate a trend.**

## Day insights

**Section:** bottom half of `/(tabs)/insights`.

### Content

1. **Calendar strip** — one cell per day in the period.
   - Cell intensity encodes that day's total, in **five discrete steps** relative
     to the period's max. Discrete, not a continuous gradient — it matches the
     segmented-gauge language and stays readable in dark mode.
   - Zero-spend days render as an outlined empty cell with no fill. These are a
     *positive* signal and are counted by [gamification](06-gamification.md).
   - Today's cell carries a lime 1.5px border.
   - Periods over 31 days render as a 7-column month grid; ≤ 31 days render as a
     single scrollable row.
2. **Averages row** — mono: daily average, busiest day, count of zero-spend days.
3. **Weekday pattern** — seven bars, average spend per weekday across the period.
   Answers "weekends wreck me" in one glance.
4. **Tap a day** → `/day/[date]`.

### Day detail (`/day/[date]`)

- Header: the date, that day's total, and its rank within the period.
- The day's category breakdown, same ranked-bar component as above.
- Every expense on that day, chronological, tappable through to the edit sheet.
- Swipe left/right moves to the adjacent day. Haptic: `selection` per day.

## Spend, Income, Net

**v1.2.** A three-way segmented control under the period chip:
**Spend · Income · Net**. Default Spend. Haptic: `selection`.

| View | Headline | Category list | Day strip |
|---|---|---|---|
| **Spend** | `expense − refund` for the period ([17](17-money-in-and-out.md#the-transaction-kinds)) | Expense categories (parents combined, [04](04-categories.md#sub-categories)), net of refunds. Net-negative categories are listed under the chart with *net refund* ([17](17-money-in-and-out.md#refunds-across-periods)) | As in v1, per-day net spend |
| **Income** | `sum(income)` | Income categories | Per-day income |
| **Net** | `income − spend`, with sign. Lime when ≥ 0, coral when < 0 | Two bars: In and Out | Per-day net |

- **Excluded everywhere:** transfers, settlements, loans, and squad mirrors with
  `excludeFromSpend` ([23](23-squads.md#mirrors)).
- Delta chips against the previous period keep their colour meaning per view.
  Spend: less is lime. Income: more is lime. Net: higher is lime.
- New shared functions in `insights.ts`: `periodSpend`, `periodIncome`, `periodNet`
  and `totalsByCategoryForKind(records, period, kind)`. `SpendRecord` gains `kind`
  and optional `lines`. Rollup-backed records carry the v2 buckets
  ([11](11-firebase.md#rollups-v2)).

## Trend

**v1.4.** A section below the category list: **the last 12 months**, one bar per
month in the current view (Spend / Income / Net).

- Data: 12 `monthlyRollups` docs plus the current month from cache, through the
  same `mergePeriodSources` path.
- **Months before the first recorded transaction are not drawn.** They are not
  zero bars. With 3 months of history, the chart has 3 bars and the note
  *"Trend fills in as you log."*
- The current month's bar is outlined, not filled, and labelled *so far*.
- Budget vs actual: when an overall budget applied in a month, a thin horizontal
  line at the budget amount crosses that month's bar ([19](19-budgets.md#insights)).
- An average line (dashed, mono label) over complete months only.
- Tapping a bar sets the period to that month. Haptic: `selection`.
- It is a bar chart, never a line chart. Spending is discrete per month, and a
  line between months would imply values that don't exist.

## Month-end projection

**v1.4.** Shown in the **Spend** view for the **current month only**, under the
headline: *"At this pace: ~₹42,000 by 31 Oct"*.

**Guard. All must hold, or nothing is shown:**
- today is the **7th** of the month or later, **and**
- the user has **≥ 28 days** of history before today (first transaction date ≤
  today − 28), **and**
- the view is Spend and the period is the current calendar month.

**Formula** (`projectMonthEnd`, pure, in `insights.ts`):

```
projection = spentSoFar
           + dailyRate × remainingDays
           + knownRecurring

dailyRate      = sum(spend over the trailing 28 days, EXCLUDING transactions with recurringId)
                 ÷ 28                        (integer division in minor units, floor)
remainingDays  = days after today until month end
knownRecurring = sum of expense recurring occurrences due after today and on/before month end
                 that are not yet handled ([20](20-recurring.md))
```

Recurring transactions are excluded from the trailing average, because otherwise
a ₹25,000 rent would be counted twice (once in the rate, once in known
recurring).

- Rounded **for display only** to 2 significant figures, with `~`.
- Tapping the line opens a sheet that **shows the formula with the user's own
  numbers**: *"₹18,200 so far + ₹610/day × 19 days + ₹999 Netflix due = ~₹30,800"*.
  [Honest numbers](00-product.md#design-principles): the user can always see why.
- With an overall budget, the line adds *"· budget ₹40,000"*. No warning colour,
  no haptic.

## Year view

**v1.4.** The period control gets a **Year** option (`PeriodKind` adds `year`:
Jan 1 to today, or a full past year by stepping).

- Headline: year-to-date spend / income / net.
- **Months grid:** 12 cells (3×4) with each month's total and the five-step
  intensity from the calendar strip, applied per month. Future months are empty
  outlines.
- The category list for the year (from 12 monthly rollups).
- **Savings rate per month** (below), as a row of mono percentages.
- All 12 monthly rollups are read once: 12 reads.

## Savings rate

**v1.4.** In the **Net** view and the Year view:

```
savingsRate(month) = (income − spend) / income      — only when income > 0
```

- Computed in integer basis points (`floor((income − spend) × 10000 / income)`),
  displayed with one decimal: *"Saved 23.4%"*.
- **No income that month: nothing is shown**, not 0% and not −∞. The label reads
  *"No income logged"*.
- **A negative rate is shown as it is**: *"Spent 112% of income"*, in coral. No
  clamping.
- Squad shares count as spend (unless excluded). Transfers, loans and
  settlements don't count either way.

## Tag insights

**v1.3.** The Insights filter bar gets a **Tag** chip. Picking a tag scopes the
headline, category list and day strip to transactions carrying that tag, for the
current period.

- Data comes from a **bounded query** (`tagIds array-contains` + `localDate`
  range), not rollups, because rollups don't carry tags ([21](21-tags.md#query-shape)).
  The custom period's 366-day cap bounds it.
- The trend, projection and year view are **hidden** while a tag is selected.
  They need rollups.

## Where the numbers come from

Two paths, one set of functions:

| Period | Source | Why |
|---|---|---|
| **Today and the current month** | Cached expense documents, aggregated on device | A just-saved expense must move the number instantly, offline |
| **Any past period** | `dailyRollups` / `monthlyRollups`, maintained by a Cloud Function | 12 document reads instead of 3,000 ([11-firebase.md](11-firebase.md#why-this-shape)) |
| **Tag-scoped** (v1.3) | Bounded `tagIds` + `localDate` query | Rollups don't carry tags |

**From v1.2 (rollups v2)** the rollup docs carry per-kind buckets: `count`,
`totalMinor`, `byCategory` (gross expense, the v1 meaning, unchanged),
`refundCount`, `refundMinor`, `refundByCategory`, `incomeCount`, `incomeMinor` and
`incomeByCategory`. They are keyed by **leaf** category, and split lines apply per
line ([11](11-firebase.md#rollups-v2)). Until the migration has reached a user
(`users/{uid}/meta/schema.ledger < 2`), past periods show *"Updating your
history…"* instead of numbers ([27](27-full-ledger-plan.md#migration-script-p2-scriptsmigrate-v2ts)).

Rollups are derived data and always rebuildable. If a rollup ever disagrees with
the expenses, the expenses win and the rollup is regenerated.

## Performance

- Every query is bounded by a `localDate` range and an index
  ([11-firebase.md](11-firebase.md#indexes)). An unbounded listener on `expenses`
  is a review rejection.
- The Insights tab MUST render in under 300ms for a year of data (~3,000
  expenses) on a mid-range Android.
- Results are memoised on `(period, dataRevision)`; any write bumps the revision.
- Insights for cached periods work fully offline. A period whose rollups have
  never been fetched shows a single inline line — *"Needs a connection once."* —
  not a blocking spinner.

## Haptics

| Action | Event |
|---|---|
| Change period | `selection` |
| Step period left/right | `selection` |
| Tap a category row | `tap` |
| Tap a calendar cell | `tap` |
| Swipe between days | `selection` |
| Expand the long tail | `tap` |
| Spend / Income / Net switch (v1.2) | `selection` |
| Tap a trend bar (v1.4) | `selection` |
| Open the projection formula (v1.4) | `tap` |
| Custom range confirmed (v1.1) | `selection` |

## Acceptance criteria

- [x] Displayed category percentages always sum to exactly 100%.
- [x] Sum of all `CategoryTotal.total` equals `periodTotal` exactly, in minor units.
- [x] `totalsByDay` returns a contiguous run of dates with no gaps.
- [x] An expense logged at 23:59 and one at 00:01 local fall on different days,
      and the boundary is local time, not UTC — verified with a non-UTC device.
- [x] Archived categories still appear in periods containing their expenses.
- [ ] Insights renders under 300ms with 3,000 seeded expenses.
      *Measured 2026-09-27 on Loop_API35 (x86 emulator), dev build `3b37050f`,
      settled app, `[perf] insights ready` marker (mount → every source ready):*
      | Cached | This month | Dev bundle | Production bundle |
      |---|---|---|---|
      | 3,000 over 365 days | 205 | 919–1,039ms | 812–882ms |
      | 205 | 205 | 919–957ms | — |
      | 10 | 10 | 546–582ms | — |
      *Model computation is 1ms and a year of history costs nothing over a
      month — rollups work. The floor is five listeners (period, previous
      period, two rollup ranges, categories) subscribing from scratch on every
      mount, plus ~1.9ms per current-month expense crossing the bridge. Getting
      under 300ms needs a structural change (e.g. app-wide live listeners for
      this month and categories) — an owner decision, not a tuning pass. Not yet
      measured on a mid-range phone, which is what the rule names (D8).*
- [x] Client-computed current-month totals and Function-computed rollups agree
      exactly, to the minor unit, for the same period.
      (proof: tests/functions/rollups.test.ts › "a sequence of creates, edits and deletes ends equal to buildRollups of what is left" and packages/shared/src/__tests__/insights.test.ts › "equals an all-cache computation of the same data exactly")
- [x] Pending (unapproved) SMS expenses appear in no total, chart or average.
      (proof: scripts/check-invariants.mjs rule 6 "pending-expenses-location")
- [x] Every number on screen is JetBrains Mono.

### Acceptance criteria added after v1

- [ ] (v1.1) A custom range persists across launches, steps by its own length, and
      can't reach the future or exceed 366 days.
- [x] (v1.2) Spend, Income and Net each equal hand-computed values over a fixture
      with expenses, refunds (same and later period), income, transfers and
      squad mirrors (excluded and included).
      (proof: packages/shared/src/__tests__/insights.test.ts › "spend / income / net (v1.2)" and "rollups + cache merge per view (v1.2)")
- [x] (v1.2) Percentages still sum to 100 with a net-negative category present.
      (proof: packages/shared/src/__tests__/insights.test.ts › "keeps percentages summing to 100 with a net-negative category present")
- [ ] (v1.4) The trend draws no bars before the first transaction.
- [ ] (v1.4) The projection is hidden before day 7 and with < 28 days of history,
      and the formula sheet's numbers add up to the projection exactly.
- [ ] (v1.4) The projection excludes recurring transactions from the daily rate
      (pure test with a large rent).
- [ ] (v1.4) The savings rate is hidden for months without income and shown
      unclamped when negative.
- [ ] (v1.3) Tag-scoped Insights read only the bounded tag query.
