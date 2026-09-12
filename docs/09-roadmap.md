# 09 — Roadmap

What is deliberately **not** in v1, why, and what has to be true before it is.

## v1 — Personal ledger (this scope)

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

## v1.1 — Groups (Squads)

The product's actual centre, held back one release because splitting is only
useful on a ledger people already trust.

Most of the hard part is already written and tested:

| Already in the repo | File |
|---|---|
| Even / shares / exact / percentage allocation, largest-remainder, never drifts | [`split.ts`](../packages/shared/src/split.ts) |
| Balance netting and greedy debt simplification | [`settle.ts`](../packages/shared/src/settle.ts) |
| Multi-member domain types | [`types.ts`](../packages/shared/src/types.ts) |
| A Squads screen shell | [`squads.tsx`](../apps/mobile/src/app/%28tabs%29/squads.tsx) |

v1 keeps all of it compiling and keeps the `squad_id`, `paid_by`, `split_mode`
and `allocations` shapes in the schema, so this is additive:

- Squad creation, member management, invites
- The Drag & Split entry flow — this is where `dragStart` / `dragTick` /
  `dragDrop` / `splitConfirm` finally mean what they were named for
- Settle Up screen driven by `settleUp()`, with `settleSuccess`
- Per-squad balances on Orbit

**Not blocked on infrastructure.** Auth, Firestore, Functions, rules and App
Check all ship in v1; groups are a data model and a set of screens on top of them
([11-firebase.md](11-firebase.md#firestore-data-model) already defines
`groups/{groupId}` and the balance Function). What it needs is design time on
invites and the split UX, not a platform change.

## v1.2 — Auto-categorisation

Sequenced in [12-sms-ingest.md](12-sms-ingest.md#post-mvp-auto-categorisation):
merchant memory first (local, no model, most of the value), then a Function-side
classifier trained on approvals and dismissals. **Never auto-approve** — the tap
is the habit.

## v1.3 — MCP server

`packages/shared` is framework-free specifically so a Node MCP server can import
`money`, `split`, `settle`, `streak`, `coins` and `insights` directly and answer
questions about a user's spending without a second implementation of the
arithmetic. Cloud Functions already import the same package, so the server-side
half of this exists from v1.

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
| Streak-reminder push notifications | Nagging is the mechanic users cite most when they delete a tracker. Any future reminder is opt-in, once daily, user-chosen hour, neutrally phrased. |
| Pie / donut charts for category share | Length beats angle for accurate comparison, and a donut can't hold 20 categories. See [05-insights.md](05-insights.md#the-chart). |
| Arbitrary per-category colour picker | Wrecks a fixed palette in one afternoon. Eight tokens instead. |
| Bank-account aggregation, email import | Heavy integrations that require trust the app has not earned yet. SMS capture covers most of the value at a fraction of the cost — and unlike aggregation, it never leaves the device. |
| A light theme | The design system is dark-only by definition. |
| Multi-currency within one ledger | Needs FX rates, a rate-date policy, and a story for historical revaluation. `Money` is ready; the product isn't. |

## Discipline

A PR implementing anything on this page against v1 should be closed on scope
alone, however small the diff. The v1 cut line is the only thing protecting the
10-second entry target.
