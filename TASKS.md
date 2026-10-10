# TASKS — the single list of remaining work

This file is the **only** task tracker in the repo. Specs live in `docs/`
(what to build and why); this file says what's left, in what order, and how to
prove each piece is done. If a task below disagrees with the repo, trust the
repo and fix the task in the same commit.

**Two parts.** Part 1 (below, through section D) is the v1 MVP. **Part 2**, at the
end of this file, covers releases v1.1–v1.6 from
[`docs/27-full-ledger-plan.md`](docs/27-full-ledger-plan.md). The rules in *How
to work this file* apply to both parts.

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
| A4 | Tick code-provable acceptance criteria in docs | A1, A2 | done |
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
| H1 | Crashlytics wrapper with key allowlist | A2 | done |
| H2 | App Check wiring | — | done |
| H3 | Accessibility/testID audit script | — | done |
| H4 | Fix every a11y/testID finding | H3 | done |
| H5 | Empty-state copy module matching `docs/02` | — | done |
| H6 | `npm run test:all` (code-level) + MVP journey YAML | A2, A3, U6 | done |

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
| D0 | Get `npm run firebase:emulators` starting cleanly. Install an EAS dev build with the M4 native deps. **Done 2026-09-27:** emulators start Auth/Firestore/Functions/Storage (functions now esbuild-bundled); EAS dev build `3b37050f` (all native deps through H1/X2/X4) installed on Loop_API35 and boots against Metro + emulators into onboarding. | — | — |
| D1 | M4 flows: `catalogue-add`, `category-archive-unarchive`, `category-custom-glyph`, `category-custom-logo`, `category-from-entry-sheet`, each passing twice. **Done 2026-09-27:** all five passed twice on Loop_API35 (10/10). Found and fixed on the way: new users skipped onboarding steps 1–2; Orbit crashed before the first coin; "Manage categories" opened the New category editor; custom-category save returned into the catalogue; Metro crashed on `.opencodework/`; flows updated for the onboarding gate (`subflows/onboarded.yaml`). | D0 | M4 status in `docs/13` |
| D2 | M5 flows: `insights-*` (6), each passing twice. 3,000-expense render under 300ms. **Flows done 2026-09-27** (all 6 twice). **Perf not met, owner decision:** ~820–880ms production bundle / ~930ms dev on Loop_API35 with 3,000 seeded; unchanged at 205 cached, ~560ms at 10, so the cost is listener start-up, not data size — see `docs/05` perf. | D0 | `docs/05` perf |
| D3 | M6 flows: `check-in-zero-spend`, `check-in-offline-reconcile`, `keep-it-plain`. Manual pass on the `docs/06` restraint rules. **Done 2026-09-27:** all three twice; restraint pass fixed rule 5 (check-in fired `streakAdvance` under Keep it plain), rule 6 (no per-session celebration cap) and rule 7 (unused `expo-notifications` autolinked an FCM receiver — takes effect in the D5 rebuild). | D0 | `docs/06` offline and Keep-it-plain |
| D4 | Onboarding flows (full, resume, skip). Bootstrap-gate escape attempts. Kill and resume at every step. Airplane-mode run, 90-second run. **Done 2026-09-28:** full/resume/skip plus new `onboarding-gate` and `onboarding-offline`, each twice. Fixed: resume could only land on welcome or feel (now `settings.onboardingStep`); the gate bounced the category modals steps 3 and 5 open; an offline cold install showed a raw auth error instead of "Connect once to set up"; `launch.yaml` tapped any "Continue", advancing onboarding on relaunch. | D0 | `docs/02` (all) |
| D5 | Rebuild with `sms-reader` + remote-config. Test `adb emu sms send` delivery (and whether alphanumeric senders work, with the dev fallback if not), 30-day backfill, permission denied, kill switch at runtime. **Done 2026-09-28:** EAS dev build `6d928d7b` (commit `c466a35`) installed. `adb emu sms send` delivers with the alphanumeric sender intact (no fallback needed). Backfill takes a 20-day-old message and skips a 40-day-old one (backdated via root `content insert`). `sms-permission-denied` flow twice. Remote Config: the live template was empty (capture off everywhere); `sms_ingest_enabled=true` is now published from `remoteconfig.template.json` (owner approved). Kill switch at runtime: real-time updates never arrived, so the app now re-fetches on foreground — verified on → off → on. | N1, N2, U5 | `docs/12` denied and kill switch |
| D6 | The 8 `sms-*` flows, each passing twice. Privacy audit across Firestore, Storage, and logcat. **Done 2026-09-28:** all 8 twice (plus `sms-permission-denied`); privacy audit clean (Firestore scans, full logcat, Storage). The negative flows (otp, manual-suppresses, duplicate) now send a CONTROLCAFE control after the message under test and wait for it, so "nothing created" can't pass by the SMS simply arriving late; kill-switch waits 20s. `scripts/e2e-flow.mjs` runs any flow and delivers its declared SMS (`SMS_AFTER`/`SMS_SEND`), flipping Remote Config for kill-switch; `test:all --device` uses it. Emulator setup it relies on: `adb root` (to clear the SMS store), heads-up notifications off (e2e.sh), the dev-client tools button off (launch.yaml). | U6, D5 | `docs/12` (rest) |
| D7 | Rollups parity on device. Export CSV, then pull and re-parse the file. Reset app leaves an empty subtree. App Check negative control. Crashlytics payload inspection. **Done 2026-09-28, two halves need the live project:** rollups — Insights shows Aug ₹60,940.00 / Jul ₹66,985.00, equal to the expenses (and all 365 daily rollups equal for the 3,000 seed); CSV — 500 rows pulled via `run-as` re-parse to the seed exactly (total, per category, integer minor units); reset — new `reset-app` flow twice, old uid's subtree empty. App Check: the emulator rejects a callable with **no** token but accepts a **fake** one (it checks presence only), so the invalid-token control must run on `loop-app-0403` after deploy. Crashlytics: only `lib/crashlytics.ts` touches it, one call site (`errorCode: app-check-init`), no user id; collection is off in dev, so inspect a real payload — including auto-captured JS exceptions — in the preview smoke test. | R6, X2, X4, H1, H2 | `docs/08` export, `docs/11` App Check and deletion |
| D8 | Maximum font scale, screen-reader walk (entry sheet, inbox, onboarding), and perf re-check (5k ledger, 3k insights) **Done 2026-09-28 on the emulator; fps needs the phone:** at font_scale 2.0 every onboarding step, Orbit, entry sheet, ledger, Insights, You and Inbox hold up — one fix (step 3's Catalogue/+ New row overflowed; now wraps). Accessibility-tree audit of the 5 onboarding steps, Orbit, entry sheet and inbox: 82 interactive nodes, 0 unlabelled. Perf: ledger at 5,000 scrolls at 23ms median / 46ms p99, 2.3% janky — but this emulator's own Settings app runs 20ms median (GPU 18ms), so 60fps can't be judged here; Insights at 3,000 is in D2. Both fps/300ms numbers need a run on the Redmi. | H4, H5 | `docs/03` fps |
| D9 | `npm run test:all -- --device`, passing twice in a row. Reconcile every doc checkbox. | everything | MVP complete |

**Owner only (not agent work):**
- Physical-device haptic pass on the Redmi Note 10 Pro
- Blaze plan and a budget alert, then deploy to `loop-app-0403` and run the
  preview-build smoke test. It must include the two D7 halves the emulator
  can't prove: a callable with an invalid App Check token is refused, and a
  Crashlytics report (non-fatal and an uncaught JS error) carries no user text
- Submit the Play Store SMS permission declaration (it has the longest lead
  time, so submit it early)
- `git tag v1.0.0-mvp` after D9


---
---

# Part 2 — Full ledger (v1.1–v1.6)

Specs: docs 16–27, plus the post-v1 sections of docs 00–14. **Read
[`docs/27-full-ledger-plan.md`](docs/27-full-ledger-plan.md) first.** It explains
the order, the phase gates and the deploy runbook. Each task names the doc section
it implements. If they disagree, fix the doc in the same commit.

**Part 2 starts after D9** (MVP complete). The exception is `DP0`, a refactor that
changes no behaviour and may start now.

**Extra rules for Part 2:**
- **Every new field is optional on read.** Never make a v1 document fail to
  parse. Add the v1-shape fixture to the test when you touch a converter.
- **Every new Firestore query lands with its index** in `firestore.indexes.json`,
  in the same commit.
- **Every new rule lands with an allow test and an attack test.**
- **Every new user-settable field extends the CSV round-trip test** in the same
  task (`docs/08` Export).
- **A phase's tasks don't start until the previous phase's D item is done**,
  unless the lane graph says otherwise.

## Part 2 status

| ID | Task | Needs | Status |
|---|---|---|---|
| DOC1 | Docs 16–27 and post-v1 updates to docs 00–14 | — | done |
| **P1 — v1.1 Complete v1** | | | |
| DP0 | Fix the import-rule drift (`use-rollups`, `profile.tsx`, `day/[date].tsx`) | — | done |
| DP1 | Force-update gate (`min_supported_build`) | — | done |
| DP2 | `createdLocalDate` + backdating fix | — | done |
| DP3 | `DatePickerSheet` model + component | — | done |
| DP4 | Entry draft `localDate` + `composeOccurredAt` | DP3 | done |
| DP5 | Insights custom-period UI | DP3 | done |
| DP6 | Ledger filter model + store (pure) | — | todo |
| DP7 | Ledger filter sheet, chips, query strategy | DP3, DP6, DP0 | todo |
| L1 | `core/auth` pure modules (errors, mask, phone) | — | todo |
| L2 | Google sign-in dep + link service | L1 | todo |
| L3 | `/settings/account` screen, OTP sheet, switch sheet | L2 | todo |
| L4 | Welcome "I already use Loop" + onboarding note | L2 | todo |
| L5 | P1 Maestro flows | DP1, DP4, DP5, DP7, L3, L4 | todo |
| **P2 — v1.2 Money in & out** | | | |
| K1 | Kind types, validators, `sys-*` ids, merge `PendingExpense` | D10 | todo |
| K2 | `documents.ts` v2 converters + v1 fixture suite | K1 | todo |
| K3 | Rules v2 (transactions, pending) + tests | K2 | todo |
| K4 | Rollups v2 + marker v2 maths (pure) | K1 | todo |
| K5 | `onExpenseWrite` v2 + trigger matrix + `rebuildUserLedger` | K2, K4, DP2 | todo |
| K6 | Migration script + `meta/schema` + client "updating" state | K5 | todo |
| K7 | Income categories + versioned seed | K1 | todo |
| K8 | Insights kinds (pure) + Spend/Income/Net UI | K4, K7 | todo |
| K9 | Entry kind switch + income | K2, K7 | todo |
| K10 | Refunds | K9 | todo |
| K11 | CSV v2 export | K2 | todo |
| K12 | `merchantKey` normaliser | — | todo |
| AC1 | `accounts.ts` (pure) | K4 | todo |
| AC2 | Accounts repository + rules | AC1, K3 | todo |
| AC3 | Accounts screens + Orbit card | AC2 | todo |
| AC4 | Entry account chip | AC2, K9 | todo |
| AC5 | Transfers | AC4 | todo |
| SM1 | Credit / reversal / cashback / card-bill parsing + fixtures | K1 | todo |
| SM2 | `matchRefund` + `pairTransfers` (pure) | SM1, K12 | todo |
| SM3 | Ingest v2 + inbox cards per kind | SM2, AC2, K3, K10 | todo |
| DP8 | Ledger filter facets: kind, account | DP7, AC2 | todo |
| K13 | P2 Maestro flows | K6, K8, K10, K11, AC3, AC5, SM3, DP8 | todo |
| **P3 — v1.3 Organise** | | | |
| O1 | Sub-categories (shared) | K7, D11 | todo |
| O2 | Sub-categories UI | O1, K8 | todo |
| O3 | Tags (shared, rules, repository) | K3, D11 | todo |
| O4 | Tags UI + ledger facet + tag insights | O3, DP8 | todo |
| O5 | Merchant memory + merchant field | K12, K3, D11 | todo |
| O6 | Split lines (shared) + per-line rollups | K5, D11 | todo |
| O7 | Split lines UI | O6 | todo |
| O8 | `suggestCategories` callable | O5 | todo |
| O9 | Smart suggestions setting + client flow | O8 | todo |
| O10 | P3 Maestro flows | O2, O4, O5, O7, O9 | todo |
| **P4 — v1.4 Plan ahead** | | | |
| B1 | `budgets.ts` (pure) | O1, K8, D12 | todo |
| B2 | Budgets repository + rules + archive cascade | B1 | todo |
| B3 | Budgets screens + Orbit gauge | B2 | todo |
| RC1 | `recurring.ts` (pure) | K1, D12 | todo |
| RC2 | Recurring repository + rules + index | RC1, K3 | todo |
| RC3 | Inbox Due group + recurring screens | RC2, DP3 | todo |
| IN1 | Trend, projection, year, savings (pure) | K8, RC1 | todo |
| IN2 | Insights v2 UI | IN1, B2, DP5 | todo |
| NT1 | Reminder planner (pure) | RC1 | todo |
| NT2 | `expo-notifications` wrapper + settings + invariant | NT1 | todo |
| B4 | P4 Maestro flows | B3, RC3, IN2, NT2 | todo |
| **P5 — v1.5 Squads** | | | |
| G1 | `groups.ts` + `settle.ts` settlements (pure) | K1, D13 | todo |
| G2 | Group converters + rules + attack tests | G1, K3 | todo |
| G3 | Entry/settlement triggers: balances, summary, activity, invalid | G2 | todo |
| G4 | Mirrors + parser branch + `onGroupPrefWrite` | G3, K5 | todo |
| G5 | Invites, leave, remove, reset seat, `deleteUserData` v2 | G4 | todo |
| G6 | Hosting App Links + intent filter | D13 | todo |
| G7 | Dock change + You avatar | D13 | todo |
| G8 | Squads screens: list, new, detail, members, settings | G2, G7 | todo |
| G9 | Squad entry — Drag & Split + loans | G8 | todo |
| G10 | Settle up + Pay via UPI + settlement suggestions | G8, SM2 | todo |
| G11 | Join flow + linking prompt | G5, G6, G8, L3 | todo |
| NT3 | Squad push: tokens, sender, mute | NT2, G3 | todo |
| G12 | P5 Maestro flows | G9, G10, G11, NT3 | todo |
| **P6 — v1.6 Reach** | | | |
| IM1 | `import.ts`: generic CSV, mapping, plan, dedupe (pure) | K11, D14 | todo |
| IM2 | `imports` rules + `finalizeImport` | IM1, K5 | todo |
| IM3 | Import UI, writer, recovery, undo | IM2 | todo |
| W1 | `widget.ts` snapshot (pure) | B1, D14 | todo |
| W2 | Quick actions | D14 | todo |
| W3 | Android widget | W1 | todo |
| IM4 | P6 Maestro flows + full-ledger journey YAML | IM3, W2, W3 | todo |

## Part 2 lanes

```
P1  Lane DP  DP0 ─▶ DP7      DP3 ─┬─▶ DP4          DP6 ─▶ DP7      DP1, DP2 (no deps)
                                  ├─▶ DP5
                                  └─▶ DP7
    Lane L   L1 ─▶ L2 ─┬─▶ L3
                       └─▶ L4                      all P1 ─▶ L5 ─▶ D10
P2  Lane K   K1 ─┬─▶ K2 ─┬─▶ K3                    K12 (no deps)
                 │       ├─▶ K11
                 │       └─▶ K9 ─▶ K10
                 ├─▶ K4 ─┬─▶ K5 ─▶ K6
                 │       ├─▶ K8
                 │       └─▶ AC1 ─▶ AC2 ─┬─▶ AC3
                 │                       └─▶ AC4 ─▶ AC5
                 ├─▶ K7 ─▶ K8, K9
                 └─▶ SM1 ─▶ SM2 ─▶ SM3             DP7+AC2 ─▶ DP8      all P2 ─▶ K13 ─▶ D11
P3  Lane O   O1 ─▶ O2    O3 ─▶ O4    O5 ─▶ O8 ─▶ O9    O6 ─▶ O7        all P3 ─▶ O10 ─▶ D12
P4  Lane B   B1 ─▶ B2 ─▶ B3
    Lane RC  RC1 ─┬─▶ RC2 ─▶ RC3
                  ├─▶ IN1 ─▶ IN2
                  └─▶ NT1 ─▶ NT2                   all P4 ─▶ B4 ─▶ D13
P5  Lane G   G1 ─▶ G2 ─┬─▶ G3 ─▶ G4 ─▶ G5 ─┐
                       └─▶ G8 ─┬─▶ G9      ├─▶ G11
             G7 ─▶ G8          └─▶ G10     │
             G6 ───────────────────────────┘       NT2+G3 ─▶ NT3      all P5 ─▶ G12 ─▶ D14
P6  Lane IM  IM1 ─▶ IM2 ─▶ IM3     Lane W  W1 ─▶ W3   W2              all P6 ─▶ IM4 ─▶ D15 ─▶ D16
```

**Start now:** DP0. **After D9:** DP1, DP2, DP3, DP6, L1.

**File-collision warnings for Part 2.** Don't run these at the same time; land
one first.

- `packages/shared/src/firestore/documents.ts`: K2, AC2, O3, O5, O6, RC2, B2,
  G2, G4, IM2. K2 first, then the rest one at a time.
- `firestore.rules` and `firestore.indexes.json`: K3, AC2, O3, O5, O6, RC2, B2,
  G2, IM2, DP7, DP8, O4. Each adds a match block or index entry, so rebases are
  usually trivial, but rules tests share ports. Run them one session at a time.
- `functions/src/handlers.ts` and `functions/src/rollups.ts`: DP2, K5, O6, G4,
  IM2.
- `functions/src/index.ts`: K5, O8, G3, G4, G5, IM2. Each adds exports.
- `packages/shared/src/csv.ts`: K11, then every task that adds a user field (AC4,
  O4, O5, O7, RC3).
- `apps/mobile/src/features/expenses/screens/expense-entry-screen.tsx`: DP4, K9,
  K10, AC4, AC5, O4, O5, O7.
- `apps/mobile/src/app/(tabs)/_layout.tsx` and `components/ui/tab-dock.tsx`: G7
  only.
- `apps/mobile/src/features/inbox/*`: SM3, O5, O9, RC3, G10.
- `apps/mobile/src/lib/remote-config.ts`: DP1, O8 (server-side keys only; no
  client change expected).
- `scripts/check-invariants.mjs`: NT2, W3.

---

## P1 — v1.1 Complete v1

### DP0 · Fix the import-rule drift
- **Needs:** — · **Owns:** `features/expenses/hooks/use-rollups.ts` → `features/expenses/api/rollup-repository.ts`, `app/(tabs)/profile.tsx` → `features/profile/screens/profile-screen.tsx`, `app/day/[date].tsx` → `features/expenses/screens/day-screen.tsx`
- **Why:** `docs/10` import rules 3–5 and its drift note.
- **Build:**
  - Move the Firestore reads in `use-rollups.ts` into a repository function. The
    hook keeps its signature.
  - Each route file becomes under 40 lines and renders one screen component.
  - Cross-feature imports go through `index.ts`.
  - No behaviour change. testIDs are unchanged.
- **Done when:**
  - `typecheck` exits 0.
  - `npm test` counts are unchanged.
  - `check:testids` exits 0.
  - `grep -rn "firestore()" apps/mobile/src/features/*/hooks` finds nothing.
  - Both route files are under 40 lines (`wc -l`).

### DP1 · Force-update gate
- **Needs:** — · **Owns:** `apps/mobile/src/lib/remote-config.ts` (new key + activation listener), `apps/mobile/src/core/update-gate/{model.ts,model.test.ts,update-gate.tsx}`, `app/_layout.tsx` (one wrapper), `remoteconfig.template.json`, `apps/mobile/package.json` (`expo-application`, for `nativeBuildVersion`), `apps/mobile/package.json` (expo-application)
- **Spec:** `docs/27` § Force-update gate.
- **Build:**
  - Pure `isBuildSupported(current, minSupported | null)`.
    - `null` (never fetched) means supported.
  - A blocking screen with a Play Store link.
  - Re-checked on foreground, at most every 15 minutes.
- **Done when:**
  - Unit tests cover equal, lower, higher and null.
  - `typecheck` exits 0.
  - The template has `min_supported_build` with default `0`.

### DP2 · `createdLocalDate` + backdating fix
- **Needs:** — · **Owns:** `packages/shared/src/expenses.ts`, `firestore/documents.ts` (optional field), `functions/src/handlers.ts` (backdating line), `tests/functions/functions.test.ts`
- **Spec:** `docs/06` § Backdating, last paragraph.
- **Build:**
  - Every client create path writes `createdLocalDate = todayISO()`: manual,
    approve, and duplicate.
  - `handleExpenseWrite` compares `localDate < (createdLocalDate ?? localDateOf(createdAt))`.
  - The converter reads a missing value as `null`.
- **Done when:** `test:functions` passes, with new tests for:
  - an evening log in a UTC−5 fixture is **not** backdated;
  - a v1 doc without the field behaves as before.

### DP3 · `DatePickerSheet`
- **Needs:** — · **Owns:** `apps/mobile/src/components/ui/date-picker-model.ts` (+ test), `components/ui/date-picker-sheet.tsx`
- **Spec:** `docs/03` § Date → `DatePickerSheet`.
- **Build:**
  - The pure model: `monthGrid(year, month)` (Monday first), `isSelectable(day,
    today, {allowFuture, minDate})`, `applyRangeTap(state, day, maxRangeDays)`.
  - The component, using theme tokens only.
  - Haptics per the doc.
- **Done when:** unit tests pass for:
  - a leap February;
  - a month starting on Sunday;
  - future days disabled;
  - `allowFuture`;
  - a range tapped in reverse order;
  - a range over the limit is refused.

  Also `typecheck` exits 0 and `check:a11y -- --max 0` exits 0.

### DP4 · Entry draft `localDate` + `composeOccurredAt`
- **Needs:** DP3 · **Owns:** `packages/shared/src/dates.ts` (new, + test), `core/state/draft-store.ts`, `features/expenses/screens/expense-entry-screen.tsx` (date row)
- **Spec:** `docs/03` § Date → What a picked date writes.
- **Build:**
  - `composeOccurredAt(localDate, timeOfDay, now)`, built from local
    components.
  - DST gap → move forward. Repeated hour → first occurrence.
  - The draft swaps `daysAgo` for `localDate`.
  - Chips plus the sheet.
  - Edit keeps the original time of day.
  - Remove `occurredAtFor` and `daysAgoOf`.
- **Done when:**
  - Unit tests run under `TZ=America/New_York` and `TZ=Asia/Kolkata` (set in the
    test script), covering a spring-forward gap and a fall-back repeat.
  - A property test: `localDateOf(composeOccurredAt(d, t)) === d` for 1,000
    random dates.
  - `typecheck` exits 0.

### DP5 · Insights custom-period UI
- **Needs:** DP3 · **Owns:** `features/expenses/screens/insights-screen.tsx` (period chip), `core/providers/settings-provider.tsx` (if needed)
- **Spec:** `docs/05` § Custom period.
- **Build:**
  - Custom opens the range sheet.
  - `customPeriod()` validates.
  - The range persists to `insightsCustomStartDate/EndDate`.
  - The chip label.
  - Stepping uses `stepPeriod`.
- **Done when:**
  - `typecheck` exits 0.
  - A pure test shows a saved custom period restores from settings unchanged.

### DP6 · Ledger filter model + store
- **Needs:** — · **Owns:** `features/expenses/model/ledger-filter.ts` (+ test), `core/state/ledger-filter-store.ts`
- **Spec:** `docs/03` § Ledger filters → Model, Query strategy.
- **Build:** `LedgerFilter`, `matches()`, `serverQueryFor()`, `isEmpty()`, and the
  store with `set/clear/fromDrillDown`.
  - P1 facets: text, date range, category, amount, source.
  - Fields for the later facets exist but are ignored when empty.
- **Done when:** unit tests cover:
  - each facet alone;
  - facets combined with AND;
  - `serverQueryFor` choosing the date range over category;
  - `amountMin > amountMax` reported invalid.

### DP7 · Ledger filter sheet, chips, query strategy
- **Needs:** DP3, DP6, DP0 · **Owns:** `app/ledger/filter.tsx`, `features/expenses/screens/ledger-filter-screen.tsx`, `features/expenses/screens/ledger-screen.tsx`, `features/expenses/api/expense-repository.ts` (scan helper), `features/expenses/screens/insights-screen.tsx` (drill-downs set the store)
- **Spec:** `docs/03` § Ledger filters.
- **Build:**
  - The sheet and the chips row.
  - The summary line, with spend and income kept separate.
  - Date-ranged loads are exact.
  - Without a date range, a paged scan capped at 10 pages, with a "scanned back
    to" line and `≥` totals.
  - Drill-downs stop using route params.
- **Done when:**
  - `typecheck` exits 0 and `check:testids` exits 0.
  - A pure test of the scan loop with a fake pager: it stops at 50 matches or 10
    pages, whichever comes first.

### L1 · `core/auth` pure modules
- **Needs:** — · **Owns:** `apps/mobile/src/core/auth/{link-errors,mask,phone}.ts` (+ tests)
- **Spec:** `docs/16` § Link errors, Validation.
- **Build:**
  - `linkErrorState(code)` gives a user-facing state for every row of the error
    table.
  - `maskEmail`, `maskPhone`.
  - `normalizePhone(input, defaultCountry='IN')` returns E.164 or `null`.
- **Done when:** unit tests cover every error-table row, the mask formats from the
  doc, and valid and invalid phone numbers.

### L2 · Google sign-in dependency + link service
- **Needs:** L1 · **Owns:** `apps/mobile/package.json`, `app.json` (plugin), `core/auth/{providers.ts,link-service.ts}`
- **Spec:** `docs/16` § Providers and every Flow section.
- **Build:**
  - `linkWithProvider`, `signInWithProvider` (deleting the throwaway anonymous
    uid first), `switchAccount` (re-runnable steps), `signOutSafely`
    (`waitForPendingWrites` with a 5s timeout).
  - `unlinkProvider` (only when 2 or more providers are linked).
  - Only this folder imports the Google SDK and the auth linking APIs.
- **Done when:**
  - `typecheck` exits 0.
  - A grep shows the Google SDK is imported only in `core/auth/`.
  - The commit body says `NATIVE REBUILD NEEDED: @react-native-google-signin/google-signin`.

### L3 · `/settings/account` + OTP sheet + switch sheet
- **Needs:** L2 · **Owns:** `app/settings/account.tsx`, `features/account/**`, the You-tab row
- **Spec:** `docs/16` § Where linking is offered, Flow sections, Haptics.
- **Build:** the screen with status and masked identity; Google and Phone buttons,
  disabled offline; the OTP sheet with resend countdown; the switch sheet with
  export and `SWITCH`; sign out; unlink.
- **Done when:** `typecheck`, `check:testids` and `check:a11y -- --max 0` exit 0.

### L4 · Welcome "I already use Loop" + onboarding note
- **Needs:** L2 · **Owns:** `features/onboarding/screens/welcome-*.tsx`, the first-expense success state
- **Spec:** `docs/02` Step 1 and Step 5, `docs/16` § "I already use Loop".
- **Done when:** `typecheck` exits 0. `check:invariants` still passes
  (`onboarding-no-permission-request`).

### L5 · P1 Maestro flows
- **Needs:** DP1, DP4, DP5, DP7, L3, L4 · **Owns:** `e2e/flows/{date-picker-backdate,ledger-filter,insights-custom-period,link-google,link-phone,sign-in-existing,switch-account,sign-out-pending-writes,force-update-gate}.yaml`
- **Spec:** `docs/27` § P1 Tests → L4.
- **Done when:** `check:testids` exits 0. The flows are only *run* in D10.

---

## P2 — v1.2 Money in & out

### K1 · Kind types, validators, `sys-*` ids, one `PendingExpense`
- **Needs:** D10 · **Owns:** `packages/shared/src/{types.ts,expenses.ts,categories.ts,sms/types.ts,index.ts}` (+ tests)
- **Spec:** `docs/17` § The transaction kinds, `docs/08` § Transactions, `docs/12` § The pending expense.
- **Build:**
  - `TransactionKind`.
  - `validateTransaction(input)` per kind:
    - transfer accounts must differ;
    - income needs an income category;
    - a refund needs `refundOf`.
  - `newIncome`, `newTransfer`, `newRefund` alongside `newPersonalExpense`.
  - `SYSTEM_CATEGORY_IDS` and `resolveCategory`.
  - Delete the duplicate `PendingExpense` in `types.ts`. The `sms/types.ts`
    shape wins. Add the optional v1.2 fields.
- **Done when:** `npm test` passes with tests for each kind's valid and invalid
  inputs. `typecheck` exits 0 across all workspaces.

### K2 · `documents.ts` v2 + v1 fixture suite
- **Needs:** K1 · **Owns:** `packages/shared/src/firestore/documents.ts`, `firestore/paths.ts` (add rollups, accounts, meta), `__tests__/firestore*.test.ts`, `__tests__/fixtures/v1-docs.json`
- **Spec:** `docs/08` § Transactions, Mirrors.
- **Build:**
  - Every new field is optional with a default.
  - `kind` defaults to `expense`.
  - Strict types when a field is present.
  - A mirror branch stub that rejects for now. G4 enables it.
  - Rollup paths join `firestorePaths`.
- **Done when:**
  - Every v1 doc in the fixture parses to the same `Expense` as before.
  - Each new field round-trips.
  - Malformed new fields throw.

### K3 · Rules v2 (transactions, pending)
- **Needs:** K2 · **Owns:** `firestore.rules`, `tests/firestore-rules/rules.test.ts`, `tests/firestore-rules/pending-expenses.test.ts`
- **Spec:** `docs/17` § Data, `docs/11` § Trust boundary.
- **Build:**
  - Clients may write `kind` only in `expense | income | refund | transfer`.
  - A transfer needs `toAccountId` that differs from `accountId`.
  - `categoryId is string`.
  - Optional new fields are type-checked when present.
  - The pending key set is widened with optional keys.
  - `rollupApplied` and `meta/schema` are owner-readable and client-unwritable.
- **Done when:** `test:rules` passes with one allow test and one attack test per new
  condition, and every existing test still passes.

### K4 · Rollups v2 + marker v2 (pure)
- **Needs:** K1 · **Owns:** `packages/shared/src/rollups.ts` (+ tests)
- **Spec:** `docs/11` § Rollups v2.
- **Build:**
  - `contributionsOf(tx)` returns bucket rows (per line, keyed by leaf) and
    account flows.
  - `applyContributionDelta(rollups, flows, old, new)`.
  - Per-bucket counts.
  - `isEmptyRollup` requires all three counts to be 0.
  - Excluded mirrors and transfers contribute nothing to the buckets.
- **Done when:** unit tests show:
  - an income-only day survives;
  - an edit that moves a category or an account is exact;
  - a sequence of operations equals `buildRollups` of what is left;
  - a split doc contributes per line (lines are accepted even though the UI comes
    in O7).

### K5 · `onExpenseWrite` v2 + trigger matrix + `rebuildUserLedger`
- **Needs:** K2, K4, DP2 · **Owns:** `functions/src/{handlers.ts,rollups.ts,index.ts}`, `tests/functions/{functions,rollups}.test.ts`
- **Spec:** `docs/06` § What counts, `docs/11` § Rollups v2 and Cloud Functions, `docs/24` § Why online-only.
- **Build:**
  - One transaction updates the rollups, `accountBalances` and the marker v2.
  - The kind × source matrix decides check-ins and coins.
  - `source: 'import'` creates skip rollups, flows and coins.
  - The zero-spend query counts only spend-counting expense shares.
  - `categorised` looks up the category's slug.
  - `rebuildUserLedger(uid, span?)` is exported for `rebuildRollups`.
- **Done when:** `test:functions` passes with one test per matrix row, plus:
  - out-of-order delivery;
  - an account move;
  - parity: after 50 random operations, the result equals `rebuildUserLedger`.

### K6 · Migration script + `meta/schema` + client "updating" state
- **Needs:** K5 · **Owns:** `scripts/migrate-v2.ts`, `tests/functions/migrate.test.ts`, `features/expenses/hooks/use-rollups.ts` (schema check), `apps/mobile/src/lib/empty-states.ts`
- **Spec:** `docs/27` § Migration script.
- **Build:**
  - The script requires `--project` and `--yes`, and supports `--from-uid`.
  - It runs 20 users at a time.
  - It seeds income categories (calling K7's seeder).
  - It writes `meta/schema`.
  - Past periods show *"Updating your history…"* while `ledger < 2`.
- **Done when:** a Functions-harness test runs the script twice on a seeded
  emulator and gets identical results, with rollups equal to a rebuild.

### K7 · Income categories + versioned seed
- **Needs:** K1 · **Owns:** `packages/shared/src/categories.ts`, `core/firebase/session-repository.ts`, category screens (type segment)
- **Spec:** `docs/04` § Income categories.
- **Build:**
  - Category `type` (default `expense`).
  - The `INCOME_ESSENTIALS` seed.
  - `categoriesSeedVersion`.
  - Slug-collision handling (`_IN` suffix, else skip).
  - The strip, manage screen and preselect filter by type.
- **Done when:** unit tests cover the seed with no collision, with one collision,
  and with a double collision, plus a test that a re-run is idempotent.

### K8 · Insights kinds (pure) + Spend/Income/Net UI
- **Needs:** K4, K7 · **Owns:** `packages/shared/src/insights.ts` (+ tests), `features/expenses/screens/insights-screen.tsx`
- **Spec:** `docs/05` § Spend, Income, Net, `docs/17` § Refunds across periods.
- **Build:**
  - `periodSpend`, `periodIncome`, `periodNet`, `totalsByCategoryForKind`.
  - `clampRefunds`.
  - Negative categories sit outside `displayPercentages`.
  - The delta colour per view.
  - Excluded mirrors are filtered out.
- **Done when:** unit tests run over the `docs/05` acceptance fixture (expenses,
  refunds in the same and later periods, income, transfers, mirrors) and match
  hand-computed values. Percentages sum to 100 with a negative category present.

### K9 · Entry kind switch + income
- **Needs:** K2, K7 · **Owns:** `features/expenses/screens/expense-entry-screen.tsx`, `features/expenses/components/kind-switch.tsx`, `features/expenses/components/expense-row.tsx`
- **Spec:** `docs/17` § Entry: the kind switch, Income.
- **Build:**
  - The switch defaults to Spend.
  - Switching keeps the amount and description and resets the category.
  - The income strip.
  - The ledger row styles each kind.
  - `?kind=income` route param.
- **Done when:** `typecheck` exits 0 and `check:testids` exits 0. A pure test of the
  switch's state transitions passes.

### K10 · Refunds
- **Needs:** K9 · **Owns:** `packages/shared/src/expenses.ts` (`refundableRemainder`, `apportionRefund`), `app/expense/refund/[id].tsx`, the entry screen (refund mode), the detail sheet Refunds section
- **Spec:** `docs/17` § Refunds.
- **Done when:** unit tests cover the remainder after multiple refunds, an
  apportioned split refund whose parts sum exactly, refunds of mirrors, transfers
  or other refunds being refused, and the deleted-original case. `typecheck` exits 0.

### K11 · CSV v2 export
- **Needs:** K2 · **Owns:** `packages/shared/src/csv.ts`, `__tests__/csv.test.ts`
- **Spec:** `docs/08` § Export (columns v2).
- **Build:** v2 columns. The parser accepts the v1 and v2 headers.
- **Done when:** the round trip is exact for every kind, account names, `refundOf`,
  and a v1 file.

### K12 · `merchantKey` normaliser
- **Needs:** — · **Owns:** `packages/shared/src/merchants.ts` (+ tests), `packages/shared/src/merchants-aliases.ts`
- **Spec:** `docs/22` § Merchant keys.
- **Done when:** unit tests cover suffixes, refs, aliases, merchant and person
  VPAs (person VPAs produce `P2P:` and `isPerson`), empty input and Unicode.

### AC1 · `accounts.ts` (pure)
- **Needs:** K4 · **Owns:** `packages/shared/src/accounts.ts` (+ tests)
- **Spec:** `docs/18` § The balance, SMS account matching.
- **Build:**
  - `Account` type and validator.
  - `effectOf(tx)`.
  - `accountBalance(opening, flow, pendingDocs, markers)`.
  - `matchAccount(last4, accounts)`.
- **Done when:** unit tests cover the `docs/18` acceptance sequence (`−1,300`),
  the edit and move delta against a marker, and every row of the matching table.

### AC2 · Accounts repository + rules
- **Needs:** AC1, K3 · **Owns:** `features/accounts/api/**`, `features/accounts/hooks/**`, `firestore.rules` (accounts, accountBalances), `tests/firestore-rules/accounts.test.ts`
- **Done when:** `test:rules` passes, covering:
  - owner CRUD on `accounts`;
  - a bad `last4` or `type` is denied;
  - every client write to `accountBalances` is denied;
  - the owner can read `rollupApplied`.

### AC3 · Accounts screens + Orbit card
- **Needs:** AC2 · **Owns:** `app/accounts/**`, `features/accounts/screens/**`, `features/expenses/screens/orbit-screen.tsx` (card slot)
- **Spec:** `docs/18` § Screens.
- **Done when:** `typecheck`, `check:testids` and `check:a11y -- --max 0` exit 0.

### AC4 · Entry account chip
- **Needs:** AC2, K9 · **Owns:** the entry screen (account row), `features/accounts/components/account-chip.tsx`, `settings` (`lastAccountByKind`), `csv.ts` (account column already in K11, so only the test)
- **Spec:** `docs/18` § Entry sheet integration.
- **Done when:** `typecheck` exits 0. A pure test of the default-account choice
  covers archived and missing accounts.

### AC5 · Transfers
- **Needs:** AC4 · **Owns:** the entry screen (transfer mode)
- **Spec:** `docs/17` § Transfers.
- **Done when:** `typecheck` exits 0. The validation test (same account rejected)
  passes.

### SM1 · Credit, reversal, cashback and card-bill parsing
- **Needs:** K1 · **Owns:** `packages/shared/src/sms/{filters.ts,parser.ts,templates.ts}`, `__tests__/sms-*.test.ts`, `__tests__/fixtures/sms/*`
- **Spec:** `docs/12` § Filtering (from v1.2), `docs/17` § Credit SMS.
- **Build:**
  - `reversal` moves from an exclusion to a classification.
  - Credits get `direction: 'credit'`.
  - New templates for the credit shapes.
  - At least 20 new fixtures.
  - The privacy test still passes.
- **Done when:** `npm test` passes. Every fixture is classified as expected. OTP,
  promo and declined messages are still excluded.

### SM2 · `matchRefund` + `pairTransfers`
- **Needs:** SM1, K12 · **Owns:** `packages/shared/src/sms/{refund-match.ts,transfer-pair.ts}` (+ tests)
- **Spec:** `docs/17` § Refund matching, Transfer pairing.
- **Done when:** unit tests cover each match rule, the ranking order, the
  amount-only case with a unique candidate and with several candidates, and the
  pairing window at 9 and 11 minutes.

### SM3 · Ingest v2 + inbox cards per kind
- **Needs:** SM2, AC2, K3, K10 · **Owns:** `features/inbox/**`
- **Spec:** `docs/12` § The inbox (from v1.2), `docs/17` § Credit SMS.
- **Build:**
  - Ingest sets `kind`, `merchantKey`, `suggestedAccountId`, `suggestedRefundOf` and
    `pairedPendingId`.
  - Cards per kind.
  - Transfer merge in one batch.
  - The `It's income` / `Different purchase` actions.
- **Done when:** `npm test` passes (mobile model tests for the card view-model per
  kind and the merge batch plan), and `typecheck` exits 0.

### DP8 · Ledger filter facets: kind, account
- **Needs:** DP7, AC2 · **Owns:** `ledger-filter.ts` (+ test), the filter sheet, `firestore.indexes.json`
- **Done when:** unit tests cover both facets. The two indexes from `docs/11` are
  added.

### K13 · P2 Maestro flows
- **Needs:** K6, K8, K10, K11, AC3, AC5, SM3, DP8 · **Owns:** `e2e/flows/{income-add,transfer-add,refund-record,accounts-balances-offline,sms-refund-match,sms-transfer-pair}.yaml`
- **Done when:** `check:testids` exits 0.

---

## P3 — v1.3 Organise

### O1 · Sub-categories (shared)
- **Needs:** K7, D11 · **Owns:** `packages/shared/src/categories.ts`, `insights.ts` (`rollUpToParents`) (+ tests)
- **Spec:** `docs/04` § Sub-categories.
- **Done when:** unit tests cover every rule-table row, the parent and child
  `displayPercentages` each summing to 100, and that re-parenting changes the
  combined totals with no input change.

### O2 · Sub-categories UI
- **Needs:** O1, K8 · **Owns:** `features/categories/**`, `insights-screen.tsx` (expand children), `category-strip.tsx` (long-press)
- **Done when:** `typecheck` and `check:testids` exit 0. A pure test shows the
  archive cascade batch plan lists the children.

### O3 · Tags (shared, rules, repository)
- **Needs:** K3, D11 · **Owns:** `packages/shared/src/tags.ts` (+ tests), `features/tags/api/**`, `firestore.rules` (tags, `tagIds` size), `tests/firestore-rules/tags.test.ts`
- **Spec:** `docs/21`.
- **Done when:** unit tests cover the `normalizeTagSlug` table. `test:rules`
  passes, with 11 tags denied and a bad slug denied.

### O4 · Tags UI + ledger facet + tag insights
- **Needs:** O3, DP8 · **Owns:** the entry screen (More → Tags), `app/tags/**`, `features/tags/**`, `ledger-filter.ts`, `insights-screen.tsx` (tag scope), `csv.ts` (tags column test), `firestore.indexes.json`
- **Done when:** `typecheck` exits 0. Unit tests pass for the tag facet and the
  pinned-tag expiry. The CSV round trip covers tags.

### O5 · Merchant memory + merchant field
- **Needs:** K12, K3, D11 · **Owns:** `packages/shared/src/merchants.ts` (`suggestFromMemory`), `features/expenses/api` (merchant memory writes in the save batch), the entry screen (merchant field), `features/inbox` (`REMEMBERED`), `firestore.rules` (merchants), `csv.ts` (merchant test)
- **Spec:** `docs/22` § Merchant memory.
- **Done when:**
  - Unit tests cover the suggestion threshold table and re-categorisation moving
    one count.
  - `test:rules` denies a `P2P:` document id.
  - The CSV round trip covers merchant.

### O6 · Split lines (shared) + per-line rollups
- **Needs:** K5, D11 · **Owns:** `packages/shared/src/expenses.ts` (`validateLines`, `deriveCategoryFields`, `rescaleLines`), `rollups.ts` tests, `firestore.rules` (`lines` size), `functions` tests
- **Spec:** `docs/03` § Split across categories.
- **Done when:** unit tests cover the tie-break, rescale summing exactly, and
  rejection when lines don't sum. `test:functions` passes (a split doc's rollups
  are correct per line). `test:rules` passes (11 lines denied).

### O7 · Split lines UI
- **Needs:** O6 · **Owns:** the entry screen (More → Split), `features/expenses/components/split-lines.tsx`, `csv.ts` (lines test), `firestore.indexes.json` (`categoryIds`)
- **Done when:** `typecheck` exits 0 and the CSV round trip covers lines.

### O8 · `suggestCategories` callable
- **Needs:** O5 · **Owns:** `functions/src/suggest.ts`, `functions/src/index.ts`, `firestore.rules` (`aiUsage`), `tests/functions/suggest.test.ts`
- **Spec:** `docs/22` § Smart suggestions.
- **Build:**
  - Vertex AI client behind an interface, so tests stub it.
  - App Check enforcement + consume.
  - Daily cap.
  - Remote Config kill switch, model and prompt version (server-side).
  - Output validation.
- **Done when:** `test:functions` covers:
  - no App Check is rejected;
  - the cap is enforced;
  - unknown ids become `null`;
  - the payload snapshot contains only merchant names and category names.

### O9 · Smart suggestions setting + client flow
- **Needs:** O8 · **Owns:** `app/settings/suggestions.tsx`, `features/settings/**`, `features/inbox` (post-ingest suggestion pass)
- **Done when:** `typecheck` exits 0. A pure test shows the pass with the setting
  off makes no call plan, and person keys are never included.

### O10 · P3 Maestro flows
- **Needs:** O2, O4, O5, O7, O9 · **Owns:** `e2e/flows/{subcategory-create-and-insights,tags-add-filter-rename,merchant-memory-suggests,split-lines,smart-suggestions-optin}.yaml`
- **Done when:** `check:testids` exits 0.

---

## P4 — v1.4 Plan ahead

### B1 · `budgets.ts` (pure)
- **Needs:** O1, K8, D12 · **Owns:** `packages/shared/src/budgets.ts` (+ tests)
- **Spec:** `docs/19` § The budget, What counts, States.
- **Done when:** unit tests cover every `docs/19` acceptance item that is pure:
  `budgetFor`, nesting, refunds, mirrors, the state thresholds in integer maths,
  and clamping at 0.

### B2 · Budgets repository + rules + archive cascade
- **Needs:** B1 · **Owns:** `features/budgets/api/**`, `firestore.rules` (budgets), `tests/firestore-rules/budgets.test.ts`, the category archive batch (adds the budget archive)
- **Done when:** `test:rules` passes (the `amounts` map validated, delete denied).
  A unit test shows the archive batch includes the budget.

### B3 · Budgets screens + Orbit gauge
- **Needs:** B2 · **Owns:** `app/budgets/**`, `features/budgets/**`, the Orbit gauge slot
- **Done when:** `typecheck`, `check:testids` and `check:a11y -- --max 0` exit 0.
  A grep shows no `haptic(` call in the budget threshold code.

### RC1 · `recurring.ts` (pure)
- **Needs:** K1, D12 · **Owns:** `packages/shared/src/recurring.ts` (+ tests)
- **Spec:** `docs/20` § Occurrences, Schedule maths, Subscriptions screen.
- **Done when:** unit tests cover every case listed in `docs/20` § Schedule maths,
  plus `dueOccurrences` with skip, pause/resume, handled ids, the window edges, and
  `monthlyEquivalent` summing exactly.

### RC2 · Recurring repository + rules + index
- **Needs:** RC1, K3 · **Owns:** `features/recurring/api/**`, `firestore.rules` (recurring, `rec_` id rule), `tests/firestore-rules/recurring.test.ts`, `firestore.indexes.json`
- **Done when:** `test:rules` passes, with a `rec_` id mismatch denied and a bad
  `interval` denied.

### RC3 · Inbox Due group + recurring screens
- **Needs:** RC2, DP3 · **Owns:** `features/inbox/**` (Due group), `app/recurring/**`, `features/recurring/**`, the detail sheet "Make recurring…"
- **Spec:** `docs/20` § The inbox, Screens.
- **Done when:** `typecheck` exits 0. Mobile model tests cover the Due group
  view-model, collapsing at 30, and a "missed N" count.

### IN1 · Trend, projection, year, savings (pure)
- **Needs:** K8, RC1 · **Owns:** `packages/shared/src/insights.ts` (+ tests)
- **Spec:** `docs/05` § Trend, Month-end projection, Year view, Savings rate.
- **Done when:** unit tests cover:
  - no bars before the first transaction;
  - every projection guard case;
  - the formula sheet's parts summing to the result;
  - recurring excluded from the rate;
  - savings rate hidden without income and negative when spend exceeds income.

### IN2 · Insights v2 UI
- **Needs:** IN1, B2, DP5 · **Owns:** `insights-screen.tsx` and new section components, `PeriodKind` `year` wiring
- **Done when:** `typecheck` and `check:a11y -- --max 0` exit 0. Every number is in
  JetBrains Mono (grep for the `fonts.mono` style on each new text node).

### NT1 · Reminder planner (pure)
- **Needs:** RC1 · **Owns:** `apps/mobile/src/core/notifications/reminder-plan.ts` (+ test)
- **Spec:** `docs/25` § Scheduling, Recurring due.
- **Done when:** unit tests cover every `planReminders` case in the `docs/25`
  acceptance list, plus recurring-due entries.

### NT2 · `expo-notifications` wrapper + settings + invariant
- **Needs:** NT1 · **Owns:** `core/notifications/{notifications.ts,tokens.ts}`, `app/settings/notifications.tsx`, `apps/mobile/package.json`, `app.json`, `scripts/check-invariants.mjs` (+ test)
- **Build:**
  - Permission requested on toggle only.
  - Two channels.
  - Re-plan on foreground, on banking a day, and on settings change.
  - Narrow `mobile-no-push-registration` to `core/notifications/`.
- **Done when:**
  - `check:invariants` passes.
  - The positive-control test fails a file outside the folder.
  - `typecheck` exits 0.
  - The commit body says `NATIVE REBUILD NEEDED: expo-notifications`.

### B4 · P4 Maestro flows
- **Needs:** B3, RC3, IN2, NT2 · **Owns:** `e2e/flows/{budget-set-and-gauge,recurring-approve-skip,recurring-two-device-approve,insights-trend-projection,reminder-permission-on-toggle}.yaml`
- **Done when:** `check:testids` exits 0.

---

## P5 — v1.5 Squads

### G1 · `groups.ts` + `settle.ts` settlements (pure)
- **Needs:** K1, D13 · **Owns:** `packages/shared/src/{groups.ts,settle.ts}` (+ tests)
- **Spec:** `docs/23` § Data model, Mirrors, `packages/shared` changes.
- **Build:**
  - `allocationsFromSplit` (basis points).
  - `memberDeltas`.
  - `mirrorFor`.
  - `validateEntry`.
  - `computeBalances` with settlements and map allocations.
  - `generateInviteCode` (alphabet only, injectable RNG).
- **Done when:** unit tests show balances sum to 0 across random scenarios
  (property test), cover each split mode, the loan non-spend mirror and the
  currency-mismatch case (no mirror), and that `₹100 / 3` gives 34/33/33 by member
  order.

### G2 · Group converters + rules + attack tests
- **Needs:** G1, K3 · **Owns:** `firestore/documents.ts` (group docs), `firestore.rules` (groups/**, mirror user-owned fields, groupIndex, payees), `tests/firestore-rules/squads.test.ts`
- **Spec:** `docs/23` § Data, rules, indexes.
- **Done when:** `test:rules` has an allow test and an attack test for every row.
  The attack tests must include:
  - a foreign uid on a seat;
  - `memberUids` tampering;
  - setting `invalid`;
  - creating a `g_` mirror;
  - editing a server-owned mirror field;
  - a non-member write;
  - writing to an archived group.

### G3 · Entry and settlement triggers
- **Needs:** G2 · **Owns:** `functions/src/squads.ts`, `functions/src/index.ts`, `tests/functions/squads.test.ts`
- **Spec:** `docs/23` § The mirror Function (steps 1, 3, 4).
- **Done when:** `test:functions` covers:
  - balances equal `computeBalances`;
  - out-of-order convergence;
  - the invalid round trip;
  - the summary transfers.

### G4 · Mirrors + parser branch + `onGroupPrefWrite`
- **Needs:** G3, K5 · **Owns:** `functions/src/squads.ts` (step 2), `functions/src/handlers.ts` (mirror rows, coin skip), `firestore/documents.ts` (mirror branch), `tests/functions/mirrors.test.ts`
- **Done when:** `test:functions` covers:
  - mirrors per row of the `docs/23` mirror table;
  - user-owned fields survive an entry edit;
  - a left member is never re-mirrored;
  - an excluded re-flag;
  - no coins or check-ins from mirrors.

### G5 · Invites, leave, remove, reset seat, `deleteUserData` v2
- **Needs:** G4 · **Owns:** `functions/src/invites.ts`, `functions/src/cleanup.ts` (`deleteUserData`), `tests/functions/{invites,delete-user}.test.ts`
- **Spec:** `docs/23` § Invites and joining, Leaving…, Account deletion.
- **Done when:** `test:functions` covers every redeem failure code, the backfill
  creating the right mirrors, the leave guard on the server balance, ownership
  handover, and seat conversion leaving other members' balances unchanged.

### G6 · Hosting App Links + intent filter
- **Needs:** D13 · **Owns:** `hosting/public/**`, `firebase.json` (hosting block), `app.json` (`android.intentFilters`)
- **Spec:** `docs/11` § Hosting, `docs/14` § v1.5.
- **Done when:** `firebase.json` is valid JSON with a hosting rewrite and headers.
  `assetlinks.json` has a placeholder fingerprint list, commented in the commit
  body. The commit body says `NATIVE REBUILD NEEDED: App Links intent filter`.

### G7 · Dock change + You avatar
- **Needs:** D13 · **Owns:** `app/(tabs)/_layout.tsx`, `components/ui/tab-dock.tsx`, `app/you.tsx`, `app/(tabs)/squads.tsx` (placeholder screen), the Orbit header
- **Spec:** `docs/01` § Tab structure.
- **Done when:** `typecheck` and `check:testids` exit 0 (existing flows that tap the
  You tab are updated in the same commit).

### G8 · Squads screens: list, new, detail, members, settings
- **Needs:** G2, G7 · **Owns:** `app/squads/**` (except expense, settle, join), `features/squads/**`
- **Done when:** `typecheck`, `check:testids` and `check:a11y -- --max 0` exit 0.
  Mobile model tests cover the list view-model (per-group net, overall total,
  other-currency groups separate).

### G9 · Squad entry — Drag & Split + loans
- **Needs:** G8 · **Owns:** `app/squads/[id]/expense/**`, `features/squads/components/split-*.tsx`
- **Spec:** `docs/23` § Add / edit an entry.
- **Done when:** `typecheck` exits 0. A pure test of the split screen model (each
  mode, the remaining counters) passes. The check-in is written in the create
  batch (grep in the commit body).

### G10 · Settle up + Pay via UPI + settlement suggestions
- **Needs:** G8, SM2 · **Owns:** `app/squads/[id]/settle.tsx`, `features/squads/**` (settle), `features/inbox/**` (settlement suggestion card), `payees` repository
- **Done when:** `typecheck` exits 0. A pure test shows the UPI URL builder escapes
  every parameter, and nothing is recorded without a confirm (model test).

### G11 · Join flow + linking prompt
- **Needs:** G5, G6, G8, L3 · **Owns:** `app/i/[code].tsx`, `app/squads/join.tsx`, `features/squads/**` (join)
- **Done when:** `typecheck` exits 0. A model test maps every redeem error code to
  its copy.

### NT3 · Squad push: tokens, sender, mute
- **Needs:** NT2, G3 · **Owns:** `core/notifications/tokens.ts`, `functions/src/push.ts`, `functions/src/squads.ts` (call site), `tests/functions/push.test.ts`
- **Done when:** `test:functions` covers the recipient selection (the actor
  excluded, the muted excluded, not involved excluded) and pruning on a stubbed
  send failure.

### G12 · P5 Maestro flows
- **Needs:** G9, G10, G11, NT3 · **Owns:** `e2e/flows/{squad-create-offline,squad-split-modes,squad-settle-up,pair-lend-repay,squad-invite-claim,squad-leave-guard}.yaml`
- **Done when:** `check:testids` exits 0.

---

## P6 — v1.6 Reach

### IM1 · `import.ts` (pure)
- **Needs:** K11, D14 · **Owns:** `packages/shared/src/import.ts` (+ tests), `__tests__/fixtures/import/*` (5 bank formats)
- **Spec:** `docs/24` Steps 2–5.
- **Done when:** unit tests cover:
  - every fixture parses;
  - ambiguous dates require a choice;
  - thousands separators;
  - debit/credit columns;
  - the duplicate multiplicity case;
  - error rows (future date, zero amount, wrong currency, too many decimals);
  - Loop CSV mirror rows skipped.

### IM2 · `imports` rules + `finalizeImport`
- **Needs:** IM1, K5 · **Owns:** `functions/src/import.ts`, `functions/src/index.ts`, `firestore.rules` (imports, `imp_` id), `tests/functions/import.test.ts`, `tests/firestore-rules/imports.test.ts`, `firestore.indexes.json`
- **Done when:**
  - `test:functions`: 5,000 rows plus finalize equals a full rebuild, with zero
    coins and zero check-ins. Undo restores the result. Finalize is idempotent.
  - `test:rules`: an `imp_` id mismatch is denied, and a client cannot write
    `status: 'done'`.

### IM3 · Import UI, writer, recovery, undo
- **Needs:** IM2 · **Owns:** `app/import/**`, `features/import/**`, `apps/mobile/package.json`
- **Done when:** `typecheck` exits 0. A pure test shows the writer plan (chunks of
  400, deterministic ids, resume from a row). The commit body says
  `NATIVE REBUILD NEEDED: expo-document-picker`.

### W1 · `widget.ts` snapshot (pure)
- **Needs:** B1, D14 · **Owns:** `packages/shared/src/widget.ts` (+ tests)
- **Done when:** unit tests cover every item in the `docs/26` acceptance list that
  is pure.

### W2 · Quick actions
- **Needs:** D14 · **Owns:** `apps/mobile/package.json`, `app.json`, `core/quick-actions.ts`, `app/_layout.tsx` (held deep link)
- **Done when:** `typecheck` exits 0 and the commit body says
  `NATIVE REBUILD NEEDED: expo-quick-actions`.

### W3 · Android widget
- **Needs:** W1 · **Owns:** `apps/mobile/src/widget/**`, `apps/mobile/package.json`, `app.json`, `app/settings/widget.tsx`, `scripts/check-invariants.mjs` (no Firestore in the widget)
- **Done when:** `check:invariants` passes, with a positive control for the new
  rule. `typecheck` exits 0. The commit body says
  `NATIVE REBUILD NEEDED: react-native-android-widget`.

### IM4 · P6 Maestro flows + the full-ledger journey
- **Needs:** IM3, W2, W3 · **Owns:** `e2e/flows/{import-loop-csv-roundtrip,import-generic-bank,import-resume-after-kill,quick-action-log-expense,widget-hidden-amounts}.yaml`, `e2e/journeys/full-ledger-day-in-the-life.yaml`
- **Spec:** `docs/27` § Final gate.
- **Done when:** `check:testids` exits 0.

---

## Part 2 device queue (the owner runs these with Claude on the Android emulator)

| ID | What | Unlocks after | Ticks |
|---|---|---|---|
| D10 | **Native rebuild #1** (google-signin). P1 flows from L5, each twice. Real Google account link and reinstall restore. Phone OTP with the test number. A DST check of a backdated edit (set the emulator time zone to `America/New_York`). The force-update gate, by raising `min_supported_build` in the emulator Remote Config. | L5 + owner setup `docs/14` v1.1 | `docs/03`, `05`, `16` (P1 items) |
| D11 | P2 flows from K13, each twice. Migration rehearsal on an emulator export of a 5,000-expense seed: run twice, then check parity. An offline account balance with an `AS OF` tag. | K13 | `docs/17`, `18`, `08` (v1.2) |
| D12 | P3 flows from O10, each twice. Smart suggestions against the **real** Vertex AI on the dev project with a 5-merchant batch. Inspect the request log for the payload. | O10 + owner Vertex setup | `docs/04` (v1.3), `21`, `22` |
| D13 | **Native rebuild #2** (expo-notifications). P4 flows from B4, each twice. The reminder fires when the day isn't banked and is cancelled once it is. Recurring approved on two installs (reinstall and **I already use Loop**). | B4 | `docs/05` (v1.4), `19`, `20`, `25` (reminders) |
| D14 | **Native rebuild #3** (App Links). P5 flows from G12, each twice, with two emulator users. `adb shell pm get-app-links` shows `verified`. The fallback page opens when the app is uninstalled. A push arrives on the second user. | G12 + owner Hosting deploy | `docs/23`, `25` (push), `11` (v1.5) |
| D15 | **Native rebuild #4** (document-picker, quick-actions, android-widget). P6 flows, each twice. Widget screenshots in each size with amounts hidden and shown. A quick action from a cold start. A 5,000-row import plus a kill and resume. | IM4 | `docs/24`, `26` |
| D16 | The full-ledger journey, twice in a row. Reconcile every Part 2 doc checkbox. | D15 | v1.6 complete |

**Owner only (Part 2):**
- `docs/14` § Post-v1 setup, per release:
  - providers, SHA fingerprints, SMS region policy (v1.1);
  - Functions region decision and the migration run on prod (v1.2);
  - Vertex AI API, billing alerts and the Remote Config server keys (v1.3);
  - Hosting deploy and the Play App Signing fingerprint (v1.5).
- Update the Play data-safety form for v1.3 (merchant names sent to Gemini when
  opted in) and v1.5 (squad data shared with other members).
- Before each production release, raise `min_supported_build` per the deploy
  runbook (`docs/27`).
- iOS track: Apple enrolment, Apple provider, APNs key, AASA.
- Tag `v1.1.0` … `v1.6.0` after each phase's D item.
