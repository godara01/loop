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

## Transactions

**Schema v2, from v1.2.** The `expenses` collection keeps its name and now holds
**every transaction kind**. Renaming it would mean migrating every document for no
user-visible gain. "Expense" in code and paths means *transaction*. `kind` is what
says which.

```ts
type TransactionKind = 'expense' | 'income' | 'refund' | 'transfer' | 'settlement' | 'loan';

interface Expense {                       // v1 fields above, plus — all optional on read:
  kind: TransactionKind;                  // missing → 'expense'
  categoryId: string;                     // NEVER null; 'sys-transfer' | 'sys-settlement' | 'sys-loan' for kinds without one
  accountId: string | null;               // docs/18
  toAccountId: string | null;             // transfer only
  refundOf: string | null;                // refund only
  merchant: string | null;                // ≤ 40, docs/22
  merchantKey: string | null;             // ≤ 64
  tagIds: readonly string[];              // ≤ 10, docs/21
  lines: readonly { categoryId: string; amountMinor: number }[] | null;  // ≤ 10, docs/03
  categoryIds: readonly string[];         // derived from lines (or [categoryId])
  recurringId: string | null;             // docs/20
  importId: string | null;                // docs/24
  createdLocalDate: string | null;        // device-local date at creation, docs/06
  // squad mirrors only (server-written), docs/23:
  groupRefId: string | null;
  paidMinor: number | null;
  direction: 'in' | 'out' | null;
  excludeFromSpend: boolean;              // missing → false
  schemaVersion: 1 | 2;                   // missing → 1
}
```

**Kinds and amounts:** `total.minor` is **always ≥ 0, and > 0 for everything a
client writes**. Direction comes from `kind` (and `direction` for mirrors). There
are no negative amounts in storage. The arithmetic for spend, income and net
lives in `insights.ts` ([17](17-money-in-and-out.md#the-transaction-kinds)).

**Parsing:** `parseExpense` stays strict about the **types** of fields that are
present, and lenient about **absence**: every new field has a default. That is
how v1 documents stay valid with no migration.

### Mirrors

Squad mirrors (`source: 'group'`, id `g_{groupId}_{entryId}` or `s_{groupId}_{settlementId}`)
are copies of the user's part of a squad record ([23](23-squads.md#mirrors)). They
differ from every other transaction:

| Property | Normal transaction | Mirror |
|---|---|---|
| `amountMinor` | > 0 | **≥ 0** (the share can be 0 when you only paid) |
| `allocations` | One self-allocation summing to the total | **`[]`**. A mirror is **not** an `ExpenseLike` and never goes into `settle.ts` |
| Writer | Client | Function. The client may update only `categoryId`, `accountId`, `tagIds`, `note` |
| Coins / check-in | Per [06](06-gamification.md#what-counts) | Never |
| Account effect | ± amount | −`paidMinor` (expense) or ± amount by `direction` (loan, settlement) |
| CSV export | Exported | Exported with `source=group`. **Skipped on re-import** ([24](24-import.md)) |

`parseExpense` has a **separate branch** for `source == 'group'` that allows these
differences. Every other source keeps the v1 rules.

## Entities added after v1

All are framework-free types in `packages/shared`. Each doc owns the full
definition.

| Entity | Path | Writer | Doc |
|---|---|---|---|
| `Account` | `users/{uid}/accounts/{id}` | Client | [18](18-accounts.md) |
| `AccountBalance` | `users/{uid}/accountBalances/{id}` | Function | [18](18-accounts.md#the-balance) |
| `Budget` | `users/{uid}/budgets/{id}` | Client | [19](19-budgets.md) |
| `RecurringRule` | `users/{uid}/recurring/{id}` | Client | [20](20-recurring.md) |
| `Tag` | `users/{uid}/tags/{id}` | Client | [21](21-tags.md) |
| `MerchantMemory` | `users/{uid}/merchants/{key}` | Client | [22](22-merchants-and-suggestions.md) |
| `AiUsage` | `users/{uid}/aiUsage/{date}` | Function | [22](22-merchants-and-suggestions.md) |
| `ImportRecord` | `users/{uid}/imports/{id}` | Client + Function | [24](24-import.md) |
| `GroupPrefs` | `users/{uid}/groupIndex/{groupId}` | Client | [23](23-squads.md) |
| `PayeeLink` | `users/{uid}/payees/{p2pKey}` | Client | [23](23-squads.md#settlement-suggestions) |
| `Device` | `users/{uid}/devices/{installationId}` | Client | [25](25-notifications.md) |
| `SchemaMeta` | `users/{uid}/meta/schema` | Function / script | [27](27-full-ledger-plan.md) |
| `Group`, `GroupEntry`, `Settlement` | `groups/{g}`, `…/expenses`, `…/settlements` | Client (rules-validated) | [23](23-squads.md) |
| `GroupBalance`, `GroupSummary`, `GroupActivity`, applied markers | `groups/{g}/…` | Function | [23](23-squads.md) |
| `Invite` | `groupInvites/{code}` | Function | [23](23-squads.md#invites-and-joining) |
| `Category` (changed) | adds `type`, `parentId` | Client | [04](04-categories.md) |
| `UserProfile` (changed) | adds `categoriesSeedVersion` | Client | [04](04-categories.md#income-categories) |
| `UserSettings` (changed) | adds `lastAccountByKind`, `pinnedTag`, `notifications`, `smartSuggestions`, `widgetShowAmounts`, `importMappings` | Client | various |

New pure modules in `packages/shared/src`: `accounts.ts`, `budgets.ts`,
`recurring.ts`, `tags.ts`, `merchants.ts`, `groups.ts`, `import.ts`,
`widget.ts`, `sms/refund-match.ts`, `sms/transfer-pair.ts`. Changed: `insights.ts`
(kinds, lines, parents, projection, savings), `rollups.ts` (v2 buckets and
markers), `settle.ts` (settlements), `csv.ts` (v2 columns), `expenses.ts`
(validators per kind), `firestore/paths.ts` (every new path, plus the rollup
paths that are hand-built today).

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
| A client-written amount is > 0; only mirrors may be 0 | Rules; `parseExpense` mirror branch |
| Split lines sum exactly to the total | `validateLines()`; converter on read; rules cap the size |
| Squad allocations sum exactly to the entry amount | `allocate()`; Function `invalid` flag; shared read parser |
| A refund never exceeds the original's refundable remainder | Entry validation; display clamp + conflict flag for offline races |
| A transfer's two accounts differ | `validateTransaction()`; rules |
| `categoryId` is never null | Reserved `sys-*` ids; rules `is string` |
| Clients edit only the user-owned fields of a mirror | Rules `affectedKeys().hasOnly(...)` |
| Squad balances sum to zero | `computeBalances`; Functions test after every scenario |
| Derived server data (rollups, account flows, balances) is rebuildable from source | `rebuildUserLedger`; parity tests |
| Every new field is optional on read | Converter defaults; a v1-fixture test suite that must keep passing |

## Local cache

There is no second local database. **Firestore's offline persistence is the local
store** ([10-architecture.md](10-architecture.md#offline-and-optimistic-writes)),
with unlimited cache size. Adding SQLite alongside it would create two caches
that disagree after an offline write — the exact moment correctness matters most.

There is **no MMKV**. Preferences live in Firestore `settings/app`
([10](10-architecture.md#state-management)). An earlier draft of this doc planned
MMKV, but it was never needed. The only on-device storage outside Firestore:

- **SecureStore**: the notification `installationId` ([25](25-notifications.md)).
- **The widget library's SharedPreferences**: the widget snapshot
  ([26](26-shortcuts-and-widget.md)).
- **expo-notifications**' own schedule store.

`expo-sqlite` was removed in M8 and stays out.

## Indexes

Composite indexes are checked in at `firestore.indexes.json`. The full list is in
[11-firebase.md](11-firebase.md#indexes). The rule that matters here: **every
query is bounded** — by `localDate` range, by `limit`, or both. An unbounded
collection listener is a review rejection and a billing incident.

## Export

**You → Export** writes a CSV of all non-deleted transactions and shares it via
the system sheet. Columns v1: date, category, amount in major units, description,
note.

**Columns v2** (each release extends the round-trip test in the same task that
adds the field): `kind`, `account` (name), `toAccount` (name), `refundOf`,
`merchant`, `tags` (names joined by `;`), `lines` (`SLUG:amount|SLUG:amount`),
`recurring` (rule description), `source`. Loop CSV v1 files still import
([24](24-import.md)). This export is the escape hatch for the account-switch flow
([16](16-account-linking.md#flow-switching-to-an-existing-account)), so it must
stay lossless for every field a user can set.

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
- [x] The same `coins.ts` and `streak.ts` functions are imported by both the app
      and Cloud Functions.
      (proof: functions/src/handlers.ts imports `evaluateCoinEvent`, `completesWeek` and
      `recordActivity`; apps/mobile orbit-screen.tsx imports the same three for the
      optimistic streak and `+N` — 2026-09-28)
- [x] A converter given a malformed document throws rather than yielding `NaN`.
      (proof: packages/shared/src/__tests__/firestore.test.ts › "rejects a document that is not an object at all")
- [x] Every v1 expense is a valid `ExpenseLike` for `settle.ts` with no mapping.
      (proof: packages/shared/src/__tests__/expenses.test.ts › "is already a valid settlement input that nets to zero")
- [x] Export → re-import produces byte-identical `amountMinor` values.
      (proof: packages/shared/src/__tests__/csv.test.ts › "round-trips Number.MAX_SAFE_INTEGER exactly, with an exact display amount")
      (device: 2026-09-28, a 500-expense export pulled from Loop_API35 re-parses to
      the seeded total and per-category sums exactly)

### Acceptance criteria added after v1

- [ ] (v1.2) A fixture set of every v1 document shape parses unchanged under the v2
      converters.
- [ ] (v1.2) Each invariant added above has a test named after it.
- [ ] (each release) The CSV round-trip test covers every field the release adds.
