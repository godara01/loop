# Loop — Product Documentation

This directory is the source of truth for **what Loop does and why**. Code is the
source of truth for *how*. When the two disagree, one of them is a bug — fix the
doc in the same PR as the code.

## How these docs are organised

One file per functional area. Each file stands alone: you can hand a single file
to someone and they can build that feature without reading the rest.

| Doc | Covers |
|---|---|
| [00-product.md](00-product.md) | Vision, principles, v1 scope, explicit non-goals |
| [01-information-architecture.md](01-information-architecture.md) | Screen map, routes, navigation rules |
| [02-onboarding.md](02-onboarding.md) | First run, profile setup, seeding, empty states |
| [03-expenses.md](03-expenses.md) | Add, edit, duplicate, delete an expense |
| [04-categories.md](04-categories.md) | System + user-created categories, management |
| [05-insights.md](05-insights.md) | Category-wise and day-wise insights |
| [06-gamification.md](06-gamification.md) | Daily check-in, streaks, coins and the coin ledger |
| [07-haptics.md](07-haptics.md) | Semantic haptic event map, per-action bindings |
| [08-data-model.md](08-data-model.md) | Domain entities and the `@loop/shared` changes v1 needs |
| [09-roadmap.md](09-roadmap.md) | What is deliberately after v1 (Groups, MCP, auto-categorisation) |
| [10-architecture.md](10-architecture.md) | Layers, folder structure, state management, import rules |
| [11-firebase.md](11-firebase.md) | Firebase services, Firestore model, security rules, Functions |
| [12-sms-ingest.md](12-sms-ingest.md) | Reading transaction SMS into an unapproved queue |
| [13-build-plan.md](13-build-plan.md) | The order to build v1 in, milestone by milestone |
| [14-environment-setup.md](14-environment-setup.md) | Firebase, EAS and dev-build setup — start here to run the app |
| [15-mvp-completion-plan.md](15-mvp-completion-plan.md) | The six phases from M3 to a tested MVP, and the final integration gate |
| [tasks/](tasks/README.md) | The remaining work broken into small, independently completable task briefs, in build order |

## Conventions used in every doc

- **MUST / SHOULD / MAY** are load-bearing. MUST is a release blocker.
- Every flow lists its **haptic event** by semantic name, never a raw pattern.
- Money in examples is written in major units for readability (`₹420.00`) but is
  always stored as integer minor units (`42000`). See
  [`packages/shared/src/money.ts`](../packages/shared/src/money.ts).
- "v1" means the first shipped build. Anything marked *Deferred* is tracked in
  [09-roadmap.md](09-roadmap.md) and MUST NOT be built early.

## Reading order for a new contributor

1. [00-product.md](00-product.md) — why this exists and what it refuses to be
2. [10-architecture.md](10-architecture.md) — the layers and where state lives
3. [08-data-model.md](08-data-model.md) — the shapes everything else moves around
4. [11-firebase.md](11-firebase.md) — where those shapes are stored
5. Whichever feature doc you are assigned

Project-level engineering rules (stack, design tokens, non-negotiables) live in
[CLAUDE.md](../CLAUDE.md), not here. These docs assume it.
