# 17 — Money In and Out (Income, Transfers, Refunds)

> **Release:** v1.2 (Phase P2 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `K*` (the kind model) and `SM*` (credit SMS) in [`TASKS.md`](../TASKS.md).
> Accounts, which transfers need, are in [18-accounts.md](18-accounts.md).

v1 records money going **out**. That leaves a tracker blind to three ordinary
things: salary coming in, a refund cancelling a purchase, and money moving between
your own accounts. Without these, "how much do I have left this month" can't be
answered, and refunds stay counted as spending forever.

## The transaction kinds

Every document in `users/{uid}/expenses` gets a `kind`. The collection keeps its
name. Renaming it would mean migrating every document for no user-visible gain,
so [08-data-model.md](08-data-model.md#transactions) records that the collection
now holds every kind.

| `kind` | Means | Counts as spend | Counts as income | Moves account balance | Created by |
|---|---|---|---|---|---|
| `expense` | Money spent | **Yes** (+) | — | `accountId` −amount | User, SMS approval, recurring approval, import, squad mirror |
| `income` | Money received | — | **Yes** (+) | `accountId` +amount | User, credit SMS approval, recurring, import |
| `refund` | Money returned against a past expense | **Yes** (−), in the original's category | — | `accountId` +amount | User ("Record refund"), refund SMS approval |
| `transfer` | Money moved between two of your accounts | — | — | `accountId` −amount, `toAccountId` +amount | User, transfer-pair SMS approval |
| `settlement` | Paying or being paid back in a squad | — | — | ± per direction | Squad mirror only ([23](23-squads.md)) |
| `loan` | Lending or borrowing in a pair | — | — | ± per direction | Squad mirror only ([23](23-squads.md#pairs-and-lending)) |

Rules that hold for every kind:

- `amountMinor` is **always a positive integer**. Direction comes from `kind`.
  There are no negative amounts anywhere in storage. The one exception is a squad
  mirror, which can be `0`, for example when you paid but your share was zero
  ([23](23-squads.md#mirrors)).
- A missing `kind` reads as `expense`, so every v1 document stays valid with no
  migration.
- `categoryId` is **never null**. Kinds without a real category use reserved ids:
  `sys-transfer`, `sys-settlement`, `sys-loan`. These ids are never stored in
  `categories/` and never shown in the category strip. `resolveCategory()` maps
  them to built-in display tags.
- **Spend** is `sum(expense) − sum(refund)` for any period and category. **Income**
  is `sum(income)`. **Net** is `income − spend`. All three come from
  `packages/shared/src/insights.ts`. The screens never do this arithmetic
  themselves.

## Entry: the kind switch

The entry sheet ([03](03-expenses.md#add-expense)) gets a three-way segmented
switch above the amount: **Spend · Income · Transfer**.

- The default is **Spend**, always. The sheet does not remember the last kind,
  because the 10-second path is spend and a remembered Income would cause
  mis-logs. The exception is the quick action **Log income**
  ([26](26-shortcuts-and-widget.md)), which opens the sheet on Income.
- Haptic: `selection` on change.
- What each kind changes:

| Kind | Amount colour | Category strip | Account row | Save label |
|---|---|---|---|---|
| Spend | `colors.text` | Expense categories | One account (optional) | **Save** |
| Income | `colors.credit` (lime) | **Income categories** ([04](04-categories.md#income-categories)) | One account (optional) | **Save income** |
| Transfer | `colors.text` | Hidden | **From → To**, both required | **Move money** |

- Switching kind **keeps the amount and description**. It resets the category to
  that kind's preselect, because an expense category is never valid for income.
- Transfer is disabled, with the hint *"Add a second account to move money"*,
  until the user has at least two active accounts ([18](18-accounts.md)).

## Income

- It uses its own set of categories, `type: 'income'`. Seeded essentials:
  `SALARY`, `FREELANCE`, `INTEREST`, `CASHBACK`, `GIFTS`, `OTHER_IN`
  ([04](04-categories.md#income-categories)).
- The preselect is the most-used income category in the last 90 days, else
  `SALARY`. Ninety rather than thirty because income is monthly.
- Income is listed in the ledger with a lime `+` prefix on the amount. That is
  the only place lime marks an amount, and it means *money in*.
- **Coins and streak:** logging income banks the day (check-in) but earns **no**
  `expense_logged` coins ([06](06-gamification.md#what-counts)).
- Income can be recurring, for example a monthly salary. See [20](20-recurring.md).

## Transfers

- Both accounts are required and **MUST differ**. The validation runs in the
  shared `validateTransaction()`, and the rules also check
  `toAccountId != accountId` when `kind == 'transfer'`.
- A transfer is invisible to spend, income, budgets and every Insights chart. It
  only moves account balances.
- It appears in the ledger with a `⇄` glyph and the tag `MOVE`. The row reads
  `HDFC → Cash`.
- **Paying a credit card bill is a transfer** from the bank account to the card
  account. That is how card spending isn't counted twice: once when you swipe,
  and again when you pay the bill.
- Transfers earn no coins and don't bank the day. They are bookkeeping, not a
  money decision.

## Refunds

### Recording one manually

From an expense's detail sheet overflow menu: **Record refund**.

1. It opens the entry sheet in Refund mode. The kind switch is replaced by a
   locked `REFUND` tag.
2. The amount is pre-filled with the **refundable remainder**: the original
   amount minus the refunds already recorded against it.
3. Category, lines and account are copied from the original and are read-only.
   The refund must land where the money was counted. The account MAY be changed,
   for example when a card purchase is refunded to the bank.
4. The date defaults to today.
5. On save the document gets `kind: 'refund'`, `refundOf: <originalId>` and
   copies of the original's `categoryId` and `lines`. Copying means rollups and
   insights never have to look up the original, which might be deleted later.

### Rules

| Rule | Enforced by |
|---|---|
| Amount ≤ refundable remainder | Entry validation, using `refundableRemainder(original, refunds)` in shared |
| Cannot refund a refund, a transfer, a settlement, a loan, or a squad mirror | The **Record refund** item is hidden for those kinds and sources |
| A refund of a split expense (with `lines`) is apportioned across the lines in proportion | `allocate()` with the original line amounts as weights, so the parts sum exactly |
| An income-category refund is not a concept | Income has no refund action. A returned salary is an expense or a correction edit |

### Partial and multiple refunds

Several refunds can point at one original. The original's detail sheet shows a
**Refunds** section listing each one and *"₹X of ₹Y refunded"*.

### When two offline devices over-refund

Two devices could each record a refund for the full amount while offline. Rules
can't sum across documents, so both writes land. Behaviour:

- Insights clamp the **displayed** refund for that original at its amount, so spend
  never goes negative from a single purchase. The raw data is kept.
- The original's detail sheet shows a coral *"Refunds exceed the purchase by ₹X"*
  note, with a link to the refunds so the user can delete one.
- Clamping is done in `insights.ts` (`clampRefunds`) and unit-tested. Rollups
  store raw sums. The clamp only applies when the original's document is in the
  queried range or cache.

### Refunds across periods

A refund often lands in a later month than the purchase. The refund counts in the
period of **its own `localDate`**. Spend is cash-basis, matching what a bank
statement shows. So a category's net spend in a period **can be negative**: a
₹2,000 March refund for a February purchase makes March's SHOPPING −₹2,000 if
nothing else was bought.

[Honest numbers](00-product.md#design-principles): the negative value is shown,
labelled `REFUND`, never clamped to zero. In the ranked bar list a negative
category shows no bar, its amount in lime, and the label *"net refund"*.
`displayPercentages` runs only over categories with positive net. Negative ones
are listed below the chart, outside the 100%.

### Deleting the original

- Deleting an expense that has refunds is allowed. The refunds stay, because the
  money really did come back. They show *"Original deleted"*.
- Undo restores the link, since nothing on the refunds changed.

## Credit SMS

v1 drops credits and reversals ([12](12-sms-ingest.md#filtering)). From v1.2 they
become **proposals** in the inbox. Nothing is ever auto-logged.

| SMS shape | Becomes | Suggested fields |
|---|---|---|
| Plain credit: *"credited with Rs 50,000 … NEFT … ACME CORP"* | Pending **income** | `merchant` = payer name; category from merchant memory, else `SALARY` if the text matches `/salary|sal\b/i`, else `OTHER_IN` |
| Reversal / refund: *"refund of Rs 499 … AMAZON … credited"* | Pending **refund** | `suggestedRefundOf` = best match (below). If there is no match, the user can attach one or approve it as income |
| Cashback: *"cashback of Rs 25 credited"* | Pending **income**, category `CASHBACK` | — |
| Card bill payment: *"payment of Rs 12,000 received towards your credit card xx1234"* | Pending **transfer**, bank → card | `toAccountId` from `last4` ([18](18-accounts.md#sms-account-matching)), `accountId` left for the user to pick |
| Person-to-person UPI credit that matches an open squad balance | Pending **settlement suggestion** ([23](23-squads.md#settlement-suggestions)) | The squad and member |

### Refund matching

`matchRefund(pending, candidates)` in `packages/shared/src/sms/refund-match.ts` is
pure. The candidates are live `expense` documents from the last **60 days**, read
through the bounded `localDate` range query. A candidate matches when **all** of
these hold:

1. `candidate.amountMinor >= pending.amountMinor`, and the pending amount is within
   the candidate's refundable remainder.
2. The `merchantKey` is the same ([22](22-merchants-and-suggestions.md#merchant-keys)), **or**
   the `accountLast4` is the same and the candidate came from SMS.
3. The candidate is not itself a refund, transfer or mirror.

Ranking: exact amount first, then the same merchant, then the most recent. Only
the **top match is suggested**, never auto-applied. The pending card shows
*"Refund for ₹499 AMAZON on 12 Mar?"* with **Yes** (approve as a linked refund),
**Different purchase** (a picker) and **It's income** (approve as income).

### Transfer pairing

A debit on one of your accounts and a credit of the **same amount** on another of
your accounts, within **10 minutes**, is almost always you moving money.
`pairTransfers(pendings)` (pure) finds such pairs. The inbox shows one combined
card, *"Looks like a transfer: HDFC ••1234 → SBI ••9876"*.

- **Merge** approves one `transfer` document and marks both pendings approved.
  The two pending updates and the transfer create go in one batch.
- **Keep separate** approves them individually, as an expense and an income.
- Both accounts must be known ([18](18-accounts.md#sms-account-matching)). If
  either `last4` is unmatched, no pair is suggested.

## Data

New and changed fields on `users/{uid}/expenses/{id}`. The full schema is in
[08](08-data-model.md#transactions).

| Field | Type | Rules |
|---|---|---|
| `kind` | `'expense' \| 'income' \| 'refund' \| 'transfer' \| 'settlement' \| 'loan'` | Missing = `expense`. Clients may write only `expense \| income \| refund \| transfer`. `settlement` and `loan` are mirror-only |
| `categoryId` | string | For `transfer`: must be `sys-transfer`. For `income`: must be an income category. For `refund`: copied from the original |
| `accountId` | string \| null | Optional except for `transfer` |
| `toAccountId` | string \| null | Required for `transfer`, must differ from `accountId`. Null otherwise |
| `refundOf` | string \| null | Required for `refund`. Null otherwise |

`pendingExpenses` gains `kind` (default `expense`), `suggestedRefundOf`,
`pairedPendingId` and `merchantKey`. All are optional in the rules key set
([12](12-sms-ingest.md#the-pending-expense)).

## What changes elsewhere

| Area | Change |
|---|---|
| Rollups ([05](05-insights.md#where-the-numbers-come-from), [11](11-firebase.md#rollups-v2)) | New buckets: `incomeCount`, `incomeMinor`, `incomeByCategory` and `refundCount`, `refundMinor`, `refundByCategory`. Transfers, settlements and loans add nothing |
| Insights ([05](05-insights.md#spend-income-net)) | Spend / Income / Net toggle |
| Budgets ([19](19-budgets.md)) | Use net spend (expense − refund) |
| Gamification ([06](06-gamification.md#what-counts)) | The kind × source matrix |
| Ledger ([03](03-expenses.md#the-ledger)) | A kind filter facet. Row styling per kind |
| CSV export ([08](08-data-model.md#export)) | `kind`, `accountId`, `toAccountId` and `refundOf` columns |
| Orbit | *Today* stays spend only. A small *"+₹X in"* line appears under it on days with income |

## Haptics

| Action | Event |
|---|---|
| Kind switch | `selection` |
| Save income / transfer / refund | `expenseSaved` |
| Transfer with the same account on both sides | `warning`, inline error |
| Refund over the remainder | `warning`, the amount shakes |
| Approve a refund match or transfer pair | `expenseSaved` |

## Edge cases

| Case | Behaviour |
|---|---|
| Edit an expense into income | Allowed if it has no refunds. The category resets to the income preselect and must be confirmed |
| Edit income into an expense | Allowed. The category resets |
| Edit anything to or from transfer | Not allowed. Delete and re-enter. A transfer has two accounts and no category, so the edit would silently drop data |
| Edit a refund's amount above the remainder | Blocked with `warning` |
| Original deleted, then its refund is edited | Allowed. The remainder check is skipped because there is no original |
| Refund recorded on the same day as the purchase | Net spend for that day can be zero. The day is not zero-spend for gamification, because a purchase happened |
| A day with only income | Counts as a **zero-spend day** ([06](06-gamification.md#what-counts)) |
| Transfer to an archived account | The archived account is not offered as a destination. Existing transfers keep rendering |
| Credit SMS in a currency other than the ledger currency | Dropped, same as debits today. There is no FX |
| A refund SMS whose original was logged manually without a merchant | Matched by amount alone **only** if exactly one candidate has that exact amount in 60 days. Otherwise no suggestion |
| A credit SMS for a squad repayment that doesn't match any balance | Proposed as plain income. The user can dismiss it |
| A v1.0 build sees a `kind: income` document | Prevented by the force-update gate ([27](27-full-ledger-plan.md#force-update-gate)), which ships before any non-expense document can exist |

## Acceptance criteria

- [ ] Every v1 document with no `kind` parses as `expense`, and every v1 test still
      passes unchanged.
- [ ] Income, refund and transfer documents round-trip through the converter, the
      rules, the CSV export, `parseExpensesCsv` and the rollups with exact
      integers.
- [ ] A ₹1,000 expense with a ₹400 refund shows ₹600 spend in its category for a
      period containing both. With the refund next month, it shows +₹1,000 then
      −₹400.
- [ ] Displayed category percentages still sum to exactly 100 when one category
      is net-negative.
- [ ] A transfer changes no spend, income, budget or Insights number. It only
      changes the two account balances.
- [ ] Rules reject a transfer with `accountId == toAccountId`, and reject a client
      write of `kind: 'settlement'`.
- [ ] A refund SMS fixture suggests the right original, and **It's income**
      approves it as income.
- [ ] A matched debit + credit fixture pair produces one transfer card, and
      **Merge** writes exactly one transfer.
- [ ] Logging income banks the day and awards no `expense_logged` coins (Functions
      test).
