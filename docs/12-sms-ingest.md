# 12 — SMS Ingestion (Unapproved Expenses)

Read transaction SMS, propose an expense, and let the user approve it. Nothing
is ever written to the ledger without a human tap.

## Platform reality — read this first

| Platform | Capability |
|---|---|
| **Android** | Can read SMS with `RECEIVE_SMS` / `READ_SMS`. This is the feature. |
| **iOS** | **No SMS access exists.** There is no API, no entitlement, no workaround. Apple does not permit it. |

So SMS ingestion is an **Android-only feature**. iOS users get the same *inbox*
surface fed by manual routes:

- **Share sheet** — share a message or copied text into Loop, which parses it
  with the same parser and creates the same pending expense.
- **Paste to parse** — a "paste a transaction message" affordance in the inbox.

The inbox, the pending-expense model, the parser and the approval flow are all
shared. Only the *source* differs. Build it that way from the start — an
Android-shaped feature retrofitted for iOS later is a rewrite.

### Play Store risk

`READ_SMS` and `RECEIVE_SMS` are **restricted permissions** under Google Play's
SMS and Call Log policy. An app that is not the default SMS handler needs an
approved Permissions Declaration, and approval for a personal-finance use case is
**not guaranteed**. Plan for rejection:

1. **The app must be complete and valuable without SMS.** Manual entry is the
   primary path; SMS is an accelerant. If the declaration is refused, v1 ships
   unchanged minus one feature.
2. **Fallback:** an Android `NotificationListenerService` reading bank *
   notifications* instead of SMS. Different permission, same parser, same pending
   queue, and it is a config change behind the Remote Config flag — not a
   rewrite. It is also policy-sensitive; treat it as plan B, not plan A.
3. **Kill switch:** `remoteConfig.smsIngestEnabled`. If a policy or parser
   problem appears in production, the feature turns off without a store release.

Submit the declaration early. It is the single longest-lead item in v1.

## Native integration

There is no Expo module for this. Required:

- A small native Android module + Expo **config plugin**, exposing:
  - a `BroadcastReceiver` on `SMS_RECEIVED` for live messages
  - a `ContentResolver` query over the SMS inbox for backfill
  - a JS event emitter and a permission request bridge
- An **EAS development build**. This does not run in Expo Go — see
  [10-architecture.md](10-architecture.md#build-and-workflow-consequence).
- The receiver does the absolute minimum on the main thread: hand the message to
  a JS task, return.

## Pipeline

```
SMS arrives
   │
   ├─▶ sender filter        Is this a known bank/card sender id?      ─ no ─▶ drop, nothing stored
   │
   ├─▶ shape filter         Does it look like a debit/credit?         ─ no ─▶ drop (OTPs, promos)
   │
   ├─▶ parse                Template registry → amount, merchant,     ─ fail ─▶ drop + anonymous
   │                        account last4, timestamp, direction                 telemetry counter
   │
   ├─▶ dedupe               Against pending + existing expenses       ─ dup ─▶ drop
   │
   └─▶ write pendingExpense status: 'pending'
            │
            └─▶ inbox badge; user approves / edits / dismisses
                     │
                     └─▶ approved ─▶ real expense (source: 'sms')
```

**Every step happens on-device.** No SMS body is ever uploaded, not to Firestore,
not to Crashlytics, not to Analytics. This is both the right thing and a Play
policy requirement.

## Filtering

- **Sender allowlist by pattern**, not a fixed list. Indian DLT headers look like
  `AD-HDFCBK`, `VM-ICICIB`, `JD-SBIINB`; the allowlist matches the 6-character
  entity part against a shipped registry.
- **Hard exclusions:** anything containing OTP/one-time-password markers, balance
  enquiries, promotional content, and failed/declined transactions. In MVP,
  reversals are also dropped.
- **Direction:** MVP ingests **debits only**. Credits are income, and the MVP has
  no income model.
- **From v1.2**, credits and reversals become proposals instead of being dropped
  ([17](17-money-in-and-out.md#credit-sms)):
  - A credit becomes pending **income**. Cashback goes to `CASHBACK`.
  - A reversal or refund becomes pending **refund**, with a suggested original from
    `matchRefund`.
  - A card bill payment becomes pending **transfer**.
  - Same-amount debit and credit across two of your accounts within 10 minutes are
    paired as a transfer (`pairTransfers`).
  - A person-to-person UPI payment matching an open squad balance becomes a
    settlement suggestion (v1.5, [23](23-squads.md#settlement-suggestions)).

  `classifyExclusion` keeps excluding OTP, balance, promo and declined messages.
  `reversal` moves from an exclusion to a classification. `isCredit` stops being a
  drop and becomes a direction, and `ParsedTransaction.direction` (already typed
  `'debit' | 'credit'`) is finally set to `'credit'`. The fixture corpus grows by at
  least 20 credit, reversal, cashback and card-bill messages.

## The parser

Lives in `packages/shared/src/sms/` — pure functions, no React, no native, so it
is unit-testable against a corpus of real message shapes with zero device.

```ts
export interface ParsedTransaction {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly direction: 'debit' | 'credit';
  readonly merchant: string | null;
  readonly accountLast4: string | null;
  readonly occurredAt: string;
  readonly templateId: string;      // which template matched
  readonly confidence: number;      // 0–1
}

export function parseTransactionSms(body: string, sender: string, receivedAt: string):
  ParsedTransaction | null;
```

- **Template registry**, versioned, one entry per bank message shape, each with a
  regex, field map, and test fixtures. New bank formats appear constantly, so the
  registry is **delivered by Remote Config** and only falls back to the bundled
  copy — a new bank format must not require a store release.
- Amounts are parsed straight to **integer minor units** with `parseAmount()`.
  Currency symbols, Indian lakh/crore grouping (`1,00,000.00`) and `Rs.`/`INR`/`₹`
  prefixes all normalise to the same integer.
- A parse below **0.6 confidence** is discarded rather than shown. A wrong
  suggestion costs more trust than a missing one.
- The parser records only `templateId` + `confidence` in telemetry. Never the body.

## Deduplication

A transaction commonly generates two messages (bank + card network), and the user
may also have typed it manually. A pending expense is dropped if any of these
already exists:

- Another pending or approved expense with the **same amount, same `accountLast4`,
  within 10 minutes**
- A **manually entered** expense with the same amount within 30 minutes — the
  human beat the machine, and the machine defers

Dedupe runs against the local Firestore cache, so it works offline.

## The pending expense

`users/{uid}/pendingExpenses/{pendingId}` — see
[11-firebase.md](11-firebase.md#firestore-data-model).

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
  /** Post-MVP auto-categorisation writes these. Null in MVP. */
  suggestedCategoryId: string | null;
  suggestionConfidence: number | null;
  suggestionModelVersion: string | null;
  /** Set on approval. */
  expenseId: string | null;
  /** Masked for user recognition: "HDFC ••1234 · SWIGGY". Never the raw body. */
  displayHint: string;
  // ——— v1.2, all optional (the rules key set gains them as optional) ———
  kind?: 'expense' | 'income' | 'refund' | 'transfer';   // missing → 'expense'
  merchantKey?: string | null;                            // docs/22
  suggestedAccountId?: string | null;                     // from accountLast4, docs/18
  suggestedRefundOf?: string | null;                      // docs/17
  pairedPendingId?: string | null;                        // transfer pairing, docs/17
}
```

**Two definitions today.** `packages/shared/src/types.ts` and
`packages/shared/src/sms/types.ts` each define `PendingExpense`, with different
shapes (`total: Money` vs `amountMinor` + `currency`). The barrel exports the
first and the converters use the second. P2 (task `K1`) merges them into the
`sms/types.ts` shape, which is the stored one, before adding fields.

**Recurring proposals are not pending expenses.** They are computed from the
rules and stored only when approved ([20](20-recurring.md#occurrences-are-computed-not-stored)).
The inbox shows both.

**Pending expenses are not expenses.** They are excluded from every total, every
chart, the streak, and coins, until approved. Anything else would mean the app's
headline number was written by a regex.

## The inbox

**Route:** `/(tabs)/index` badge → `/inbox`. Reachable from Orbit, with a count
badge when pending items exist.

Each card shows: amount (large, mono), merchant, masked account, time, and a
category chip the user must pick (MVP) or confirm (post-MVP).

| Action | Result | Haptic |
|---|---|---|
| **Approve** | Creates the expense, marks pending `approved`, links `expenseId` | `expenseSaved` |
| **Edit & approve** | Opens the normal entry sheet pre-filled, then saves | `expenseSaved` |
| **Dismiss** | Marks `rejected`. Never deleted — rejections are the training signal for post-MVP categorisation | `destructive` |
| **Approve all** | Only offered when every card has a category; confirms with a count | `expenseSaved`, once |

- Cards are ordered newest first, grouped by day.
- Pending items **expire after 30 days** (`status: 'expired'`) so the inbox never
  becomes a graveyard.
- The inbox is empty by default and shows *"Transaction messages will show up
  here for you to approve."*
- **From v1.2** cards render per kind: income cards have a lime `+`, refund cards
  show the suggested original with **Yes / Different purchase / It's income**,
  and transfer pairs show one combined card with **Merge / Keep separate**. The
  account chip is pre-selected from `accountLast4` when exactly one account
  matches ([18](18-accounts.md#sms-account-matching)).
- **From v1.3** the category chip is pre-selected from merchant memory
  (`REMEMBERED`) or an opt-in AI suggestion (`SUGGESTED`)
  ([22](22-merchants-and-suggestions.md)).
- **From v1.4** a **Due** group for recurring occurrences sits above the SMS items
  ([20](20-recurring.md#the-inbox)).

### Approval, streaks and coins

- The **arrival** of an SMS never advances the streak and never awards coins.
  Automated engagement is not engagement — it would hollow out the exact habit
  the streak defends.
- **Approving** does bank the day and award `expense_logged` coins, because the
  user opened the app and made a decision. See
  [06-gamification.md](06-gamification.md).
- Approving several at once awards coins under the same daily cap as manual
  entry. No cap arbitrage.
- **From v1.2**, approving income or a refund banks the day without logging
  coins, and a transfer does neither. The full matrix is in
  [06](06-gamification.md#what-counts).
- Approving a **backdated** message does not fill in a past streak day
  ([06](06-gamification.md#backdating)).

## Permissions UX

- Never requested at launch. Requested from an **explainer screen** in You →
  *Auto-capture*, or from a one-time card on Orbit after the third manual expense
  (by which point the value is obvious).
- The explainer states plainly: *"Loop reads only transaction messages from banks,
  on your device. Nothing is uploaded, and nothing is added without your approval."*
- Denial is fine and permanent-friendly: the card never asks twice, and everything
  keeps working.
- On grant: backfill the **last 30 days** of the SMS inbox in one pass, so the
  feature proves itself immediately.

## Privacy commitments

These are load-bearing product promises, not implementation details:

1. Message bodies never leave the device.
2. Only extracted structured fields and a masked `displayHint` are persisted.
3. No message from a non-allowlisted sender is stored, parsed further, or counted.
4. Turning the feature off deletes every `pending` item and stops the receiver.
5. The privacy policy and the Play data-safety form say exactly this.
6. **From v1.3**, only with **Smart suggestions** turned on (off by default),
   extracted **merchant names** (never bodies, amounts or accounts, and never
   person payees) are sent to the `suggestCategories` Function and Gemini on
   Vertex AI ([22](22-merchants-and-suggestions.md#request-and-response)). The
   data-safety form and the privacy policy are updated in the P3 release.

## Post-MVP: auto-categorisation

**Now specified in [22-merchants-and-suggestions.md](22-merchants-and-suggestions.md).**
In summary:

1. **v1.2: merchant key.** `merchantKey()` normalises the parsed merchant. Person
   UPI handles are hashed and flagged, never stored or sent anywhere in plain text.
2. **v1.3: merchant memory.** Approvals and re-categorisations count per merchant
   on device (`users/{uid}/merchants/{key}`). Two approvals with ≥ 60% agreement
   pre-select the category (`REMEMBERED`).
3. **v1.3: smart suggestions (opt-in).** For merchants with no memory, the
   `suggestCategories` callable asks Gemini on Vertex AI, sending only merchant
   names and category names. The result is cached per merchant, so each merchant
   is asked once.
4. **Never auto-approve.** Even at high confidence, the tap stays. The tap *is*
   the habit.

The original plan of "a server classifier trained on rejections" is replaced by
per-user memory. Rejections are still recorded (`rejected` is never deleted), and
remain available if a trained model is ever justified.

## Acceptance criteria

- [ ] iOS builds contain no SMS permission, no SMS code, and a working
      share-sheet + paste path into the same inbox.
- [x] With SMS permission denied, every other feature works unchanged.
      (proof: e2e/flows/sms-permission-denied.yaml on Loop_API35, build `6d928d7b`,
      2026-09-28 — both permissions denied, then log, coins, ledger, Insights and
      the inbox's paste path)
- [x] `remoteConfig.smsIngestEnabled = false` fully disables capture at runtime.
      (proof: Loop_API35, build `6d928d7b`, 2026-09-28 — flag published to
      loop-app-0403: on → an SMS is captured; off → after the app next comes to
      the foreground an SMS is ignored; on again → captured. Real-time updates
      never arrived on the emulator, so `lib/remote-config.ts` re-fetches on every
      foreground (15 min minimum in release) rather than relying on them.)
- [x] No SMS body appears in Firestore, Storage, Crashlytics, Analytics, or logs
      — verified by inspection of a real device session.
      (proof: Loop_API35, build `6d928d7b`, 2026-09-28 — sms-privacy's Firestore
      scans for a unique body fragment before and after approval; a full logcat
      of that session has no line with the fragment, the balance or the merchant
      from any process, and none of Loop's 834 lines has the amount, card or
      "Avl bal"; Storage holds only category logos. No Analytics SDK is in the
      app; Crashlytics' only call site is `app-check-init`. Emulator, not a
      physical phone — repeat once on the Redmi.)
- [x] An OTP message never produces a pending expense.
      (proof: packages/shared/src/__tests__/sms-parser.test.ts › "returns null for an OTP from an allowlisted bank")
- [x] Bank + card-network duplicates of one transaction produce one pending item.
      (proof: packages/shared/src/__tests__/sms-dedupe.test.ts › "collapses a bank SMS and a card-network SMS 2 minutes apart")
- [x] A manually entered expense suppresses the matching SMS item.
      (proof: packages/shared/src/__tests__/sms-dedupe.test.ts › "matches a manual expense on amount alone, with no account number in play")
- [x] Pending items are absent from every total, chart, streak and coin award.
      (proof: scripts/check-invariants.mjs rule 6 "pending-expenses-location")
- [x] The parser suite runs with no device and no emulator, against a fixture
      corpus of at least 40 real message shapes.
      (proof: packages/shared/src/__tests__/sms-corpus.test.ts › "has at least 40 entries covering at least 4 banks")
