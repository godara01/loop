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
| **Cloud Messaging** | Group invites and settlement nudges — **v1.1** | v1 registers no notifications ([06](06-gamification.md#restraint-rules)) |
| **Emulator Suite** | Local dev and rules tests | The only way most of this is testable without spending money |
| **App Distribution** | QA builds to testers | |

Deliberately **not** used: Realtime Database (Firestore covers it), Hosting,
Dynamic Links (sunset — group invites use a custom scheme plus a short-code
Function), Firestore-backed full-text search (use a client-side filter in v1).

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
  `users/{uid}` subtree and Storage prefix, then the auth record.

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
groupInvites/{code}                     groupId, expiresAt, createdBy
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

## Trust boundary

The client is trusted to write **its own expenses, categories, settings and
check-ins**. It is not trusted to write **anything that could be inflated for
gain**:

| Client-written | Function-written only |
|---|---|
| `expenses`, `categories`, `settings`, `pendingExpenses`, `checkIns`, profile | `wallet`, `coinLedger`, `dailyRollups`, `monthlyRollups`, `groups/*/balances` |

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
| `redeemInvite` | Callable — **v1.1** | Validates a group invite code and adds the member |
| `onGroupExpenseWrite` | **v1.1** | Recomputes group balances with `settle.ts` |

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

## Acceptance criteria

- [ ] The app is fully usable in airplane mode: log, edit, delete, browse
      insights for cached periods.
- [ ] A client cannot write `wallet`, `coinLedger` or any rollup — proven by a
      rules test, not by inspection.
- [ ] An expense with a float or negative `amountMinor` is rejected by rules.
- [ ] Killing the app immediately after a save loses nothing once it reopens.
- [ ] `packages/shared` has zero Firebase imports and is imported by both the app
      and Functions.
- [ ] App Check is enforced on Firestore, Storage and Functions before the first
      external tester build.
- [ ] Deleting an account removes every document and file for that uid.
