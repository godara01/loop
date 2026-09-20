# Task Backlog — remaining MVP work

This directory breaks the remaining work in [`15-mvp-completion-plan.md`](../15-mvp-completion-plan.md)
into small, independently completable tasks. Each file is self-contained: a fresh
agent with no other context should be able to open one file, read the docs it
points to, and finish that task end-to-end without needing this conversation.

## Why this exists

As of 2026-09-20, M0–M3 (`docs/13-build-plan.md`) are done and verified. M4
(categories) is app-complete but not device-verified. M5 (insights) and M6
(gamification, streak, coins, Cloud Functions, onboarding) have code in the tree
but were bulk-committed by an autonomous loop run without going through the
phase gate in `docs/15` — their acceptance criteria are unticked and their L4
(Maestro) flows have not been run. M7 (SMS inbox) has only early scaffolding
(`packages/shared/src/sms/types.ts`, `sender.ts`, `templates.ts`) — no parser,
no native module, no UI. M8 (hardening/release) has not started.

This backlog exists so that work keeps moving **in phase order** without losing
the gate discipline `docs/15` set out (verify, tick the doc, commit — don't
stack unverified work on top of unverified work).

## Rules for working this backlog

1. **Work tasks in order**, top to bottom in the table below. A task that says
   "Depends on" must not be started before its dependency's Definition of Done
   is met.
2. **Use the `unlazy` skill for every task in this backlog.** Each task file
   says so again, but it's the standing rule: write gates before implementing
   (solo mode for a single-file task; orchestrated mode only if the task file
   itself says to fan out into leaves), and don't report a task done until its
   gates are met with real evidence, not a confident summary.
3. **One commit per task**, made only when that task's Definition of Done is
   fully green — same discipline as `docs/15`'s "one commit per phase," just at
   finer grain. Do not bundle multiple tasks into one commit.
4. **Update the doc, not just the code.** Every task names a `docs/NN-*.md`
   file with acceptance criteria to tick. An implementation isn't done until the
   checkbox is ticked and any decision made along the way is recorded there.
5. When a task's own testing section says a command should already pass
   (because the underlying L1/L2/L3 suite already covers it), **run it and
   confirm** rather than assuming — these tasks were scoped from the current
   state of the repo, but code drifts.

## Order

| # | Task | Phase (docs/13 milestone) | Depends on |
|---|---|---|---|
| 1 | [phase-2-04-device-verification.md](phase-2-04-device-verification.md) | Phase 2 / M4 | — |
| 2 | [phase-3-01-insights-gate.md](phase-3-01-insights-gate.md) | Phase 3 / M5 | Task 1 |
| 3 | [phase-4-01-gamification-functions-gate.md](phase-4-01-gamification-functions-gate.md) | Phase 4 / M6 | Task 2 |
| 4 | [phase-4-02-onboarding-gate.md](phase-4-02-onboarding-gate.md) | Phase 4 / M6 | Task 3 |
| 5 | [phase-5-01-sms-parser.md](phase-5-01-sms-parser.md) | Phase 5 / M7 | Task 4 |
| 6 | [phase-5-02-sms-native-module.md](phase-5-02-sms-native-module.md) | Phase 5 / M7 | Task 4 |
| 7 | [phase-5-03-sms-inbox-repository.md](phase-5-03-sms-inbox-repository.md) | Phase 5 / M7 | Task 5 |
| 8 | [phase-5-04-sms-inbox-ui.md](phase-5-04-sms-inbox-ui.md) | Phase 5 / M7 | Tasks 5, 6, 7 |
| 9 | [phase-5-05-sms-integration-gate.md](phase-5-05-sms-integration-gate.md) | Phase 5 / M7 | Task 8 |
| 10 | [phase-6-01-rollup-functions.md](phase-6-01-rollup-functions.md) | Phase 6 / M8 | Task 9 |
| 11 | [phase-6-02-scheduled-cleanup.md](phase-6-02-scheduled-cleanup.md) | Phase 6 / M8 | Task 10 |
| 12 | [phase-6-03-csv-export-reset-app.md](phase-6-03-csv-export-reset-app.md) | Phase 6 / M8 | Task 9 |
| 13 | [phase-6-04-app-check-crashlytics.md](phase-6-04-app-check-crashlytics.md) | Phase 6 / M8 | Task 9 |
| 14 | [phase-6-05-polish-accessibility-perf.md](phase-6-05-polish-accessibility-perf.md) | Phase 6 / M8 | Tasks 10–13 |
| 15 | [phase-6-06-final-integration-gate.md](phase-6-06-final-integration-gate.md) | Final gate | Task 14 |

Tasks 10–13 don't depend on each other and can run in any order (or in
parallel, by different agents) once task 9 is closed — only task 14 needs all
four finished.

## Task file shape

Every task file has the same sections: **Objective**, **Context**, **Flow**
(how it should behave, step by step), **Edge cases**, **Files owned**,
**Testing**, **Definition of done**, **Working method**. If you're picking up
a task and something in it looks stale against the current repo state, trust
the repo and fix the task file's assumption in the same commit — these were
written from a snapshot of the tree, not a promise about the future.
