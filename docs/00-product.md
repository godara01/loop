# 00 — Product Overview

## What Loop is

A personal expense tracker that makes logging money feel physical and slightly
rewarding, so that people actually keep doing it past week two.

Group expense splitting ("Squads") is the eventual centre of the product, but
**v1 ships the personal ledger only**. The reason is sequencing, not scope
reduction: splitting is only useful on top of a ledger people already trust, and
the split/settlement domain logic already exists and tested in
[`packages/shared`](../packages/shared/src) ready to switch on. See
[09-roadmap.md](09-roadmap.md).

After v1, releases **v1.1–v1.6** turn the personal ledger into a full expense
manager: income, accounts, budgets, recurring payments, squads and the rest. They
are planned in [27-full-ledger-plan.md](27-full-ledger-plan.md). The
[release scope table](#release-scope-after-v1) below is the binding cut line for
each release.

## The problem

Expense trackers fail for one reason: the logging habit dies. Entry is tedious,
nothing acknowledges the effort, and the payoff (insight) arrives weeks later.
Loop attacks the habit directly — fast entry, immediate physical feedback, and a
visible daily streak — rather than adding more analytics to an app nobody opens.

## Design principles

1. **Under 10 seconds to log an expense.** From cold app launch to saved. Every
   design decision loses to this one.
2. **Gamification is seasoning, not the meal.** A streak, a check-in, and coins.
   No avatars, no leaderboards, no mascot, no loss-aversion nagging. If a
   mechanic would embarrass an adult using this in public, it does not ship.
   The restraint rules are enforceable and listed in [06-gamification.md](06-gamification.md#restraint-rules).
3. **Every meaningful action has weight.** Confirmations, commitments and
   rejections are felt, not just seen. See [07-haptics.md](07-haptics.md).
4. **Offline-first, always.** Every read and write resolves against a local cache
   first; the network is a sync detail the user never waits on. Firebase is the
   backend ([11-firebase.md](11-firebase.md)), but the app must be fully usable in
   airplane mode, and onboarding asks for **no account** — the first launch signs
   in anonymously and can be linked to a real credential later.
5. **Nothing enters the ledger without a human tap.** SMS-derived expenses are
   *proposals* until approved ([12-sms-ingest.md](12-sms-ingest.md)). The app's
   headline number is never written by a regex.
6. **Money is never a float.** Non-negotiable, enforced by
   [`money.ts`](../packages/shared/src/money.ts).
7. **Honest numbers.** The app never rounds a total to make a chart prettier,
   and never invents a projection it can't justify from logged data.

## v1 scope

| Area | In v1 | Doc |
|---|---|---|
| Onboarding | Name, currency, haptics consent, category seeding, first expense | [02](02-onboarding.md) |
| Expenses | Create, edit, duplicate, soft-delete, notes, receipt photo | [03](03-expenses.md) |
| Categories | 10 seeded system categories + unlimited user-created | [04](04-categories.md) |
| Insights — category | Spend by category over a period, share of total, trend vs previous period | [05](05-insights.md#category-insights) |
| Insights — day | Day-wise totals, calendar strip, single-day detail | [05](05-insights.md#day-insights) |
| Gamification | Daily check-in, streak, coins and an append-only coin ledger | [06](06-gamification.md) |
| Haptics | Semantic layer bound to every major action | [07](07-haptics.md) |
| SMS capture | Transaction SMS → unapproved queue → one-tap approval. **Android only** | [12](12-sms-ingest.md) |
| Architecture | Feature modules, repository layer, Zustand + Firestore | [10](10-architecture.md) |
| Backend | Firebase: Auth, Firestore, Functions, Storage, App Check, Remote Config | [11](11-firebase.md) |

## Release scope after v1

Each release's scope is binding in the same way the v1 table is. A PR that builds
a later release's feature early is rejected on scope alone.

| Release | Adds | Docs |
|---|---|---|
| **v1.1** | Account linking (Google, Phone), arbitrary date picker, ledger filters, Insights custom period, force-update gate | [16](16-account-linking.md), [03](03-expenses.md), [05](05-insights.md) |
| **v1.2** | Transaction kinds: income, refunds, transfers. Accounts and balances. Credit, refund and transfer SMS proposals. Merchant key | [17](17-money-in-and-out.md), [18](18-accounts.md), [22](22-merchants-and-suggestions.md#merchant-keys) |
| **v1.3** | Sub-categories, tags, merchant field and memory, split across categories, opt-in smart suggestions | [04](04-categories.md#sub-categories), [21](21-tags.md), [22](22-merchants-and-suggestions.md), [03](03-expenses.md#split-across-categories) |
| **v1.4** | Budgets, recurring and subscriptions, Insights v2 (Spend/Income/Net, trend, projection, year, savings rate), opt-in daily reminder | [19](19-budgets.md), [20](20-recurring.md), [05](05-insights.md), [25](25-notifications.md) |
| **v1.5** | Squads with placeholder members, invites, Drag & Split, settle up, pairs and lending, squad push | [23](23-squads.md), [25](25-notifications.md#squad-push) |
| **v1.6** | CSV import, quick actions, Android widget | [24](24-import.md), [26](26-shortcuts-and-widget.md) |
| iOS track | Apple sign-in, iOS push, iOS widget | — |

### How the principles constrain the new scope

| Principle | Consequence |
|---|---|
| Under 10 seconds | The entry sheet stays amount → category → Save. Kind and account are optional with remembered defaults. Merchant, tags and split lines live under **More**. AI suggestions never run on the entry sheet |
| Gamification is seasoning | Budget overruns are neutral copy with no haptic. Push is never about the streak. Recurring approvals bank the day but earn no logging coins |
| Offline-first | Every new write is a plain local write. Server-derived numbers (balances, rollups) show the server value plus a local delta, and an `AS OF` time while offline. Only linking, invites, leaving a squad, smart suggestions, import and push need the network, and the UI says so |
| Nothing enters the ledger without a human tap | Recurring items, credit and refund SMS, and transfer pairs are inbox proposals. Import has an explicit confirm. **The one documented exception is squad mirrors**: joining a squad is the consent, mirrors carry a squad badge, and a per-squad "Count my share" switch controls whether they count as spend ([23](23-squads.md#mirrors)) |
| Money is never a float | Amounts stay positive integers, and `kind` carries the direction. Split lines, squad allocations and refunds of split expenses all go through `allocate()` |
| Honest numbers | The projection is guarded and shows its formula. Savings rate is hidden without income. Net-negative refund months are shown, not clamped. Months before the first record are hidden, not zero |

## Explicit non-goals

These are **out** for every release in this doc, and a PR adding them should be
rejected on scope alone. v1-only non-goals that the releases above now cover
(groups, income, budgets, recurring, widgets, auto-categorisation) were moved into
the [release scope table](#release-scope-after-v1).

- A required sign-up. Anonymous auth is the default, and linking is optional and
  never a wall ([16](16-account-linking.md))
- **Auto-approval** of anything: SMS, recurring or AI-suggested
- Bank-account aggregation, email import
- Receipt photos and OCR receipt parsing (*deferred*; the `receiptPath` field stays)
- Multi-currency in a single ledger. One ledger currency, chosen at onboarding.
  Squads in another currency don't mirror into the ledger ([23](23-squads.md#currency))
- Spendable coins, a shop, IAP ([09](09-roadmap.md#considered-and-rejected))
- Net worth, investments, loans with interest
- Watch app, web app
- Leaderboards, friends, social feeds, push-notification streak nagging

## Success signals

The build is working if, in a two-week internal test:

- **D7 logging retention ≥ 50%** of testers log on day 7.
- **Median time-to-log ≤ 10s**, measured from app foreground to save, on a
  mid-range Android.
- **≥ 60% of active days include a check-in or an expense** — the streak is
  being maintained deliberately, not accidentally.
- **Zero** reports of split/rounding drift. `allocate()` throwing in production
  is a P0.
- **≥ 70% of SMS-proposed expenses are approved, not dismissed**, on Android. A
  lower rate means the parser is guessing and should be tightened, not tuned for
  volume.

## Platform and constraints

Expo SDK 57 / RN 0.86, iOS and Android, portrait only, dark theme only.

Development runs on an **EAS development build, not Expo Go** — the native
Firebase SDK and the SMS module both require it
([10-architecture.md](10-architecture.md#build-and-workflow-consequence)).

Features are tested on the **Android emulator**. Haptic events are wired in as
each interaction is built, but emulators do not vibrate, so feeling and tuning
them on a physical mid-range Android is batched into one pass during hardening —
see [07-haptics.md](07-haptics.md#testing).

**One feature is platform-asymmetric**: SMS capture cannot exist on iOS, because
Apple provides no API for it at any entitlement level. iOS reaches the same inbox
through the share sheet and paste. This is a permanent constraint, not a backlog
item.
