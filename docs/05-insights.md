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

## Where the numbers come from

Two paths, one set of functions:

| Period | Source | Why |
|---|---|---|
| **Today and the current month** | Cached expense documents, aggregated on device | A just-saved expense must move the number instantly, offline |
| **Any past period** | `dailyRollups` / `monthlyRollups`, maintained by a Cloud Function | 12 document reads instead of 3,000 ([11-firebase.md](11-firebase.md#why-this-shape)) |

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

## Acceptance criteria

- [ ] Displayed category percentages always sum to exactly 100%.
- [ ] Sum of all `CategoryTotal.total` equals `periodTotal` exactly, in minor units.
- [ ] `totalsByDay` returns a contiguous run of dates with no gaps.
- [ ] An expense logged at 23:59 and one at 00:01 local fall on different days,
      and the boundary is local time, not UTC — verified with a non-UTC device.
- [ ] Archived categories still appear in periods containing their expenses.
- [ ] Insights renders under 300ms with 3,000 seeded expenses.
- [ ] Client-computed current-month totals and Function-computed rollups agree
      exactly, to the minor unit, for the same period.
- [ ] Pending (unapproved) SMS expenses appear in no total, chart or average.
- [ ] Every number on screen is JetBrains Mono.
