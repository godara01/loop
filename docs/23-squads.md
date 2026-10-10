# 23 — Squads, Pairs and Settling Up

> **Release:** v1.5 (Phase P5 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `G*` in [`TASKS.md`](../TASKS.md).

Squads are shared tabs: a flat's rent, a Goa trip, Friday dinners. Anyone in the
squad logs what they paid and how it splits. Loop keeps the running balance and
tells everyone the fewest payments that settle it. A **pair** is a squad of
exactly two, used for one-to-one IOUs and lending ("Ravi owes me ₹500").

The domain maths already exists and is tested: [`split.ts`](../packages/shared/src/split.ts)
(even, shares, exact, percentage, largest-remainder) and
[`settle.ts`](../packages/shared/src/settle.ts) (netting, greedy simplification).
This doc is the product, data and trust model around it.

## Principles applied

- **People who don't have the app are first-class.** You add "Rahul" by name.
  Rahul is a **placeholder member** with a real seat and a real balance. When
  Rahul installs Loop, an invite lets him claim that seat and inherit its whole
  history.
- **Offline-first still holds.** Creating a squad, adding placeholders, logging
  expenses, editing and recording a settlement all work offline. Joining (claiming
  a seat) and leaving need the network, because the server has to check them.
- **No leaderboard, no shame** ([06](06-gamification.md#restraint-rules)). There is
  no ranking inside a squad and no "biggest spender". Debt is shown in coral
  because coral means debt in this design system, not as a judgement.
- **The server keeps the books.** Balances and personal-ledger mirrors are written
  by Functions. A modified client can't change what anyone else owes or what
  lands in anyone else's ledger.

## Concepts

| Term | Meaning |
|---|---|
| **Squad** | `groups/{groupId}` with `type: 'squad'`, 2–50 members |
| **Pair** | `type: 'pair'`, exactly 2 members. The UI calls it a *person*, e.g. "Ravi" |
| **Member** | A seat in the group: `memberId` (random, stable), a name, and optionally a claimed `uid` |
| **Placeholder** | A member with `uid: null`. Can pay, owe and be settled with, exactly like anyone else |
| **Entry** | A group expense or loan: `groups/{g}/expenses/{entryId}` |
| **Settlement** | A recorded payment between two members: `groups/{g}/settlements/{id}` |
| **Mirror** | The server-written copy of **your part** of an entry or settlement in **your** personal ledger |

## Data model

### `groups/{groupId}`

```ts
interface Group {
  readonly name: string;                    // ≤ 32
  readonly type: 'squad' | 'pair';
  readonly currency: CurrencyCode;          // fixed at creation
  readonly colorToken: CategoryColorToken;
  readonly members: Readonly<Record<string /* memberId */, GroupMember>>;
  readonly memberUids: readonly string[];   // uids of ACTIVE claimed members — the access list
  readonly ownerMemberId: string;
  readonly createdBy: string;               // uid
  readonly editedMember: string | null;     // set on member-map edits; see Rules
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

interface GroupMember {
  readonly name: string;                    // ≤ 24, unique (case-insensitive) within the group
  readonly uid: string | null;              // null = placeholder; honoured ONLY if also in memberUids
  readonly status: 'placeholder' | 'active' | 'left';
  readonly upiId: string | null;            // optional; set by the member themself; used for "Pay via UPI"
  readonly joinedAt: string;
}
```

**Trust rule:** a member's `uid` is honoured only when that uid is also in
`memberUids`. Clients can never change `memberUids`; the rules allow it only at
creation, as `[creator]`. Every other change goes through the `redeemInvite` and
`leaveSquad` callables. So a client can't write someone else's uid into a seat
and have mirrors sent to their ledger.

### `groups/{g}/expenses/{entryId}`

```ts
interface GroupEntry {
  readonly entryType: 'expense' | 'loan';
  readonly description: string;             // ≤ 80
  readonly categorySlug: string;            // creator's category slug, e.g. "FOOD"; 'LOAN' for loans
  readonly amountMinor: number;             // > 0
  readonly currency: CurrencyCode;          // == group.currency
  readonly paidBy: string;                  // memberId
  readonly splitMode: SplitMode;            // 'even' | 'shares' | 'exact' | 'percentage'
  readonly splitInputs: Readonly<Record<string, number>>; // the user's raw inputs, for editing
  readonly allocations: Readonly<Record<string /* memberId */, number /* minor */>>;
  readonly occurredAt: string;
  readonly localDate: string;
  readonly createdByMember: string;
  readonly updatedByMember: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly invalid: boolean;                // Function-written; see Validation
}
```

- **Allocations are a map keyed by `memberId`**, not an array. The rules can then
  check `allocations.keys().hasOnly(group.members.keys())` with a single `get()`.
- `splitInputs` holds what the user entered: shares `{a: 2, b: 1}`, percentages in
  **basis points** `{a: 6000, b: 4000}`, or exact minor units. Editing re-opens the
  split exactly as entered. `allocations` is the result of `allocate()` and always
  sums to `amountMinor`.
- **One payer per entry.** Multiple payers are out of scope for v1.5. Log two
  entries instead.
- **A loan** is `entryType: 'loan'`, `paidBy: lender`, `allocations: {borrower:
  amount}`. It moves the balance exactly like an expense the borrower owes in
  full, but it is **never spend** for anyone ([Pairs and lending](#pairs-and-lending)).

### `groups/{g}/settlements/{id}`

`from` (memberId who paid), `to`, `amountMinor`, `currency`, `method: 'cash' |
'upi' | 'bank' | 'other'`, `note`, `occurredAt`, `localDate`, `createdByMember`,
`createdAt`, `updatedAt`, `deletedAt`.

### Server-written

| Path | Contents |
|---|---|
| `groups/{g}/balances/{memberId}` | `netMinor` (+ is owed, − owes), `updatedAt`. **Keyed by memberId**, so placeholders have balances |
| `groups/{g}/meta/summary` | `transfers: {from, to, amountMinor}[]` from `simplifyDebts`, `totalSpentMinor`, `entryCount`, `updatedAt` |
| `groups/{g}/applied/{docId}` | Marker: the per-member deltas this entry or settlement last contributed. The same pattern as `rollupApplied`. Readable by members, so clients can compute local deltas |
| `groups/{g}/activity/{id}` | `{type, actorMemberId, refId, summary, at}`: created, edited (with before → after amount), deleted, settled, joined, left, renamed |
| `groupInvites/{code}` | `{groupId, memberId \| null, createdBy, expiresAt, usesLeft}`. **No client access** |
| `users/{uid}/expenses/g_{g}_{entryId}`, `.../s_{g}_{settlementId}` | Mirrors, see below |

### Per-user prefs: `users/{uid}/groupIndex/{groupId}`

Client-written: `countMyShare: boolean` (default `true`), `muted: boolean`,
`lastSeenActivityAt`. This collection already exists in the rules.

## Mirrors

A mirror is **your part** of a group record, written into your personal
`expenses` so that personal Insights, budgets, accounts and CSV export all work
without knowing squads exist.

| Group record | Your mirror (only if you're involved) |
|---|---|
| Expense entry, your share `s`, you paid `p` (`p` = amount or 0) | `kind: 'expense'`, `amountMinor: s` (**may be 0**), `paidMinor: p`, `categoryId` = your category with the entry's slug (else your `OTHER`) |
| Loan, you lent | `kind: 'loan'`, `direction: 'out'`, `amountMinor` = amount |
| Loan, you borrowed | `kind: 'loan'`, `direction: 'in'` |
| Settlement, you paid | `kind: 'settlement'`, `direction: 'out'` |
| Settlement, you received | `kind: 'settlement'`, `direction: 'in'` |

All mirrors have `source: 'group'`, `groupId`, `groupRefId`, `allocations: []`,
the entry's `description`, `localDate`, `occurredAt`, and
`excludeFromSpend` (= `!countMyShare`).

**Who owns which field.** Server-owned: `kind`, `direction`, `amountMinor`,
`paidMinor`, `localDate`, `occurredAt`, `description`, `groupId`, `groupRefId`,
`deletedAt`, `excludeFromSpend`. **User-owned:** `categoryId`, `accountId`,
`tagIds`, `note`. The payer chooses which of their accounts paid, and anyone can
re-categorise their own mirror or tag it `goa-trip`. Rules let clients update
**only** the user-owned keys on `source: 'group'` documents
(`affectedKeys().hasOnly([...])`). The Function **merges** only server-owned keys,
so user choices survive edits to the entry.

**What mirrors do and don't do:**

- They count in personal spend (`amountMinor` = share), budgets, rollups and
  Insights, unless `excludeFromSpend`.
- They move account balances by `paidMinor` (expense) or by ± amount (loan and
  settlement) ([18](18-accounts.md#the-balance)).
- They **never** award coins and **never** bank the day ([06](06-gamification.md#what-counts)).
  The *creator's* client banks its own day by writing `checkIns/{today}`
  alongside the entry, because the creator made the decision.
- They are marked in the ledger with a squad badge (`◇ GOA TRIP`), tap through to
  the entry, and can't be deleted from the personal ledger. Deleting happens on
  the entry.
- A mirror with `amountMinor: 0` (you paid but your share was zero) renders as
  *"You paid ₹1,200 · your share ₹0"*. It is **not** a valid `ExpenseLike`. The
  converter has a separate `source: 'group'` branch that allows 0 and
  `allocations: []` ([08](08-data-model.md#mirrors)).
- **"Count my share"** (squad settings, default on): turning it off makes the
  Function re-flag every existing mirror of that squad with
  `excludeFromSpend: true`, and new ones are written that way. Rollups skip spend
  buckets for excluded mirrors. Account flows still apply. Use it for squads that
  are "not my spending", such as a flat kitty you manage for others.

### Currency

A group's currency is fixed at creation. If a member's ledger currency differs
from the group's, **no mirrors are written for them**. There is no FX
([00](00-product.md#explicit-non-goals)). The squad works fully for them, and a
banner in the squad reads *"This squad is in USD; your ledger is INR. It won't
appear in your spending."*

### The mirror Function

`onGroupEntryWrite` / `onSettlementWrite` (Firestore triggers):

1. **In a transaction:**
   - Re-read the entry, the group and the `applied` marker.
   - Compute the new per-member deltas.
   - Apply `new − old` to `balances/{memberId}` docs.
   - Write the marker.
   - Recompute `meta/summary` from all balance docs (≤ 50) with `simplifyDebts`.
   - Re-reading means duplicate and out-of-order deliveries converge on the
     latest state.
2. **Outside the transaction:** for each member whose `uid` is in `memberUids`,
   with a matching currency, upsert or merge their mirror. Members no longer in
   `memberUids` (left or deleted) get **no** write. A left member's existing
   mirrors are frozen as history and are never re-created.
3. Append to `activity`.
4. **Validate.** If the allocations don't sum to `amountMinor`, or reference a
   member not in the group, or `paidBy` is not a member: set `invalid: true` on the
   entry, apply **zero** balance effect (and remove any previous one), and soft-delete
   existing mirrors. When a later edit makes it valid, clear `invalid` and
   re-apply. Rules stop clients setting `invalid` themselves.

Category mapping costs one read per involved member:
`categories where slug == X and archivedAt == null limit 1`.

## Validation

| Check | Where |
|---|---|
| `amountMinor` int > 0, `currency == group.currency` | Rules (one `get()` of the group) |
| `paidBy` and every allocation key are members of the group | Rules: `group.members.keys().hasAll([paidBy])`, `allocations.keys().hasOnly(group.members.keys())` |
| The writer is an active member, and `updatedByMember` is their seat | Rules: `request.auth.uid in group.memberUids` and `group.members[updatedByMember].uid == request.auth.uid` |
| Allocations sum exactly to the amount | **Can't be done in rules** (no loops). `allocate()` on the client, `invalid` flag in the Function, **and** the shared read parser rejects bad sums, so other clients never render a broken entry as valid |
| At least one participant. Percentages total 10,000 bp. Exact amounts sum to the total | Split UI and `allocate()` |
| Group not archived | Rules: `group.archivedAt == null` |

## Screens

### The Squads tab (`/(tabs)/squads`)

The dock becomes **Orbit · Ledger · [+] · Squads · Insights**, and **You** moves to
an avatar button in Orbit's header ([01](01-information-architecture.md)).

```
SQUADS                                   [Join] [+]
┌──────────────────────────────────────────────┐
│ ◇ GOA TRIP  · 5 people        you're owed    │
│                                  ₹2,450.00   │  ← lime
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ ◇ FLAT 302  · 3 people           you owe     │
│                                    ₹830.00   │  ← coral
└──────────────────────────────────────────────┘
PEOPLE
  Ravi                     owes you ₹500.00
  Ana                      settled up
```

- A header total: *"Overall you're owed ₹2,120"* (the sum over groups in the
  ledger currency; other-currency groups are listed separately).
- **+** opens *New squad* or *Add a person*. **Join** opens code entry.
- Archived squads go in a collapsed section at the bottom.
- An unread activity dot appears when `activity.at > lastSeenActivityAt`. It is
  a dot, not a count.

### New squad (`/squads/new`)

Name, currency (default: the ledger currency), colour, then **people**: type names
to add placeholders. The creator is added automatically as the owner. **Create**
works offline (`splitConfirm`). Next screen: *Invite people*.

### Add a person (`/squads/new?type=pair`)

Just a name. It creates a pair with you and a placeholder.

### Squad detail (`/squads/[id]`)

- Hero: your net in this squad, mono, coloured. **Settle up** and **Add expense**
  plates.
- Segments: **Entries** (paginated 30, newest first, by day) · **Balances** (every
  member's net and the simplified transfers) · **Activity**.
- An entry row shows description, payer (*"Ana paid"*), amount, and **your
  share** in mono. Invalid entries are coral with *"Doesn't add up — tap to fix"*.

### Add / edit an entry (`/squads/[id]/expense/new`, `/squads/[id]/expense/[entryId]`)

The Drag & Split flow from the Stitch design. Order:

1. **Amount pad.** The same component as personal entry.
2. **Description and category.** The category strip shows **your** categories, and
   the entry stores the slug. Default: the most-used category in this squad.
3. **Paid by.** Member plates, default you. Haptic: `selection`.
4. **Split.**

| Mode | Interaction |
|---|---|
| **Even** (default: everyone) | Member plates sit in an **In** zone. Drag a plate out to exclude it, or back in (`dragStart` → `dragTick` per zone crossing → `dragDrop`). Each plate shows its live share, recomputed by `allocate()` on every change |
| **Shares** | A −/+ stepper per member (0–99) |
| **Exact** | An amount per member. A mono *"₹120 left to assign"* counter; Save stays disabled until it hits ₹0 |
| **Percent** | A percent per member, with up to 2 decimals stored as basis points. A *"40% left"* counter |

5. **Save** fires `splitConfirm`. Writes, in one batch: the entry, and
   `users/{me}/checkIns/{today}` if this is a create dated today.

**Lend / borrow** (pairs, and squads via overflow): a two-plate switch,
**I lent** / **I borrowed**, then amount and note. It saves as a `loan` entry.

Deleting an entry is a soft delete with the 6-second undo. Haptic: `destructive`.

### Settle up (`/squads/[id]/settle`)

- Lists the simplified transfers: *"You pay Ana ₹450"*, *"Rahul pays you ₹1,200"*.
- Tapping your own debt opens the **Record payment** sheet:
  - Amount, pre-filled with the full amount and editable for partial payments.
  - Method plates.
  - Note.
  - **Pay via UPI** appears only if the payee has a `upiId`, the group is INR, and
    the platform is Android. It opens `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=Loop%20<squad>`.
    When the user returns: *"Did the payment go through?"* **Yes, record it** /
    **No**. **Loop never records a payment on its own**, and never claims the UPI
    app succeeded.
- Recording fires `settleSuccess`. It writes a settlement, and on the payer's side
  the mirror lands once synced.
- Anyone can record a settlement between **any two** members. That covers
  placeholders who paid cash. The activity log shows who recorded it.
- Settling a debt someone else owes you: on their row, **Mark as paid**, the same
  sheet.

### Members (`/squads/[id]/members`)

- Each member shows name, `ACTIVE` / `INVITE PENDING` / `LEFT`, and their balance.
- Placeholder: **Invite** creates a seat-bound invite link (share sheet).
  **Rename**.
- **Invite anyone** creates a squad-wide link. On redemption the joiner picks an
  unclaimed placeholder or *"I'm not listed"*, which creates a new seat.
- Your own row: edit your name in this squad and your UPI id.
- The owner can remove a member, but only at a zero balance.

### Squad settings (`/squads/[id]/settings`)

Name, colour, **Count my share in my spending**, **Mute notifications**,
**Archive squad** (owner, all balances zero), **Leave squad** (zero balance).

## Invites and joining

### Creating

`createInvite({groupId, memberId?})` is a callable, App Check enforced:

- The caller must be an active member. The group must not be archived.
- `memberId` (seat-bound) must be a placeholder.
- The code is **10 characters of Crockford base32**, about 50 bits, from a CSPRNG.
- It expires after **7 days**. A seat-bound invite has `usesLeft: 1`; a squad-wide
  one has `usesLeft: 20`.
- Returns the code and the link `https://<project>.web.app/i/<code>`.
- Rate limit: 30 invites per uid per day.

### Links: Firebase Hosting + App Links

Firebase Dynamic Links shut down in August 2025. Invites use **Firebase Hosting**
instead ([11](11-firebase.md#hosting)):

- `/.well-known/assetlinks.json` lists the **Play App Signing** SHA-256, plus the
  upload key and the EAS dev key, so the link opens the installed app directly
  (`autoVerify` intent filter for `https://<project>.web.app/i/*`).
- `/.well-known/apple-app-site-association` is served with
  `Content-Type: application/json` and no redirect, and wired in on the iOS track.
- `/i/<code>` (a static page) is the fallback when the app is not installed. It
  shows the code in large mono type, a **Copy code** button, and a Play Store
  link. **There is no deferred deep linking**: after installing, the user pastes or
  types the code in **Squads → Join**. The page tells them so.
- In-app route: `/i/[code]` opens the join flow.

### Redeeming

`redeemInvite({code, claimMemberId?, displayName?})` is a callable, App Check
enforced and rate-limited to 10 per uid per hour. Its transaction:

1. Load the invite. It fails with `not-found`, `deadline-exceeded` (expired) or
   `resource-exhausted` (no uses left).
2. Load the group. It fails if archived, or `failed-precondition` if the group
   already has 50 members.
3. If the caller is already in `memberUids`, it fails with `already-exists`. The
   app just opens the squad.
4. Seat-bound invite: claim `invite.memberId`. It must still be a placeholder,
   otherwise `failed-precondition` (*"Someone already claimed this seat"*).
   Squad-wide invite: claim `claimMemberId` (must be a placeholder) or create a new
   seat with `displayName`.
5. Set `members[m].uid = caller`, `status: 'active'`. Add the caller to
   `memberUids` with `arrayUnion`. Decrement `usesLeft`.
6. Write `users/{caller}/groupIndex/{g}` with the defaults.
7. Write `activity`: joined.

After the transaction, a **backfill** runs: a BulkWriter writes the joiner's
mirrors for every existing entry and settlement where their seat is involved, if
the currency matches. The joiner's ledger then holds their whole history in the
squad, all under the dates they happened. Because of the backdating rule, none of
it banks days or awards coins.

### Anonymous members

An anonymous user can create and join squads. **Never a wall.** Before the first
squad action, the linking sheet ([16](16-account-linking.md#where-linking-is-offered))
explains: *"Squads are shared with other people. If you lose this phone without
linking an account, you'll need a new invite to get back in."* **Not now**
proceeds.

If an anonymous member loses their phone, their seat stays (`uid` = the dead
uid). Any active member can **Reset seat** on them. That callable (`resetSeat`)
turns the seat back into a placeholder and removes the dead uid from `memberUids`,
and the person is re-invited to that seat. The history stays, because it belongs
to the seat, not the uid.

## Leaving, removing, archiving

| Action | Who | Condition | Effect |
|---|---|---|---|
| **Leave** (`leaveSquad` callable) | Any active member | Their **server** balance is 0 | `status: 'left'`, uid removed from `memberUids`, name kept. Their mirrors stay as history. If the owner leaves, ownership passes to the longest-standing active member. If nobody active remains, the group is archived |
| **Remove member** (`removeMember` callable) | Owner | Member balance 0 | Same as leave, for that seat. A placeholder with zero balance and **no** entries referencing it is deleted outright. Otherwise it is marked `left` |
| **Reset seat** (`resetSeat` callable) | Any active member | The seat is active and not the caller | Back to placeholder. History and balance kept |
| **Archive** | Owner | Every balance 0 | `archivedAt` set. Read-only for everyone. Shown in Archived. Mirrors stay |
| **Delete squad** | — | — | **Not offered.** Shared financial history is not one person's to destroy. Archive instead |

A non-zero balance blocks Leave and Archive with *"Settle up first: you owe Ana
₹450"* and a **Settle up** button.

## Account deletion

`deleteUserData` ([C3](../TASKS.md)) is extended. It runs these steps **before**
deleting `users/{uid}`, for every group whose `memberUids` contains the uid:

- Turn the seat into a placeholder (`uid: null`, `status: 'placeholder'`, name
  kept) and remove the uid from `memberUids`. Balances are untouched, because
  other people's money is still owed.
- If that uid was the **only** active member, delete the whole group tree
  (`recursiveDelete(groups/{g})`), since nobody else can ever see it.
- Hand over ownership as in Leave.

The [account-switch flow](16-account-linking.md#flow-switching-to-an-existing-account)
uses the same path.

## Pairs and lending

- A pair is a squad with `type: 'pair'` and exactly two members: you plus one
  person, usually a placeholder.
- Pair detail is a simpler squad view: one balance line (*"Ravi owes you ₹500"*),
  the entries, and **Settle up** / **Lend** / **Borrow** / **Split an expense**.
- **A loan is not spend.** If I lend Ravi ₹1,000:
  - My balance shows +₹1,000.
  - My mirror is `kind: 'loan', direction: 'out'`. It moves my account −₹1,000 and
    is **not** in my spending, budgets or Insights.
  - If Ravi claims his seat, his mirror is `kind: 'loan', direction: 'in'`. It
    moves his account +₹1,000 and is not his income.
- When Ravi repays, that is a **settlement**, with the same non-spend treatment.
- A shared dinner within a pair is a normal **expense** entry. Shares count as
  spend.

## Settlement suggestions

When a **person-to-person** UPI SMS (debit or credit, [22](22-merchants-and-suggestions.md#merchant-keys))
has an amount that **exactly** equals an open simplified transfer between you and
one member, the inbox shows *"Settle ₹450 with Ana in Flat 302?"* with **Yes,
record it** / **No, it's something else**.

- **Yes** writes the settlement (method `upi`) and stores the mapping
  `users/{uid}/payees/{p2pKey} = {groupId, memberId}`. Future payments to that VPA
  suggest that member first, even for partial amounts.
- **No** turns it into a normal proposal (an expense or income).
- **Never auto-applied.**

## Notifications

Squad push is **opt-in** and per squad (muted by default until the user enables
notifications in [25](25-notifications.md#squad-push)). The Functions send:

| Event | To | Text (no amounts by default) |
|---|---|---|
| Entry created, edited or deleted | Every other active, unmuted member who is involved | *"Ana added 'Dinner' in Goa Trip"* |
| Settlement recorded | The other party, if active | *"Rahul recorded a payment to you in Flat 302"* |
| You joined (to the others) | The others | *"Ravi joined Goa Trip"* |

Tapping a notification opens the squad and marks activity as seen.

## Haptics

| Action | Event |
|---|---|
| Create squad, add a person | `splitConfirm` |
| Payer / member selection | `selection` |
| Drag a member plate in or out of the split | `dragStart` → `dragTick` (zone crossing) → `dragDrop` |
| Save an entry | `splitConfirm` |
| Exact or percent total doesn't match on Save | `warning`, the counter shakes |
| Record a settlement | `settleSuccess` |
| Delete an entry | `destructive` |
| Undo delete | `tap` |
| Join success | `splitConfirm` |
| Join failure | `error` |
| Leave / archive confirm | `warning`, then `destructive` |

## Edge cases

| Case | Behaviour |
|---|---|
| Two members edit the same entry offline | Last write wins at the server. Each write appears in Activity as an edit with before → after, so nothing is silent |
| One member edits while another deletes | Whichever lands last decides. A delete-then-edit undeletes only if the editor's write contains `deletedAt: null`, which it does because the editor saw a live doc. Activity shows both. Accepted, and visible |
| An entry whose payer is a placeholder | Normal. The placeholder's balance goes up. No mirror for the placeholder |
| Rename a placeholder after it's claimed | Claimed seats are renamed only by their owner (rules via `editedMember`). Placeholders by any active member |
| Duplicate member names in a squad | Rejected by the client: *"There's already an Ana — try Ana K"*. Rules can't enforce uniqueness, so the Function appends ` (2)` if a race produces a duplicate |
| Entry references a member who later left | Fine. The seat still exists with `status: 'left'`. Their share still counts in balances |
| A member who left is owed money afterwards because of an edit | Their balance becomes non-zero. The squad shows them under Balances with `LEFT`. Others can record settlements with them. They receive no mirrors |
| Squad created offline, then the creator uninstalls before syncing | The group never reached the server. Nothing exists. Accepted |
| Group with only placeholders besides me | Fully usable as a personal split tracker |
| A 50-member squad | `members` map ≤ 50 (rules: `members.size() <= 50`). Even-split rounding across 50 is exact via `allocate()` |
| ₹100 split 3 ways | `allocate()` gives 34/33/33 (largest-remainder, deterministic tie-break by member order). The balances sum to 0 exactly |
| Currency mismatch for one member | No mirrors for them, a banner, the squad still works |
| Mirror category slug not found | Maps to the member's `OTHER`. The member can re-categorise (user-owned field) |
| Function delivers out of order (edit before create) | It re-reads the current doc and converges. The marker prevents double-applying |
| The entry's `occurredAt` is edited | Each mirror's `localDate` moves. Personal rollups follow through the normal marker diff |
| Invite link opened by someone already in the squad | Opens the squad |
| Invite expired or used up | *"This invite has expired. Ask for a new one."* |
| Seat claimed by someone else first | *"Someone already claimed this seat."* Offers the squad-wide join if the inviter allows it |
| Archived squad | Read-only. No new entries, settlements or invites (rules plus callables) |
| A member deletes their account | The seat becomes a placeholder, see [Account deletion](#account-deletion) |
| Simplified transfers when everyone is at 0 | *"All settled up"*, and a single `settleSuccess` when the last settlement brings everyone to zero |

## Data, rules, indexes

| Path | Read | Write |
|---|---|---|
| `groups/{g}` | Members (`request.auth.uid in resource.data.memberUids`) | **Create:** `memberUids == [request.auth.uid]`, `members[ownerMemberId].uid == request.auth.uid`, `members.size()` ≤ 50 (`== 2` for pairs), `type`/`currency` valid. Placeholders may be included at creation. Any `uid` a client writes on another seat is inert, because uids are honoured only when they're in `memberUids` ([trust rule](#groupsgroupid)). **Update:** caller in `memberUids`, not archived, and `memberUids`/`createdBy`/`currency`/`type`/`ownerMemberId` unchanged. A member-map change sets `editedMember = <key>` and touches only that key (`members.diff(resource.data.members).affectedKeys().hasOnly([editedMember])`). The edited seat's `uid` must stay what it was (`members[k].uid == resource.data.members.get(k, {'uid': null}).uid`), and the seat must be a placeholder or the caller's own |
| `groups/{g}/expenses/{id}` | Members | Create/update per [Validation](#validation). `invalid` unchanged by clients. Delete denied |
| `groups/{g}/settlements/{id}` | Members | `from != to`, both members, amount int > 0. Delete denied |
| `groups/{g}/{balances,meta,applied,activity}/*` | Members | Denied |
| `groupInvites/{code}` | Denied | Denied |
| `users/{uid}/groupIndex/{g}` | Owner | Owner |
| `users/{uid}/payees/{key}` | Owner | Owner |
| `users/{uid}/expenses/{g_…\|s_…}` | Owner | Client **create denied**. Update only `categoryId`, `accountId`, `tagIds`, `note`, `updatedAt` |

Indexes: `groups` on `memberUids (array) + updatedAt DESC`; `groups/{g}/expenses`
on `deletedAt ASC, occurredAt DESC` (already listed in [11](11-firebase.md#indexes));
`groups/{g}/settlements` on `deletedAt ASC, occurredAt DESC`;
`groups/{g}/activity` on `at DESC`.

**Rules `get()` budget:** each entry write does one `get(group)`. A batch with an
entry plus a check-in is well inside the 10 (single) / 20 (batch) limits.

## `packages/shared` changes

- `settle.ts`:
  - `computeBalances` takes **settlements** as well as expenses (a settlement
    `from → to` adds `+amount` to `from` and `−amount` to `to`).
  - Map-shaped allocations are supported through an adapter
    `entryToExpenseLike(entry)`.
  - Loans are treated like expenses in balances.
- New `groups.ts`:
  - The `GroupEntry` and `Settlement` types.
  - `allocationsFromSplit(mode, inputs, total, memberOrder)`, which wraps
    `allocate()` and handles basis points.
  - `memberDeltas(entry)`.
  - `mirrorFor(entry, memberId, ledgerCurrency, categoryLookup)`.
  - `validateEntry(entry, group)`.
  - All pure, all unit-tested.
- `firestore/documents.ts`: converters for the group docs. The **mirror branch** of
  `parseExpense` allows `amountMinor >= 0` and `allocations: []` when
  `source == 'group'`.

## Acceptance criteria

- [ ] Create a squad offline with three placeholders, log 5 entries in all four
      split modes, then go online. Balances and the simplified transfers match a
      hand calculation, and sum to 0.
- [ ] A second emulator user redeems a seat-bound invite, and their personal ledger
      fills with mirrors for every involved entry, at the original dates, with no
      coins and no check-ins.
- [ ] A client write that sets someone else's uid on a seat, changes `memberUids`,
      sets `invalid`, or creates a `g_` mirror is denied (rules tests).
- [ ] An entry with allocations that don't sum is flagged `invalid`, contributes 0
      to balances, and is fixed by an edit (Functions test).
- [ ] An out-of-order event delivery (update processed before create) converges to
      the same balances (Functions test).
- [ ] A loan of ₹1,000 changes balances and account flows and **no** spend,
      budget or Insights number on either side.
- [ ] Leave and Archive are blocked with a non-zero balance and succeed at zero.
- [ ] Account deletion converts seats to placeholders. The other members' balances
      are unchanged.
- [ ] **Pay via UPI** never records a settlement without the explicit
      confirmation.
- [ ] The App Link opens the installed app straight to the join flow, and the
      fallback page shows the code when the app isn't installed (device check, D
      queue).
