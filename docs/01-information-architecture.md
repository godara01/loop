# 01 — Information Architecture

## Tab structure (v1)

Four tabs in the bottom dock ([`tab-dock.tsx`](../apps/mobile/src/components/ui/tab-dock.tsx)),
plus a persistent centre **Add** action that is not a tab.

```
┌──────────────────────────────────────────────┐
│                                              │
│                  screen                      │
│                                              │
├──────────────────────────────────────────────┤
│  Orbit    Ledger    (+)    Insights    You   │
└──────────────────────────────────────────────┘
```

| Tab | Route | Purpose |
|---|---|---|
| **Orbit** | `/(tabs)/index` | Today. Spend so far, streak capsule, check-in, last few expenses |
| **Ledger** | `/(tabs)/activity` | Full reverse-chronological expense list, grouped by day, searchable |
| **(+) Add** | `/expense/new` (modal) | Not a tab — a raised tactile plate in the dock that presents the entry sheet |
| **Insights** | `/(tabs)/insights` | Category and day breakdowns |
| **You** | `/(tabs)/profile` | Profile, categories, haptics, coin history, auto-capture, export |

The existing `squads` tab is **removed from the dock for v1**. The route file and
its shared logic stay in the repo untouched — see [09-roadmap.md](09-roadmap.md).

## Full route map

```
app/
  _layout.tsx                  Root: fonts, gesture root, safe area, DB provider
  onboarding/
    _layout.tsx                Stack, no dock, no back-swipe out of step 1
    index.tsx                  Step 1 — welcome
    profile.tsx                Step 2 — name + currency
    feel.tsx                   Step 3 — haptics consent + calibration
    categories.tsx             Step 4 — pick starter categories
    first-expense.tsx          Step 5 — log one expense
  (tabs)/
    _layout.tsx                Dock
    index.tsx                  Orbit
    activity.tsx               Ledger
    insights.tsx               Insights
    profile.tsx                You
  expense/
    new.tsx                    Add expense (modal sheet)
    [id].tsx                   Expense detail / edit (modal sheet)
  category/
    index.tsx                  Manage categories
    catalogue.tsx              Browse and add from the category catalogue
    new.tsx                    Create category (modal sheet)
    [id].tsx                   Edit category (modal sheet)
  day/
    [date].tsx                 Single-day detail, YYYY-MM-DD
  coins.tsx                    Coin ledger history (from You)
  inbox.tsx                    Unapproved SMS-derived expenses (docs/12)
```

Typed routes are on (`experiments.typedRoutes`), so every path above must exist
as a file before it can be linked.

## Navigation rules

- **Onboarding is a gate.** If `profile.onboardedAt` is null, the root layout
  redirects to `/onboarding` and the tabs are unreachable. Once set, `/onboarding`
  is unreachable. See [02-onboarding.md](02-onboarding.md).
- **Entry is always a modal sheet**, never a pushed screen. It must be
  dismissible with a downward drag, and dismissing with unsaved input MUST
  confirm ([03-expenses.md](03-expenses.md#discarding)).
- **The dock is never hidden** on tab screens, and always clears the safe area
  by `layout.thumbZoneOffset`.
- **One back-stack per tab.** Switching tabs preserves each tab's stack.
- Deep links use the `loop://` scheme. v1 registers `loop://expense/new` only
  (for a future quick-action); everything else is internal.

## Screen inventory and their source screens

Stitch project *Gamified Haptic Expense Tracker* (`projects/11249192348559067173`)
is the visual source. Port class names to [`theme.ts`](../packages/shared/src/theme.ts)
tokens rather than re-deriving colours by eye.

| Screen | Stitch reference |
|---|---|
| Orbit | Orbit dashboard / Arcade Gamified Dashboard |
| Add expense | Drag & Split flow (entry half only in v1) |
| Insights | Category breakdown + calendar views |
| You | Profile / settings |

## Layout invariants

Every screen in the app obeys these; they come from
[`theme.ts`](../packages/shared/src/theme.ts) and are not negotiable per-screen.

- Screen margin `layout.screenMargin` (16), gutter `layout.gutter` (12).
- Every card, chip and container has a **1.5px solid border**
  (`borderWidth.mechanical`). Never a blurred shadow.
- Depth is a hard offset plate: `0px 4px 0px` at rest, collapsing to `0px 1px 0px`
  with a 3px downward translate on press (`elevation.rest` / `elevation.pressed`).
- All numbers, ratios, dates and timestamps use JetBrains Mono (`fonts.mono`) so
  columns never shift.
- Text on Electric Lime `#D4FF00` is always Deep Void `#0B0F19`.
- Scroll containers pad the bottom by 140 to clear the dock.
- Tablet content clamps to `layout.tabletMaxWidth` (680) and centres.
