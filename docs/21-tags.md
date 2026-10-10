# 21 — Tags

> **Release:** v1.3 (Phase P3 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `O*` (tags) in [`TASKS.md`](../TASKS.md).

Categories answer *what kind of spending*. Tags answer *what was it for*: `goa-trip`,
`wedding`, `work`, `reimbursable`. A transaction has exactly one category (or
split lines, see [03](03-expenses.md#split-across-categories)) and any number of
tags, up to 10.

## The tag

`users/{uid}/tags/{tagId}`, written by the client:

```ts
interface Tag {
  readonly id: string;            // random, stable forever
  readonly slug: string;          // normalised display key, unique among non-archived tags
  readonly name: string;          // what the user typed, trimmed, ≤ 24 chars
  readonly colorToken: CategoryColorToken | null;  // optional; null = muted outline
  readonly lastUsedAt: string;
  readonly createdAt: string;
  readonly archivedAt: string | null;
}
```

Transactions store **`tagIds: string[]`**, never names.

### Why ids, not names

Storing names on transactions makes **rename** and **delete** a rewrite of every
tagged transaction. Offline, the device only has part of the history in cache, so
the rewrite would silently miss the transactions it doesn't hold. With stable ids:

- **Rename** is a single write to `tags/{id}`. Every transaction shows the new
  name at once, offline included.
- **Delete** is a soft delete (`archivedAt`). Readers resolve ids against the
  registry and leave out archived tags from chips, filters and insights.
  Transactions are never touched.

## Normalisation

`normalizeTagSlug(input)` is pure, in `packages/shared/src/tags.ts`:

1. Trim, then lowercase (locale-independent).
2. Replace whitespace and `_` with `-`, and collapse repeats.
3. Strip everything outside `[a-z0-9-]`. Leading `#` is allowed and stripped.
4. Trim `-` from both ends.
5. Empty after this is invalid. Over 24 characters is cut to 24.

`Goa Trip!`, `goa-trip` and `#goa_trip` all produce the slug `goa-trip`. Typing an
existing slug **reuses** that tag. It never creates a duplicate. If the slug
belongs to an **archived** tag, that tag is unarchived and reused.

## Entry

Under **More** in the entry sheet: a **Tags** row with chips and an input.

- Typing filters existing non-archived tags by slug prefix, most recently used
  first, up to 6 suggestions.
- **Enter** or tapping *Create "goa-trip"* adds a new tag. The tag document is
  written **in the same batch** as the transaction.
- Recently used tags (the last 5 by `lastUsedAt`) appear as one-tap chips before
  typing.
- Limit: **10 per transaction**. At 10 the input disables with *"10 tags max"*.
  Haptic: `warning`.
- Saving bumps `lastUsedAt` on each used tag, in the same batch.

Tags never sit on the 10-second path. They are behind More and nothing requires
them.

### Sticky tags for trips

A **Pin tag** toggle on a tag chip (long-press) keeps that tag pre-applied to
every new transaction until it is unpinned or **7 days** pass, whichever comes
first. It is stored at `settings/app.pinnedTag: {tagId, until}`. The entry sheet
shows the pinned tag as a lime-outlined chip with ✕. It is meant for trips:
pin `goa-trip` on day one and every expense is tagged.

## Using tags

| Surface | Behaviour |
|---|---|
| Ledger row | Up to 2 tag chips after the description, then `+N` |
| Ledger filter ([03](03-expenses.md#ledger-filters)) | A **Tag** facet. Choosing tags filters to transactions with **any** of them |
| Insights | Choosing a tag in the filter bar scopes the whole Insights tab to that tag: total, category breakdown, days ([05](05-insights.md#tag-insights)) |
| Tag detail `/tags/[id]` | Total of all time and this month, category breakdown, and the ledger filtered by the tag |
| You → Tags `/tags` | All tags by last used, with count and total for the last 12 months. Rename, recolour and delete |

### Query shape

Firestore allows **one `array-contains` or `array-contains-any` per query**, and
`array-contains-any` takes at most 30 values. So:

- A **single** tag filter uses `tagIds array-contains X` plus the `localDate` range.
  Index: `tagIds (array) + localDate DESC`.
- **Several** tags use `array-contains-any` (≤ 30).
- Any other filter combined with tags runs **on the client** over the results
  ([03](03-expenses.md#ledger-filters)).
- Tag totals are always computed from a **bounded** query: tag plus period.
  Rollups do not carry tags. Adding a per-tag bucket would make every rollup
  document unbounded.

## Data and rules

| Path | Writer | Rules |
|---|---|---|
| `users/{uid}/tags/{id}` | Client | Owner read/write. `slug` matches `^[a-z0-9-]{1,24}$`. `name` is a string ≤ 24. Delete is denied; use `archivedAt` |
| `expenses.tagIds` | Client | When present: a list, `size() <= 10` |

Slug uniqueness is enforced on the **client**: the check runs against the cached
registry before creating a tag. Rules can't check uniqueness across documents.
Two devices creating the same slug offline produce two tags. The registry screen
detects duplicates and offers **Merge**, which rewrites the losing tag's
transactions in chunks and is **online only**, the one rewrite in this doc. The
loser is then archived.

## Haptics

| Action | Event |
|---|---|
| Add a tag to a transaction | `selection` |
| Hitting the 10-tag limit | `warning` |
| Pin / unpin a tag | `toggleOn` / `toggleOff` |
| Rename save | `splitConfirm` |
| Delete (archive) confirm | `warning`, then `destructive` |
| Merge duplicates | `splitConfirm` |

## Edge cases

| Case | Behaviour |
|---|---|
| A transaction references an archived tag | The chip is hidden in lists. The detail sheet shows it muted with *"deleted tag"*. Insights exclude it |
| A transaction references a tag id that doesn't exist | Ignored everywhere. No crash, no render |
| Rename to a slug that already exists | Blocked: *"#work already exists — merge instead?"* |
| Tag on a soft-deleted transaction | Not counted (all reads filter `deletedAt`) |
| Pinned tag gets archived | The pin is cleared |
| Import with a tags column | Comma- or semicolon-separated names → normalised → existing or new tags ([24](24-import.md#step-3-map-columns-generic-csv)) |
| Squad mirror | The user may add tags to their own mirror. These are user-owned fields ([23](23-squads.md#mirrors)) |
| CSV export | A `tags` column with names joined by `;`, resolved at export time ([08](08-data-model.md#export)) |

## Acceptance criteria

- [ ] `normalizeTagSlug` table tests cover the case, punctuation, `#`, length and
      empty rules.
- [ ] Renaming a tag offline changes the label on every cached transaction with
      zero transaction writes (verify with Firestore pending-writes count = 1).
- [ ] Deleting a tag removes it from chips, filters and Insights without touching
      any transaction document.
- [ ] Rules reject `tagIds` longer than 10.
- [ ] A single-tag ledger filter uses the indexed `array-contains` query (the
      emulator query log shows no full scan).
- [ ] The pinned tag auto-expires after 7 days.
