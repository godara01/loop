# 08 — Domain Model

The shapes everything moves around, and the changes `@loop/shared` needs before
feature work starts. **Where these documents are stored** — collections, rules,
Functions — is [11-firebase.md](11-firebase.md). This doc is about the types.

## Layering

```
packages/shared/types.ts       ← the domain types below. Pure TS.
        │
        │  converters (core/db/converters.ts)
        ▼
Firestore documents            ← Timestamps, nested maps, doc ids
```

The app never sees a Firestore document and Firestore never sees a `Money`
object. Converters are the only place the two meet, and they validate rather than
coerce: an unexpected field shape throws instead of silently producing `NaN`.

## Entities

```ts
// Unchanged, already implemented
interface Money   { minor: number; currency: CurrencyCode }        // money.ts
interface Allocation { memberId: string; amount: Money }           // split.ts
interface Balance / Transfer                                        // settle.ts
interface StreakState { current; longest; lastLoggedOn }            // streak.ts

// Changed in v1
interface Expense {
  id: string;
  categoryId: string;               // was: category: ExpenseCategory
  total: Money;                     // named `total`, so Expense stays structurally
                                    // assignable to settle.ts's ExpenseLike
  description: string;
  note: string | null;
  occurredAt: string;               // ISO instant
  localDate: string;                // 'YYYY-MM-DD', device-local, stored
  source: 'manual' | 'sms' | 'shared' | 'group';
  receiptPath: string | null;       // Cloud Storage path, not a URL
  pendingId: string | null;         // set when approved from the inbox
  // Group-ready from day one, null/self in v1:
  groupId: string | null;
  paidBy: string;
  splitMode: SplitMode;
  allocations: readonly Allocation[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// New in v1
interface Category         // docs/04
interface PendingExpense   // docs/12
interface CoinLedgerEntry  // docs/06
interface Wallet          { coinBalance: number; updatedAt: string }
interface DailyRollup     { date: string; total: Money; count: number;
                            byCategory: Record<string, number> }
interface UserProfile     { uid: string; displayName: string;
                            currency: CurrencyCode; onboardedAt: string | null;
                            isAnonymous: boolean }
```

### Why the group fields exist in v1

Every v1 expense writes `groupId: null`, `paidBy: <self>`, `splitMode: 'even'`,
and a single allocation to the user. That costs nothing and means every v1 row is
already a valid `ExpenseLike` for
[`settle.ts`](../packages/shared/src/settle.ts). When groups ship, the group
feature reads existing data instead of migrating it.

### Why `localDate` is stored

Every day-wise query in [05-insights.md](05-insights.md) filters and orders on it.
Deriving it from `occurredAt` at query time is unindexable in Firestore and gets
the timezone wrong. It is computed once, on write, with `todayISO()`-style local
resolution.

## Required changes to `@loop/shared`

These land as **one PR, before feature work**:

1. **`Category` entity**, `CategoryIcon`, `CategoryColorToken`, and the bundled
   catalogue — [04-categories.md](04-categories.md).
2. **`Expense.category` → `Expense.categoryId`**, plus the group-ready fields
   above. `ExpenseCategory` becomes `EssentialCategorySlug`, demoted to seed data.
3. **`insights.ts`** — `totalsByCategory`, `totalsByDay`, `periodTotal`,
   `compareToPrevious`, and rollup-fed variants of the same
   ([05-insights.md](05-insights.md)).
4. **`coins.ts`** — coin rules, caps and deterministic ledger-entry ids, as pure
   functions shared by the app and Cloud Functions
   ([06-gamification.md](06-gamification.md)).
5. **`sms/`** — the transaction parser and template registry
   ([12-sms-ingest.md](12-sms-ingest.md)).
6. **`firestore/`** — collection path builders and converter *types* only. No
   Firebase SDK import.
7. **Palette additions** — `ice`, `amber`, `rose` plus their `onAccent` pairs in
   [`theme.ts`](../packages/shared/src/theme.ts), transcribed from Stitch.

Unchanged and used as-is: [`money.ts`](../packages/shared/src/money.ts),
[`split.ts`](../packages/shared/src/split.ts),
[`settle.ts`](../packages/shared/src/settle.ts),
[`streak.ts`](../packages/shared/src/streak.ts).

**`packages/shared` MUST stay free of React, React Native and Firebase imports.**
It is consumed by the app, by Cloud Functions, and by the MCP server later. An
ESLint `no-restricted-imports` rule enforces it.

## Invariants

Enforced in three places — types, security rules, and tests — because any one of
them alone is insufficient.

| Invariant | Enforced by |
|---|---|
| Money is an integer count of minor units | `money()` throws; rules check `is int` |
| An expense amount is > 0 | Rules `CHECK`; entry validation |
| Allocations sum exactly to the total | `allocate()` throws |
| Displayed percentages sum to 100 | Largest-remainder in `insights.ts` |
| One check-in per local date | Firestore document id **is** the date |
| Coins are append-only and server-written | Security rules deny client writes |
| Every read filters `deletedAt == null` | Repository layer; no raw queries elsewhere |

## Local cache

There is no second local database. **Firestore's offline persistence is the local
store** ([10-architecture.md](10-architecture.md#offline-and-optimistic-writes)),
with unlimited cache size. Adding SQLite alongside it would create two caches
that disagree after an offline write — the exact moment correctness matters most.

The only local storage outside Firestore is **MMKV**, holding device preferences
that must be readable before Firestore is warm: haptics enabled, keep-it-plain,
last insights period, and the onboarding gate flag.

`expo-sqlite` stays in `app.json` for now but is unused by v1; remove it if
nothing claims it by the time entry ships.

## Indexes

Composite indexes are checked in at `firestore.indexes.json`. The full list is in
[11-firebase.md](11-firebase.md#indexes). The rule that matters here: **every
query is bounded** — by `localDate` range, by `limit`, or both. An unbounded
collection listener is a review rejection and a billing incident.

## Export

**You → Export** writes a CSV of all non-deleted expenses (date, category, amount
in major units, description, note) and shares it via the system sheet.

- Generated **from the local cache**, so it works offline.
- Amounts are formatted from integer minor units and MUST round-trip to the same
  integers if re-imported.
- This is the escape hatch that makes anonymous-account usage an acceptable trade
  rather than a trap ([11-firebase.md](11-firebase.md#auth-model)).

## Seed data

[`mock.ts`](../apps/mobile/src/data/mock.ts) stays until the repositories land,
then is **deleted** — not left as a fallback. A dev-only seeder that writes a year
of plausible expenses into the emulator replaces it, for the performance criteria
in [03](03-expenses.md#acceptance-criteria) and [05](05-insights.md#performance).

## Acceptance criteria

- [x] `npm run typecheck` passes across all workspaces after the shared changes.
      (proof: `npm run typecheck` exits 0 across @loop/mobile, @loop/shared and @loop/functions)
- [x] `packages/shared` has zero React, React Native and Firebase imports, with a
      lint rule proving it.
      (proof: scripts/check-invariants.mjs rule 2 "shared-no-react-native-firebase")
- [ ] The same `coins.ts` and `streak.ts` functions are imported by both the app
      and Cloud Functions.
- [x] A converter given a malformed document throws rather than yielding `NaN`.
      (proof: packages/shared/src/__tests__/firestore.test.ts › "rejects a document that is not an object at all")
- [x] Every v1 expense is a valid `ExpenseLike` for `settle.ts` with no mapping.
      (proof: packages/shared/src/__tests__/expenses.test.ts › "is already a valid settlement input that nets to zero")
- [x] Export → re-import produces byte-identical `amountMinor` values.
      (proof: packages/shared/src/__tests__/csv.test.ts › "round-trips Number.MAX_SAFE_INTEGER exactly, with an exact display amount")
