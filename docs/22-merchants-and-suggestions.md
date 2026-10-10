# 22 — Merchants and Category Suggestions

> **Release:** the merchant key ships in v1.2 (P2), because refund matching needs
> it. Merchant memory and smart suggestions ship in v1.3 (P3). See
> [27-full-ledger-plan.md](27-full-ledger-plan.md).
> **Tasks:** `K*` (normaliser) and `O*` (memory, suggestions) in [`TASKS.md`](../TASKS.md).

Most of the time, the same shop gets the same category. Loop learns that from the
user's own taps and pre-selects the category next time. For shops it has never
seen, it can optionally ask a model for a guess. Every suggestion is only a
pre-selection. **The user's tap still decides, and nothing is auto-approved**
([12](12-sms-ingest.md#post-mvp-auto-categorisation), [09](09-roadmap.md)).

## The merchant field

`expenses.merchant: string | null`. This is the shop or payee as the user would
say it: `Swiggy`, `Blue Tokai`, `ACME Corp`. It is ≤ 40 characters.

- **SMS proposals** fill it from the parsed template's `merchant` group
  ([12](12-sms-ingest.md#the-parser)).
- **Manual entry**: a **Merchant** field under **More**, with autocomplete from
  merchant memory (prefix match on `displayName`, up to 6, most recent first).
- **The description stays separate.** The description is *what* ("Dinner with
  Ana"), the merchant is *where* ("Toit"). If the description is empty, the
  ledger row shows the merchant, then the category name.
- Merchant is never required.

## Merchant keys

`merchantKey(raw)` is pure, in `packages/shared/src/merchants.ts`, and is the
identity used for memory and refund matching. **It ships in P2.**

Steps, in order:

1. Uppercase, then normalise Unicode to NFKC.
2. **UPI handles.** If `raw` looks like a VPA (`name@bank`):
   - **Merchant VPAs** have a known merchant prefix or the handle of a payment
     aggregator, e.g. `paytmqr…@paytm`, `…@ybl` with `q`-prefixed ids, or the
     shipped `MERCHANT_VPA_PATTERNS` list. The key is the VPA's merchant part with
     the digits stripped.
   - **Person VPAs** (anything else, e.g. `ravi.k93@okaxis`): the key is
     `P2P:` + a hash of the VPA, and the result is flagged `isPerson: true`.
3. Strip trailing reference noise: `REF\s*\d+`, `TXN\s*\w+`, runs of 6+ digits, and
   `*` and `#` segments.
4. Strip legal suffixes: `PVT`, `PRIVATE`, `LTD`, `LIMITED`, `LLP`, `INC`,
   `INDIA`, `IN`, as whole words at the end, repeatedly.
5. Strip punctuation, then collapse whitespace.
6. Apply the shipped **alias table** for known variants (`AMZN`, `AMAZON IN`,
   `AMAZON PAY` → `AMAZON`). It is about 50 entries, versioned with the template
   registry ([12](12-sms-ingest.md)) and overridable through Remote Config.
7. If the result is empty, there is no key (`null`).

`merchantKey('Swiggy Pvt Ltd REF 88812')` gives `SWIGGY`. `merchantKey('ravi.k93@okaxis')`
gives `P2P:3f9a…` with `isPerson: true`.

**Person payees are never sent to a model, never shown in suggestions, and never
stored in plain text in the merchant registry.** They are what squads and lending
use to suggest settlements ([23](23-squads.md#settlement-suggestions)).

## Merchant memory

`users/{uid}/merchants/{merchantKey}`, written by the client:

```ts
interface MerchantMemory {
  readonly displayName: string;                         // last non-empty raw merchant, cleaned
  readonly categoryCounts: Readonly<Record<string, number>>;  // categoryId → approvals/saves
  readonly lastCategoryId: string;
  readonly lastUsedAt: string;
  readonly ai: { readonly categoryId: string; readonly modelVersion: string; readonly at: string } | null;
}
```

- **Updated on every save or approval** of a transaction that has a merchant key
  and is **not** a person key. It is in the same batch as the transaction:
  `categoryCounts.{catId}: increment(1)` and `lastCategoryId`. `increment` merges
  correctly across offline devices.
- **Editing the category** of an existing transaction applies `increment(-1)` to
  the old category and `+1` to the new one. Re-categorising teaches the memory.
- **Deleting** a transaction does not decrement. The user did choose that category.

### When memory suggests a category

`suggestFromMemory(memory, activeCategories)`:

| Condition | Suggestion |
|---|---|
| Top category has **≥ 2** uses **and** ≥ **60%** of this merchant's total uses, and is active | That category, labelled `REMEMBERED` |
| Otherwise, `ai` is set and its category is still active | The AI category, labelled `SUGGESTED` |
| Otherwise | None. The normal most-used preselect applies ([03](03-expenses.md#add-expense)) |

Where it applies:

- **Inbox proposals**: `suggestedCategoryId` is set at ingest
  ([12](12-sms-ingest.md#the-pending-expense)). The card pre-selects it and shows
  the label.
- **Manual entry**: when the user picks a merchant from autocomplete **and has not
  touched the category yet**, the category switches to the suggestion with a
  `selection` haptic. A category the user chose is never overridden.

## Smart suggestions (AI)

For merchants with no useful memory, Loop can ask Gemini. It is **opt-in, off by
default**, and runs **only for inbox proposals**, in the background. It never
runs on the entry sheet, because waiting on a network call would break the
10-second rule.

### Where it runs: a callable Function

`suggestCategories` is an `onCall` Cloud Function that calls Gemini on **Vertex AI**
in the same Firebase/GCP project.

| Guard | How |
|---|---|
| Only the app can call it | `enforceAppCheck: true`, plus `consumeAppCheckToken: true` for replay protection. The client uses limited-use App Check tokens |
| Per-user daily cap | The server counts calls in `users/{uid}/aiUsage/{YYYY-MM-DD}` (`count`, Function-written). The cap comes from Remote Config `ai_daily_cap` (default **50 merchants/day**). Over the cap, it returns `resource-exhausted` |
| Kill switch | Remote Config `ai_suggestions_enabled` (server-side read). If off, it returns an empty result |
| Model and prompt | Remote Config `ai_model` (e.g. a Gemini Flash-Lite tier) and `ai_prompt_version`. The prompt lives in Function code, versioned. **The prompt never ships in the app binary** |
| Cost ceiling | A Cloud Billing budget alert on Vertex AI (owner action, [14](14-environment-setup.md)) |

#### Rejected alternative: `@react-native-firebase/ai` from the client

Calling the model from the client would be simpler. It was rejected because it
can't enforce a **per-user daily** cap (only per-minute rate limits), and the
prompt and category-mapping logic would ship inside the app, where they can be
read and changed. The callable keeps both server-side at the cost of one extra
hop. That doesn't matter, because suggestions are asynchronous.

### Request and response

```ts
// request — at most 20 merchants per call
{ merchants: string[] /* displayName, never a person key */,
  categories: { id: string; name: string; parent: string | null }[] /* active expense categories only */ }

// response
{ modelVersion: string,
  results: { merchant: string; categoryId: string | null; confidence: number }[] }
```

**Never sent:** amounts, dates, SMS bodies, account numbers, `last4`,
descriptions, notes, tags, or anything about the user. Only shop names and the
user's own category names.

The Function validates the model's output: every `categoryId` must be one of the
ids in the request. Anything else becomes `null`. A confidence below **0.5**
becomes `null`.

### Client flow

1. After an ingest pass ([12](12-sms-ingest.md#pipeline)), collect the pending
   proposals whose merchant key has no memory suggestion and no cached `ai`, and is
   not a person.
2. If **Smart suggestions** is on and the device is online, call
   `suggestCategories` with up to 20 unique merchants.
3. For each non-null result, write `merchants/{key}.ai` and update the pending
   proposal's `suggestedCategoryId`, `suggestionConfidence` and
   `suggestionModelVersion` (fields already in the schema, [12](12-sms-ingest.md#the-pending-expense)).
4. The inbox card shows the category pre-selected with a `SUGGESTED` tag.
5. **On approval**, the transaction records nothing about the AI. The merchant
   memory gets its normal increment, so the second approval turns it into a
   `REMEMBERED` suggestion with no model call.

The AI is called **at most once per merchant ever**, because the result is cached
on the merchant doc. The memory takes over from there.

### Settings

**You → Smart suggestions** (`/settings/suggestions`):

- A switch, off by default, with the copy: *"Suggest categories for new shops
  using Google's Gemini. Only the shop name and your category names are sent —
  never amounts, messages or account details."*
- Shows *"N suggestions used today"*.
- Stored at `settings/app.smartSuggestions: boolean`.

## Haptics

| Action | Event |
|---|---|
| Category auto-selected from memory in manual entry | `selection` |
| Smart suggestions toggle | `toggleOn` / `toggleOff` |

Suggestions arriving in the inbox fire nothing. They are not an event the user
caused.

## Edge cases

| Case | Behaviour |
|---|---|
| Suggested category was archived or deleted since | Treated as no suggestion |
| Memory counts tie (e.g. 2 FOOD, 2 GROCERIES) | Neither has ≥ 60%, so no memory suggestion. It falls through to AI or the default |
| Offline | No AI call. Memory works, because it is cached |
| Callable returns `resource-exhausted` | Stop calling for the rest of the local day. Proposals show without a suggestion |
| Model returns an unknown id | Rejected by the Function and treated as `null` |
| The user turns Smart suggestions off | No new calls. Cached `ai` values stay and are still shown. The setting copy says so. **Clear AI suggestions** deletes the `ai` fields |
| Person payee | Never sent to the model and never remembered by name. A settlement may be suggested instead |
| Two merchants normalise to one key | They share memory. Intended, since they're the same shop |
| One merchant has many legitimate categories (Amazon) | The 60% rule means no confident memory, and the user picks. Correct |
| `merchantKey` alias table updated by Remote Config | New saves use the new key. Old memory under the old key is orphaned and harmless. No migration |
| Account deletion | `merchants/` and `aiUsage/` are under `users/{uid}`, so `deleteUserData` removes them |

## Data and rules

| Path | Writer | Rules |
|---|---|---|
| `users/{uid}/merchants/{key}` | Client | Owner read/write. `categoryCounts` is a map of ints. `displayName` is a string ≤ 40. The doc id must not start with `P2P:` (person keys are never stored here) |
| `users/{uid}/aiUsage/{date}` | Functions only | Owner read. Client write denied |
| `expenses.merchant` / `expenses.merchantKey` | Client | Optional strings, ≤ 40 / ≤ 64 |

## Acceptance criteria

- [ ] `merchantKey` table tests: suffixes, refs, aliases, merchant and person VPAs,
      empty input, Unicode.
- [ ] Two approvals of `SWIGGY` into FOOD make the third proposal pre-select FOOD
      with `REMEMBERED`.
- [ ] Re-categorising a transaction moves one count from the old category to the
      new one.
- [ ] The callable rejects calls without App Check, enforces the daily cap, and
      returns `null` for ids outside the request (Functions tests with a stubbed
      model).
- [ ] A request payload captured in the Functions test contains only merchant
      names and category names (snapshot test).
- [ ] Manual entry never overrides a category the user already tapped.
- [ ] With Smart suggestions off (the default), the app makes zero
      `suggestCategories` calls.
