# 26 — Quick Actions and the Home-screen Widget

> **Release:** v1.6 (Phase P6 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> The iOS widget is on the iOS track.
> **Tasks:** `W*` in [`TASKS.md`](../TASKS.md).

The fastest expense entry is the one that skips opening the app first. There are
two shortcuts: long-press quick actions on the app icon, and an Android
home-screen widget.

## Quick actions

Package: `expo-quick-actions` (Android app shortcuts and iOS home-screen quick
actions).

| Action | Opens |
|---|---|
| **Log expense** | `loop://expense/new` |
| **Log income** | `loop://expense/new?kind=income` |
| **Inbox** | `loop://inbox`. Only shown on Android with SMS capture enabled, or when items are due |

- They are static items, set once at app start. The Inbox item is updated when its
  visibility changes.
- **Cold start:** the bootstrap gate ([10](10-architecture.md#feature-bootstrap-sequence))
  runs first. The deep link is held and applied once the gate settles, so the
  entry sheet opens over Orbit and the 10-second target still holds.
- Not onboarded yet: the link is dropped and onboarding shows.
- `docs/01` deep links: `loop://expense/new` (already registered),
  `loop://expense/new?kind=income`, `loop://inbox`.

## Android widget

Package: `react-native-android-widget`. The widget is rendered with the library's
own primitives (`FlexWidget`, `TextWidget`, `ImageWidget`) in a headless JS task.
**Skia, Reanimated and React Native views can't render inside a widget**, so the
widget re-creates the Tactile Neo-Fin look with plain shapes: a 1.5px border, a
hard offset plate drawn as a second rectangle, JetBrains Mono for the numbers, and
Deep Void on Electric Lime for the + plate.

### Layouts

| Size | Content |
|---|---|
| **2×1** | *TODAY* label, today's spend in mono, a lime **+** plate |
| **4×1** | Adds the month budget gauge (10 segments drawn as boxes) and *"₹6,200 left"*, or the month's spend when there's no budget |
| **4×2** | Adds the last 3 transactions (description + amount) and an **Inbox (N)** chip when proposals are pending |

**+** opens `loop://expense/new`. Tapping elsewhere opens the app on Orbit.

### Privacy: "Hide amounts" is on by default

A home screen is visible to anyone near the phone. By default the widget shows
`₹ ••••` for every amount, and the gauge stays visible because it carries no
numbers. **You → Widget** has the switch **Show amounts on widget**, off by
default, stored in `settings/app.widgetShowAmounts`.

### Where its data comes from

The widget **never** reads Firestore. A headless task can't rely on the app's
Firestore instance being alive, and starting a second one would double reads and
cache. Instead, the app **pushes a snapshot**:

```ts
// packages/shared/src/widget.ts (pure)
interface WidgetSnapshot {
  readonly v: 1;
  readonly asOf: string;            // ISO; when the app computed this
  readonly localDate: string;       // the date "today" refers to
  readonly todaySpend: Money;
  readonly month: { readonly spent: Money; readonly budget: Money | null; readonly segments: number };
  readonly recent: readonly { readonly description: string; readonly amount: Money; readonly kind: string }[];
  readonly inboxCount: number;
  readonly showAmounts: boolean;
}
function buildWidgetSnapshot(now, transactions, budget, inboxCount, settings): WidgetSnapshot;
```

- The app rebuilds the snapshot and calls `requestWidgetUpdate` whenever an input
  changes: after a save, delete or approve, on foreground, on a settings change,
  and at most once every 5 seconds (debounced).
- The snapshot is stored with the widget library's storage (SharedPreferences).
- **Stale data:** if `snapshot.localDate != today` when the widget renders (for
  example the first render after midnight), *TODAY* shows `₹0`, the gauge shows the
  month only if the month hasn't changed, and a small mono *"as of 23:58"* appears.
  The widget never shows yesterday's number labelled as today.
- Android refreshes widgets at least every 30 minutes (`updatePeriodMillis`), which
  re-renders with the same snapshot to apply the date rule above.

### Signed out or reset

Sign-out and Reset write an **empty snapshot**. The widget then shows *"Open Loop
to set up"*.

## iOS widget (iOS track)

WidgetKit through an Expo config plugin and an App Group for the snapshot, with
the same `WidgetSnapshot` contract. It is deferred because it needs Apple
enrolment to build and test.

## Haptics

Quick actions and widget taps open the app. The haptic belongs to whatever screen
opens. The widget itself can't vibrate.

| Action | Event |
|---|---|
| Show amounts on widget switch | `toggleOn` / `toggleOff` |

## Edge cases

| Case | Behaviour |
|---|---|
| Widget added before onboarding | *"Open Loop to set up"* |
| Midnight passes with the app closed | The date rule shows `₹0 · as of 23:58` until the app is opened |
| Budget removed | The 4×1 shows the month's spend instead |
| `Keep it plain` | No effect, because the widget has no gamification |
| Squad mirrors | Included in today's spend if they count toward spend (`excludeFromSpend` false) |
| The app is force-stopped | The widget still renders its last snapshot. Tapping + cold-starts the app |
| Device language/locale | Amount formatting uses the same `formatMoney` as the app |

## Acceptance criteria

- [ ] `buildWidgetSnapshot` tests: hidden amounts, a stale date, no budget, income
      excluded from today's spend, excluded mirrors.
- [ ] Quick action **Log expense** from a cold start opens the entry sheet after
      the bootstrap gate (device).
- [ ] The widget never imports the Firestore SDK (invariant check: the widget
      task file has no `@react-native-firebase` import).
- [ ] With default settings, the widget shows no amount (device screenshot in the D
      queue).
