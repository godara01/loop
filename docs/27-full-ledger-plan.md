# 27 — Full Ledger Plan (v1.1 → v1.6)

> **Status and remaining work live in [`TASKS.md`](../TASKS.md).** This doc is
> the plan and rationale. Don't track progress here.

## Context

The v1 MVP is the personal ledger with SMS capture, streak and coins
([15](15-mvp-completion-plan.md)). Compared with an ordinary expense manager, it
is missing:

- the v1 gaps: account linking, a real date picker, a ledger filter UI and the
  Insights custom-period UI,
- the features people expect from any expense tracker: income, budgets, recurring
  payments, accounts and transfers, refunds, squads and lending, tags,
  sub-categories, merchants, split categories, smart suggestions, import, richer
  insights, reminders and a widget.

This plan delivers all of it in **six releases**, each with a phase gate, without
breaking the [design principles](00-product.md#design-principles).

### Decisions fixed by the owner (2026-10-10)

- **Still rejected:** multi-currency, and spendable coins or a coin shop
  ([09](09-roadmap.md#considered-and-rejected)).
- **Deferred:** the receipt photo and OCR scanning.
- **Firebase only.** No dedicated backend. Services: Auth, Firestore, Cloud
  Functions, Hosting, FCM, Remote Config, App Check and Vertex AI (same GCP
  project).
- **Smart suggestions** = on-device merchant memory first, then Gemini through a
  **callable Function → Vertex AI**. Opt-in, never auto-approves
  ([22](22-merchants-and-suggestions.md)).
- **Squads have placeholder members** who can claim their seat later
  ([23](23-squads.md)).
- **Tab dock:** Orbit · Ledger · [+] · Squads · Insights. **You** moves to an avatar
  button on Orbit ([01](01-information-architecture.md)).
- **Sign-in providers:** Google and Phone OTP now. Apple sign-in, iOS push and the
  iOS widget go to the **iOS track**, which needs Apple enrolment
  ([16](16-account-linking.md)).

## Releases at a glance

| Release | Phase | Theme | Feature docs |
|---|---|---|---|
| **v1.1** | P1 | Complete v1 | [03](03-expenses.md) date picker + ledger filters, [05](05-insights.md) custom period, [16](16-account-linking.md) |
| **v1.2** | P2 | Money in & out | [17](17-money-in-and-out.md), [18](18-accounts.md), [22](22-merchants-and-suggestions.md#merchant-keys) (merchant key), [08](08-data-model.md) schema v2 |
| **v1.3** | P3 | Organise | [04](04-categories.md#sub-categories), [21](21-tags.md), [03](03-expenses.md#split-across-categories), [22](22-merchants-and-suggestions.md) |
| **v1.4** | P4 | Plan ahead | [19](19-budgets.md), [20](20-recurring.md), [05](05-insights.md) insights v2, [25](25-notifications.md) reminders |
| **v1.5** | P5 | Squads | [23](23-squads.md), [25](25-notifications.md#squad-push) |
| **v1.6** | P6 | Reach | [24](24-import.md), [26](26-shortcuts-and-widget.md) |
| iOS track | — | iOS parity | Apple sign-in, APNs push, iOS widget, AASA |
| v1.7 | — | MCP server | [09](09-roadmap.md) |

### Why this order

- **P1 first** because it closes promises the v1 docs already made. It also ships
  the **force-update gate**, which every later schema change relies on.
- **P2 before everything else new** because `kind`, accounts and rollups v2 change
  the core data shape. Budgets, recurring, squads and import all sit on top of it.
  The marker v2 is designed in P2 to already carry per-line, leaf-category
  contributions, so P3's split lines and sub-categories need **no rollups v3**.
- **The merchant key is in P2, not P3**, because refund matching needs it.
- **P3 before P4** because budgets on parent categories need sub-categories, and
  recurring templates carry tags and merchants.
- **Squads come late (P5)** despite being the "real centre" of the product
  ([00](00-product.md)). They need linking (P1), mirrors on top of `kind`
  (P2: `settlement`, `loan`), accounts (P2, for who-paid flows) and push (P4
  installs `expo-notifications`). Building them earlier would mean rebuilding them.
- **Import is last** because it needs every field to exist first (kinds, accounts,
  tags, merchants), or imported data would be poorer than the app's own.

## How every phase is tested

The same four layers as [15](15-mvp-completion-plan.md#how-every-phase-is-tested).

| Layer | What | Command |
|---|---|---|
| **L1 Unit** | Pure logic in `packages/shared` and `features/*/model` | `npm test` |
| **L2 Rules** | Firestore + Storage rules | `npm run test:rules` |
| **L3 Functions** | Triggers, callables, idempotency, out-of-order events | `npm run test:functions` |
| **L4 E2E** | Maestro flows on `Loop_API35` against the emulators | `npm run e2e -- <flow>` (D queue) |

**Phase gate** (all of these before the phase commit):

1. `npm run test:all` is green (typecheck, unit, invariants, testids, a11y, rules,
   functions). The baseline counts in TASKS.md only go up.
2. The phase's Maestro flows pass **twice in a row** from clean state. This is the
   D-queue item.
3. The phase's doc acceptance criteria are ticked, each with its proof line.
4. A haptic call is present for every new interaction listed in that doc's
   **Haptics** table.
5. The CSV round-trip test is extended for every new field the phase adds
   ([08](08-data-model.md#export)).
6. The deploy runbook (below) is followed in order, if the phase changes the schema
   or Functions.

## Force-update gate

Ships in **P1**, before any document of a new shape can exist.

- Remote Config key `min_supported_build` (integer, default `0`).
- On every foreground, `lib/remote-config.ts` fetches it, at most every 15
  minutes. If `Application.nativeBuildVersion < min_supported_build`, a blocking
  screen appears: *"This version of Loop is out of date. Update to keep your data
  in sync."* with a Play Store button.
- **Offline**, the last fetched value is used. If none was ever fetched, the gate
  doesn't block, because offline-first wins.
- Why: once linking makes multiple devices normal, a v1.0 phone signed into the
  same account would misread `kind: income` as spend, and would throw on new
  fields. Raising `min_supported_build` before deploying a new schema makes that
  impossible.

## Deploy runbook (every schema-changing phase)

Order matters. Every step is backward-compatible with the one before it.

1. **Raise `min_supported_build`** to the build that understands the new shape,
   only once that build is live in the Play Store.
2. **Deploy Functions** that read both old and new shapes. A missing `kind` means
   `expense`, a missing marker field means a v1 marker.
3. **Deploy rules** that accept the new optional fields.
4. **Run the migration script**, if the phase has one (P2:
   `scripts/migrate-v2.ts`).
5. **Release the app** to production. That is staged rollout, then 100%.

In the dev and emulator environments the same order is scripted:
`scripts/deploy-phase.sh <phase>`.

### Migration script: P2 (`scripts/migrate-v2.ts`)

- Admin SDK. It refuses to run without `--project` and an explicit `--yes`.
- For every user: rebuild rollups v2 and account flows from `expenses`
  (`rebuildUserLedger(uid)`, the same code as `rebuildRollups` and
  `finalizeImport`). Then write the **server-only** doc `users/{uid}/meta/schema
  = {ledger: 2, migratedAt}`.
- It is idempotent and resumable (`--from-uid`), and processes 20 users at a time.
- Seeds the income categories for users without them (the `categoriesSeedVersion`
  check).
- **Clients never decide that a migration ran.** A v1.2 client reads
  `meta/schema.ledger`. If it is `< 2` (the script hasn't reached this user yet),
  past-period Insights show *"Updating your history…"* instead of numbers that
  might be wrong. Current-month numbers come from the cache and are always right.

## Phase P1 — Complete v1 (v1.1)

**Native rebuild #1:** `@react-native-google-signin/google-signin`.

**Features**
- Force-update gate ([above](#force-update-gate)).
- `DatePickerSheet` design-system component, single and range modes, with
  `allowFuture` ([03](03-expenses.md#date)).
- Entry draft moves from `daysAgo` to `localDate`, keeping the time of day
  DST-safely.
- Insights custom period UI ([05](05-insights.md#period-selection)).
- Ledger filter model (pure) + Zustand store + filter sheet + active chips
  ([03](03-expenses.md#ledger-filters)). The facets in P1: category, date range,
  amount, source, text.
- Account linking: Google + Phone, "I already use Loop", switch account, sign
  out, unlink ([16](16-account-linking.md)).
- **Time-zone bug fix:** the client writes `createdLocalDate`. `onExpenseWrite`
  uses it for backdating instead of `localDateOf(createdAt)` running in UTC on the
  server ([06](06-gamification.md#backdating)).
- Fix the doc drift found while planning: docs/01's `onboarding/_layout.tsx`;
  docs/10's `core/lib/dates.ts` and MMKV; `use-rollups.ts` using the Firebase SDK
  directly; logic inside `profile.tsx` and `day/[date].tsx` route files.

**Tests**
- L1: date picker model (month grid, disabled future, min date), the `localDate` +
  time-of-day composer across a DST change, filter predicates, `link-errors`,
  `mask`, phone normaliser.
- L3: backdating uses `createdLocalDate` (a US time zone fixture logging at 20:00
  local is **not** backdated).
- L4: `date-picker-backdate`, `ledger-filter`, `insights-custom-period`,
  `link-google` (emulator Auth), `link-phone` (test number), `sign-in-existing`,
  `switch-account`, `sign-out-pending-writes`, `force-update-gate`.

**Gate:** docs/03, 05, 16 acceptance criteria.

## Phase P2 — Money in & out (v1.2)

**No native rebuild.**

**Features**
- `kind` model and reserved `sys-*` category ids ([17](17-money-in-and-out.md),
  [08](08-data-model.md#transactions)).
- `documents.ts` v2 converters (lenient new fields, mirror branch stubbed for P5)
  and rules v2.
- **Marker v2 + rollups v2 + account flows** in one transaction: per-bucket counts
  and leaf keys ([11](11-firebase.md#rollups-v2)).
- **Trigger matrix** in `handlers.ts`: kind × source, deciding who banks the day and
  who earns coins ([06](06-gamification.md#what-counts)). Zero-spend counts only
  expense shares > 0. The `categorised` check looks up the slug.
- Income categories plus the versioned seed.
- Entry kind switch, refund flow, transfer flow.
- Accounts: CRUD, balances (server + local delta), Orbit card, entry account chip
  ([18](18-accounts.md)).
- `merchantKey` normaliser ([22](22-merchants-and-suggestions.md#merchant-keys)).
- SMS v2: credit / refund / cashback / card-bill / transfer-pair proposals and the
  refund matcher ([17](17-money-in-and-out.md#credit-sms), [12](12-sms-ingest.md)).
- Ledger filter facets: kind, account.
- CSV export v2 columns.
- Migration script and deploy runbook.

**Tests**
- L1: kind validators, refund remainder and apportioning, `clampRefunds`,
  `displayPercentages` with negative categories, `accountBalance` with the marker
  delta, `merchantKey`, `matchRefund`, `pairTransfers`, credit SMS fixtures (≥ 20
  new), CSV v2 round trip.
- L2: kind rules (no client `settlement`/`loan`), transfer accounts differ, `sys-*`
  ids, `accountBalances` and `rollupApplied` read-only, the pending key set
  widened.
- L3: the trigger matrix (every cell), rollups v2 per bucket, income-only day not
  deleted, account flow on edit and move, migration script idempotent on a seeded
  emulator.
- L4: `income-add`, `transfer-add`, `refund-record`, `accounts-balances-offline`,
  `sms-refund-match`, `sms-transfer-pair`.

**Gate:** docs/17, 18 acceptance criteria. The migration has been rehearsed on an
emulator export of a 5,000-expense seed.

## Phase P3 — Organise (v1.3)

**No native rebuild.**

**Features**
- Sub-categories (one level, parent combining at read time, archive cascade)
  ([04](04-categories.md#sub-categories)).
- Tags: registry, ids, entry UI, pinning, rename, archive, merge
  ([21](21-tags.md)).
- Merchant field, memory and `REMEMBERED` suggestions
  ([22](22-merchants-and-suggestions.md)).
- Split across categories: `lines`, entry UI, and refund apportioning across
  lines ([03](03-expenses.md#split-across-categories)).
- `suggestCategories` callable on Vertex AI, plus the Smart suggestions setting.
- Ledger filter facets: tag, merchant.

**Tests**
- L1: parent combining, tag slug, `suggestFromMemory`, lines → `categoryIds` with
  the tie-break, line `allocate`.
- L2: tag and merchant rules, `lines` ≤ 10, `tagIds` ≤ 10, the `P2P:` id denied.
- L3: rollups per line and per leaf, `suggestCategories` (App Check, cap,
  invalid-id rejection, payload snapshot) with a stubbed model.
- L4: `subcategory-create-and-insights`, `tags-add-filter-rename`,
  `merchant-memory-suggests`, `split-lines`, `smart-suggestions-optin` (stubbed
  Function in the emulator).

**Gate:** docs/04, 21, 22 acceptance criteria.

## Phase P4 — Plan ahead (v1.4)

**Native rebuild #2:** `expo-notifications`.

**Features**
- Budgets, the Orbit gauge and budget vs actual ([19](19-budgets.md)).
- Recurring rules, virtual proposals in the inbox, subscriptions
  ([20](20-recurring.md)).
- Insights v2: Spend / Income / Net, 12-month trend, month-end projection, year
  view, savings rate, tag scope ([05](05-insights.md)).
- Daily reminder and recurring-due local notifications
  ([25](25-notifications.md)).

**Tests**
- L1: `budgetFor`, `budgetProgress`, `occurrences` (month-end, leap year),
  `dueOccurrences`, `monthlyEquivalent`, the projection with its guard,
  `savingsRate`, `planReminders`.
- L2: budget and recurring rules, the `rec_` id rule.
- L3: a recurring approval banks the day with no coins. Rollups for income,
  refund and net months (savings).
- L4: `budget-set-and-gauge`, `recurring-approve-skip`,
  `recurring-two-device-approve` (two emulator users or a reinstall),
  `insights-trend-projection`, `reminder-permission-on-toggle`.

**Gate:** docs/05, 19, 20, 25 (reminders) acceptance criteria.

## Phase P5 — Squads (v1.5)

**Native rebuild #3:** App Links intent filter
(`https://<project>.web.app/i/*`, `autoVerify`). FCM tokens come from the
existing `expo-notifications`.

**Features**
- Dock change and the You avatar ([01](01-information-architecture.md)).
- Groups, placeholders, entries (map allocations), settlements, pairs and loans
  ([23](23-squads.md)).
- Functions: entry/settlement triggers (balances, marker, summary, mirrors,
  activity, validation), the `countMyShare` re-flag, `createInvite`,
  `redeemInvite` + backfill, `leaveSquad`, `removeMember`, `resetSeat`.
- Hosting: `assetlinks.json`, the `/i/{code}` fallback page.
- The Drag & Split screen, settle up, Pay via UPI (with confirmation), settlement
  suggestions.
- `deleteUserData` seat conversion.
- Squad push (opt-in, per-squad mute).

**Tests**
- L1: `allocationsFromSplit` (basis points, exact, shares), `memberDeltas`,
  `mirrorFor`, `validateEntry`, `computeBalances` with settlements, the
  invite-code generator alphabet.
- L2: every row of the [squads rules table](23-squads.md#data-rules-indexes),
  including the trust-rule attacks: foreign uid on a seat, `memberUids`
  tampering, setting `invalid`, creating a mirror, editing server-owned mirror
  fields.
- L3: balances sum to 0, out-of-order convergence, invalid flag round trip,
  mirrors with currency mismatch, a left member is never re-mirrored, the redeem
  failure codes, the backfill, deleteUserData seat conversion, push recipient
  selection and token pruning.
- L4: `squad-create-offline`, `squad-split-modes`, `squad-settle-up`,
  `pair-lend-repay`, `squad-invite-claim` (two emulator users), `squad-leave-guard`.

**Gate:** doc 23 and 25 (push) acceptance criteria. An App Link opening on a real
device.

## Phase P6 — Reach (v1.6)

**Native rebuild #4:** `expo-document-picker`, `expo-quick-actions`,
`react-native-android-widget`.

**Features**
- CSV import: mapping, preview, duplicate multiplicity, the online-only writer,
  `finalizeImport`, recovery, undo ([24](24-import.md)).
- Quick actions and the Android widget ([26](26-shortcuts-and-widget.md)).

**Tests**
- L1: generic CSV parser over the 5 bank-format fixtures, date-format ambiguity,
  `buildImportPlan`, `buildWidgetSnapshot`.
- L2: `imports` rules, the `imp_` id rule.
- L3: `finalizeImport` equals a full rebuild, undo, an import creates no
  coins or check-ins.
- L4: `import-loop-csv-roundtrip`, `import-generic-bank`, `import-resume-after-kill`,
  `quick-action-log-expense`, `widget-hidden-amounts`.

**Gate:** docs/24, 26 acceptance criteria.

## Final gate — full-ledger journey

`e2e/journeys/full-ledger-day-in-the-life.yaml`, one run on a fresh install:

1. Onboard. Link Google. Create accounts Cash and HDFC (••1234) with opening
   balances.
2. Log an expense (FOOD › COFFEE, tag `office`), income (SALARY to HDFC), a
   transfer (HDFC → Cash) and a split expense (FOOD + HOUSEHOLD).
3. Inject a debit SMS for ••1234 (the account pre-selected), then a refund SMS
   (the match suggested, approved).
4. Set an overall budget and a FOOD budget. The gauges match the hand
   calculation.
5. Create the recurring rule *Rent*, monthly. Change the device date → due item →
   approve.
6. Create a squad with 2 placeholders. Log a dinner split by shares. Settle one
   debt. Lend a pair ₹500.
7. Second emulator user redeems an invite. Their ledger shows the mirrors.
   Balances agree on both sides.
8. Insights: spend, income and net for the month equal `insights.ts` over the
   journey's own data. The trend shows 1 month. No projection (the guard holds).
9. Export CSV → reset → "I already use Loop" → data is back. Import the export into
   a second fresh account → identical totals.
10. Server invariants: `wallet == sum(coinLedger)`; rollups equal a full rebuild;
    account flows equal a full rebuild; squad balances sum to 0; no email, phone
    or SMS body in any document.

**Exit:** green twice in a row; docs 16–26 acceptance criteria ticked; tagged
`v1.6.0`.

## Native rebuild schedule

| When | Adds | Notes |
|---|---|---|
| P1 start | `@react-native-google-signin/google-signin` | Plus Firebase Phone provider config. No new native module for phone |
| P4 start | `expo-notifications` | Two Android channels |
| P5 start | App Links intent filter | `app.json` `android.intentFilters` |
| P6 start | `expo-document-picker`, `expo-quick-actions`, `react-native-android-widget` | Widget provider XML via the config plugin |

Each rebuild uses the same commit → `eas build --profile development --platform
android` → verify → `adb install -r` routine as [15](15-mvp-completion-plan.md#native-rebuild-schedule).
The commit body says `NATIVE REBUILD NEEDED: <pkg>` (TASKS.md rule 9).

## Owner actions

| When | Action |
|---|---|
| Before P1 device tests | Enable the **Google** and **Phone** providers. Add the SHA-1/SHA-256 of the EAS dev key, upload key and Play App Signing key. Set the Phone **SMS region policy** to India only. Enable Play Integrity. Add a test phone number for the emulator ([14](14-environment-setup.md)) |
| Before P2 production deploy | Run `scripts/migrate-v2.ts` on prod after the Functions and rules deploy |
| Before P3 | Enable the **Vertex AI API**. Set a **Cloud Billing budget alert** for Vertex AI and Identity Platform SMS. Set Remote Config `ai_suggestions_enabled=false` until the D-queue check passes |
| Before P5 | **Hosting**: `firebase init hosting`, deploy `assetlinks.json` + `/i/` page. Confirm the Play App Signing SHA-256 is in `assetlinks.json` |
| Before P5 push | Nothing extra on Android (FCM is in `google-services.json`). iOS: an APNs key on the iOS track |
| iOS track | Apple Developer enrolment. Apple provider. APNs key. AASA |

## Risks

| Risk | Mitigation |
|---|---|
| SMS-pumping fraud on phone auth | India-only region policy, Play Integrity, App Check, billing alert |
| `google-signin` free build uses the deprecated legacy API | Isolated in `core/auth/providers.ts`. Move to the Credential Manager build if it's removed |
| Firestore hot-spotting on rollup docs | Import skips per-row rollups (`finalizeImport`). Normal logging is far below 1 write/sec/doc |
| Vertex AI cost | Opt-in, per-uid daily cap, one call per merchant ever (cached), kill switch, billing alert |
| Rules complexity in squads | The trust rule (uids honoured only via `memberUids`) means a rules gap can't redirect mirrors. Every rule has an attack test |
| Mirrors breaking personal invariants (0 amounts, no allocations) | A separate parser branch, never an `ExpenseLike`, a separate rollup path, all tested |
| App Links verification failing | The fallback page plus manual code entry always works. D-queue check on a real device |
| Old builds misreading new data | The force-update gate ships before any new shape |
| Scope creep inside phases | Each feature doc lists what it is **not** doing. Anything else goes to [09](09-roadmap.md) |
