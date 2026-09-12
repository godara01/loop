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
expenses. Any other attempt offers archiving instead. If a category is somehow
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

- [ ] `Expense.categoryId` replaces `Expense.category` across `@loop/shared`, the
      app and the seed data, and `npm run typecheck` is clean.
- [ ] A fresh install has exactly 8 active categories and a full browsable
      catalogue, both available with no network.
- [ ] Adding from the catalogue creates an independent copy; later renaming it
      does not affect the catalogue and vice versa.
- [ ] Creating a category from inside expense entry returns to entry with it
      selected and the typed amount intact.
- [ ] A custom category with an uploaded logo can be created offline and renders
      its logo immediately.
- [ ] Duplicate slugs are impossible, including against archived categories that
      are later re-activated.
- [ ] Archiving a category with expenses leaves every Insights total unchanged.
- [ ] Every colour token passes 4.5:1 contrast for its tag text.
