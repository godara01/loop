# 09 — Roadmap

What is deliberately **not** in v1, why, and what has to be true before it is.

## v1 — Personal ledger

Onboarding, expenses, categories (essentials + catalogue + custom), insights,
streak/check-in/coins, SMS-derived unapproved expenses (Android), haptics, and
the Firebase backend.
Defined by [00-product.md](00-product.md#v1-scope).

**Ships when:** every acceptance-criteria block in docs 02–08 and 10–12 passes on
a physical iPhone and a physical mid-range Android, and the security-rules test
suite is green.

**Longest-lead item:** the Google Play restricted-permission declaration for SMS
([12-sms-ingest.md](12-sms-ingest.md#play-store-risk)). Submit it first; the rest
of v1 does not depend on the answer, and the app ships without the feature if the
answer is no.

## v1.1 – v1.6 — The full ledger

Planned in detail in [27-full-ledger-plan.md](27-full-ledger-plan.md). The
binding scope per release is the table in
[00-product.md](00-product.md#release-scope-after-v1).

| Release | Theme | Feature docs |
|---|---|---|
| **v1.1** | Complete v1: account linking, date picker, ledger filters, custom period, force-update gate | [16](16-account-linking.md), [03](03-expenses.md), [05](05-insights.md) |
| **v1.2** | Money in & out: income, refunds, transfers, accounts, credit SMS | [17](17-money-in-and-out.md), [18](18-accounts.md) |
| **v1.3** | Organise: sub-categories, tags, merchants, split lines, smart suggestions | [04](04-categories.md), [21](21-tags.md), [22](22-merchants-and-suggestions.md) |
| **v1.4** | Plan ahead: budgets, recurring, Insights v2, reminders | [19](19-budgets.md), [20](20-recurring.md), [05](05-insights.md), [25](25-notifications.md) |
| **v1.5** | Squads: placeholders, invites, Drag & Split, settle up, pairs and lending | [23](23-squads.md) |
| **v1.6** | Reach: CSV import, quick actions, Android widget | [24](24-import.md), [26](26-shortcuts-and-widget.md) |
| iOS track | Apple sign-in, iOS push, iOS widget | — |

### What happened to the old v1.1–v1.3 plan

- **Groups (old v1.1)** are now **v1.5**. The reasoning hasn't changed (splitting
  needs a trusted ledger), and squads also need linking (v1.1), transaction kinds
  and accounts (v1.2) and push (v1.4) first. `split.ts`, `settle.ts` and the
  group-ready expense fields are still the foundation ([23](23-squads.md)).
- **Auto-categorisation (old v1.2)** is split. The merchant key ships in **v1.2**
  for refund matching. Merchant memory, plus a Gemini fallback through a callable
  Function, ships in **v1.3** ([22](22-merchants-and-suggestions.md)). The
  "server classifier trained on approvals" became merchant memory, which learns
  per user on device, plus an opt-in model for unseen merchants. **Never
  auto-approve** still holds.
- **MCP server (old v1.3)** moves to **v1.7**, unchanged in intent. The new pure
  modules (`accounts`, `budgets`, `recurring`, `groups`) give it far more to
  answer.

## v1.7 — MCP server

`packages/shared` is framework-free specifically so a Node MCP server can import
`money`, `split`, `settle`, `streak`, `coins` and `insights` directly and answer
questions about a user's spending without a second implementation of the
arithmetic. Cloud Functions already import the same package, so the server-side
half of this exists from v1.

## Deferred, not rejected

| Idea | Status |
|---|---|
| Receipt photo | Specified in [03](03-expenses.md#receipts). Deferred by owner decision (2026-10-10). Fields, rules and cleanup stay |
| OCR receipt scanning | Deferred with receipts |
| Multiple payers on one squad entry | Log two entries until there's demand |
| Recurring transfers | Recurring is expense and income only in v1.4 |
| App lock (biometric / PIN), hide-amounts privacy mode in-app, bulk ledger actions, PDF statements, changing the ledger currency | Not planned. Listed so they aren't forgotten |

## Considered and rejected

Not "later". Decided against, with the reason recorded so it doesn't get
relitigated every quarter.

| Idea | Why not |
|---|---|
| Streak freezes / repairs, purchasable saves | Rewards anxiety and turns a habit signal into a currency. If retention demands it, the fix is one automatic grace day per month — free, silent, unpurchasable. |
| Spendable coins, a shop, IAP | v1 needs the ledger to be trustworthy before it can be an economy. The ledger is built append-only and server-authoritative so this *can* be added later without a migration — but it is a separate product decision, not a v1 assumption. |
| Auto-approving high-confidence SMS expenses | The approval tap is the habit the streak defends. Automating it away removes the product. |
| A second local database (SQLite) beside Firestore | Two caches that disagree right after an offline write — the exact moment correctness matters most. See [10-architecture.md](10-architecture.md#state-management). |
| TanStack Query / Redux over Firestore | Firestore already caches, dedupes, queues offline writes and pushes realtime updates. A second cache is a second source of truth. |
| Levels, badges, tiers | A second scoreboard over the same number. Coins already carry the signal. |
| Leaderboards, friend comparison | Spending is private. Comparison is the fastest way to make this app feel bad to open. |
| Streak-reminder push notifications | Nagging is the mechanic users cite most when they delete a tracker. The opt-in daily reminder in [25](25-notifications.md) is the allowed form: once daily, user-chosen hour, neutral copy, never mentions the streak. |
| Pie / donut charts for category share | Length beats angle for accurate comparison, and a donut can't hold 20 categories. See [05-insights.md](05-insights.md#the-chart). |
| Arbitrary per-category colour picker | Wrecks a fixed palette in one afternoon. Eight tokens instead. |
| Bank-account aggregation, email import | Heavy integrations that require trust the app has not earned yet. SMS capture covers most of the value at a fraction of the cost — and unlike aggregation, it never leaves the device. |
| A light theme | The design system is dark-only by definition. |
| Multi-currency within one ledger | Needs FX rates, a rate-date policy, and a story for historical revaluation. `Money` is ready; the product isn't. |

## Discipline

A PR implementing a feature from a later release, or anything in the rejected
table, should be closed on scope alone, however small the diff. The release cut
lines in [00](00-product.md#release-scope-after-v1) are the only thing protecting
the 10-second entry target.
