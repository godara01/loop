# 11 — Firebase

Firebase is the backend. This doc fixes which services are used for what, the
Firestore data model, the trust boundary, and the security rules that enforce it.

## SDK choice

**`@react-native-firebase` (native), not the Firebase JS SDK.**

The JS SDK runs in Expo Go, which is tempting, but Firestore's offline
persistence is not supported in React Native under the JS SDK — the cache is
memory-only. Loop's first principle is that the app is fully usable offline, so a
memory-only cache is disqualifying, not inconvenient.

Consequences, accepted deliberately:

- Development moves from **Expo Go to an EAS development build**. SMS ingestion
  ([12-sms-ingest.md](12-sms-ingest.md)) requires a dev build anyway.
- Config plugins for each RNFirebase module go in `app.json`.
- `google-services.json` / `GoogleService-Info.plist` are **not committed**; they
  are EAS secrets, referenced by file. `.env` keeps only public config.

## Services and what each is for

| Service | Used for | Notes |
|---|---|---|
| **Auth** | Identity | Anonymous at first launch; upgraded by linking Google / Apple / phone |
| **Firestore** | All domain data | Offline persistence on, unlimited cache size |
| **Cloud Functions** | Everything the client must not be trusted to compute: coin awards, rollups, group balances, invite redemption | Node, importing `packages/shared` for the maths |
| **Cloud Storage** | Receipt images, custom category logos | Per-user path, rules-scoped |
| **App Check** | Blocks non-app clients from the API | Play Integrity + App Attest. Enforced from day one, not retrofitted |
| **Remote Config** | Kill-switches and rollout flags: SMS ingest, auto-categorisation, the category catalogue version | Lets a bad parser be disabled without a store release |
| **Crashlytics** | Crash and error reporting | Never log amounts, descriptions or SMS bodies |
| **Analytics** | Funnel and retention only | Event names only. No expense values, ever |
| **Cloud Messaging** | Squad activity push — **v1.5**, opt-in | Tokens from `expo-notifications` `getDevicePushTokenAsync()`. No `@react-native-firebase/messaging` ([25](25-notifications.md)) |
| **Hosting** | **v1.5**: invite App Links (`assetlinks.json`, AASA) and the `/i/{code}` fallback page | See [Hosting](#hosting) |
| **Vertex AI (Gemini)** | **v1.3**: opt-in category suggestions, called only from the `suggestCategories` callable | Same GCP project. Never called from the client ([22](22-merchants-and-suggestions.md)) |
| **Emulator Suite** | Local dev and rules tests | The only way most of this is testable without spending money |
| **App Distribution** | QA builds to testers | |

Deliberately **not** used: Realtime Database (Firestore covers it), Dynamic
Links (shut down August 2025; invites use Hosting App Links plus a short code),
Firestore-backed full-text search (use a client-side filter),
`@react-native-firebase/messaging` (conflicts with `expo-notifications` on
Android), and the client-side AI Logic SDK (no per-user cap, and the prompt would
ship in the binary). Hosting **was** on this list for v1. It is used from v1.5,
for invite links only.

## Auth model

Onboarding still asks for **no account**. First launch calls
`signInAnonymously()`, which produces a real `uid`, so every rule below works and
the data model never has an "unowned" state.

```
Anonymous uid  ──link──▶  Google / Apple / Phone credential   (same uid, data intact)
```

- The upgrade prompt appears when the user first does something that needs
  durability across devices: joining a group, or explicitly tapping **Back up my
  data** in You.
- **The prompt is never a wall.** An anonymous user can use every v1 feature
  indefinitely.
- Losing the device without linking loses the data. That is stated plainly at the
  end of onboarding, once, and in You. The CSV export
  ([08-data-model.md](08-data-model.md#export)) is the escape hatch.
- Account deletion (App Store and Play requirement): a Function deletes the whole
  `users/{uid}` subtree and Storage prefix, then the auth record. From v1.5 it
  first turns the user's squad seats into placeholders ([23](23-squads.md#account-deletion)).
- **v1.1 linking** ships Google and Phone. Apple ships on the iOS track. The
  flows, error handling and account switching are in [16](16-account-linking.md).
  Email and phone numbers are never written to Firestore.

## Firestore data model

Paths are built by `core/db/paths.ts` — never string-concatenated at a call site.

```
users/{uid}                             Profile doc: displayName, currency,
                                        onboardedAt, categoriesSeededAt,
                                        createdAt, updatedAt
  settings/app                          hapticsEnabled, keepItPlain, insightsPeriod
  wallet/main                           coinBalance, updatedAt   ← Function-written
  streak/main                           current, longest, lastLoggedOn

  categories/{categoryId}               slug, name, iconRef, colorToken, kind,
                                        sortOrder, archivedAt
  expenses/{expenseId}                  amountMinor, currency, categoryId,
                                        description, note, occurredAt (ISO, UTC),
                                        localDate ('YYYY-MM-DD'), receiptPath,
                                        source ('manual'|'sms'|'group'),
                                        groupId (null in v1), deletedAt
  pendingExpenses/{pendingId}           SMS-derived, unapproved. See docs/12
  checkIns/{YYYY-MM-DD}                 source, createdAt        ← doc id IS the date
  coinLedger/{entryId}                  ruleId, coins, localDate, refId, createdAt
                                                                 ← Function-written
  dailyRollups/{YYYY-MM-DD}             totalMinor, count, byCategory{}
                                                                 ← Function-written
  monthlyRollups/{YYYY-MM}              totalMinor, count, byCategory{}, byDay{}
                                                                 ← Function-written
  groupIndex/{groupId}                  Denormalised membership index for "my groups"
  devices/{deviceId}                    FCM token, platform, lastSeenAt

catalog/meta                            version, updatedAt
catalog/categories/entries/{slug}       Global catalogue: name, icon, logoUrl,
                                        colorToken, section. Read-only to clients

groups/{groupId}                        v1.1 — name, currency, memberIds[],
                                        members{uid: role}, createdBy, archivedAt
  expenses/{expenseId}                  paidBy, splitMode, allocations[]
  settlements/{settlementId}
  balances/{uid}                        netMinor                 ← Function-written
groupInvites/{code}                     groupId, memberId, expiresAt, usesLeft, createdBy  ← Function-only

— added after v1 (each doc owns the full shape) —
users/{uid}
  meta/schema                           ledger: 2, migratedAt                    ← server-only (v1.2)
  accounts/{id}                         docs/18                                   (v1.2)
  accountBalances/{id}                  flowMinor                                ← Function (v1.2)
  rollupApplied/{expenseId}             marker v2: per-line leaf contributions + account flows
                                                                                 ← Function; owner-READABLE from v1.2
  tags/{id}                             docs/21                                   (v1.3)
  merchants/{merchantKey}               docs/22                                   (v1.3)
  aiUsage/{YYYY-MM-DD}                  count                                    ← Function (v1.3)
  budgets/{id}                          docs/19                                   (v1.4)
  recurring/{id}                        docs/20                                   (v1.4)
  payees/{p2pKey}                       groupId, memberId                         (v1.5)
  imports/{id}                          docs/24                                   (v1.6)
groups/{groupId}                        docs/23 — members map, memberUids[], ownerMemberId (v1.5)
  expenses/{entryId}                    map allocations, splitInputs, invalid
  settlements/{id}
  balances/{memberId}                   netMinor                                 ← Function
  meta/summary                          simplified transfers                      ← Function
  applied/{docId}                       per-member delta marker                   ← Function
  activity/{id}                                                                  ← Function
```

### Why this shape

**User data is one subtree.** `users/{uid}/**` makes the security rule a single
`uid` comparison, makes account deletion one recursive delete, and makes an
export one query prefix.

**Groups are top-level, not nested under a user.** They are shared by definition;
nesting them under one member's subtree would make ownership and rules incoherent.
`users/{uid}/groupIndex` exists so "list my groups" is a cheap subtree query
instead of an `array-contains` scan across all groups.

**`localDate` is a stored string.** Every day-wise query
([05-insights.md](05-insights.md)) filters and orders on it. Deriving it from the
timestamp at query time would be wrong across timezones and unindexable.

**Rollups exist so Insights is O(days), not O(expenses).** A year of data is
~3,000 expense docs; charting it by reading them all is 3,000 reads per period
change. Reading 12 monthly rollup docs is 12. Rollups are maintained by a
Function on every expense write and feed the *same* `insights.ts` functions the
client would otherwise call on raw expenses.

Rollup rules:
- The **current day** is computed client-side from the cached expenses, so a just
  -saved expense moves the number instantly, offline.
- Past periods read rollups.
- A rollup is derived data and **always rebuildable** — a Function can
  regenerate any user's rollups from their expenses. If a rollup ever disagrees
  with the expenses, the expenses win and the rollup is rebuilt.

### Indexes

Composite indexes are checked into `firestore.indexes.json`:

| Collection | Fields |
|---|---|
| `expenses` | `deletedAt` ASC, `localDate` DESC |
| `expenses` | `deletedAt` ASC, `categoryId` ASC, `localDate` DESC |
| `expenses` | `deletedAt` ASC, `occurredAt` DESC |
| `pendingExpenses` | `status` ASC, `receivedAt` DESC |
| `groups/{g}/expenses` | `deletedAt` ASC, `occurredAt` DESC |
| `expenses` (v1.1) | `deletedAt` ASC, `categoryIds` ARRAY, `localDate` DESC |
| `expenses` (v1.2) | `deletedAt` ASC, `kind` ASC, `localDate` DESC |
| `expenses` (v1.2) | `deletedAt` ASC, `accountId` ASC, `localDate` DESC |
| `expenses` (v1.3) | `deletedAt` ASC, `tagIds` ARRAY, `localDate` DESC |
| `expenses` (v1.4) | `recurringId` ASC, `localDate` ASC (no `deletedAt`: soft-deleted occurrences count as handled) |
| `expenses` (v1.6) | `importId` ASC, `localDate` ASC |
| `groups` (v1.5) | `memberUids` ARRAY, `updatedAt` DESC |
| `groups/{g}/settlements` (v1.5) | `deletedAt` ASC, `occurredAt` DESC |
| `groups/{g}/activity` (v1.5) | `at` DESC |

Every index is added to `firestore.indexes.json` **in the task that adds its
query**. `groups/{g}/expenses` is listed above but **not yet in the file**. The
P5 task adds it.

## Trust boundary

The client is trusted to write **its own expenses, categories, settings and
check-ins**. It is not trusted to write **anything that could be inflated for
gain**:

| Client-written | Function-written only |
|---|---|
| `expenses`, `categories`, `settings`, `pendingExpenses`, `checkIns`, profile | `wallet`, `coinLedger`, `dailyRollups`, `monthlyRollups`, `groups/*/balances` |
| From v1.2: `accounts`, `budgets`, `recurring`, `tags`, `merchants`, `imports` (create), `groupIndex`, `payees`, `devices`, `groups/{g}` + entries + settlements (rules-validated) | From v1.2: `accountBalances`, `rollupApplied`, `meta/schema`, `aiUsage`, squad mirrors (`source: 'group'`, except user-owned fields), `groups/*/{balances,meta,applied,activity}`, `groupInvites`, `imports.status = 'done'` |

**The squad trust rule:** a seat's `uid` is honoured only when it is also in
`memberUids`, and clients can never change `memberUids` after creation. A
malicious client therefore can't point mirrors at someone else's ledger
([23](23-squads.md#groupsgroupid)).

Coins are a score today and could become spendable tomorrow. Making them
server-authoritative now costs one Function and closes the entire class of
"edit the local database, mint coins" attacks before it opens. See
[06-gamification.md](06-gamification.md).

## Cloud Functions

All Firestore-triggered unless noted. Every one is idempotent — Functions retry.

| Function | Trigger | Does |
|---|---|---|
| `onExpenseWrite` | `users/{uid}/expenses/{id}` write | Updates daily + monthly rollups; ensures the day's check-in exists; enqueues coin evaluation |
| `onCheckInCreate` | `users/{uid}/checkIns/{date}` create | Advances the streak via `streak.ts`; writes coin ledger entries via `coins.ts` |
| `awardCoins` | Internal | Writes `coinLedger` entries with deterministic ids and updates `wallet` in a transaction |
| `rebuildRollups` | Callable (admin/debug) | Regenerates rollups from expenses |
| `onUserDelete` | Auth delete | Recursive delete of the user subtree and Storage prefix |
| `cleanupSoftDeleted` | Scheduled, daily | Hard-deletes expenses soft-deleted > 90 days ago and their receipts |
| `onExpenseWrite` **v2** (v1.2) | same | Rollups v2 + account flows in **one transaction with one marker**. The [kind × source matrix](06-gamification.md#what-counts) decides the check-in and coins. **Skips** rollups, flows and coins for `source: 'import'` creates ([24](24-import.md#why-online-only)). Backdating via `createdLocalDate` (v1.1) |
| `rebuildUserLedger` (v1.2) | Internal; used by `rebuildRollups`, `finalizeImport` and the migration script | Rebuilds rollups v2, account flows and markers from transactions |
| `suggestCategories` (v1.3) | Callable, App Check + replay protection | Gemini on Vertex AI; per-uid daily cap; Remote Config kill switch ([22](22-merchants-and-suggestions.md)) |
| `onGroupEntryWrite`, `onSettlementWrite` (v1.5) | `groups/{g}/{expenses,settlements}/{id}` write | Balance deltas via an applied marker, summary via `simplifyDebts`, mirrors, activity, `invalid` flag, push ([23](23-squads.md#the-mirror-function)) |
| `onGroupPrefWrite` (v1.5) | `users/{uid}/groupIndex/{g}` write | When `countMyShare` changes, re-flags `excludeFromSpend` on that squad's mirrors |
| `createInvite`, `redeemInvite` (+ backfill), `leaveSquad`, `removeMember`, `resetSeat` (v1.5) | Callables, App Check | [23](23-squads.md#invites-and-joining) |
| `deleteUserData` **v2** (v1.5) | Callable | Converts squad seats to placeholders before the recursive delete |
| `finalizeImport` (v1.6) | Callable, App Check | Verifies the count, rebuilds the import span, marks it done; also undo ([24](24-import.md)) |

Functions import the same `packages/shared` package the app does. The streak that
the server computes and the streak the client predicts are produced by the same
function — that is the entire reason the package is framework-free.

### Idempotency

- `checkIns` doc id **is** the local date, so a double tap is one document.
- Coin ledger entry ids are deterministic: `${ruleId}__${localDate}` for
  daily-capped rules, `${ruleId}__${refId}` for per-object rules. A retry
  overwrites rather than duplicates.
- Wallet updates run in a transaction that reads the ledger entry first and
  no-ops if it already existed.

### Rollups v2

**From v1.2.** `dailyRollups/{date}` and `monthlyRollups/{month}`:

```ts
{ count, totalMinor, byCategory,                  // gross expense — v1 meaning, unchanged
  refundCount, refundMinor, refundByCategory,     // refunds, by the refunded category
  incomeCount, incomeMinor, incomeByCategory,     // income, by income category
  byDay /* monthly only */ }
```

- Keyed by **leaf** category. Parents are combined at read time
  ([04](04-categories.md#sub-categories)). **Split lines apply per line.**
- Transfers, settlements, loans and mirrors with `excludeFromSpend` add nothing.
  Mirrors add **their share** to the expense buckets.
- A rollup doc is empty, and deleted, **only when all three counts are 0**. v1's
  `isEmptyRollup` checked `count` alone, which would delete an income-only day.
- **Marker v2** (`rollupApplied/{expenseId}`) stores the exact vector this document
  last contributed: `{localDate, kind, contributions: [{bucket, categoryId,
  amountMinor}], flows: [{accountId, deltaMinor}]}`. The trigger applies
  `new − old` to the rollups **and** `accountBalances` in **one transaction**, so the
  two can never disagree. The owner can read markers, which lets the client compute
  exact local deltas for edits ([18](18-accounts.md#who-computes-it)).
- Rollup paths join `firestorePaths` (today they are hand-built in
  `functions/src/rollups.ts` and `use-rollups.ts`).

### Hosting

**From v1.5.** It is used only for invites:

- `public/.well-known/assetlinks.json` lists the SHA-256 of the **Play App Signing**
  key, the upload key and the EAS dev key. Without the Play App Signing key, links
  from Play installs fail verification.
- `public/.well-known/apple-app-site-association` (iOS track) is served with a
  `headers` rule for `Content-Type: application/json` and **no redirect**.
- `public/i/index.html` plus a rewrite `"/i/**" → "/i/index.html"`. A static page
  that reads the code from the path and shows it large, with Copy and a store
  link. No script talks to Firestore, and no data about the invite is exposed.
- `firebase.json` gains a `hosting` block. The emulator suite gains a hosting
  emulator for the fallback page check.

### Region

All Functions currently deploy to the default **us-central1** (no
`setGlobalOptions`). The user base is India-first and Firestore's region is fixed
([14](14-environment-setup.md#1a-check-the-firestore-region-before-anything-else)).
**Decision for P2:** set `setGlobalOptions({region: <Firestore's region>})` before
the v2 Functions deploy, so triggers run next to the data. Callables are
region-addressed from the client (`functions().app.functions('<region>')`), so the
app and Functions must change together. This is the P2 deploy runbook step.

## Security rules

Sketch; the real file lives at `firestore.rules` and ships with tests.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function signedIn()   { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }

    match /catalog/{doc=**} {
      allow read: if signedIn();
      allow write: if false;                       // deploy-time only
    }

    match /users/{uid} {
      allow read, write: if isOwner(uid);

      match /{sub=**} { allow read: if isOwner(uid); }

      match /expenses/{id} {
        allow create: if isOwner(uid)
          && request.resource.data.amountMinor is int
          && request.resource.data.amountMinor > 0
          && request.resource.data.currency == resource_currency(uid)
          && request.resource.data.localDate.matches('\\d{4}-\\d{2}-\\d{2}');
        allow update, delete: if isOwner(uid);
      }

      match /checkIns/{date}      { allow create: if isOwner(uid); allow update, delete: if false; }
      match /wallet/{d}           { allow write: if false; }
      match /coinLedger/{d}       { allow write: if false; }
      match /dailyRollups/{d}     { allow write: if false; }
      match /monthlyRollups/{d}   { allow write: if false; }
    }

    match /groups/{gid} {                          // v1.1
      allow read:   if signedIn() && request.auth.uid in resource.data.memberIds;
      allow update: if signedIn() && request.auth.uid in resource.data.memberIds;
      match /balances/{uid} { allow write: if false; }
    }
  }
}
```

Rules that matter and are easy to forget:

- `amountMinor` must be a **positive integer** at the rules level. A float
  reaching Firestore is a data corruption that survives every client fix.
- Check-ins are **create-only**. No edits, no deletes — otherwise a streak can be
  rewritten.
- Storage rules mirror this: `receipts/{uid}/**` writable only by that uid, with a
  5MB and `image/*` content-type limit.

## Cost and scale

Firestore bills per document read. The design keeps a heavy user's day cheap:

| Action | Reads |
|---|---|
| Open Orbit | ~5 (profile, settings, streak, wallet, today's rollup) |
| Open Ledger, first page | 50, then cached |
| Change Insights period (past) | 1–12 rollup docs |
| Change Insights period (current month) | Already-cached expenses, 0 new |

The failure mode to avoid is a listener on the whole `expenses` collection. Every
query is bounded by `localDate` or `limit`. A code review that sees an unbounded
Firestore query rejects it.

## Environments

Three projects: `loop-dev`, `loop-staging`, `loop-prod`. EAS build profiles pick
the config file. Nothing but CI deploys rules or Functions to prod, and rules
tests gate the deploy.

Local development runs against the **Emulator Suite** by default; pointing a dev
build at prod requires an explicit flag.

## Decisions made while building M2

Recorded here because each one is easy to "fix" back into a bug.

**Paths come from one module.** `packages/shared/src/firestore/paths.ts` builds
every path. Call sites never concatenate strings, and the rules tests import the
same builders, so the tests check the paths the app actually writes.

**Singleton documents use fixed ids.** `settings/app`, `wallet/main` and
`streak/main`, so reading one never needs a query. An earlier draft of this doc
wrote `catalog/categories/{slug}`, which is not a valid document path (a document
path needs an even number of segments). The catalogue lives at
`catalog/categories/entries/{slug}`.

**Timestamps are ISO-8601 strings made on the device, not server timestamps.**
A server timestamp reads as `null` in the local snapshot until the write syncs,
and every document must be complete and renderable the moment it is written
offline. `toISOString()` always emits UTC with a `Z`, so these strings also sort
correctly as text, which is what ordering expenses by `occurredAt` relies on.

**Converters validate and throw.** `packages/shared/src/firestore/documents.ts`
turns documents into domain types and raises `DocumentShapeError`, naming the
path and field, on anything malformed. Reads are strict about types and enums and
lenient about lengths, so tightening a length limit later can't make existing
data unreadable. The category repository skips a malformed document and reports
it, so one bad document doesn't take down the whole list.

**A brand-new install needs the network exactly once.** Anonymous sign-in has to
reach Firebase Auth to get a uid. After that the session is restored from disk,
offline. With no connection on first launch, the gate shows "Connect once to set
up" instead of spinning forever.

**The profile is created only once the server confirms it doesn't exist.** A
cache miss proves nothing, and writing a fresh profile over a real one would
reset the account.

**Essentials are seeded against a marker, not against document existence.**
`profile.categoriesSeededAt` and the eight category documents are written in
**one batch**, so the marker can never disagree with the data. The category ids
are deterministic (`cat-food`, …), so two launches racing to seed write identical
documents instead of duplicates, and a seed that is still pending offline already
shows as done locally, so it doesn't run twice.

## Decisions made while building M4

**`allow write` cannot validate `request.resource.data` and also cover
delete.** `request.resource` is `null` on a delete — the categories rule
originally read `allow write: if isOwner(uid) && request.resource.data.slug is
string && …`, and on a delete that null-dereferences instead of short-circuiting
to false, denying every delete with a "Null value error" rather than the
intended `PERMISSION_DENIED` for a bad write. The Storage rules test suite
(below) caught this the first time a delete was actually exercised end to end.
Fixed by splitting `allow create, update` (which validates fields) from `allow
delete` (which only checks ownership) — the same split every other collection
in this file already used. **Any rule that both validates `request.resource`
fields and allows delete must make this same split**; a combined `allow write`
is only safe when it does no field validation at all.

**Storage rules are tested with the compat SDK, not the modular one.**
`@firebase/rules-unit-testing`'s `RulesTestContext.storage()` returns
`firebase.storage.Storage` — the `firebase/compat/storage` namespaced API — even
though the Firestore half of the same package uses modular `firebase/firestore`.
`tests/storage-rules/rules.test.ts` is written against `ref(...).put(...)`
accordingly; do not "fix" it to modular `uploadBytes`, it will not compile
against what the test context actually returns.

**Storage path building gets its own module**, `packages/shared/src/storage-paths.ts`,
rather than living in `firestore/paths.ts`. A Storage path has no even/odd
segment constraint the way a Firestore document path does, and folding the two
together would blur that difference. It must be kept in sync with
`storage.rules` by hand — there is no shared source of truth between the two,
the same way `firestore/paths.ts` and `firestore.rules` already aren't.

## Decisions made while planning v1.1–v1.6 (2026-10-10)

- **No Dynamic Links.** Hosting App Links and a typed code ([Hosting](#hosting)).
- **One notification library.** `expo-notifications` for both local and FCM
  tokens. RNFirebase messaging would register a second
  `FirebaseMessagingService`.
- **AI through a callable**, never the client SDK ([22](22-merchants-and-suggestions.md#where-it-runs-a-callable-function)).
- **Recurring proposals are virtual.** Nothing is stored until approval, which
  uses deterministic ids ([20](20-recurring.md#why-not-store-proposals-in-pendingexpenses)).
- **Tags by id**, so renaming and deleting are single writes ([21](21-tags.md#why-ids-not-names)).
- **Allocations as maps** in squads, so the rules can validate keys with one
  `get()` ([23](23-squads.md#groupsgexpensesentryid)).
- **Import skips per-row triggers** and rebuilds once
  ([24](24-import.md#why-online-only)). That avoids rollup hot-spotting (~1
  write/sec/doc).

## Acceptance criteria

- [ ] The app is fully usable in airplane mode: log, edit, delete, browse
      insights for cached periods.
- [x] A client cannot write `wallet`, `coinLedger` or any rollup — proven by a
      rules test, not by inspection.
      (proof: tests/firestore-rules/rules.test.ts › "lets the owner read their wallet but never write it", "lets the owner read their coin ledger entry but never write it", "lets the owner read their daily rollup but never write it" and "lets the owner read their monthly rollup but never write it")
- [x] An expense with a float or negative `amountMinor` is rejected by rules.
      (proof: tests/firestore-rules/rules.test.ts › "rejects a fractional amount — money is never a float" and "rejects zero and negative amounts")
- [ ] Killing the app immediately after a save loses nothing once it reopens.
- [x] `packages/shared` has zero Firebase imports and is imported by both the app
      and Functions.
      (proof: scripts/check-invariants.mjs rule 2 "shared-no-react-native-firebase")
- [ ] App Check is enforced on Firestore, Storage and Functions before the first
      external tester build.
      *(2026-09-28: callables declare `enforceAppCheck`, and the emulator refuses a
      call with no token — but it accepts a fake one, so the invalid-token check
      has to run against the deployed project. Firestore/Storage enforcement is a
      console setting. Owner, before the first tester build.)*
- [x] Deleting an account removes every document and file for that uid.
      (proof: tests/functions/delete-user.test.ts › "leaves a fully populated user with zero docs and zero files" and "leaves a second user's data untouched")

### Acceptance criteria added after v1

- [ ] (v1.2) A client can't write `accountBalances`, `rollupApplied`, `meta/schema`
      or `aiUsage`, and the owner can read them (rules tests).
- [ ] (v1.2) `onExpenseWrite` v2 keeps rollups and account flows equal to
      `rebuildUserLedger` after any sequence of creates, edits, moves and deletes
      (Functions test).
- [ ] (v1.5) Every row of the squad rules table has an allow test and an attack
      test.
- [ ] (v1.5) `assetlinks.json` is served with the right content type and contains
      the Play App Signing fingerprint (`curl` check in the D queue).
