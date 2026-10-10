# 04 — Categories

Three tiers, deliberately:

1. **Essentials** — a small set installed at onboarding so the app works immediately.
2. **The catalogue** — a large, browsable library with logos that the user adds
   from in one tap.
3. **Custom** — the user's own name, logo and colour.

Most apps get this wrong by shipping 40 categories nobody wants. Loop ships 8,
and makes adding the 9th feel like picking from a shelf.

## The change this requires

Today, [`types.ts`](../packages/shared/src/types.ts) defines categories as a
closed string union:

```ts
export type ExpenseCategory = 'DINING' | 'GROCERIES' | ... | 'OTHER';
```

User-created categories cannot exist in a compile-time union, so **v1 turns
categories into data**. This is the one breaking change to `@loop/shared` that v1
requires, and it MUST land before expense entry is built:

- `Expense.category: ExpenseCategory` → `Expense.categoryId: string`
- The union survives as `EssentialCategorySlug`, used only to seed.
- A `Category` entity, defined in shared, framework-free.
- Anything rendering a category takes a `Category`, never a raw string, so an
  archived or renamed category can't print a stale label.

```ts
export interface Category {
  readonly id: string;
  /** Uppercase, unique per user, ≤ 12 chars — what the mono tag prints. */
  readonly slug: string;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly colorToken: CategoryColorToken;
  readonly kind: 'essential' | 'catalogue' | 'custom';
  /** Set when added from the catalogue, so updates can be matched later. */
  readonly catalogueSlug: string | null;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly archivedAt: string | null;
}

export type CategoryIcon =
  | { readonly kind: 'glyph'; readonly name: string }        // @expo/vector-icons
  | { readonly kind: 'image'; readonly path: string };       // Storage path
```

## Tier 1 — Essentials

Installed during onboarding ([02](02-onboarding.md#step-4--categories)), `kind:
'essential'`. Eight, not ten — every category on this list must be one almost
everyone uses weekly.

| Slug | Name | Glyph |
|---|---|---|
| `FOOD` | Food & dining | `restaurant` |
| `GROCERIES` | Groceries | `basket` |
| `TRANSPORT` | Transport | `car` |
| `BILLS` | Bills & utilities | `flash` |
| `SHOPPING` | Shopping | `pricetag` |
| `HEALTH` | Health | `medkit` |
| `FUN` | Entertainment | `game-controller` |
| `OTHER` | Other | `ellipsis-horizontal` |

Essentials are renamable and recolourable but **not deletable** — only archivable.
`OTHER` cannot even be archived: it is the fallback for orphaned expenses.

## Tier 2 — The catalogue

**Route:** `/category/catalogue`, reachable from the entry sheet's **+** chip and
from **You → Categories → Add**.

A browsable library of ~60 categories, each with a name, logo and suggested
colour, grouped into sections: *Food, Transport, Home, Health, Money, Lifestyle,
Work, Travel, Family, Education*. Examples: Coffee, Swiggy/food delivery, Fuel,
Cab, Metro, Rent, Maintenance, Internet, Mobile recharge, Subscriptions, Gym,
Pharmacy, Insurance, EMI, Investments, Gifts, Pets, Childcare, Salon, Laundry,
Books, Courses, Flights, Hotels, Parking, Tolls, Charity.

- **Storage:** `catalog/categories/{slug}` in Firestore, read-only to clients
  ([11-firebase.md](11-firebase.md#firestore-data-model)). The catalogue can grow
  without a store release.
- **Bundled fallback:** the same list ships in
  `packages/shared/src/categories.ts` so a first launch with no network still has
  a full catalogue. Firestore wins when it is newer (`catalog/meta.version`).
- **Logos:** each entry has a glyph name **and** an optional logo image URL.
  Glyphs render instantly and offline; the image is a progressive enhancement,
  cached by `expo-image`. A missing image never blocks a category — it falls back
  to the glyph. Never a blank tile, never a spinner in the tag.
- **Adding** copies the catalogue entry into `users/{uid}/categories` with
  `kind: 'catalogue'` and `catalogueSlug` set. It is a copy, not a reference —
  the user can rename and recolour it freely, and a catalogue change never
  rewrites their data.
- Already-added entries show as added and are not offered twice.
- Search filters by name and section. Multi-select, then **Add 4 categories**.
- Haptics: `selection` per tile, `press` on Add, `splitConfirm` on success.

## Tier 3 — Custom

**Route:** `/category/new`, a modal sheet. Reachable from the **+** chip and from
the catalogue's *"Can't find it? Create your own"* footer.

| Field | Rules |
|---|---|
| Name | 1–24 chars after trim. Required. |
| Slug | Auto-derived: uppercase, spaces stripped, ≤ 12 chars. Editable. Unique among the user's non-archived categories, case-insensitive. |
| Logo | Either a **glyph** from a curated grid of ~60 `@expo/vector-icons` names, or an **uploaded image** |
| Colour | One of the eight tokens below |

### Uploaded logos

- Picked with `expo-image-picker`, cropped square client-side, resized to
  **256×256 PNG/WebP** before upload. Never upload the original.
- Stored at `users/{uid}/categoryLogos/{categoryId}` in Cloud Storage; rules
  restrict writes to that uid with a 512KB and `image/*` limit.
- Uploads are optimistic: the local file renders immediately and syncs in the
  background. Offline creation works, and the logo uploads when connectivity
  returns.
- Deleting or hard-deleting the category deletes the file.
- The glyph path is the default and the fast path. Image logos are for the user
  who really wants their gym's logo.

A live preview `MonoTag` renders above the fields and updates as you type.
Duplicate slug → inline error and `warning`; Save stays blocked. Created from the
expense sheet, the new category is auto-selected on return with the typed amount
preserved.

Haptics: `selection` on glyph and colour, `press` on Save, `splitConfirm` on
creation.

## Income categories

**v1.2.** Categories gain a `type`:

```ts
readonly type: 'expense' | 'income';   // missing = 'expense' (every v1 category)
```

- **Income essentials**, seeded silently ([02](02-onboarding.md#step-4--categories)),
  `kind: 'essential'`:

| Slug | Name | Glyph |
|---|---|---|
| `SALARY` | Salary | `briefcase` |
| `FREELANCE` | Freelance | `laptop` |
| `INTEREST` | Interest | `trending-up` |
| `CASHBACK` | Cashback & rewards | `gift` |
| `GIFTS` | Gifts received | `heart` |
| `OTHER_IN` | Other income | `ellipsis-horizontal` |

- `OTHER_IN` is the income fallback and, like `OTHER`, can't be archived.
- **Versioned seed:** `profile.categoriesSeedVersion` (missing = 1). The app
  seeds version 2 (income) once, in a batch. **Slug collision:** if a user already
  has a category with one of these slugs (e.g. a custom expense category `SALARY`),
  the income one is seeded as `<SLUG>_IN`, truncated to 12 characters. If that is
  also taken, that seed row is skipped. The seed never renames a user's category.
- The entry strip, catalogue and manage screen are filtered by type for the
  current kind. **Manage categories** gets an **Expense / Income** segment.
- Custom income categories are created the same way as custom expense ones, with
  `type: 'income'`.
- **The type is fixed after creation.** Transactions reference categories by id,
  so flipping a type would put existing expenses into income.
- The catalogue stays expense-only.

## Sub-categories

**v1.3.** One level only: `FOOD › COFFEE`, `FOOD › DELIVERY`.

```ts
readonly parentId: string | null;   // missing = null
```

### Rules

| Rule | Why |
|---|---|
| A parent must be top-level (`parentId == null`). There are no grandchildren | Two levels cover real use. Deeper trees make the strip and charts unreadable |
| Parent and child have the same `type` | Income can't sit under an expense category |
| A category with children can't become a child | Would create a second level |
| `OTHER` and `OTHER_IN` can't have children or be children | They are fallbacks |
| A parent stays selectable for transactions | "FOOD" with no detail is still a valid answer. 10-second rule |
| Max **20** children per parent | The detail chart stays readable |

### Where children show

- **Entry strip:** shows **leaf and parent categories in one usage-ordered list**,
  labelled `COFFEE` for a child (its own slug). A long-press on a parent chip
  shows its children. The strip ordering rule ([below](#ordering-in-the-entry-strip))
  is unchanged and counts each category individually.
- **Manage categories:** children are indented under their parent. **Move under…**
  re-parents, and **Make top-level** un-parents.
- **Insights:** the ranked list shows **parents**, with totals combining children.
  Tapping a parent expands its children inline, each with its share of the
  parent. Categories without children behave as today.
- **Budgets** on a parent include children ([19](19-budgets.md#what-counts)).

### Rollups are by leaf; parents are combined when read

Rollups store `byCategory` by the **category the transaction (or line) points
at**, never by parent. Insights combine parents at read time with
`rollUpToParents(totals, categoriesById)` (pure, shared). So:

- **Re-parenting never rewrites a transaction or a rollup.** Moving `COFFEE` under
  `FOOD` immediately changes every period's FOOD total, past included. That is
  correct, because the user is re-organising, not re-recording. The confirm sheet
  says so: *"COFFEE's past spending will count under FOOD in Insights."*
- `displayPercentages` runs on the combined parent totals, so they sum to 100. The
  children's shares inside a parent are a second `displayPercentages` call over
  the children, and also sum to 100.

### Archive and delete

- **Archiving a parent** archives its children in the same batch, after a confirm
  that lists them. Unarchiving the parent asks *"Also restore N sub-categories?"*.
- **Archiving a child** leaves the parent alone.
- **Deleting** follows the existing rule (zero transactions only). A parent with
  children can't be deleted until the children are moved or deleted.

## Reserved system ids

**v1.2.** Transaction kinds with no real category use reserved ids
([17](17-money-in-and-out.md#the-transaction-kinds)): `sys-transfer`,
`sys-settlement`, `sys-loan`. They are **never stored** in `categories/`.
`resolveCategory(id)` maps them to built-in display tags (`MOVE`, `SETTLE`,
`LOAN`). They never appear in the strip, the manage screen or Insights charts.
User category ids are random and can't collide with the `sys-` prefix: the
repository refuses to create one.

## Squads: mapping by slug

**v1.5.** A squad entry is shared between people who each have their own
categories. It stores the creator's **slug** (`FOOD`), not a category id.
Each member's mirror maps the slug to **their** active category with the same
slug and type `expense`, else their `OTHER` ([23](23-squads.md#mirrors)). The
member can re-categorise their own mirror, because `categoryId` is a user-owned
field on mirrors.

## Colour tokens

Categories do **not** get arbitrary colours — a colour picker would wreck the
palette in one afternoon. Eight tokens, derived from
[`theme.ts`](../packages/shared/src/theme.ts):

```ts
export type CategoryColorToken =
  | 'lime' | 'coral' | 'violet' | 'limeDeep'
  | 'ice' | 'amber' | 'rose' | 'steel';
```

Each token declares a `tint` (border and text, for the outlined MonoTag) and an
`onTint` (text colour when the token is a filled plate, such as a breakdown bar).
Both directions MUST clear 4.5:1, and both are asserted for every token in
`__tests__/theme-contrast.test.ts` — no category colour may be changed by eye.

Two notes from building it:

- **`violet` tints with `palette.violetLight` (`#A78BFA`).** The structural social
  violet `#8B5CF6` measures 4.1:1 on a card, so it fails as tag text. The
  structural token is unchanged; only the category tint differs, and a test pins
  that reasoning so it can be simplified if the palette ever moves.
- **`steel` replaces the drafted `slateTag`.** A dark slate works as a filled chip
  but is unreadable as an outline tint (1.3:1); `#8F9CAE` clears both roles.

## Editing, archiving, deleting

**Edit** — name, logo and colour apply retroactively everywhere, since expenses
reference the id. Changing a slug is allowed but warned: *"Your past expenses will
show the new tag."*

**Archive** (`archivedAt` set) is the normal removal path:

- Gone from the entry strip.
- Existing expenses keep pointing at it and still render their tag, dimmed.
- Insights keep counting it for periods containing its expenses.
- Un-archive is one tap in **You → Categories → Archived**.

**Delete** is offered only for custom or catalogue categories with **zero**
expenses. From v1.3 a parent must also have no children
([Sub-categories](#archive-and-delete)), and from v1.4 an archived category's
budget is archived with it ([19](19-budgets.md)). Any other attempt offers archiving instead. If a category is somehow
deleted with expenses attached, the repository reassigns those expenses to
`OTHER` — there is never a dangling reference.

Haptics: `warning` on the archive confirm, `destructive` on a delete confirm.

## Managing (`/category/index`)

- Sections: **Active** and **Archived**, plus an **Add** button into the catalogue.
- Each row: tag preview with logo, name, expense count, all-time total.
- Long-press-and-drag reorders active categories, setting `sortOrder`. This is the
  one place in v1 that uses the full drag haptic vocabulary — `dragStart` →
  `dragTick` → `dragDrop`.

## Ordering in the entry strip

Not alphabetical, and not `sortOrder` alone:

1. Manual order (`sortOrder`) if the user has ever reordered, else
2. **Most used in the last 30 days**, descending, then
3. Everything else by `sortOrder`.

This is what makes category selection a single tap for most entries. The strip
shows at most 12 before overflowing into a "See all" sheet; charts handle the
long tail separately ([05-insights.md](05-insights.md#long-tail)).

## Acceptance criteria

- [x] `Expense.categoryId` replaces `Expense.category` across `@loop/shared`, the
      app and the seed data, and `npm run typecheck` is clean.
- [x] A fresh install has exactly 8 active categories and a full browsable
      catalogue, both available with no network.
- [x] Adding from the catalogue creates an independent copy; later renaming it
      does not affect the catalogue and vice versa.
- [x] Creating a category from inside expense entry returns to entry with it
      selected and the typed amount intact.
- [x] A custom category with an uploaded logo can be created offline and renders
      its logo immediately.
- [x] Duplicate slugs are impossible, including against archived categories that
      are later re-activated.
- [x] Archiving a category with expenses leaves every Insights total unchanged.
- [x] Every colour token passes 4.5:1 contrast for its tag text.

### Acceptance criteria added after v1

- [ ] (v1.2) Every v1 category parses as `type: 'expense'`. The income seed runs
      once, handles slug collisions, and never renames a user category.
- [ ] (v1.2) An income category never appears in the Spend strip, and vice versa.
- [ ] (v1.3) Re-parenting COFFEE under FOOD changes FOOD's past totals with zero
      transaction or rollup writes.
- [ ] (v1.3) Parent shares and child shares each sum to exactly 100%.
- [ ] (v1.3) Rules and the repository reject a grandchild, a mixed-type
      parent/child, and `sys-` ids.
