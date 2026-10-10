# Loop — Product Documentation

This directory is the source of truth for **what Loop does and why**. Code is the
source of truth for *how*. When the two disagree, one of them is a bug — fix the
doc in the same PR as the code.

## How these docs are organised

One file per functional area. Each file stands alone: you can hand a single file
to someone and they can build that feature without reading the rest.

| Doc | Covers |
|---|---|
| [00-product.md](00-product.md) | Vision, principles, v1 scope, release scope v1.1–v1.6, explicit non-goals |
| [01-information-architecture.md](01-information-architecture.md) | Screen map, routes, navigation rules |
| [02-onboarding.md](02-onboarding.md) | First run, profile setup, seeding, empty states |
| [03-expenses.md](03-expenses.md) | Add, edit, duplicate, delete an expense |
| [04-categories.md](04-categories.md) | System + user-created categories, management |
| [05-insights.md](05-insights.md) | Category-wise and day-wise insights |
| [06-gamification.md](06-gamification.md) | Daily check-in, streaks, coins and the coin ledger |
| [07-haptics.md](07-haptics.md) | Semantic haptic event map, per-action bindings |
| [08-data-model.md](08-data-model.md) | Domain entities and the `@loop/shared` changes v1 needs |
| [09-roadmap.md](09-roadmap.md) | Release sequence after v1, deferred ideas, and what was considered and rejected |
| [10-architecture.md](10-architecture.md) | Layers, folder structure, state management, import rules |
| [11-firebase.md](11-firebase.md) | Firebase services, Firestore model, security rules, Functions |
| [12-sms-ingest.md](12-sms-ingest.md) | Reading transaction SMS into an unapproved queue |
| [13-build-plan.md](13-build-plan.md) | The order to build v1 in, milestone by milestone |
| [14-environment-setup.md](14-environment-setup.md) | Firebase, EAS and dev-build setup — start here to run the app |
| [15-mvp-completion-plan.md](15-mvp-completion-plan.md) | The six phases from M3 to a tested MVP, and the final integration gate |
| [16-account-linking.md](16-account-linking.md) | Google / Phone linking, signing in on a new device, switching accounts, sign-out (v1.1) |
| [17-money-in-and-out.md](17-money-in-and-out.md) | Transaction kinds: income, refunds, transfers; credit and refund SMS (v1.2) |
| [18-accounts.md](18-accounts.md) | Accounts, payment methods and balances (v1.2) |
| [19-budgets.md](19-budgets.md) | Monthly overall and category budgets (v1.4) |
| [20-recurring.md](20-recurring.md) | Recurring transactions and subscriptions, as inbox proposals (v1.4) |
| [21-tags.md](21-tags.md) | Tags across categories (v1.3) |
| [22-merchants-and-suggestions.md](22-merchants-and-suggestions.md) | Merchant field, merchant memory, opt-in AI category suggestions (v1.2–v1.3) |
| [23-squads.md](23-squads.md) | Squads, placeholder members, invites, Drag & Split, settle up, pairs and lending (v1.5) |
| [24-import.md](24-import.md) | CSV import with mapping, duplicate detection and undo (v1.6) |
| [25-notifications.md](25-notifications.md) | Opt-in reminders and squad push (v1.4–v1.5) |
| [26-shortcuts-and-widget.md](26-shortcuts-and-widget.md) | Quick actions and the Android home-screen widget (v1.6) |
| [27-full-ledger-plan.md](27-full-ledger-plan.md) | The six releases from v1.1 to v1.6: order, tests, gates, deploy runbook, owner actions |

Remaining work is tracked in one place: [`../TASKS.md`](../TASKS.md).

## Conventions used in every doc

- **MUST / SHOULD / MAY** are load-bearing. MUST is a release blocker.
- Every flow lists its **haptic event** by semantic name, never a raw pattern.
- Money in examples is written in major units for readability (`₹420.00`) but is
  always stored as integer minor units (`42000`). See
  [`packages/shared/src/money.ts`](../packages/shared/src/money.ts).
- "v1" means the first shipped build. "v1.1" … "v1.6" are the releases in
  [27-full-ledger-plan.md](27-full-ledger-plan.md). A feature tagged with a release
  MUST NOT be built before that release's phase. Anything marked *Deferred* is
  tracked in [09-roadmap.md](09-roadmap.md).

## Reading order for a new contributor

1. [00-product.md](00-product.md) — why this exists and what it refuses to be
2. [10-architecture.md](10-architecture.md) — the layers and where state lives
3. [08-data-model.md](08-data-model.md) — the shapes everything else moves around
4. [11-firebase.md](11-firebase.md) — where those shapes are stored
5. Whichever feature doc you are assigned

Project-level engineering rules (stack, design tokens, non-negotiables) live in
[CLAUDE.md](../CLAUDE.md), not here. These docs assume it.
