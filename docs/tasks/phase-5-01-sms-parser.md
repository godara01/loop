# Task 5 — Phase 5 (M7): SMS parser & dedupe (pure logic, no device)

**Depends on:** Task 4 (M6 gated)
**Blocks:** Tasks 7, 8 (both need the parser's types and functions)
**Runs independently of:** Task 6 (native module) — no shared files, safe to
do in parallel with it once Task 4 is closed.

## Objective

Build the pure, framework-free SMS parsing pipeline in
`packages/shared/src/sms/`. This is the only genuinely novel logic in Phase 5
and the only part testable with zero device or emulator — get it right and
correct here before anything native or UI depends on it.

Scaffolding already exists: `packages/shared/src/sms/types.ts`, `sender.ts`,
`templates.ts`, `sms.test.ts`. **Read them first.** This task's job is to reach
the full contract, not necessarily to start from scratch — `parser.ts` and
`dedupe.ts` (per the contract below) do not exist yet and are this task's main
deliverable.

## Context

Read [`docs/12-sms-ingest.md`](../12-sms-ingest.md) in full — it is short and
exact about the pipeline, filtering rules, and the parser's public shape.
Also read [`docs/00-product.md`](../00-product.md#explicit-non-goals-for-v1)
for why credits are out of scope (no income model).

## Flow (the pipeline this module implements)

```
SMS arrives
   ├─▶ sender filter   allowlist by DLT entity pattern (AD-HDFCBK, VM-ICICIB, JD-SBIINB, …) ─ no match ─▶ null, nothing stored
   ├─▶ shape filter    excludes OTP/balance-enquiry/promo/declined/reversal    ─ excluded ─▶ null
   ├─▶ parse           template registry → amount, merchant, last4, direction, confidence ─ no match or confidence < 0.6 ─▶ null
   └─▶ ParsedTransaction (debits only — credits are dropped, no income model)
```

Deliver these exact exports (already sketched, in this shape, in the existing
Phase 5 planning notes — treat this as the binding contract):

```ts
// packages/shared/src/sms/types.ts (extend existing)
export interface ParsedTransaction {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly direction: 'debit' | 'credit';
  readonly merchant: string | null;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly templateId: string;
  readonly confidence: number; // 0–1
}

// packages/shared/src/sms/parser.ts (new)
export function parseTransactionSms(
  body: string,
  sender: string,
  receivedAt: string,
): ParsedTransaction | null;

// packages/shared/src/sms/dedupe.ts (new)
export function isDuplicatePendingExpense(
  candidate: ParsedTransaction,
  existingPending: readonly PendingExpenseLike[],
  existingManualExpenses: readonly ManualExpenseLike[],
): boolean;
```

1. **Sender filter** (`sender.ts` — extend if the allowlist registry isn't
   pattern-based yet): match the 6-character DLT entity part against a shipped
   registry, not a fixed sender list.
2. **Shape filter**: hard-exclude anything with OTP/one-time-password markers,
   balance enquiries, promotional content, failed/declined transactions, and
   reversals (reversals are dropped entirely in MVP — matching them to the
   original debit is v1.1).
3. **Direction**: debits only. A credit message must return `null` even if
   otherwise well-formed.
4. **Parse**: template registry (`templates.ts`) is versioned, one entry per
   bank message shape (regex + field map + fixtures). Amounts parse straight
   to integer minor units via the existing `parseAmount()` in
   `packages/shared/src/money.ts` — this must correctly normalise Indian
   lakh/crore grouping (`1,00,000.00`) and `Rs.`/`INR`/`₹` prefixes. A parse
   below 0.6 confidence returns `null` rather than a low-confidence guess.
5. **Dedupe**: a candidate is a duplicate (and should be dropped before ever
   becoming a pending expense) if either holds:
   - another pending or approved expense with the same amount and same
     `accountLast4` within 10 minutes
   - a manually entered expense with the same amount within 30 minutes (the
     human beat the machine; the machine defers)

## Edge cases to handle

- Bank + card-network duplicate messages for one transaction must produce one
  pending item, not two (this is what `dedupe.ts` exists for).
- OTP messages must never produce a pending expense, including OTP messages
  from an otherwise-allowlisted bank sender.
- A message from a non-allowlisted sender must not be stored, parsed further,
  or counted anywhere — not even in a rejected-count metric that retains the
  body.
- The parser must record only `templateId` and `confidence` for telemetry —
  never the message body. Don't add a debug path that logs the raw body,
  even temporarily; it's a stated privacy commitment in `docs/12`, not a
  style preference.
- New bank formats must be addable without a store release — the template
  registry is designed to be overridden by Remote Config later (Task 6 wires
  that; this task just needs the registry shape to support it, e.g. a version
  field and a way to merge an override set over the bundled one).

## Files owned

`packages/shared/src/sms/types.ts`, `parser.ts`, `dedupe.ts`, `templates.ts`,
`sender.ts`, `sms.test.ts`. Nothing outside `packages/shared/src/sms/`.

## Testing

- L1 only — this is pure `packages/shared` code, `npm test` runs it.
- Build a fixture corpus of **at least 40 real message shapes** (Indian bank
  debit/credit formats, lakh grouping, OTP, promos, declined, reversals,
  credits) in `sms.test.ts` or a sibling fixtures file. Cover: correct parse
  with exact `amountMinor`, confidence cutoff (just above/below 0.6), sender
  allowlist accept/reject, each hard-exclusion category, dedupe within and
  outside the 10-minute/30-minute windows.
- `npm run typecheck`

## Definition of done

- [ ] `parseTransactionSms` and `isDuplicatePendingExpense` implemented exactly
      to the contract above
- [ ] ≥40-message fixture corpus, all passing
- [ ] Confidence cutoff, sender allowlist, and every hard exclusion category tested
- [ ] Dedupe tested at and around both time windows
- [ ] No code path logs or persists a raw message body
- [ ] `npm test` and `npm run typecheck` green
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode (this is one coherent leaf: pure logic, no
cross-cutting dependencies). Write `GATES.md` before implementing, with a gate
for the fixture-corpus size and pass rate, a gate per hard-exclusion category,
and a gate for the "no raw body persisted" privacy invariant — that last one
matters enough to be its own gate, not folded into a general "tests pass" gate.
