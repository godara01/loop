# Task 7 — Phase 5 (M7): pendingExpenses rules + repository

**Depends on:** Task 5 (parser types/contract)
**Blocks:** Task 8

## Objective

Add the `pendingExpenses` Firestore data model, security rules, and the
repository that the inbox UI (Task 8) will read and write through. This is the
trust boundary for the whole SMS feature: the client never gets to write a
real expense from a parsed SMS without a human tap, and no raw message body
may ever reach Firestore.

## Context

Read [`docs/12-sms-ingest.md`](../12-sms-ingest.md#the-pending-expense) for
the exact `PendingExpense` shape and
[`docs/11-firebase.md`](../11-firebase.md) for how existing collections
(`expenses`, `categories`) declare paths, converters, and rules, so this
follows the same pattern rather than inventing a new one. Look at
`packages/shared/src/firestore/paths.ts` and `documents.ts` for the existing
`expenseToDoc`/`parseExpense` pattern from M3 — `pendingExpenses` needs the
equivalent pair.

## Flow

1. `packages/shared/src/firestore/paths.ts`: add
   `paths.pendingExpense(uid, id)` alongside the existing path builders.
2. `packages/shared/src/firestore/documents.ts`: add the `PendingExpense`
   converter pair, matching this shape exactly (from `docs/12`):
   ```ts
   interface PendingExpense {
     id: string;
     status: 'pending' | 'approved' | 'rejected' | 'expired';
     amountMinor: number;
     currency: CurrencyCode;
     merchant: string | null;
     accountLast4: string | null;
     occurredAt: string;
     receivedAt: string;
     source: 'sms' | 'shared' | 'pasted';
     templateId: string;
     confidence: number;
     suggestedCategoryId: string | null;      // always null in MVP
     suggestionConfidence: number | null;      // always null in MVP
     suggestionModelVersion: string | null;    // always null in MVP
     expenseId: string | null;                 // set on approval
     displayHint: string;                      // masked, e.g. "HDFC ••1234 · SWIGGY"
   }
   ```
   **Note there is no `body` field** — the raw SMS text must never be written
   to this document. This is the single most important property of this task.
3. `firestore.rules`: add rules for `users/{uid}/pendingExpenses/{id}` —
   owner-only read/write, `status` constrained to the enum, and (per
   `docs/12`'s acceptance criteria) verify at the rules level that no document
   shape containing a `body`-like field can be written. Follow the pattern
   `checkIns` already uses for create-only semantics where relevant (an
   externally-created pending item shouldn't be freely rewritable to fabricate
   history, but the user must be able to transition `pending` → `approved` /
   `rejected`).
4. `apps/mobile/src/features/inbox/api/pending-expenses-repository.ts`:
   ```ts
   export function createPendingExpense(uid: string, parsed: ParsedTransaction, source: PendingExpense['source']): Promise<string>;
   export function listenPendingExpenses(uid: string, onChange: (items: PendingExpense[]) => void): () => void;
   export function approvePendingExpense(uid: string, pendingId: string, categoryId: string, edits?: Partial<ExpenseDraft>): Promise<void>;
   export function dismissPendingExpense(uid: string, pendingId: string): Promise<void>;
   export function approveAllPendingExpenses(uid: string, approvals: { pendingId: string; categoryId: string }[]): Promise<void>;
   ```
   `approvePendingExpense` and `approveAllPendingExpenses` must write the real
   expense (`source: 'sms'`, `pendingId` linking back) **and** mark the
   pending item `approved` with `expenseId` set, **in one batch** — coins and
   streak then follow automatically through the existing `onExpenseWrite`
   Function from M6 (no separate coin/streak logic here).
5. `displayHint` construction (e.g. `"HDFC ••1234 · SWIGGY"`) happens wherever
   a `ParsedTransaction` becomes a `PendingExpense` — likely in
   `createPendingExpense` — and must never include the raw body, only the
   already-extracted structured fields.

## Edge cases to handle

- **Pending expenses must be excluded from every total, chart, streak, and
  coin award** until approved — confirm the queries feeding Insights (Task 2)
  and the streak/coin Functions (Task 3) genuinely can't see
  `pendingExpenses` documents (they're a separate subcollection, so this
  should already hold structurally — verify it, don't assume it).
- **30-day expiry**: pending items must transition to `status: 'expired'`
  after 30 days so the inbox never becomes a graveyard. Decide here whether
  this is a scheduled Function (Phase 6 territory, per `docs/13`'s M8 scope —
  `cleanupSoftDeleted` and pending-expense expiry are grouped there) or a
  client-side filter for now with the real cleanup Function deferred to Task
  11 (`phase-6-02-scheduled-cleanup.md`). Prefer the latter to avoid scope
  creep into Phase 6: filter expired-but-not-yet-swept items out of
  `listenPendingExpenses`'s results client-side, and leave the actual
  Firestore field update to the Phase 6 scheduled Function.
- **Dismiss never deletes** — rejections are the training signal for
  post-MVP categorisation (`docs/12`). `dismissPendingExpense` sets `status:
  'rejected'`, full stop.
- **Approve all** must only be callable when every pending card has a
  category assigned — enforce this in the repository function's contract
  (reject the call with a clear error if any `approvals` entry is missing a
  `categoryId`) so the UI (Task 8) can't accidentally bypass it.
- Rules test: a client must not be able to set `expenseId` directly on create,
  only through the approval path (which itself goes through the batch in step
  4, not a raw client field-set) — write a rules test that a raw
  `pendingExpenses` write with a nonempty `expenseId` and `status: 'pending'`
  is rejected if that combination shouldn't exist.

## Files owned

`firestore.rules` (pendingExpenses section only), `tests/firestore-rules/*`
(add a pendingExpenses test file), `packages/shared/src/firestore/paths.ts`,
`packages/shared/src/firestore/documents.ts`,
`apps/mobile/src/features/inbox/api/*`.

## Testing

- L1: `PendingExpense` converter round-trip and malformed-input rejection, in
  `packages/shared/src/__tests__/`.
- L2 (`npm run test:rules`): owner-only access; `status` enum enforcement; no
  document containing a `body` field is ever accepted (positive control: try
  writing one and confirm it's rejected); the approve-path field constraints
  from the edge case above.
- Manual/emulator: create a pending item via the Firestore emulator directly
  (simulating what Task 6's native module + Task 5's parser will produce),
  confirm `listenPendingExpenses` surfaces it, confirm `approvePendingExpense`
  produces exactly one new expense document and updates the pending item in
  the same batch.

## Definition of done

- [ ] `PendingExpense` converter pair implemented, round-trip tested, no `body` field anywhere in the shape
- [ ] `firestore.rules` pendingExpenses section written and covered by `test:rules`
- [ ] Repository functions implemented exactly to the contract above
- [ ] Approve path writes the expense and updates the pending item atomically
- [ ] Pending items confirmed invisible to Insights/streak/coins queries
- [ ] `npm test`, `npm run typecheck`, `npm run test:rules` green
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. This leaf is judgment-tier (security rules
design). Write `GATES.md` before implementing, with an explicit gate for "no
raw body ever accepted" that includes a positive control (write a body-bearing
document and confirm the rules reject it) — an absence check without a
positive control can pass by accident if the test itself is malformed.
