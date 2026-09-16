# 15 — MVP Completion Plan (six phases)

## Context

M0 (dev build + toolchain), M1 (shared domain layer) and M2 (Firebase spine: anonymous
auth, bootstrap gate, category seed, settings, 28 rules tests) are done and verified
on the `Loop_API35` emulator. M2 is **not committed yet** (28 changed files).

What remains of the v1 scope in `docs/00-product.md` maps one-to-one onto build-plan
milestones M3–M8 (`docs/13-build-plan.md`), so the six phases below *are* those
milestones, each tightened with explicit features, integration points and tests,
plus a final end-to-end integration gate.

Decisions fixed by the user:
- **Android-only MVP.** Code stays cross-platform; iOS build, iPhone pass and the
  iOS share extension move post-MVP (needs Apple enrollment).
- **Blaze plan in Phase 6.** Phases 1–5 run entirely on emulators; Functions deploy
  to `loop-app-0403` in Phase 6.
- **One commit per phase**, on `master`, made only when the phase gate is green.
  Final commit tagged `v1.0.0-mvp`.

---

## How every phase is tested

Four layers. Every phase adds to them; nothing is tested only by hand.

| Layer | What | Command | Runs against |
|---|---|---|---|
| **L1 Unit** | Pure logic: `packages/shared` + pure model files in `apps/mobile/src/features/*/model` | `npm test` | Node, no device |
| **L2 Rules** | Firestore (and Phase 2+ Storage) security rules | `npm run test:rules` | Throwaway emulator :8085 |
| **L3 Functions** | Cloud Functions triggers, idempotency, ledger maths (Phase 4+) | `npm run test:functions` | `emulators:exec` Functions+Firestore+Auth |
| **L4 E2E** | Real app on `Loop_API35` via **Maestro** flows, with server-state assertions through the emulator REST API inside flows (`runScript` + `http`) | `npm run e2e -- <flow>` | Emulator + local Firebase emulators |

**Phase gate** (all must pass before the phase commit):
1. `npm run typecheck`, `npm test`, `npm run test:rules` (+ `test:functions` from Phase 4) green
2. The phase's Maestro flows green **twice in a row** from clean state (flake check)
3. The phase's acceptance criteria in its doc ticked; decisions recorded in the doc
4. `docs/13` status line added; haptic calls present for every new interaction
   (felt on a device only in Phase 6)
5. Commit

### Groundwork (start of Phase 1, before any feature)
- Commit the M2 work as its own commit.
- Install Maestro (`~/.maestro`, Java 25 is present). Create `e2e/`:
  - `e2e/subflows/launch.yaml` — `openLink exp+loop://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`, optional dismiss of the dev-menu sheet (`Continue`/`Close`)
  - `e2e/subflows/reset.yaml` — `pm clear com.getter.loop` + wipe emulator data
  - `e2e/scripts/firestore.js` — tiny helper for REST asserts (`Authorization: Bearer owner`)
- `scripts/e2e.sh` + root `e2e` script: checks emulators/Metro/device are up, runs flows.
- `scripts/seed-emulator.ts` (root devDep `firebase-admin`) — deterministic fixtures
  (N expenses, category mix, dates); **refuses to run unless `FIRESTORE_EMULATOR_HOST` is set**.
- `apps/mobile` `test` script: `tsx --test` over `src/**/model/*.test.ts` (files that
  import no React Native), wired into root `npm test`.
- Convention: `testID` on every interactive element and asserted value
  (`expense-amount`, `ledger-day-2026-09-16-total`, …). Maestro selects by id, never by coordinates.

---

## Phase 1 — Core loop: add, edit, delete, ledger (M3)

**Features**
- Dock: remove Squads from the dock; add the centre lime **+** plate → `/expense/new`.
  Delete `app/(tabs)/squads.tsx` (it only renders mock data; `settle.ts`/`split.ts`
  stay for v1.1). Update `docs/01`.
- Entry sheet (modal): custom amount pad, category strip (`orderForEntry`), description,
  date chip (Today/Yesterday/pick), note; save / update; discard confirmation; repeat-last chip.
- Expense detail/edit `app/expense/[id].tsx`; duplicate; **soft delete + 6 s undo**.
- Ledger `(tabs)/activity.tsx`: grouped by `localDate` with mono day totals, search,
  50-row paging (`deletedAt == null` + `orderBy occurredAt desc`, index exists).
- Orbit: today's spend + recent expenses from Firestore; remove mock settle/split UI;
  hide the streak capsule until Phase 4 (no fake "12").
- Delete `apps/mobile/src/data/mock.ts`.
- New haptic events `expenseSaved`, `destructive` in `lib/haptics.ts` + You bench list.

**Integration points**
- `packages/shared/src/firestore/documents.ts` — add `expenseToDoc` / `parseExpense`
  (`total` ⇄ `amountMinor`+`currency`, single self-allocation) and `paths.expense`
  (exists); `localDateOf(date)` beside `todayISO` in `streak.ts`.
- `apps/mobile/src/features/expenses/{model,api,hooks,components,screens,index.ts}`
  — `model/amount-input.ts` pure state machine using `parseAmount` (`money.ts`).
- `app/_layout.tsx` Stack: `expense/new`, `expense/[id]` as modal presentations.
- Introduce **zustand** (JS-only) for the entry draft (`core/state/draft-store.ts`), as
  docs/10 prescribes — survives hopping to category creation in Phase 2.

**Decision surfaced:** docs/03 put the check-in in the same batch as the expense, but
check-ins are **create-only** in the rules, so a second expense of the day would make
the whole batch fail. Phase 1 writes the expense alone; the check-in is created by the
`onExpenseWrite` Function in Phase 4. Record in docs/03 and docs/11.

**Tests**
- L1: amount-input (second `.`, JPY no decimal, max fraction digits, zero rejected,
  lakh grouping via `parseAmount`); expense converter round-trip + malformed cases;
  `localDateOf` across midnight/timezones; ledger grouping.
- L2: doc from `expenseToDoc` accepted; soft-delete update allowed; foreign uid denied.
- L4 flows: `expense-add` (₹120 FOOD → ledger "Today" + Orbit total + server doc
  `amountMinor: 12000`), `expense-edit-delete-undo`, `expense-discard`,
  `expense-offline` (airplane mode add → visible offline → reconnect → server has it).
- Perf: seed 5,000 expenses → Maestro scrolls ledger end-to-end without drops/crash.

**Gate:** docs/03 acceptance criteria; manual 10-second entry check on the emulator.

---

## Phase 2 — Categories in full: catalogue, custom, manage (M4)

**Native rebuild #1** (one EAS dev build, installed via `adb install -r`):
`@react-native-firebase/storage`, `expo-image-manipulator`.

**Features**
- Catalogue `app/category/catalogue.tsx`: sections, search, multi-select, "Add N"
  batch; bundled `CATEGORY_CATALOGUE`, overridden by `catalog/categories/entries/*`
  when `catalog/meta.version` is newer.
- Create/edit sheet `app/category/new.tsx`, `[id].tsx`: `validateCategoryDraft`,
  live `MonoTag` preview, glyph grid, 8 colour tokens, uploaded logo (square crop,
  256 px, `users/{uid}/categoryLogos/{id}`, optimistic local render, glyph fallback).
- Manage `app/category/index.tsx`: active/archived, archive/unarchive (`canArchive`),
  delete only if `canDelete`, orphan → `OTHER`, drag reorder
  (`dragStart`/`dragTick`/`dragDrop`).
- Entry strip "+" → catalogue/new → back with the new category selected and the typed
  amount intact (draft store).

**Integration points:** `features/categories/{api,hooks,components,screens}` (repository
exists: `features/categories/api/category-repository.ts`); `storage.rules` + `firebase.json`
storage emulator; You → Categories row.

**Tests**
- L1: catalogue override/version pick; `reorder → sortOrder` pure fn; orphan-reassignment
  plan; logo size/type guard.
- L2: category image-icon doc accepted; Storage rules (owner-only, ≤512 KB, `image/*`)
  on the storage emulator.
- L4 flows: `catalogue-add`, `category-custom-glyph`, `category-custom-logo` (PNG pushed to
  emulator gallery), `category-archive-unarchive`, `category-reorder` (server `sortOrder`),
  `category-from-entry-sheet` (amount preserved).

**Gate:** docs/04 acceptance criteria.

---

## Phase 3 — Insights: category-wise and day-wise (M5)

**Features**
- `app/(tabs)/insights.tsx`; dock becomes Orbit · Ledger · **+** · Insights · You.
- Period control (week/month/30 days/custom, swipe prev/next, no future), persisted in
  `settings.insightsPeriod` (field exists).
- Category section: period total + delta chip (down = lime), ranked bars,
  `displayPercentages`, `collapseLongTail`; tap → ledger filtered by category+period.
- Day section: calendar strip with 5 discrete intensity steps, averages row, weekday
  bars; `app/day/[date].tsx` day detail with swipe between days.

**Integration points / reuse:** everything numeric comes from
`packages/shared/src/insights.ts` (`periodOf`, `previousPeriod`, `totalsByCategory`,
`totalsByDay`, `periodStats`, `weekdayAverages`, `compareToPrevious`, `collapseLongTail`).
Add `intensityStep()` there. Data via expenses query on `localDate` range (index exists).
Rollups deferred to Phase 6.

**Tests**
- L1: `intensityStep`; period navigation bounds; existing insights suite.
- L4 flows: `insights-fixture` — seed a deterministic fixture, the seed script prints the
  expected totals/percentages (computed with the same shared functions), and the flow
  asserts the screen shows exactly those; `insights-day-detail`; `insights-timezone`
  (emulator timezone changed; 23:59 vs 00:01 land on different days);
  `insights-period-persist`.
- Perf: 3,000 seeded expenses, render under 300 ms (logged `[perf]` mark read from logcat).

**Gate:** docs/05 acceptance criteria.

---

## Phase 4 — Streak, check-in, coins, Cloud Functions, onboarding (M6)

**Features**
- New `functions/` workspace (TypeScript, firebase-functions v2, bundled with
  `@loop/shared`): `onExpenseWrite` (create day check-in if absent, evaluate coins),
  `onCheckInCreate` (streak via `recordActivity`/`completesWeek`, coins via
  `evaluateCoinEvent`), transactional wallet update with `coinEntryId` idempotency.
- Orbit: check-in plate, real `StreakCapsule` from `streak/main`, coin balance from
  `wallet/main`, optimistic `+N` chip, milestone Skia burst (reduce-motion aware).
- `app/coins.tsx` history; **Keep it plain** switch (`settings.keepItPlain` exists).
- Onboarding `app/onboarding/*` (5 steps); `BootstrapProvider` routes to onboarding
  while `profile.onboardedAt` is null; currency step writes `profile.currency`;
  first-expense step reuses the Phase 1 sheet; resume mid-flow.

**Integration points:** `core/providers/bootstrap-provider.tsx` (gate),
`core/firebase/session-repository.ts` (profile updates), `firebase.json` functions
emulator, root `test:functions`, `features/streaks/*`, `features/onboarding/*`.

**Tests**
- L1: onboarding step reducer; optimistic coin preview = `evaluateCoinEvent`.
- L2: profile `onboardedAt`/`currency` update allowed; check-in create-only (exists).
- L3: double check-in → one ledger entry; 10 expenses → 6 `expense_logged` coins;
  delete → no clawback; backdated expense → no streak day; handler run twice → no
  duplicate; `wallet.coinBalance == sum(ledger)`; 7-day run → `week_complete` once.
- L4 flows: `onboarding-full` (fresh data → Orbit, streak 1, coins settle > 0 via server
  poll), `onboarding-skip`, `onboarding-resume`, `check-in-zero-spend` (+8),
  `keep-it-plain`, `check-in-offline-reconcile`.

**Gate:** docs/02 and docs/06 acceptance criteria.

---

## Phase 5 — SMS capture and the unapproved inbox (M7, Android)

**Native rebuild #2:** local Expo module `apps/mobile/modules/sms-reader` (Kotlin
`BroadcastReceiver` for `SMS_RECEIVED`, `ContentResolver` 30-day backfill, permission
bridge, config plugin adding `RECEIVE_SMS`/`READ_SMS`) +
`@react-native-firebase/remote-config` (`smsIngestEnabled`, template registry override).
Kept deliberately small: it can only be compiled on EAS.

**Features**
- `packages/shared/src/sms/`: sender allowlist (DLT entity match), shape filters
  (OTP/promo/declined/reversal/credit excluded), template registry,
  `parseTransactionSms` → integer minor units via `parseAmount`, confidence ≥ 0.6,
  dedupe (same amount+last4 ≤ 10 min; manual expense ≤ 30 min), masked `displayHint`.
- `pendingExpenses` repository; `app/inbox.tsx` (approve / edit & approve / dismiss /
  approve all), Orbit badge, 30-day expiry on read; approval writes the expense
  (`source: 'sms'`, `pendingId`) and marks the pending item in one batch — coins and
  streak then follow through `onExpenseWrite` automatically.
- You → Auto-capture explainer and permission; card after the 3rd manual expense.
- **Paste to parse** in the inbox (the manual path; Android share intent is a stretch
  goal; the iOS share extension is post-MVP).

**Tests**
- L1: ≥ 40-message fixture corpus (Indian bank formats, lakh grouping, OTP, promos,
  declined, reversals, credits), dedupe windows, expiry, confidence cut-off.
- L2: pendingExpenses rules (owner-only, status enum, no raw `body` field).
- L4 flows using `adb emu sms send`: `sms-debit-approve` (card → approve → ledger +
  server `source: sms`), `sms-otp-ignored`, `sms-duplicate-single-card`,
  `sms-manual-suppresses`, `sms-dismiss`, `sms-kill-switch` (dev override),
  `sms-paste-parse`, `sms-privacy` (server scan: no document contains the raw text).
  First step verifies `adb emu sms send` accepts alphanumeric senders; if not, a
  `__DEV__`-only allowlist entry for the emulator's numeric sender.

**Gate:** docs/12 acceptance criteria (Android).

---

## Phase 6 — Hardening, live deploy, release readiness (M8)

**Native rebuild #3:** `@react-native-firebase/app-check`, `@react-native-firebase/crashlytics`,
`expo-file-system`, `expo-sharing`; drop `expo-sqlite` (unused).

**Features**
- Rollup Functions (daily/monthly) + `rebuildRollups`; Insights past periods read rollups.
- Scheduled `cleanupSoftDeleted` (90 days) and pending-expense expiry; `onUserDelete`.
- You → **Export CSV** (pure builder/parser in shared) and **Reset app** (typed RESET →
  delete subtree + Storage prefix → onboarding).
- App Check (debug provider on emulator, Play Integrity live), Crashlytics without PII.
- Empty states, accessibility labels, font scaling, error states, perf re-check.
- **Physical-device haptic pass** on the Redmi Note 10 Pro: every event in docs/07.
- **Live:** user upgrades to Blaze + sets a budget alert → deploy rules, indexes,
  Functions → EAS `preview` build (embedded bundle, live project) smoke test.

**Tests**
- L1: CSV round trip byte-identical `amountMinor`; rollup builders; client-vs-rollup parity.
- L3: rollups on write/edit/delete, rebuild idempotent, cleanup, user delete removes all.
- L4 flows: `export-csv` (pull file, re-parse), `reset-app`, `insights-rollups-parity`,
  `app-check-debug`.
- Manual checklists: haptic pass, preview-build live smoke.

**Gate:** docs/07, 08, 11 acceptance criteria.

---

## Final gate — full MVP integration test

`npm run test:all` (`scripts/test-all.sh`) runs everything from a **clean slate**:
typecheck → `npm test` → `test:rules` → `test:functions` → start emulators with no
imported data → `pm clear` the app → **every phase flow** → the journey below → teardown
and summary.

**Journey `e2e/journeys/mvp-day-in-the-life.yaml`**, one continuous run on a fresh install:
1. Onboarding: name, INR, haptics on, add COFFEE from the catalogue, first expense → Orbit shows streak 1; server wallet > 0
2. Four more expenses (one backdated), edit one, delete one, undo, delete again
3. Custom category created from inside the entry sheet; amount survives
4. Debit SMS injected → inbox → approve; OTP injected → nothing; duplicate → one card
5. Airplane mode → add expense → kill + relaunch → still there → reconnect → synced
6. Insights: totals and percentages equal the values computed by `insights.ts` from the journey's own data; day detail matches
7. Server invariants: 1 user; `wallet == sum(coinLedger)`; one check-in per active day; no raw SMS text in any document; rollups equal client totals
8. Export CSV → re-parse → identical amounts
9. Keep it plain → no capsule/coins/celebrations
10. Reset app → onboarding; server subtree empty

**Exit criteria:** `test:all` green twice consecutively; acceptance criteria in docs 02–12
ticked (Android); physical haptic checklist and live preview-build smoke done; docs/13
marks MVP complete; commit tagged `v1.0.0-mvp`.

---

## Native rebuild schedule

| When | Adds | Why batched |
|---|---|---|
| Phase 2 start | storage, image-manipulator | first feature needing files |
| Phase 5 start | SMS module, remote-config | SMS is the only Kotlin |
| Phase 6 start | app-check, crashlytics, file-system, sharing; remove expo-sqlite | release-only concerns |

Each: commit → `eas build --profile development --platform android` → verify with
`unzip -l` (dev-menu marker + new native libs) before `adb install -r`.

## User actions (not blocking earlier phases)
- **Submit the Play SMS permission declaration** early. It has the longest lead time and does not block Phase 5 development.
- **Phase 6:** enable Blaze + a budget alert. Then run the live preview-build smoke test and the physical haptic pass with me.
- **Post-MVP:** Apple Developer enrollment for iOS.

## Risks
- `adb emu sms send` may reject alphanumeric senders. There is a dev-only fallback, noted in Phase 5.
- Maestro drag gestures for reorder may be flaky. Fallback: assert via move up/down accessibility actions.
- Disk has about 11 GB free. Three EAS APKs (~340 MB each) are deleted after install.
