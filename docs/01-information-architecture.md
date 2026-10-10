# 01 — Information Architecture

## Tab structure

Four tabs in the bottom dock ([`tab-dock.tsx`](../apps/mobile/src/components/ui/tab-dock.tsx)),
plus a persistent centre **Add** action that is not a tab.

### v1.0 – v1.4

```
│  Orbit    Ledger    (+)    Insights    You   │
```

### From v1.5 (Squads)

```
┌──────────────────────────────────────────────┐
│ (avatar)                 screen              │
├──────────────────────────────────────────────┤
│  Orbit    Ledger    (+)    Squads   Insights │
└──────────────────────────────────────────────┘
```

**You** leaves the dock. It becomes a round avatar plate (the user's initials,
1.5px border) at the left of Orbit's header, which pushes `/you`. The dock stays
at four tabs plus the plate, because five tabs plus a plate is too tight for the
thumb zone at 360dp.

| Tab | Route | Purpose |
|---|---|---|
| **Orbit** | `/(tabs)/index` | Today: spend so far, streak capsule, check-in, budget gauge ([19](19-budgets.md)), accounts card ([18](18-accounts.md)), recent transactions. From v1.5, the **You avatar** |
| **Ledger** | `/(tabs)/activity` | All transactions, grouped by day, searchable, **filterable** ([03](03-expenses.md#ledger-filters)) |
| **(+) Add** | `/expense/new` (modal) | Not a tab. A raised tactile plate that presents the entry sheet |
| **Squads** (v1.5) | `/(tabs)/squads` | Squads and people (pairs), with your balance in each ([23](23-squads.md)) |
| **Insights** | `/(tabs)/insights` | Spend / Income / Net, categories, days, trend, year ([05](05-insights.md)) |
| **You** | `/(tabs)/profile` until v1.5, then `/you` | Profile, account, categories, accounts, budgets, recurring, tags, notifications, smart suggestions, import / export, reset |

The v1 dock removed the original mock `squads` tab. v1.5 brings it back as a real
feature.

## Full route map

Routes marked with a release are added in that release. Unmarked routes exist
today.

```
app/
  _layout.tsx                  Root: providers, bootstrap gate, force-update gate (v1.1)
  onboarding/
    index.tsx                  Step 1 — welcome (+ "I already use Loop", v1.1)
    profile.tsx                Step 2 — name + currency
    feel.tsx                   Step 3 — haptics consent + calibration
    categories.tsx             Step 4 — pick starter categories
    first-expense.tsx          Step 5 — log one expense
  (tabs)/
    _layout.tsx                Dock
    index.tsx                  Orbit
    activity.tsx               Ledger
    squads.tsx                 Squads (v1.5)
    insights.tsx               Insights
    profile.tsx                You (moves to /you in v1.5)
  you.tsx                      You, pushed from the Orbit avatar (v1.5)
  expense/
    new.tsx                    Add transaction (modal sheet). ?kind=income|transfer (v1.2)
    [id].tsx                   Detail / edit (modal sheet)
    refund/[id].tsx            Record a refund against [id] (v1.2)
    approve/[pendingId].tsx    Approve an inbox proposal
  ledger/
    filter.tsx                 Ledger filter sheet (modal, v1.1)
  category/
    index.tsx                  Manage categories (+ sub-categories, v1.3)
    catalogue.tsx              Browse and add from the catalogue
    new.tsx                    Create category (modal sheet)
    [id].tsx                   Edit category (modal sheet)
  accounts/                    (v1.2)
    index.tsx                  Accounts list
    new.tsx                    Create account (modal)
    [id].tsx                   Account detail; edit via modal
  budgets/                     (v1.4)
    index.tsx                  Budgets for a month
    edit/[id].tsx              Set / change a budget (modal)
  recurring/                   (v1.4)
    index.tsx                  Subscriptions & bills, income
    new.tsx                    New rule (modal)
    [id].tsx                   Edit rule (modal)
  tags/                        (v1.3)
    index.tsx                  All tags
    [id].tsx                   Tag detail
  squads/                      (v1.5)
    new.tsx                    New squad or person (?type=pair)
    join.tsx                   Enter an invite code
    [id]/index.tsx             Squad detail: entries / balances / activity
    [id]/expense/new.tsx       Add entry — Drag & Split (modal)
    [id]/expense/[entryId].tsx Edit entry (modal)
    [id]/settle.tsx            Settle up
    [id]/members.tsx           Members, invites
    [id]/settings.tsx          Squad settings
  i/
    [code].tsx                 Invite deep link → join flow (v1.5)
  import/                      (v1.6)
    index.tsx                  Pick file, map, preview, write
    history.tsx                Past imports, undo
  settings/
    account.tsx                Back up / sign-in / sign-out (v1.1)
    notifications.tsx          Reminders, squad push (v1.4)
    suggestions.tsx            Smart suggestions (v1.3)
    widget.tsx                 Widget privacy (v1.6)
    auto-capture.tsx           SMS capture
    reset.tsx                  Reset app
  day/
    [date].tsx                 Single-day detail, YYYY-MM-DD
  coins.tsx                    Coin ledger history
  inbox.tsx                    Proposals: SMS, recurring due (v1.4), refunds/transfers (v1.2)
```

There is no `onboarding/_layout.tsx`. The onboarding screens are plain stack
screens in the root `Stack`, and the gate lives in the root layout. An earlier
version of this doc listed one.

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
- Deep links use the `loop://` scheme: `loop://expense/new` (v1),
  `loop://expense/new?kind=income` and `loop://inbox` (quick actions, v1.6,
  [26](26-shortcuts-and-widget.md)). Invites use the verified HTTPS App Link
  `https://<project>.web.app/i/<code>`, which routes to `/i/[code]` (v1.5,
  [23](23-squads.md#invites-and-joining)).
- Deep links that arrive before the bootstrap gate settles are **held**, then
  applied. Before onboarding finishes they are dropped.
- **Sheets inside sheets:** the filter sheet, account picker, date picker and tag
  input are lightweight in-screen sheets (RN `Modal`), not routes. They must not
  stack more than one deep.

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
| Squads tab, squad detail | Squads space |
| Squad entry | Drag & Split flow (split half, v1.5) |
| Settle up | Settle Up payment |
| Screens with no Stitch source (accounts, budgets, recurring, import, filter sheet) | Compose from existing tokens and components: `Card`, `MonoTag`, `TactileButton`, the segmented gauge. **No new visual primitives** without a Stitch screen |

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
