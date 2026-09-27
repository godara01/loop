# TASKS — the single list of remaining MVP work

This file is the **only** task tracker in the repo. Specs live in `docs/`
(what to build and why); this file says what's left, in what order, and how to
prove each piece is done. If a task below disagrees with the repo, trust the
repo and fix the task in the same commit.

Snapshot: 2026-09-23. M0–M3 are done and verified. M4–M6 are code-complete, and
their automated tests pass. None of them has run on a device yet; those checks
are in the device queue. M7 (SMS) is scaffolding only. M8 (hardening) hasn't
started.

---

## How to work this file (read before every task)

1. **Pick any task whose `Needs` are all `done`.** The lanes below show what
   can run in parallel.
2. **Every "Done when" check must be run and must pass.** Only automated,
   code-level checks count: `typecheck`, unit tests, rules/functions tests,
   grep and invariant scripts. Never claim a pass you didn't see.
   Never write hash-shaped "evidence".
3. **Never boot the Android emulator, run Maestro, or start an EAS build.** Those
   checks belong to the device queue (section D), which the project owner runs
   separately. You may *write* Maestro YAML when a task asks for it.
4. `npm run test:rules` and `npm run test:functions` are **not** device tests.
   They start a throwaway Firestore emulator (Java, already installed on this
   machine) and exit. Run them when a task lists them.
5. **One task per commit.** In the same commit, flip the task's status in the
   table to `done` and add the checks you ran to the commit body.
   Don't bundle tasks.
6. **Stay inside `Owns`.** If you must touch another file, keep the change
   minimal and say so in the commit body.
7. **Standing rules from `CLAUDE.md`:**
   - Money is integer minor units, never floats.
   - Call `haptic('…')` from `apps/mobile/src/lib/haptics.ts`. Never import
     `expo-haptics` anywhere else.
   - `packages/shared` has no React, React Native, or Firebase imports.
   - Stick to the design tokens in `theme.ts`.
   - No raw SMS body is ever logged, persisted, or sent anywhere.
8. **No scratch trackers.** Don't create `PLAN.md`, `GATES.md`,
   `TASK_SUMMARY.md`, or `*.backup` files in the repo. Notes go in the commit
   body or the relevant `docs/` file.
9. **Native dependency changes need a rebuild.** When a task adds a native
   package, add it to `apps/mobile/package.json` (and `app.json` plugins if it
   has one). Then write `NATIVE REBUILD NEEDED: <pkg>` in the commit body. Do
   not attempt the build.

10. **Parallel sessions need separate directories.** Two agents in the same
    checkout will fight over the git index. Give each one its own directory:
    `git worktree add ../loop-<id> -b task/<id>` (plain git, works with any
    tool), then run `npm install` inside it. `test:rules` and `test:functions`
    bind the same emulator ports, so only one session at a time may run them.

### Baseline (all green on 2026-09-27, after batch 2)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | shared 324 pass · mobile 62 pass · functions 0 |
| `npm run test:functions` | 32 pass |
| `npm run test:rules` | 58 pass (Firestore + Storage) |
| `npm run check:invariants` | exit 0 |
| `npm run check:testids` | exit 0 |
| `npm run check:a11y -- --max 0` | exit 0 (0 findings) |

A task must never lower these counts. A task that adds tests raises them.

---

## Status

`todo` → `done`. `blocked` means waiting on a `Needs`.

| ID | Task | Needs | Status |
|---|---|---|---|
| A1 | Make the SMS unit tests actually run | — | done |
| A2 | Invariant-check script (`npm run check:invariants`) | — | done |
| A3 | Maestro testID cross-check script | — | done |
| A4 | Tick code-provable acceptance criteria in docs | A1, A2 | todo |
| S1 | DLT sender registry | A1 | done |
| S2 | SMS shape filters (OTP/balance/promo/declined/reversal/credit) | A1 | done |
| S3 | Versioned, serializable template registry + override merge | A1 | done |
| S4 | `parser.ts` — `parseTransactionSms` | S1, S2, S3 | done |
| S5 | ≥40-message fixture corpus + privacy test | S4 | done |
| S6 | `dedupe.ts` — `isDuplicatePendingExpense` | A1 | done |
| S7 | `displayHint` builder | A1 | done |
| P1 | `pendingExpenses` path + converter pair | — | done |
| P2 | `pendingExpenses` security rules + rules tests | P1 | done |
| P3 | Pure approval-batch model | P1 | done |
| P4 | `pending-expenses-repository.ts` | P1, P3 | done |
| N1 | Native `sms-reader` Expo module (code only) | — | done |
| N2 | Remote Config wrapper (kill switch + template override) | S3 | done |
| N3 | Pure SMS ingest pipeline | S4, S6, S7, P1 | done |
| U1 | Inbox view-model (grouping, badge count, approve-all eligibility) | P1 | done |
| U2 | `/inbox` route, cards, empty state | U1, P4 | done |
| U3 | Orbit inbox badge | U1, P4 | done |
| U4 | Paste-to-parse | U2, N3 | done |
| U5 | Auto-capture explainer + one-time Orbit card + backfill | N1, N2, N3, U2 | done |
| U6 | Author the 8 SMS Maestro flows | U2, U3, U4, U5, A3 | done |
| R1 | Pure rollup maths in `packages/shared` | — | done |
| R1a | R1 follow-ups: valid test dates, shared empty-rollup rule | R1 | done |
| R2 | `onExpenseWrite` maintains rollups | R1a | done |
| R3 | `rebuildRollups` callable | R1 | done |
| R4 | Rules test: clients can't write rollups | — | done |
| R5 | Pure cache + rollup merge for Insights | R1 | done |
| R6 | Insights reads rollups for past periods | R5 | done |
| C1 | `cleanupSoftDeleted` (90-day) | R2 | done |
| C2 | Pending-expense expiry sweep (30-day) | P1 | done |
| C3 | `deleteUserData` callable (full-subtree delete) | — | done |
| X1 | CSV builder/parser with round-trip test | — | done |
| X2 | You → Export CSV screen | X1 | done |
| X3 | Pure reset-app model | — | done |
| X4 | You → Reset app screen | X3, C3 | done |
| H1 | Crashlytics wrapper with key allowlist | A2 | todo |
| H2 | App Check wiring | — | done |
| H3 | Accessibility/testID audit script | — | done |
| H4 | Fix every a11y/testID finding | H3 | done |
| H5 | Empty-state copy module matching `docs/02` | — | done |
| H6 | `npm run test:all` (code-level) + MVP journey YAML | A2, A3, U6 | todo |

---

## Parallel lanes

Each lane is a chain. Different lanes don't share files, so separate agents can
work them at the same time. An arrow means "must be done first".

```
Lane A  hygiene     A1 ─┬─▶ A4          A2 ─▶ A4, H1        A3 ─▶ U6, H6
                        │
Lane S  SMS logic   A1 ─┼─▶ S1 ─┐
                        ├─▶ S2 ─┼─▶ S4 ─▶ S5
                        ├─▶ S3 ─┘ └──────────────▶ N2
                        ├─▶ S6
                        └─▶ S7
Lane P  pending     P1 ─┬─▶ P2
                        ├─▶ P3 ─▶ P4
                        ├─▶ U1
                        └─▶ C2
Lane N  native      N1 (no deps)        S4+S6+S7+P1 ─▶ N3
Lane U  inbox UI    U1+P4 ─▶ U2, U3     U2+N3 ─▶ U4     N1+N2+N3+U2 ─▶ U5     all U + A3 ─▶ U6
Lane R  rollups     R1 ─┬─▶ R1a ─▶ R2 ─▶ C1
                        ├─▶ R3
                        └─▶ R5 ─▶ R6       R4 (no deps)
Lane X  CSV/reset   X1 ─▶ X2            X3 + C3 ─▶ X4       C3 (no deps)
Lane H  hardening   H2, H3, H5 (no deps)    H3 ─▶ H4    A2 ─▶ H1    A2+A3+U6 ─▶ H6
```

**Start now, all in parallel:** A1, A2, A3, P1, N1, R1, R4, C3, X1, X3, H2, H3,
H5.

**File-collision warnings:** these tasks run in different lanes but edit the
same file. Don't run them at the same time; land one first.

- `packages/shared/src/index.ts`: S1–S7, P1, R1, R5, X1, X3. Each adds export
  lines only, so the fix is a trivial rebase.
- `firestore.rules`: P2 only. R4 and C1–C3 touch tests only.
- `functions/src/index.ts`: R2, R3, C1, C2, C3. Each adds one export.
- `apps/mobile/src/app/(tabs)/index.tsx` (Orbit): U3 and U5.
- `apps/mobile/src/app/(tabs)/profile.tsx` (You): X2, X4, U5.

---

## A — Hygiene and cross-cutting checks

### A1 · Make the SMS unit tests actually run
- **Needs:** — · **Owns:** `packages/shared/src/sms/sms.test.ts` → `packages/shared/src/__tests__/sms.test.ts`
- **Why:** `packages/shared`'s test glob is `src/__tests__/*.test.ts`, so
  `src/sms/sms.test.ts` never runs today.
- **Build:** move the file under `__tests__/` and fix its import paths. If any
  test fails once it runs, fix the scaffolding code in `src/sms/`, not the
  test's intent.
- **Done when:**
  - `npm test -w @loop/shared` passes with more than 155 tests (the SMS tests are now counted)
  - `find packages/shared/src -name '*.test.ts' -not -path '*/__tests__/*'` prints nothing
  - `npm run typecheck` exits 0

### A2 · Invariant-check script
- **Needs:** — · **Owns:** `scripts/check-invariants.mjs`, `scripts/check-invariants.test.mjs`, root `package.json` (add `check:invariants`)
- **Build:** a Node script that scans source files (skip `node_modules`) and
  exits non-zero with a readable list of violations. Each rule is one entry in
  a table, so later tasks can add rules:
  1. `expo-haptics` is imported only in `apps/mobile/src/lib/haptics.ts`
  2. `packages/shared/src/**` imports nothing from `react`, `react-native`,
     `@react-native-firebase/*`, `firebase`, or `firebase-admin`
  3. No `console.` call anywhere under `packages/shared/src/sms/`
  4. No permission-request call (`requestPermissions`, `PermissionsAndroid`,
     `request*PermissionsAsync`) under `apps/mobile/src/app/onboarding/` or
     `apps/mobile/src/features/onboarding/`
  5. No push-notification registration (`getExpoPushTokenAsync`,
     `getDevicePushTokenAsync`, `registerForPushNotifications`) anywhere in
     `apps/mobile/src`
  6. The string `pendingExpenses` appears only in
     `packages/shared/src/firestore/**`, `packages/shared/src/sms/**`,
     `apps/mobile/src/features/inbox/**`, `functions/src/cleanup.ts`,
     `firestore.rules`, and tests. This proves Insights, streak, and coins
     can't read pending items.
- **Done when:**
  - `npm run check:invariants` exits 0 on the current tree
  - `node --test scripts/check-invariants.test.mjs` passes. It needs one
    positive-control case per rule: a temporary fixture file that breaks the
    rule makes the script exit non-zero.

### A3 · Maestro testID cross-check script
- **Needs:** — · **Owns:** `scripts/check-testids.mjs`, root `package.json` (add `check:testids`)
- **Build:** parse every `e2e/**/*.yaml` file. Collect every `id:` selector.
  Fail if an id doesn't appear as `testID="…"` or `testID={'…'}` anywhere
  under `apps/mobile/src`. Allow template-built ids through an explicit
  allowlist in the script, with a comment explaining each entry.
- **Done when:**
  - `npm run check:testids` exits 0 on the current flows, or its failures are
    real and are fixed in the same commit by adding the missing testID
  - Renaming one testID in a scratch copy makes it fail (describe this check
    in the commit body)

### A4 · Tick code-provable acceptance criteria
- **Needs:** A1, A2 · **Owns:** checkboxes in `docs/03`, `docs/05`, `docs/06`, `docs/07`, `docs/08`, `docs/11`
- **Build:** go through every unticked `- [ ]` in those docs. Tick an item
  only if an automated test or invariant rule proves it. Append the proof in
  the form `(proof: tests/functions/functions.test.ts › "10 expenses in a day…")`.
  Leave device-only items (timing, fps, airplane mode, "felt on device")
  unticked.
- **Candidates to check:**
  - `docs/06`: double check-in, expense cap, client can't write
    wallet/coinLedger, delete keeps streak/coins, backdating, zero push
    notifications
  - `docs/07`: `expo-haptics` in one file
  - `docs/08`: shared has zero React/Firebase imports; a malformed converter
    input throws
  - `docs/11`: float/negative `amountMinor` rejected; client can't write
    wallet/ledger/rollups; shared has zero Firebase imports
- **Done when:** every newly ticked box names a test or rule that exists and
  passes. `grep -c '\- \[x\]'` is higher in each touched doc. Nothing
  device-only is ticked.

---

## S — SMS parsing logic (pure, `packages/shared/src/sms/`)

Spec: `docs/12-sms-ingest.md`. Everything here is framework-free and tested
with `npm test`. All new tests go in `packages/shared/src/__tests__/`.

### S1 · DLT sender registry
- **Needs:** A1 · **Owns:** `sms/sender.ts`, `__tests__/sms-sender.test.ts`
- **Build:** today `isAllowlistedSender` accepts *any* `XX-XXXXXX` header.
  Replace it with a registry of bank entity codes (HDFCBK, ICICIB, SBIINB,
  AXISBK, KOTAKB, at least 8 banks). Match only the 6-character entity part,
  whatever the 2-letter operator prefix. Export
  `senderEntity(sender): string | null` and
  `isAllowlistedSender(sender, extraEntities?: readonly string[])`.
  `extraEntities` is how Remote Config and the dev-only numeric sender get
  added later.
- **Done when:** tests pass for:
  - accepts `AD-HDFCBK`, `VM-HDFCBK`, `JD-SBIINB`
  - rejects `AD-AMAZON`, `+919876543210`, `HDFCBK`, and an empty string
  - accepts an entity only when it's passed in `extraEntities`
  - `npm run typecheck` exits 0

### S2 · Shape filters
- **Needs:** A1 · **Owns:** `sms/filters.ts`, `__tests__/sms-filters.test.ts`
- **Build:**
  `classifyExclusion(body): 'otp' | 'balance' | 'promo' | 'declined' | 'reversal' | null`
  and `isCredit(body): boolean`. The current regex in `templates.ts` matches
  bare `code` and `expire`, so it drops real debits. Make the patterns
  specific.
- **Done when:**
  - Each category has ≥ 3 positive fixtures and returns the right label
  - ≥ 5 genuine debit messages return `null`. Include a merchant containing
    "code" (for example `CODECADEMY`) and a card "valid till/expiry" line
  - ≥ 3 credit messages make `isCredit` true, and ≥ 3 debits make it false

### S3 · Versioned, serializable template registry
- **Needs:** A1 · **Owns:** `sms/templates.ts`, `sms/types.ts`, `__tests__/sms-templates.test.ts`
- **Build:** a registry shape `{ version: number; templates: TemplateSpec[] }`
  where each `TemplateSpec` is plain JSON:
  `{ id, entity, pattern: string, flags: string, fields: { amount, merchant?, last4? } }`.
  JSON matters because Remote Config ships it later.
  - `compileRegistry(spec)` validates the JSON and compiles the RegExps. It
    throws on a bad regex or a missing named group.
  - `mergeRegistry(bundled, override)` keeps the higher version, and an
    override template replaces a bundled one with the same `id`.
  - Amounts go through `parseAmount()` in `money.ts`.
  - Keep `parseTransactionSms` in this file and working on the compiled
    bundled registry until S4 moves it. The existing `__tests__/sms.test.ts`
    must still pass unchanged.
- **Done when:**
  - Tests cover `compileRegistry` rejecting an invalid pattern and a missing
    `amount` group
  - Tests cover `mergeRegistry` override-by-id and version precedence
  - `Rs.1,00,000.00`, `INR 1,234.5`, and `₹ 99` extract to exactly
    `10000000`, `123450`, and `9900` minor units
  - `JSON.parse(JSON.stringify(BUNDLED_REGISTRY))` compiles to the same
    template ids

### S4 · `parseTransactionSms`
- **Needs:** S1, S2, S3 · **Owns:** `sms/parser.ts`, `__tests__/sms-parser.test.ts`, `packages/shared/src/index.ts` (exports)
- **Contract (binding):**
  `parseTransactionSms(body, sender, receivedAt, opts?: { registry?, extraEntities? }): ParsedTransaction | null`
- **Build:** the pipeline is sender filter → `classifyExclusion` → template
  match → confidence ≥ 0.6. It returns debits only; a credit returns `null`.
  `occurredAt` defaults to `receivedAt` when the message has no timestamp.
- **Done when:** tests pass for:
  - a non-allowlisted sender returns `null`, even with a perfect body
  - an allowlisted OTP returns `null`
  - a credit returns `null`
  - confidence 0.59 returns `null` and 0.6 returns a result (test through a
    registry fixture)
  - `amountMinor` is always an integer, and `Number.isInteger` passes in
    every test

### S5 · Fixture corpus and privacy test
- **Needs:** S4 · **Owns:** `__tests__/fixtures/sms-corpus.ts`, `__tests__/sms-corpus.test.ts`
- **Build:** at least 40 realistic message shapes. Each entry is
  `{ sender, body, expect: null | Partial<ParsedTransaction> }`. Cover:
  - ≥ 4 banks' debit formats
  - lakh grouping, `Rs.`/`INR`/`₹` prefixes, card and UPI debits
  - OTP, balance, promo, declined, reversal, and credit messages
  - non-bank senders
- **Also:** delete the unused duplicate `PendingExpenseDoc` from `sms/types.ts`
  once P1's converter exists.
- **Done when:**
  - The test asserts `corpus.length >= 40` and that every entry matches its
    `expect`
  - A **privacy test** checks every non-null result: its key set equals the
    `ParsedTransaction` keys exactly, and no string field contains any 12-char
    substring of the original body except the extracted merchant
  - `npm run check:invariants` exits 0 (no `console.` in `sms/`)

### S6 · `isDuplicatePendingExpense`
- **Needs:** A1 · **Owns:** `sms/dedupe.ts`, `__tests__/sms-dedupe.test.ts`
- **Contract:**
  `isDuplicatePendingExpense(candidate, existingPending, existingManual): boolean`
  - `existingPending` items carry `{ amountMinor, accountLast4, occurredAt, status }`
  - `existingManual` items carry `{ amountMinor, occurredAt, source }`
- **Rules:**
  - It's a duplicate if a pending or approved item has the same amount and
    `accountLast4` within ±10 min
  - It's a duplicate if a manual expense has the same amount within ±30 min
  - Rejected and expired pending items don't count
- **Done when:** boundary tests pass at 9:59, 10:00, and 10:01 min, and at
  29:59, 30:00, and 30:01 min. Same amount with a different last4 is not a
  duplicate. A rejected match is not a duplicate. A bank message plus a
  card-network message for the same transaction is a duplicate.

### S7 · `displayHint` builder
- **Needs:** A1 · **Owns:** `sms/display-hint.ts`, `__tests__/sms-display-hint.test.ts`
- **Build:** `buildDisplayHint(parsed, senderEntity): string`. It returns
  strings like `HDFC ••1234 · SWIGGY`. When merchant or last4 is null, it
  falls back to shorter forms.
- **Done when:** tests pass for all 4 null combinations. The output never
  contains more than 4 digits of the account. The function signature has no
  `body` parameter.

---

## P — Pending expenses data layer

Spec: `docs/12-sms-ingest.md#the-pending-expense`. The document has **no
`body` field, ever**.

### P1 · Path and converter pair
- **Needs:** — · **Owns:** `packages/shared/src/firestore/paths.ts`, `firestore/documents.ts`, `__tests__/firestore.test.ts`
- **Build:** add `paths.pendingExpenses(uid)` and `paths.pendingExpense(uid, id)`.
  Add `pendingExpenseToDoc` and `parsePendingExpense`, following the existing
  `expenseToDoc`/`parseExpense` pattern.
  - `parsePendingExpense` throws on a bad status enum, a non-integer
    `amountMinor`, or any unknown key (including `body`)
  - Don't edit `sms/types.ts`; S-lane tasks own it. Import `PendingExpense`
    from it. Removing the duplicate `PendingExpenseDoc` is left for S5.
- **Done when:**
  - A round-trip test passes: `parse(toDoc(x))` deep-equals `x`
  - Malformed-input tests throw, with one per rule above
  - `npm test` and `npm run typecheck` pass

### P2 · Security rules
- **Needs:** P1 · **Owns:** `firestore.rules` (the `pendingExpenses` block only), `tests/firestore-rules/pending-expenses.test.ts`
- **Build:** replace today's `allow read, write: if isOwner(uid)` with these
  rules:
  - owner-only
  - `keys().hasOnly([...allowed fields])`
  - `status` must be in the enum
  - **create** requires `status == 'pending'` and `expenseId == null`
  - **update** allows only `pending→approved` (with `expenseId` a string) or
    `pending→rejected`, and the amount, currency, and dates can't change
  - **delete** is always refused
- **Done when:** `npm run test:rules` passes, with at least 10 new tests and
  the previous 40 still passing. Required cases:
  - a doc containing `body` is rejected, as the positive control
  - a non-owner can't read or write
  - create with `expenseId` set is rejected
  - `approved→pending` is rejected
  - changing `amountMinor` on update is rejected
  - delete is rejected

### P3 · Approval-batch model (pure)
- **Needs:** P1 · **Owns:** `apps/mobile/src/features/inbox/model/approval.ts`, `approval.test.ts`
- **Build:**
  - `buildApproval(uid, pending, categoryId, edits?, now)` returns
    `{ expense: Expense with source:'sms', pendingId; pendingUpdate: { status:'approved', expenseId, updatedAt } }`
  - `buildApproveAll(uid, items, choices, now)` throws `MissingCategoryError` if any
    item has no category. It returns one pair per item.
  - `pasted` items produce `source: 'sms'`, since `ExpenseSource` has no
    `'pasted'` and `parseExpense` would reject it. The pending doc keeps
    `'pasted'`, reachable through `expense.pendingId`.
- **Done when:** `npm test -w @loop/mobile` passes with the new tests. The
  missing-category test fails without the check, so it's a positive control.

### P4 · Repository
- **Needs:** P1, P3 · **Owns:** `apps/mobile/src/features/inbox/api/pending-expenses-repository.ts`
- **Contract:** `createPendingExpense`, `listenPendingExpenses` (filters out
  `receivedAt` older than 30 days client-side), `approvePendingExpense`,
  `dismissPendingExpense` (sets `rejected` and never deletes), and
  `approveAllPendingExpenses`.
  - Approve writes the expense and updates the pending doc in **one**
    `writeBatch`
  - It uses P3 for the doc shapes and adds no coin or streak logic
  - Follow `features/expenses/api/*` for how the repo talks to Firestore
- **Done when:**
  - `npm run typecheck` exits 0
  - `npm run check:invariants` exits 0
  - `grep -c "writeBatch\|batch(" pending-expenses-repository.ts` ≥ 1
  - `grep -n "\.delete(" pending-expenses-repository.ts` prints nothing
  - Device verification happens in D6

---

## N — Native and platform glue (code only; the owner verifies in D5)

### N1 · `sms-reader` Expo module
- **Needs:** — · **Owns:** `apps/mobile/modules/sms-reader/**`, `apps/mobile/src/lib/sms-reader.ts`, `apps/mobile/src/lib/sms-reader.ios.ts`, `apps/mobile/app.json` (plugin entry)
- **Build:** a local Expo module (Kotlin) plus a config plugin that adds
  `RECEIVE_SMS` and `READ_SMS`.
  - A `BroadcastReceiver` hands each message straight to JS with no parsing
    and no logging
  - A `ContentResolver` backfill covers N days
- **JS contract (binding):**
  ```ts
  requestPermissions(): Promise<'granted' | 'denied'>
  getRecentSms(sinceDays: number): Promise<RawSmsMessage[]>
  startSmsListener(onMessage: (m: RawSmsMessage) => void): () => void
  stopSmsListener(): void   // idempotent
  interface RawSmsMessage { body: string; sender: string; receivedAt: string }
  ```
  `sms-reader.ios.ts` is a stub with the same exports. It resolves `'denied'`
  and `[]` and never imports the native module.
- **Done when:**
  - `npm run typecheck` exits 0
  - `cd apps/mobile && npx expo config --json` lists both SMS permissions
    under `android.permissions`
  - `grep -rn "Log\.\|println" apps/mobile/modules/sms-reader/android` prints
    nothing
  - `grep -n "requireNativeModule\|NativeModules" apps/mobile/src/lib/sms-reader.ios.ts`
    prints nothing
  - Commit body says `NATIVE REBUILD NEEDED: sms-reader`

### N2 · Remote Config wrapper
- **Needs:** S3 · **Owns:** `apps/mobile/src/lib/remote-config.ts`, `packages/shared/src/sms/registry-override.ts`, `packages/shared/src/__tests__/sms-registry-override.test.ts`, `apps/mobile/package.json`
- **Build:**
  - Add `@react-native-firebase/remote-config`
  - Expose `smsIngestEnabled` (default `false` until fetched) and
    `onSmsIngestEnabledChange(cb)`
  - Expose `getTemplateOverride()`, which returns a validated registry
    through S3's `compileRegistry`, or `null` when the value is invalid
  - The pure step `parseTemplateOverride(json: string): CompiledRegistry | null`
    lives in `packages/shared/src/sms/registry-override.ts`
- **Done when:**
  - Unit tests pass: invalid JSON → `null`, valid override → compiled
    registry, missing key → default
  - `npm run typecheck` exits 0
  - Commit body says `NATIVE REBUILD NEEDED: remote-config`

### N3 · Ingest pipeline (pure)
- **Needs:** S4, S6, S7, P1 · **Owns:** `apps/mobile/src/features/inbox/model/ingest.ts`, `ingest.test.ts`
- **Build:**
  `ingestMessage(raw, ctx: { registry, extraEntities, existingPending, existingManual, enabled }): PendingDraft | null`.
  `PendingDraft` is the create payload for P4, `source` is `'sms' | 'pasted'`,
  and it has no body. It returns `null` when `enabled` is false.
- **Done when:** tests pass for:
  - disabled returns null
  - OTP returns null
  - a duplicate returns null
  - a valid debit returns a draft whose keys contain no `body`, and
    `JSON.stringify(draft)` doesn't contain the raw body
  - pasted input with no sender still parses, using a `pasted` sender path

---

## U — Inbox UI (code-level goals; flows run in D6)

Spec: `docs/12` "The inbox" and "Permissions UX", and `docs/01` for routes.
Every interactive element gets a `testID` and an `accessibilityLabel`.

### U1 · Inbox view-model
- **Needs:** P1 · **Owns:** `apps/mobile/src/features/inbox/model/inbox-view.ts`, `.test.ts`
- **Build:** `groupByDay(items, tz)`, newest first; `badgeCount(items)`,
  which counts `status === 'pending'` only; and
  `canApproveAll(items, choices)`.
- **Done when:** unit tests pass for:
  - badge count ignores approved, rejected, and expired items
  - grouping at local midnight
  - `canApproveAll` is false when any category is missing and false when the
    list is empty

### U2 · `/inbox` screen
- **Needs:** U1, P4 · **Owns:** `apps/mobile/src/app/inbox.tsx`, `features/inbox/screens/*`, `features/inbox/components/*`, `features/inbox/hooks/*`
- **Build:**
  - Day-grouped cards show the amount in JetBrains Mono, the merchant, the
    `displayHint`, the time, and a required category chip
  - Actions: Approve (`expenseSaved`), Edit & approve (opens the entry sheet
    prefilled), Dismiss (`destructive`), and Approve all. Approve all is
    disabled until `canApproveAll` and asks for confirmation with a count.
  - Empty state copy: *"Transaction messages will show up here for you to
    approve."*
- **Done when:**
  - `npm run typecheck`, `npm run check:invariants`, and `npm run check:testids`
    exit 0
  - `grep -rn "expo-haptics" apps/mobile/src/features/inbox` prints nothing
  - The empty-state string is present verbatim

### U3 · Orbit inbox badge
- **Needs:** U1, P4 · **Owns:** `apps/mobile/src/app/(tabs)/index.tsx` (badge only), `features/inbox/components/inbox-badge.tsx`
- **Build:** hidden when `badgeCount` is 0, and links to `/inbox`. Use
  testID `orbit-inbox-badge`.
- **Done when:** `typecheck` exits 0, and the badge reads its count only via
  U1's `badgeCount` (confirm with grep).

### U4 · Paste-to-parse
- **Needs:** U2, N3 · **Owns:** `features/inbox/components/paste-sheet.tsx`, `features/inbox/hooks/use-paste-parse.ts`
- **Build:** paste text → `ingestMessage` with `source: 'pasted'` → create a
  pending item. An unparseable message shows an inline error and creates
  nothing. It works on iOS, so it has no import of `sms-reader`.
- **Done when:** `typecheck` exits 0, and
  `grep -n "sms-reader" features/inbox/components/paste-sheet.tsx features/inbox/hooks/use-paste-parse.ts`
  prints nothing.

### U5 · Auto-capture explainer and backfill
- **Needs:** N1, N2, N3, U2 · **Owns:** `apps/mobile/src/app/settings/auto-capture.tsx`, `features/inbox/hooks/use-sms-capture.ts`, `features/inbox/model/capture-prompt.ts` (+ test), a link row in `(tabs)/profile.tsx`, a one-time card in `(tabs)/index.tsx`
- **Build:**
  - The explainer copy comes verbatim from `docs/12`
  - `requestPermissions()` is called **only** from the explainer or from the
    Orbit card, which shows once after the 3rd manual expense and never
    again once dismissed or denied
  - On grant, backfill 30 days through `ingestMessage` → `createPendingExpense`,
    then start the listener
  - When `smsIngestEnabled` flips to false, stop the listener immediately
  - Android only: gate it with `Platform.OS`
- **Done when:**
  - A unit test for `shouldShowCapturePrompt(manualCount, promptState)` passes:
    false below 3, true at 3, false after it was shown or denied
  - `typecheck` exits 0
  - `grep -rn "requestPermissions" apps/mobile/src` lists only the explainer
    and the Orbit card hook
  - The backfill and listener have a visible error state, not a silent catch.
    `grep -n "catch" use-sms-capture.ts` shows the error being surfaced.

### U6 · Author the 8 SMS Maestro flows
- **Needs:** U2, U3, U4, U5, A3 · **Owns:** `e2e/flows/sms-*.yaml`
- **Flows:** `sms-debit-approve`, `sms-otp-ignored`, `sms-duplicate-single-card`,
  `sms-manual-suppresses`, `sms-dismiss`, `sms-kill-switch`, `sms-paste-parse`,
  `sms-privacy`. The last one uses `runScript` against the emulator REST API
  and asserts no document contains the injected body text. Follow the style
  of the existing flows, such as `check-in-zero-spend.yaml`.
- **Done when:** all 8 files exist, `npm run check:testids` exits 0, and each
  file parses as YAML. **Do not run them.** Running them is D6.

---

## R — Rollups

Spec: `docs/11-firebase.md` (the rollup schema) and
`docs/05-insights.md#where-the-numbers-come-from`.

### R1 · Pure rollup maths
- **Needs:** — · **Owns:** `packages/shared/src/rollups.ts`, `__tests__/rollups.test.ts`, `types.ts` (a `MonthlyRollup` type if missing)
- **Build:**
  - `rollupDelta(before: Expense | null, after: Expense | null)` returns
    per-day and per-month deltas of `{ totalMinor, count, byCategory, byDay }`.
    A soft-deleted expense counts as absent. A category or amount edit moves
    the contribution between buckets.
  - `buildRollups(expenses)` builds everything from scratch
  - `applyDelta(rollup, delta)` drops categories whose value reaches 0
- **Done when:** tests pass for:
  - create, edit amount, edit category, edit date across a month boundary,
    soft-delete, and hard-delete of an already soft-deleted expense (a no-op)
  - **parity:** for a seeded random set of 500 expenses, folding
    `rollupDelta` over the create, edit, and delete history equals
    `buildRollups` of the final state. `buildRollups` month totals also equal
    `insights.ts` period totals to the minor unit.

### R1a · R1 follow-ups
- **Needs:** R1 · **Owns:** `packages/shared/src/rollups.ts`, `__tests__/rollups.test.ts`
- **Why:** review of R1 found two gaps.
  - The parity test generates impossible dates such as `2026-09-31` through
    `2026-09-45` and `2026-10-45`.
  - The rule "a rollup whose `count` reaches 0 is deleted" lives only in the
    test's `applyToRollups` helper, so R2 would have to re-invent it.
- **Build:**
  - Generate only real calendar dates across at least 3 months, and include
    the last day of each month.
  - Export `isEmptyRollup(r)` (true when `count === 0`) and
    `applyRollupDelta(rollups, delta): Rollups`. This is the helper moved
    out of the test, which drops empty docs.
  - Have the test use the exported helper.
- **Done when:**
  - `npm test -w @loop/shared` passes with no fewer tests than before
  - `grep -nE "2026-(09-3[1-9]|09-4|10-3[2-9]|10-4)" packages/shared/src/__tests__/rollups.test.ts`
    prints nothing
  - Every generated date round-trips through `new Date(d + 'T00:00:00Z').toISOString().slice(0,10) === d`,
    asserted in the test
  - `typecheck` exits 0

### R2 · `onExpenseWrite` maintains rollups
- **Needs:** R1a · **Owns:** `functions/src/rollups.ts`, `functions/src/handlers.ts` (call site), `tests/functions/rollups.test.ts`
- **Build:** apply the rollup change to `dailyRollups/{date}` and
  `monthlyRollups/{YYYY-MM}` in one transaction.
  - `handleExpenseWrite` currently returns early for deleted and soft-deleted
    expenses, so the rollup update must run **before** that return.
  - Triggers are at-least-once and can arrive out of order, so don't trust the
    event's `before`. Keep a server-only marker at
    `users/{uid}/rollupApplied/{expenseId}` holding the contribution last
    applied (`{ localDate, categoryId, minor }`, or absent).
  - Compute the delta as marker → current `after`, then write the rollups
    and the marker in the same transaction. A replayed event then produces
    a zero delta.
  - `firestore.rules` already denies unknown paths through the final
    catch-all; confirm this in the commit body.
  - Delete a rollup doc once `isEmptyRollup` holds.
- **Done when:** `npm run test:functions` passes, with ≥ 6 new tests and the
  existing 7 still passing. Cover:
  - create, edit, category move, and soft delete
  - the same event delivered twice (applied once)
  - an older event arriving after a newer one (the final rollups still equal
    `buildRollups` of the current expenses)

### R3 · `rebuildRollups` callable
- **Needs:** R1 · **Owns:** `functions/src/rollups.ts`, `functions/src/index.ts` (export), `tests/functions/rollups.test.ts`
- **Done when:** `test:functions` passes these tests:
  - a corrupted rollup is fixed by a rebuild
  - running the rebuild twice gives identical documents
  - it rebuilds only the calling user's data

### R4 · Rules test for rollup writes
- **Needs:** — · **Owns:** `tests/firestore-rules/rules.test.ts` (the server-authoritative `describe` block)
- **Done when:** `test:rules` passes with new cases showing that a client
  write to `dailyRollups/*` and `monthlyRollups/*` is denied and an owner
  read is allowed. Add the tests only if they aren't already covered, and say
  in the commit whether they were.

### R5 · Cache + rollup merge (pure)
- **Needs:** R1 · **Owns:** `packages/shared/src/insights.ts` (a new `mergePeriodSources` function), `__tests__/insights.test.ts`
- **Build:** combine rollup days for past dates with cached expenses for the
  current month into the existing Insights output types.
- **Done when:** tests pass for:
  - a period spanning the boundary has no gaps in `totalsByDay`
  - totals equal an all-cache computation of the same data exactly
  - `displayPercentages` still sums to 100

### R6 · Insights reads rollups for past periods
- **Needs:** R5 · **Owns:** `apps/mobile/src/features/expenses/screens/insights-screen.tsx`, a new `features/expenses/hooks/use-rollups.ts`
- **Done when:** `typecheck` exits 0. The screen uses `mergePeriodSources`,
  confirmed by grep. The current month still reads the cache.

---

## C — Scheduled and cleanup Functions (`functions/src/cleanup.ts`)

### C1 · `cleanupSoftDeleted`
- **Needs:** R2 · **Owns:** `functions/src/cleanup.ts`, `functions/src/index.ts`, `firestore.indexes.json`, `tests/functions/cleanup.test.ts`
- **Build:** a daily schedule that hard-deletes expenses whose `deletedAt` is
  more than 90 days old. Use a bounded, indexed collection-group query. Rollups
  stay unchanged; R1 already treats this case as a no-op.
- **Done when:** `test:functions` passes these tests:
  - boundary at 89 days kept, 90 days kept, 91 days deleted
  - rollup docs are byte-identical before and after
  - a second run is a no-op
  - the matching index entry exists in `firestore.indexes.json`

### C2 · Pending expiry sweep
- **Needs:** P1 · **Owns:** same files as C1, in the expiry section
- **Build:** a daily schedule that sets `status: 'expired'` on `pending`
  items with `receivedAt` more than 30 days old. It never deletes.
- **Done when:** `test:functions` passes these tests:
  - 29 days is untouched and 31 days expires
  - `approved`, `rejected`, and `expired` items are untouched
  - a second run is a no-op
  - the document count is unchanged

### C3 · `deleteUserData` callable
- **Needs:** — · **Owns:** `functions/src/cleanup.ts`, `functions/src/index.ts`, `tests/functions/delete-user.test.ts`, `package.json` (`test:functions` may need `--only firestore,storage`)
- **Build:** delete everything under `users/{uid}/**`: profile, settings,
  categories, expenses, checkIns, streak, wallet, coinLedger, pendingExpenses,
  dailyRollups, monthlyRollups, rollupApplied, groupIndex, and devices. Also delete the
  Storage prefix `users/{uid}/`. Only the caller's own uid can be deleted.
- **Done when:** `test:functions` passes these tests:
  - a fully populated user (at least one doc in *every* listed subcollection,
    plus 2 Storage files) is left with zero docs and zero files
  - a second user's data is untouched
  - calling for another uid is refused
  - a second call is a no-op

---

## X — CSV export and reset app

### X1 · CSV builder and parser
- **Needs:** — · **Owns:** `packages/shared/src/csv.ts`, `__tests__/csv.test.ts`
- **Build:** `buildExpensesCsv(expenses)` excludes soft-deleted expenses. Its
  columns are `occurredAt, localDate, amountMinor, currency, amount, categoryId,
  description, note, source`, where `amount` is a display-only major-unit
  column. Follow RFC 4180 quoting. `parseExpensesCsv(csv)` exists only for the
  round-trip test.
- **Done when:** round-trip tests give identical `amountMinor` for:
  - JPY (0 decimals)
  - INR `1,00,00,000.00`
  - `Number.MAX_SAFE_INTEGER`
  - descriptions containing commas, quotes, newlines, and emoji
  - a soft-deleted row, which must be excluded

### X2 · Export CSV screen
- **Needs:** X1 · **Owns:** You-tab row in `(tabs)/profile.tsx`, `features/expenses/hooks/use-export-csv.ts`, `apps/mobile/package.json` (`expo-sharing`)
- **Build:** build the CSV from the ledger's data source, which excludes
  pending and soft-deleted items. Write it with `expo-file-system` and share
  it with `expo-sharing`. Failure shows an error state.
- **Done when:** `typecheck` exits 0, and the commit body says
  `NATIVE REBUILD NEEDED: expo-sharing`.

### X3 · Reset-app model (pure)
- **Needs:** — · **Owns:** `apps/mobile/src/features/onboarding/model/reset.ts` (+ test)
- **Build:**
  - `isResetConfirmed(input)` is case-sensitive: only the exact string
    `RESET` passes
  - `resetPlan(auth: { isAnonymous })` returns
    `'delete-user' | 'sign-out'`
  - A small state machine models `idle → confirming → deleting → done | error`.
    Offline goes to the `error` state with *"Reset needs a connection"*.
- **Done when:** unit tests pass for:
  - `reset`, `RESET `, and ` RESET` are false, and `RESET` is true
  - anonymous gives `delete-user` and linked gives `sign-out`
  - offline gives the error state and never reaches `done`

### X4 · Reset app screen
- **Needs:** X3, C3 · **Owns:** `apps/mobile/src/app/settings/reset.tsx`, a You-tab row
- **Build:**
  - The user types RESET; confirming fires `haptic('error')`
  - It calls `deleteUserData` and **waits for it** before clearing local
    Firestore persistence
  - Then it deletes the anonymous user or signs out, and routes to
    `/onboarding`
  - It follows the destructive pattern in `docs/04`
- **Done when:** `typecheck` exits 0, and the navigation call comes after the
  awaited callable (confirm with grep in the commit body).

---

## H — Hardening

### H1 · Crashlytics wrapper
- **Needs:** A2 · **Owns:** `apps/mobile/src/lib/crashlytics.ts`, a pure `crash-keys.ts` (+ test), `app/_layout.tsx` (one init call), `apps/mobile/package.json`, `scripts/check-invariants.mjs` (new rule)
- **Build:**
  - Add `@react-native-firebase/crashlytics`
  - The wrapper exposes only `recordError(err, key: 'screen' | 'errorCode', value)`
  - Keys pass an allowlist, and values are truncated and stripped of digits
    longer than 4
  - No `setUserId`
  - New invariant rule: `@react-native-firebase/crashlytics` is imported only
    in `lib/crashlytics.ts`
  - If `expo-sqlite` has no imports, remove it from `package.json`
- **Done when:**
  - Allowlist and scrub unit tests pass
  - `check:invariants` exits 0 and its positive-control test covers the new
    rule
  - `typecheck` exits 0
  - Commit body says `NATIVE REBUILD NEEDED`

### H2 · App Check wiring
- **Needs:** — · **Owns:** `apps/mobile/src/lib/app-check.ts`, `app/_layout.tsx` (one init call), `apps/mobile/package.json`, `functions/src/*` (`enforceAppCheck: true` on callables)
- **Build:** use the debug provider under `__DEV__` and Play Integrity
  otherwise. A token failure must not crash the app; log it through H1's
  wrapper if H1 is done.
- **Done when:**
  - `typecheck` exits 0
  - `grep -n "enforceAppCheck" functions/src` covers every `onCall`
  - `test:functions` passes, with the test harness bypass documented in the
    commit
  - Commit body says `NATIVE REBUILD NEEDED`

### H3 · Accessibility and testID audit script
- **Needs:** — · **Owns:** `scripts/check-a11y.mjs`, root `package.json` (`check:a11y`)
- **Build:** use the TypeScript compiler API (it's already a dependency) to
  find every `Pressable`, `TouchableOpacity`, `TextInput`, `Switch`, and
  `Button`, plus the project's own tactile button components, under
  `apps/mobile/src`. Report each one that lacks a `testID` or an
  `accessibilityLabel`/`accessibilityRole`. Support `--json` output and
  `--max N` for CI ratcheting.
- **Done when:** the script runs and prints a count. A scratch component with
  a bare `Pressable` is reported. The current count is recorded in the commit
  body.

### H4 · Fix every a11y/testID finding
- **Needs:** H3 · **Owns:** only the props on flagged elements. No refactors.
- **Done when:** `npm run check:a11y -- --max 0` exits 0, and `typecheck`,
  `test`, and `check:testids` all exit 0. It's fine to split this task by
  feature folder across several commits, named H4a, H4b, and so on.

### H5 · Empty-state copy module
- **Needs:** — · **Owns:** `apps/mobile/src/lib/empty-states.ts` (+ a model test), the screens that render empty states
- **Build:** a single map holding the copy from
  `docs/02-onboarding.md#empty-states-after-onboarding` (Orbit, Ledger,
  Insights, Insights-thin-data) and the Inbox copy from `docs/12`. Screens
  import from this map instead of hard-coding the strings.
- **Done when:** a unit test asserts that each string equals the doc text
  verbatim. `grep` finds none of those strings hard-coded outside the module.
  `typecheck` exits 0.

### H6 · `test:all` and journey YAML
- **Needs:** A2, A3, U6 · **Owns:** `scripts/test-all.sh`, root `package.json`, `e2e/journeys/mvp-day-in-the-life.yaml`
- **Build:** `npm run test:all` runs typecheck → test → check:invariants →
  check:testids → check:a11y → test:rules → test:functions, stops on the first
  failure, and prints a summary. `--device` additionally runs every Maestro
  flow and the journey (the owner runs that part). Write the journey YAML from
  `docs/15-mvp-completion-plan.md#final-gate--full-mvp-integration-test`.
- **Done when:** `npm run test:all` (without `--device`) exits 0, the journey
  file exists, and `check:testids` covers `e2e/journeys/` too.

---

## D — Device queue (the owner runs these with Claude on the Android emulator)

These need the `Loop_API35` emulator, an EAS dev build, or both. Code agents
**don't** do these. Each item names the doc checkboxes it can tick.

| ID | What | Unlocks after | Ticks |
|---|---|---|---|
| D0 | Get `npm run firebase:emulators` starting cleanly. Install an EAS dev build with the M4 native deps. | — | — |
| D1 | M4 flows: `catalogue-add`, `category-archive-unarchive`, `category-custom-glyph`, `category-custom-logo`, `category-from-entry-sheet`, each passing twice | D0 | M4 status in `docs/13` |
| D2 | M5 flows: `insights-*` (6), each passing twice. 3,000-expense render under 300ms. | D0 | `docs/05` perf |
| D3 | M6 flows: `check-in-zero-spend`, `check-in-offline-reconcile`, `keep-it-plain`. Manual pass on the `docs/06` restraint rules. | D0 | `docs/06` offline and Keep-it-plain |
| D4 | Onboarding flows (full, resume, skip). Bootstrap-gate escape attempts. Kill and resume at every step. Airplane-mode run, 90-second run. | D0 | `docs/02` (all) |
| D5 | Rebuild with `sms-reader` + remote-config. Test `adb emu sms send` delivery (and whether alphanumeric senders work, with the dev fallback if not), 30-day backfill, permission denied, kill switch at runtime. | N1, N2, U5 | `docs/12` denied and kill switch |
| D6 | The 8 `sms-*` flows, each passing twice. Privacy audit across Firestore, Storage, and logcat. | U6, D5 | `docs/12` (rest) |
| D7 | Rollups parity on device. Export CSV, then pull and re-parse the file. Reset app leaves an empty subtree. App Check negative control. Crashlytics payload inspection. | R6, X2, X4, H1, H2 | `docs/08` export, `docs/11` App Check and deletion |
| D8 | Maximum font scale, screen-reader walk (entry sheet, inbox, onboarding), and perf re-check (5k ledger, 3k insights) | H4, H5 | `docs/03` fps |
| D9 | `npm run test:all -- --device`, passing twice in a row. Reconcile every doc checkbox. | everything | MVP complete |

**Owner only (not agent work):**
- Physical-device haptic pass on the Redmi Note 10 Pro
- Blaze plan and a budget alert, then deploy to `loop-app-0403` and run the
  preview-build smoke test
- Submit the Play Store SMS permission declaration (it has the longest lead
  time, so submit it early)
- `git tag v1.0.0-mvp` after D9
