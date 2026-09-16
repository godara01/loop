# 10 — Architecture

How the code is arranged, what may import what, and where each kind of state
lives. Written against the **end state** — full personal expense management plus
full group management — so that v1 does not have to be unpicked to get there.

## The shape

Four layers. Dependencies point downward only.

```
        ┌─────────────────────────────────────────────┐
  UI    │  app/ (routes)  ·  features/*/screens        │  React, Expo Router
        ├─────────────────────────────────────────────┤
  APP   │  features/*/hooks  ·  core/state (Zustand)   │  Orchestration, no I/O
        ├─────────────────────────────────────────────┤
  DATA  │  features/*/api (repositories)  ·  core/firebase │  Firestore, Functions, Storage
        ├─────────────────────────────────────────────┤
 DOMAIN │  packages/shared                             │  Pure TS. No React, no Firebase.
        └─────────────────────────────────────────────┘
```

**The domain layer never imports anything.** `packages/shared` holds money,
splits, settlement, streaks, coins and insight maths as pure functions. It is
consumed by the app today, by Cloud Functions tomorrow, and by the MCP server
later — the same arithmetic, compiled once. A Firebase import in
`packages/shared` is a build-breaking mistake.

## Folder structure

```
packages/shared/src/
  money.ts split.ts settle.ts streak.ts coins.ts insights.ts
  categories.ts        Catalogue definitions + seed set
  types.ts theme.ts
  firestore/           Converters + collection path builders (types only, no SDK)

apps/mobile/src/
  app/                 Expo Router routes ONLY — a route file is <40 lines and
                       renders one screen component. No logic, no queries.

  features/
    onboarding/
    expenses/
      api/             expense-repository.ts        Firestore reads/writes
      hooks/           use-expenses.ts, use-save-expense.ts
      components/      amount-pad.tsx, category-strip.tsx, expense-row.tsx
      screens/         expense-entry-screen.tsx, ledger-screen.tsx
      model/           Feature-local view types (not domain types)
      index.ts         The feature's PUBLIC surface
    categories/
    insights/
    streaks/           Check-in, streak, coins wallet
    inbox/             SMS-derived unapproved expenses (docs/12)
    groups/            Reserved for v1.1. Empty in v1.
    profile/

  core/
    firebase/          app.ts auth.ts db.ts functions.ts storage.ts
    db/                converters.ts paths.ts query-helpers.ts
    state/             session-store.ts ui-store.ts draft-store.ts
    ui/                Design-system primitives (today's components/ui)
    lib/               haptics.ts dates.ts format.ts result.ts
    providers/         auth-provider.tsx bootstrap-provider.tsx
```

### Import rules

These are enforceable with an ESLint boundary rule and should be, before the
second feature is written.

1. `packages/shared` imports **nothing** from `apps/`.
2. `core/*` imports `packages/shared` and other `core/*`. Never `features/*`.
3. `features/A` imports `core/*` and `packages/shared`. It may import
   `features/B` **only** through `features/B/index.ts` — never a deep path.
4. `app/*` imports feature screens and nothing else. Routes are wiring.
5. Only `core/firebase/*` and `features/*/api/*` may touch the Firebase SDK. A
   component importing `firestore()` is a review rejection.

Rule 3 is what keeps groups from tangling into expenses. Group splitting will
need to read categories and write expenses; it does that through their public
surfaces, so either feature can be rewritten behind its `index.ts`.

## State management

The single most common way to get this wrong is to put a second cache in front
of Firestore. **Firestore is already the cache**: it persists offline, dedupes
listeners, queues writes, and pushes realtime updates. Wrapping it in TanStack
Query or a Redux mirror produces two sources of truth that disagree at exactly
the wrong moment — right after a write, offline.

| State | Lives in | Why |
|---|---|---|
| Persisted domain data (expenses, categories, groups, coins) | **Firestore + its offline cache**, read through repository hooks | One source of truth, realtime, offline-durable |
| Auth session, current user profile | **`AuthProvider`** context over the Firebase Auth listener | Read by everything, changes rarely |
| Cross-screen client state (entry draft, insight period, filters) | **Zustand** slices in `core/state` | Small, no boilerplate, no provider tree, easy to persist |
| Device preferences (haptics, keep-it-plain, last period) | **Firestore `settings/app`** through `SettingsProvider`, which also mirrors `hapticsEnabled` into the haptic module | Firestore's cache is already warm inside the bootstrap gate, so a second on-device store would add a native dependency and a rebuild for nothing. Add MMKV only when something must be read *before* the gate — nothing is yet |
| Ephemeral UI (open sheet, focused field) | `useState` in the component | Not worth lifting |
| Derived money, splits, insights | **Pure functions in `packages/shared`**, memoised on `(inputs)` | Testable without a device or emulator |

**No Redux. No TanStack Query.** If a genuinely non-Firestore async source
appears later (a REST FX-rate API, say), add TanStack Query *for that source
only* — not for Firestore.

### The repository pattern

Every Firestore access goes through a repository. Screens and hooks never see a
`QuerySnapshot`, a `Timestamp`, or a raw document.

```ts
// features/expenses/api/expense-repository.ts
export function observeExpenses(
  uid: string,
  period: Period,
  onChange: (expenses: Expense[]) => void,
): Unsubscribe;

export async function saveExpense(uid: string, draft: ExpenseDraft): Promise<Expense>;
export async function softDeleteExpense(uid: string, id: string): Promise<void>;
```

Repositories own **converters** (`withConverter`), which are the one place
`Timestamp` becomes an ISO string and `amountMinor` becomes `Money`. A converter
that silently drops an unknown field is a data-loss bug; converters validate and
throw.

This boundary is also what makes group expenses cheap later: `observeExpenses`
gains an overload for a group path, and every screen above it is unchanged.

### Hooks

```ts
// features/expenses/hooks/use-expenses.ts
export function useExpenses(period: Period) {
  // subscribes via the repository, returns { expenses, loading, error, fromCache }
}
```

- Hooks expose `fromCache` so the UI can show the offline pill. Never hide it.
- One listener per logical query, mounted at the highest screen that needs it.
  Two components needing the same data share via the hook, not two listeners.
- Every listener is torn down on unmount. A leaked Firestore listener bills.

## Offline and optimistic writes

Firestore writes resolve locally first and sync later. That gives optimistic UI
for free, and it means **a saved expense must appear instantly with no spinner,
airplane mode or not**. Rules:

- Never `await` a Firestore write before dismissing the entry sheet. Await only
  the local resolution the SDK gives synchronously through the snapshot.
- Documents with `metadata.hasPendingWrites` render normally, with a small mono
  `SYNCING` tag. Not a spinner, not a disabled state.
- The only true failure is a **rules rejection**, which surfaces later. Those go
  to a small conflict queue in `inbox/` rather than a toast the user may miss.
- Anything the client is not trusted to compute (coins) is written by a Cloud
  Function and therefore is **not** available offline instantly. The UI shows
  the coin award as pending and reconciles when it lands. See
  [11-firebase.md](11-firebase.md#trust-boundary).

## Feature bootstrap sequence

`core/providers/bootstrap-provider.tsx` gates the first render:

1. Load fonts (already gating the splash in [`_layout.tsx`](../apps/mobile/src/app/_layout.tsx))
2. Init Firebase, enable Firestore persistence, install App Check
3. Resolve the auth session (anonymous or signed-in)
4. Read the local preference store from MMKV
5. Read `profile.onboardedAt` — from cache if offline
6. Hide the splash, route to onboarding or tabs

Steps 2–5 run in parallel where possible; the whole sequence has a **2 second**
budget before the splash is considered stuck, after which the app proceeds in
degraded mode rather than hanging on a network call.

## Error handling

- Repositories return typed failures, never throw raw Firebase errors upward.
  `core/lib/result.ts` provides `Result<T, AppError>`.
- Every user-facing failure has a haptic (`error`) and an inline message. No
  silent catches — the one exception is `haptic()` itself, which swallows by
  design ([07-haptics.md](07-haptics.md)).
- Crashlytics gets the error; the user gets a sentence.

## Dev-build-only hazards

Two things about a **development build** that are invisible in the design file
and absent from a release build, discovered building the entry sheet
([03-expenses.md](03-expenses.md#implementation-notes)):

- **The top-right corner is claimed by Expo's floating "open dev menu" button**
  on every dev build. It sits above the app's own views and swallows taps meant
  for anything underneath it. Keep interactive controls — especially icon-only
  ones — out of roughly the top-right 70×70dp of every screen, or place them
  lower in the layout entirely. The entry sheet's duplicate/delete actions moved
  from the header's top-right into their own row for exactly this reason.
- **`edgeToEdgeEnabled: true` (in `app.json`) disables Android's automatic
  resize-on-keyboard behaviour.** A fixed footer below a scrollable region — a
  Save button, say — can end up rendered behind the keyboard with nothing able
  to scroll it into view. Wrap any screen with that shape in
  `KeyboardAvoidingView` (`behavior="height"` on Android, `"padding"` on iOS)
  rather than relying on the OS to resize the window.

Both are easy to miss in an emulator screenshot taken with the keyboard closed,
and easy to miss in Expo Go (whose dev menu button behaves differently) — they
only show up once a real flow types into a field or taps that corner. The
Maestro flows in `e2e/flows/` caught both live.

## Testing

| Layer | How |
|---|---|
| `packages/shared` | Vitest/Jest, pure unit tests. This is where money, split, streak and coin rules are proven. Fast, no emulator. |
| Repositories | Firebase Emulator Suite, including **security-rules tests** — rules are code and get tested like code |
| Cloud Functions | Emulator, unit tests on the same `packages/shared` functions |
| Hooks/screens | React Native Testing Library against a fake repository |
| Tactile feel | A physical mid-range Android. Not automatable. |

The security-rules test suite is not optional. A rules mistake in a money app is
the highest-severity bug class available.

## Build and workflow consequence

`@react-native-firebase` is a native module, so **development moves from Expo Go
to an EAS development build**. See [11-firebase.md](11-firebase.md#sdk-choice)
for why the native SDK is the right call despite that cost. SMS ingestion
([12-sms-ingest.md](12-sms-ingest.md)) requires a dev build regardless, so this
happens either way.

Given this machine has no Android SDK and JDK 25, dev builds are produced by EAS
and installed on device. Local `expo prebuild` is not part of the workflow.
