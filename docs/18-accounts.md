# 18 — Accounts (Payment Methods and Balances)

> **Release:** v1.2 (Phase P2 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `AC*` in [`TASKS.md`](../TASKS.md).

An **account** is where money sits or comes from: a bank account, a credit card,
the cash in your wallet, a UPI wallet. Attaching an account to a transaction
answers *"how much is left in HDFC?"* and *"what do I owe on the card?"*. It also
makes transfers possible ([17](17-money-in-and-out.md#transfers)).

Accounts are **optional**. A user who never creates one keeps the 10-second flow
exactly as in v1, and every transaction sits under *Unassigned*.

## What Loop is not doing

- **No bank sync.** Balances are what the user records plus an opening balance.
  They are **Loop's** balance, not the bank's, and the UI says *"in Loop"*, never
  *"available"*.
- **No net worth.** The Orbit total is labelled *Accounts total*. There are no
  investments, assets or liabilities beyond cards ([00](00-product.md#explicit-non-goals)).

## The account

`users/{uid}/accounts/{accountId}`, written by the client:

```ts
interface Account {
  readonly id: string;
  readonly name: string;            // ≤ 24 chars, e.g. "HDFC Salary"
  readonly type: 'cash' | 'bank' | 'card' | 'wallet';
  readonly last4: string | null;    // 4 digits; bank or card only; used for SMS matching
  readonly openingBalance: Money;   // ledger currency; may be negative (card: owed at start)
  readonly openingDate: string;     // YYYY-MM-DD — flows before this date are still counted, see below
  readonly colorToken: CategoryColorToken;  // the same 8 tokens as categories
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}
```

- A **Cash** account is suggested, not created, the first time the user opens
  Accounts. It is not seeded silently, because a seeded account the user never
  chose would make *Unassigned* look like a mistake.
- `type: 'card'` means a **credit** card. A debit card is its bank account, so the
  user picks that bank.
- Currency is always the ledger currency. There is no multi-currency.

## The balance

```
balance(account) = openingBalance
                 + flowMinor            ← server, users/{uid}/accountBalances/{accountId}
                 + localDelta           ← client, for docs with pending writes
```

`flowMinor` is the signed sum of every live transaction's effect on the account:

| Kind | Effect on `accountId` | Effect on `toAccountId` |
|---|---|---|
| `expense` | −`paidMinor` (mirrors) or −amount | — |
| `income`, `refund` | +amount | — |
| `transfer` | −amount | +amount |
| `settlement` (paid) / (received) | −amount / +amount | — |
| `loan` (lent) / (borrowed) | −amount / +amount | — |

For squad mirrors, the account moves by **what you paid** (`paidMinor`), not your
share ([23](23-squads.md#mirrors)). If you paid ₹1,200 for dinner, ₹1,200 left
your account, even though your share was ₹300.

### Who computes it

- **The server.** `onExpenseWrite` keeps `accountBalances/{id}.flowMinor` updated
  in the **same transaction and with the same marker** as the rollups
  ([11](11-firebase.md#rollups-v2)). The marker v2 records the per-account flows a
  document last contributed. An edit applies `new − old` to each touched account,
  so moving a transaction between accounts is exact.
- **The client.** It reads `accountBalances` (owner-readable, client-unwritable)
  and adds a local delta for documents with `hasPendingWrites`:
  - **New document**: its full effect.
  - **Edited document**: `effect(local doc) − effect(marker)`. The owner can read
    their `rollupApplied/{id}` marker, so this is exact even for edits.
  - **Soft-deleted document**: `−effect(marker)`.
- This is the same "server + local delta" pattern as Insights rollups
  (`mergePeriodSources`). The function `accountBalance(opening, flow, pendingDocs, markers)`
  is pure, lives in `packages/shared/src/accounts.ts`, and is unit-tested.

### Offline

While offline the balance is still shown, with a mono `AS OF 14:02` tag giving
the time of the last server snapshot of `accountBalances`. When it reconnects,
the tag disappears.

### Opening balance and opening date

- The opening balance means *"what this account held at the start of
  `openingDate`"*.
- Transactions dated **before** `openingDate` are still counted. If the user sets
  the opening balance to today's real balance and then imports or back-dates old
  expenses, the balance double-counts them. So the form says:
  *"Enter the balance on the opening date. Transactions before that date will
  also be counted."*
- **Editing the opening balance** is allowed at any time. It is a client field, so
  the change is instant and offline-safe. No recompute is needed.

## Screens

### `/accounts` (from You → Accounts, and from the Orbit accounts card)

- One row per active account: colour tag, name, type glyph, `••1234`, and the
  balance in mono. Card accounts show **OUTSTANDING ₹X** in coral when the
  balance is negative, and **CREDIT ₹X** when it is positive (overpaid).
- An *Unassigned* row with the net flow of transactions that have no account.
  It is read-only and tapping it opens the ledger filtered to `account = none`.
- An **Accounts total** footer: the sum of active accounts' balances. Card
  outstanding counts as negative.
- Archived accounts are in a collapsed section.
- Drag to reorder (`dragStart` → `dragTick` → `dragDrop`), the same as categories.

### `/accounts/new` and `/accounts/[id]` (modal sheet)

Fields: name, type (four plates), last 4 (bank and card only), opening balance
(mono amount pad, with a ± toggle for cards), opening date (`DatePickerSheet`,
past or today), colour. Save fires `splitConfirm`.

### Account detail

- The balance hero, then the ledger filtered to this account (as either side of a
  transfer).
- Overflow menu: **Edit**, **Archive**, **Delete**. Delete is only shown when the
  account has zero transactions.

### Orbit

A compact **Accounts** card below the hero, only once at least one account
exists. It lists up to 3 accounts by `sortOrder` with balances, plus the total.
**Keep it plain** doesn't hide it, because it is data, not gamification.

## Entry sheet integration

- An **account chip** row under the category strip, collapsed to a single chip
  showing the current choice, e.g. `HDFC ▾`. One tap opens a small sheet of active
  accounts plus *None*.
- **Default:** the account last used **for this kind**, stored in
  `settings.lastAccountByKind`. If that account is archived or missing, the
  default is *None*.
- **Transfer** shows two chips, `From ▾ → To ▾`, both required.
- The account row is hidden entirely until the user has at least one account.
  Zero added friction for users who don't use accounts.

## SMS account matching

`ParsedTransaction.accountLast4` already exists ([12](12-sms-ingest.md)). The
matcher `matchAccount(last4, accounts)` is pure:

| Situation | Result |
|---|---|
| Exactly one active account with that `last4` | Pre-selected on the pending card |
| Two or more accounts share that `last4` | **No guess.** The card shows *"Which account?"* with those accounts as options |
| None match | *None*, plus a one-tap **Add account ••1234** link that opens `/accounts/new` pre-filled with `last4` and the bank name from the sender registry |
| Archived account matches | Not used. The result is *None* |

## Data and rules

| Path | Writer | Rules |
|---|---|---|
| `users/{uid}/accounts/{id}` | Client | Owner read/write. `name` is a string ≤ 24. `type` is in the set. `last4` is null or matches `^[0-9]{4}$`. `openingBalance.amountMinor` is an int (may be negative). Delete is allowed only by the owner, and the client checks there are zero transactions (rules can't count) |
| `users/{uid}/accountBalances/{id}` | Functions only | Owner read. Client write denied |
| `users/{uid}/rollupApplied/{expenseId}` | Functions only | **Now owner-readable** (was: no rule, so denied), needed for the edit delta above. Client write denied |
| `settings/app.lastAccountByKind` | Client | `map<kind, accountId>` |

Transaction rules ([11](11-firebase.md#security-rules)): when `accountId` or
`toAccountId` is present it must be a string. Rules do **not** `get()` the
account to check it exists, because that would cost a read on every write and
break offline batch semantics. A dangling id renders as *Unknown account* and
counts under *Unassigned*.

## Haptics

| Action | Event |
|---|---|
| Save account | `splitConfirm` |
| Account chip opens | `tap` |
| Choose an account | `selection` |
| Reorder | `dragStart` → `dragTick` → `dragDrop` |
| Archive confirm | `warning`, then `destructive` |

## Edge cases

| Case | Behaviour |
|---|---|
| Archive an account with history | Allowed. Its transactions keep `accountId` and render the name dimmed. Its balance still counts in the total until the user zeroes it with a transfer. A note on archive says so |
| Delete an account with transactions | Not offered. Archive instead |
| Deleted (dangling) `accountId` | Counted under *Unassigned*. The row shows *Unknown account* |
| Two devices create "Cash" offline | Two Cash accounts exist. The list shows both, and the user archives one. No dedupe magic |
| Negative cash balance | Shown in coral with no warning. The user forgot to log an ATM withdrawal, and Loop doesn't scold |
| A card account with a positive balance | Shown as **CREDIT** |
| A transfer from a card to a bank | Allowed. It is a cash advance |
| A transaction moved from account A to B | The marker diff moves the flow exactly. The client delta handles it offline |
| Change `type` from bank to card | Allowed. Only the display changes, the maths is identical |
| Import with an account column | Account names map to existing accounts or *None* ([24](24-import.md)) |
| The user has 0 accounts | Every account UI is hidden except You → Accounts and the Orbit suggestion |

## Acceptance criteria

- [ ] A ₹1,000 expense, then a ₹200 refund, then a ₹500 transfer out on account A
      gives `flowMinor = −1,300` (Functions test), and the client balance matches
      before and after sync.
- [ ] Moving a transaction from A to B changes both balances exactly, offline
      included (pure test over the marker delta).
- [ ] Two accounts sharing `last4` produce *"Which account?"*, never a guess.
- [ ] Rules deny every client write to `accountBalances` and every client write to
      `rollupApplied`, and allow the owner to read both.
- [ ] A user with no accounts sees no account UI in the entry sheet.
- [ ] Offline, balances render with an `AS OF` tag and never a spinner.
