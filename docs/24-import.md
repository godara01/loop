# 24 — CSV Import

> **Release:** v1.6 (Phase P6 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `IM*` in [`TASKS.md`](../TASKS.md).

New users usually arrive with history in another app or a bank statement. Import
brings that history in, so Insights and budgets have something to compare against
from day one. It is also the second half of the export escape hatch: a Loop CSV
exported from one account imports into another losslessly.

## Principles applied

- **Nothing enters the ledger without a human tap.** Import always shows a preview,
  and nothing is written until the user taps **Import N transactions**.
- **Imported rows never bank days or award coins.** Logging history is not today's
  habit ([06](06-gamification.md#what-counts)).
- **Online only.** It is the one bulk write in the app. See [Why online-only](#why-online-only).
- **No guessing on ambiguity.** A date like `03/04/2026` can be two different
  days, so the user picks the format. Rows that can't be parsed are listed, not
  dropped quietly.

## Entry point

**You → Import** (`/import`). **Online only**: offline, the screen shows *"Import
needs a connection"* and nothing else.

## Step 1: pick a file

`expo-document-picker` with types `text/csv`, `text/comma-separated-values` and
`text/plain`.

| Check | Failure copy |
|---|---|
| Size ≤ **2 MB** | *"That file is too big (max 2 MB). Split it and import in parts."* |
| Decodes as UTF-8 (BOM allowed), else as Windows-1252 | *"Couldn't read that file."* |
| `.xlsx`, `.xls`, `.numbers` | *"Excel files aren't supported. Export as CSV first."*, detected by extension or magic bytes |
| ≤ **5,000** data rows | *"That's N rows — max 5,000 per import."* |
| At least 1 data row | *"No rows found."* |

## Step 2: recognise the format

| Detected | Behaviour |
|---|---|
| **Loop CSV**: the header equals `CSV_COLUMNS` v1 or v2 exactly ([08](08-data-model.md#export)) | No mapping step. Every field maps 1:1. Rows with `source = group` are **skipped**, because squad mirrors come from the squad, not from a file. That count shows in the preview |
| **Anything else** | The generic mapping step |

## Step 3: map columns (generic CSV)

The parser handles quoted fields, escaped quotes, embedded commas and newlines,
CRLF and LF, a trailing empty line, and `,` / `;` / `\t` delimiters (detected from
the header row).

The mapping screen shows the first 5 rows and one dropdown per Loop field:

| Loop field | Required | Accepted inputs |
|---|---|---|
| **Date** | Yes | A column. Then **Date format**: `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY`, `DD MMM YYYY`. The app pre-selects the format that parses **every** row. If two formats both parse every row (all days ≤ 12), there is **no pre-selection** and the user must pick, with a hint showing how row 1 reads each way |
| **Amount** | Yes | Either **one signed column** (negative = money out, or a toggle "positive = money out" for apps that export spend as positive), **or** two columns, **Debit** and **Credit** |
| Description | No | A column |
| Category | No | A column, then name mapping (step 4) |
| Type | No | A column whose values map to expense / income. Otherwise the sign or debit/credit decides |
| Account | No | A column, then name mapping |
| Merchant | No | A column |
| Tags | No | A column, split on `,` or `;` |
| Note | No | A column |

**Amount parsing** uses `parseAmount()` from [`money.ts`](../packages/shared/src/money.ts),
after stripping currency symbols, spaces and thousands separators (the separator
is detected: `1,234.50` vs `1.234,50`). **Never via a float.** An amount with more
fractional digits than the ledger currency allows is an error row, not a rounded
row.

**Currency.** If a currency column is mapped, rows not in the ledger currency are
error rows: *"USD — Loop has one currency"*. Without a currency column, every row
is assumed to be in the ledger currency, and the screen says so.

The mapping for a given header signature is remembered in
`settings/app.importMappings[hash(header)]`, so the same bank's export maps itself
next time.

## Step 4: map categories and accounts

- Each distinct category name in the file gets a row: *"Food & Drinks (124 rows) →
  [ FOOD ▾ ]"*. Pre-mapping order: an exact slug or name match (case-insensitive),
  then the catalogue ([04](04-categories.md)), then `OTHER` (or `OTHER_IN` for
  income). The options are any existing category, **Create "Food & Drinks"**, or
  OTHER.
- Each distinct account name is matched to an existing account, offered as
  **Create**, or set to *None*.

## Step 5: preview

`buildImportPlan(rows, mapping, existing)` is pure, in
`packages/shared/src/import.ts`, and produces:

| Bucket | Meaning | Default |
|---|---|---|
| **New** | Will be imported | Included |
| **Possible duplicates** | Match an existing transaction | **Excluded**, each with a toggle to include |
| **Errors** | Can't be imported: bad date, zero or unparsable amount, future date, wrong currency | Listed with row number and reason. Never imported |
| **Skipped** | Loop CSV squad mirror rows | Count only |

The preview header shows date span, counts per bucket, and totals for spend and
income across **New**.

### Duplicate detection

Fingerprint = `(localDate, kind, amountMinor, merchantKey ?? normalised description)`.
It is compared against existing live transactions in the file's date span, using
one bounded `localDate` range query.

**Matching counts multiples.** Count the fingerprint in the file (`f`) and in Loop
(`l`). The first `min(f, l)` rows of the file are marked duplicates, and the rest
are new. Two ₹50 coffees on 3 March in the file, with one already in Loop, gives
one duplicate and one new row. Dropping both would lose a real coffee.

Rows that are duplicates **within the file**, with no counterpart in Loop, are
imported: two identical coffees is a real thing.

## Step 6: write

**Import N transactions** (`press`, then `expenseSaved` on completion):

1. Generate `importId` (random) and write `users/{uid}/imports/{importId}`:
   `{status: 'writing', rowCount, createdAt, fileName, spanStart, spanEnd}`.
2. Write the new categories, tags and accounts first, in one batch.
3. Write the transactions in **batches of 400**, sequentially, awaiting each
   commit. This is the one place the app awaits writes, and it is online only.
   Each transaction has `source: 'import'`, `importId`, `kind`, `createdLocalDate`
   = today, and its own `localDate`.
4. A progress bar shows `n / N` in mono.
5. After the last commit is acknowledged, call `finalizeImport({importId})`, a
   callable that:
   - verifies the count,
   - rebuilds the user's rollups and account flows for the import's
     `[spanStart, spanEnd]` months (marker v2, the same code as `rebuildRollups`),
   - sets `imports/{id}.status = 'done'`.
6. Done screen: *"Imported 1,243 transactions"*, with **View in ledger** (filtered
   by `importId`) and **Undo import**.

### Why online-only

5,000 transaction writes each fire `onExpenseWrite`, and they all target the same
dozen monthly rollup documents. Firestore sustains about **one write per second
per document**, so 5,000 transactional updates to `monthlyRollups/2026-03` would
contend, retry and fail, leaving rollups drifted. So:

- `onExpenseWrite` **skips the rollup, flow and coin work** for
  `source == 'import'` creates ([11](11-firebase.md#cloud-functions)).
  `finalizeImport` rebuilds those months once, in bulk.
- Offline, 5,000 queued writes would sit in the RNFirebase queue and replay on
  reconnect with no progress UI. The bounded, awaited, online-only writer avoids
  that.

### If the app dies mid-import

The `imports/{id}` doc stays `status: 'writing'`. On next launch, the app finds
`writing` imports older than 2 minutes and shows a card: *"An import didn't
finish (812 of 1,243). [Finish] [Undo]"*.

- **Finish** re-runs from the first missing row. Transaction ids are
  deterministic (`imp_{importId}_{rowIndex}`), so rows already written are
  overwritten identically, not duplicated. Then it calls `finalizeImport`.
- **Undo**: see below.

`finalizeImport` is idempotent.

## Undo import

Available from the done screen, from **You → Import → History**, and from the
recovery card, for **24 hours** after `createdAt`.

1. Online check.
2. Query `importId == X` (index `importId + localDate`) and soft-delete in batches
   of 400 (`deletedAt`).
3. `finalizeImport({importId, undo: true})` rebuilds the span again.
4. `imports/{id}.status = 'undone'`.

Categories, accounts and tags created by the import are **not** removed. They may
have been used since, and leftover empty ones are harmless.

## Data and rules

| Path | Writer | Rules |
|---|---|---|
| `users/{uid}/imports/{id}` | Client creates. Function sets `done` | Owner read. Client create/update of `status` in `['writing','undone']` only |
| `expenses` with `source: 'import'` | Client | Normal transaction rules, plus: `importId` is a string, and the id matches `'imp_' + importId + '_' + <digits>` |
| `finalizeImport` | Callable, App Check | Caller must own the import |

Index: `expenses` on `importId ASC, localDate ASC`.

## Haptics

| Action | Event |
|---|---|
| Pick file | `tap` |
| Mapping dropdown change | `selection` |
| Import button | `press` |
| Import complete | `expenseSaved` |
| Error (file rejected) | `error` |
| Undo import confirm | `warning`, then `destructive` |

## Edge cases

| Case | Behaviour |
|---|---|
| A formula-injection cell (`=HYPERLINK(...)`) in a description | Stored as text. The export guard ([08](08-data-model.md#export)) escapes it again on the way out |
| Leading or trailing whitespace, smart quotes | Trimmed and normalised |
| A date with a time (`2026-03-04 18:22`) | The date part sets `localDate`. The time sets `occurredAt` in local time. Without a time, `occurredAt` is local noon |
| Future-dated row | Error row (the same rule as manual entry, [03](03-expenses.md#validation-summary)) |
| Zero amount | Error row |
| A refund in a bank statement (a credit with the same merchant as an earlier debit) | Imported as **income**. Import doesn't link refunds. The user can convert one later from its detail sheet |
| Transfers between own accounts | Imported as an expense and an income. The preview notes *"Transfers between your accounts will show as spend + income. You can merge them later."* |
| Huge category list (200 distinct names) | The mapping list virtualises. **Map all unmatched to OTHER** button |
| The same file imported twice | The second preview marks every row a duplicate. Nothing imports by default |
| A Loop CSV v1 (before kinds) | Every row is imported as `expense` |
| The user signs out mid-import | Blocked: the sign-out flow waits for pending writes ([16](16-account-linking.md#flow-sign-out)), and the import screen holds a wake lock |

## Acceptance criteria

- [ ] Loop CSV export → import into a fresh account recreates every non-mirror
      transaction with identical `amountMinor`, `kind`, `localDate`, category slug,
      account name, tags and note.
- [ ] Every row in the generic fixture set (5 bank formats under
      `packages/shared/src/__tests__/fixtures/import/`) parses with the expected
      mapping, and ambiguous-date fixtures force a format choice.
- [ ] Duplicate multiplicity: file {2× ₹50 coffee}, Loop {1×} gives 1 duplicate and
      1 new.
- [ ] Importing 5,000 rows on the emulator leaves rollups equal to a full
      `rebuildRollups` (Functions test), with zero coin ledger entries and zero
      check-ins created.
- [ ] Killing the app at batch 3 of 13 and choosing **Finish** produces exactly
      5,000 transactions (deterministic ids).
- [ ] **Undo** within 24h soft-deletes every imported row and restores rollups.
- [ ] Offline, the import screen does not allow starting.
