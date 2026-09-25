/**
 * Categories are data, not a union.
 *
 * Three tiers, deliberately: eight `essential` categories installed at
 * onboarding so the app works immediately, a browsable `catalogue` the user adds
 * from in one tap, and `custom` ones they name themselves. See
 * docs/04-categories.md.
 *
 * Adding from the catalogue COPIES the entry into the user's own categories. It
 * is not a reference: renaming a catalogue entry later must never rewrite
 * anybody's data, and a user must be free to rename what they added.
 */

// The token list lives in theme.ts, which owns the palette. Categories consume
// it; re-exporting here would make `CategoryColorToken` ambiguous at the package
// barrel, and ESM silently DROPS ambiguous star re-exports.
import type { CategoryColorToken } from './theme';

/**
 * A glyph renders instantly and offline; an uploaded image is a progressive
 * enhancement that falls back to its glyph until it loads. A category is never
 * a blank tile.
 */
export type CategoryIcon =
  | { readonly kind: 'glyph'; readonly name: string }
  | { readonly kind: 'image'; readonly path: string; readonly fallbackGlyph: string };

export type CategoryKind = 'essential' | 'catalogue' | 'custom';

export interface Category {
  readonly id: string;
  /** Uppercase, unique per user, ≤ 12 chars — what the mono tag prints. */
  readonly slug: string;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly colorToken: CategoryColorToken;
  readonly kind: CategoryKind;
  /** Set when added from the catalogue, so later catalogue changes can be matched. */
  readonly catalogueSlug: string | null;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly archivedAt: string | null;
}

/** The shape the catalogue and the essentials share before a user owns them. */
export interface CategoryTemplate {
  readonly slug: string;
  readonly name: string;
  readonly glyph: string;
  readonly colorToken: CategoryColorToken;
  readonly section: CatalogueSection;
}

export type CatalogueSection =
  | 'Everyday'
  | 'Food'
  | 'Transport'
  | 'Home'
  | 'Health'
  | 'Money'
  | 'Lifestyle'
  | 'Work'
  | 'Travel'
  | 'Family';

export const CATALOGUE_SECTIONS: readonly CatalogueSection[] = [
  'Everyday',
  'Food',
  'Transport',
  'Home',
  'Health',
  'Money',
  'Lifestyle',
  'Work',
  'Travel',
  'Family',
];

/** The fallback every orphaned expense lands on. Can never be archived. */
export const FALLBACK_CATEGORY_SLUG = 'OTHER';

export type EssentialCategorySlug =
  | 'FOOD'
  | 'GROCERIES'
  | 'TRANSPORT'
  | 'BILLS'
  | 'SHOPPING'
  | 'HEALTH'
  | 'FUN'
  | 'OTHER';

/**
 * Installed at onboarding. Eight, not forty — every one here must be something
 * almost everyone uses weekly. Everything else lives in the catalogue.
 */
export const ESSENTIAL_CATEGORIES: readonly CategoryTemplate[] = [
  { slug: 'FOOD', name: 'Food & dining', glyph: 'restaurant', colorToken: 'lime', section: 'Everyday' },
  { slug: 'GROCERIES', name: 'Groceries', glyph: 'basket', colorToken: 'limeDeep', section: 'Everyday' },
  { slug: 'TRANSPORT', name: 'Transport', glyph: 'car', colorToken: 'ice', section: 'Everyday' },
  { slug: 'BILLS', name: 'Bills & utilities', glyph: 'flash', colorToken: 'amber', section: 'Everyday' },
  { slug: 'SHOPPING', name: 'Shopping', glyph: 'pricetag', colorToken: 'violet', section: 'Everyday' },
  { slug: 'HEALTH', name: 'Health', glyph: 'medkit', colorToken: 'coral', section: 'Everyday' },
  { slug: 'FUN', name: 'Entertainment', glyph: 'game-controller', colorToken: 'rose', section: 'Everyday' },
  { slug: 'OTHER', name: 'Other', glyph: 'ellipsis-horizontal', colorToken: 'steel', section: 'Everyday' },
];

/**
 * The browsable library. Shipped bundled so a first launch with no network still
 * has a full catalogue; Firestore's copy wins when it is newer.
 *
 * Essentials are deliberately absent — they are already installed.
 */
export const CATEGORY_CATALOGUE: readonly CategoryTemplate[] = [
  // Food
  { slug: 'COFFEE', name: 'Coffee & tea', glyph: 'cafe', colorToken: 'amber', section: 'Food' },
  { slug: 'DELIVERY', name: 'Food delivery', glyph: 'bicycle', colorToken: 'lime', section: 'Food' },
  { slug: 'SNACKS', name: 'Snacks', glyph: 'fast-food', colorToken: 'rose', section: 'Food' },
  { slug: 'DRINKS', name: 'Drinks & bars', glyph: 'wine', colorToken: 'violet', section: 'Food' },
  { slug: 'CANTEEN', name: 'Office canteen', glyph: 'restaurant', colorToken: 'steel', section: 'Food' },

  // Transport
  { slug: 'FUEL', name: 'Fuel', glyph: 'speedometer', colorToken: 'amber', section: 'Transport' },
  { slug: 'CAB', name: 'Cabs & autos', glyph: 'car-sport', colorToken: 'ice', section: 'Transport' },
  { slug: 'METRO', name: 'Metro & bus', glyph: 'train', colorToken: 'ice', section: 'Transport' },
  { slug: 'PARKING', name: 'Parking', glyph: 'square', colorToken: 'steel', section: 'Transport' },
  { slug: 'TOLLS', name: 'Tolls', glyph: 'card', colorToken: 'steel', section: 'Transport' },
  { slug: 'VEHICLE', name: 'Vehicle service', glyph: 'construct', colorToken: 'coral', section: 'Transport' },

  // Home
  { slug: 'RENT', name: 'Rent', glyph: 'home', colorToken: 'coral', section: 'Home' },
  { slug: 'MAINT', name: 'Maintenance', glyph: 'hammer', colorToken: 'steel', section: 'Home' },
  { slug: 'INTERNET', name: 'Internet', glyph: 'wifi', colorToken: 'ice', section: 'Home' },
  { slug: 'MOBILE', name: 'Mobile recharge', glyph: 'phone-portrait', colorToken: 'ice', section: 'Home' },
  { slug: 'ELECTRIC', name: 'Electricity', glyph: 'flash', colorToken: 'amber', section: 'Home' },
  { slug: 'WATER', name: 'Water & gas', glyph: 'water', colorToken: 'ice', section: 'Home' },
  { slug: 'HELP', name: 'Household help', glyph: 'people', colorToken: 'violet', section: 'Home' },
  { slug: 'LAUNDRY', name: 'Laundry', glyph: 'shirt', colorToken: 'steel', section: 'Home' },
  { slug: 'FURNITURE', name: 'Home & furniture', glyph: 'bed', colorToken: 'violet', section: 'Home' },

  // Health
  { slug: 'PHARMACY', name: 'Pharmacy', glyph: 'medical', colorToken: 'coral', section: 'Health' },
  { slug: 'DOCTOR', name: 'Doctor', glyph: 'medkit', colorToken: 'coral', section: 'Health' },
  { slug: 'GYM', name: 'Gym & fitness', glyph: 'barbell', colorToken: 'lime', section: 'Health' },
  { slug: 'THERAPY', name: 'Therapy', glyph: 'heart', colorToken: 'rose', section: 'Health' },
  { slug: 'DENTAL', name: 'Dental', glyph: 'happy', colorToken: 'ice', section: 'Health' },

  // Money
  { slug: 'EMI', name: 'EMI & loans', glyph: 'trending-down', colorToken: 'coral', section: 'Money' },
  { slug: 'INSURANCE', name: 'Insurance', glyph: 'shield-checkmark', colorToken: 'ice', section: 'Money' },
  { slug: 'INVEST', name: 'Investments', glyph: 'trending-up', colorToken: 'lime', section: 'Money' },
  { slug: 'TAX', name: 'Tax', glyph: 'document-text', colorToken: 'steel', section: 'Money' },
  { slug: 'FEES', name: 'Bank charges', glyph: 'cash', colorToken: 'steel', section: 'Money' },

  // Lifestyle
  { slug: 'SUBS', name: 'Subscriptions', glyph: 'repeat', colorToken: 'violet', section: 'Lifestyle' },
  { slug: 'SALON', name: 'Salon & grooming', glyph: 'cut', colorToken: 'rose', section: 'Lifestyle' },
  { slug: 'CLOTHES', name: 'Clothing', glyph: 'shirt', colorToken: 'violet', section: 'Lifestyle' },
  { slug: 'ELECTRONIC', name: 'Electronics', glyph: 'hardware-chip', colorToken: 'ice', section: 'Lifestyle' },
  { slug: 'MOVIES', name: 'Movies & events', glyph: 'ticket', colorToken: 'rose', section: 'Lifestyle' },
  { slug: 'GAMING', name: 'Gaming', glyph: 'game-controller', colorToken: 'violet', section: 'Lifestyle' },
  { slug: 'BOOKS', name: 'Books', glyph: 'book', colorToken: 'amber', section: 'Lifestyle' },
  { slug: 'GIFTS', name: 'Gifts', glyph: 'gift', colorToken: 'rose', section: 'Lifestyle' },
  { slug: 'CHARITY', name: 'Charity', glyph: 'heart-circle', colorToken: 'lime', section: 'Lifestyle' },
  { slug: 'HOBBIES', name: 'Hobbies', glyph: 'color-palette', colorToken: 'amber', section: 'Lifestyle' },

  // Work
  { slug: 'OFFICE', name: 'Office supplies', glyph: 'briefcase', colorToken: 'steel', section: 'Work' },
  { slug: 'SOFTWARE', name: 'Software & tools', glyph: 'terminal', colorToken: 'ice', section: 'Work' },
  { slug: 'COURSES', name: 'Courses', glyph: 'school', colorToken: 'amber', section: 'Work' },
  { slug: 'FREELANCE', name: 'Freelance costs', glyph: 'laptop', colorToken: 'steel', section: 'Work' },

  // Travel
  { slug: 'FLIGHTS', name: 'Flights', glyph: 'airplane', colorToken: 'ice', section: 'Travel' },
  { slug: 'HOTELS', name: 'Stays', glyph: 'business', colorToken: 'violet', section: 'Travel' },
  { slug: 'TRAINS', name: 'Trains', glyph: 'train', colorToken: 'amber', section: 'Travel' },
  { slug: 'SIGHTS', name: 'Sightseeing', glyph: 'camera', colorToken: 'rose', section: 'Travel' },
  { slug: 'VISA', name: 'Visa & docs', glyph: 'documents', colorToken: 'steel', section: 'Travel' },
  { slug: 'LUGGAGE', name: 'Luggage', glyph: 'bag', colorToken: 'steel', section: 'Travel' },

  // Family
  { slug: 'CHILDCARE', name: 'Childcare', glyph: 'happy', colorToken: 'rose', section: 'Family' },
  { slug: 'SCHOOL', name: 'School fees', glyph: 'school', colorToken: 'amber', section: 'Family' },
  { slug: 'PETS', name: 'Pets', glyph: 'paw', colorToken: 'lime', section: 'Family' },
  { slug: 'ELDERCARE', name: 'Parents & family', glyph: 'people-circle', colorToken: 'violet', section: 'Family' },
  { slug: 'TOYS', name: 'Kids & toys', glyph: 'balloon', colorToken: 'rose', section: 'Family' },
  { slug: 'SUPPORT', name: 'Family support', glyph: 'heart-half', colorToken: 'coral', section: 'Family' },
];

export const MAX_CATEGORY_NAME_LENGTH = 24;
export const MAX_CATEGORY_SLUG_LENGTH = 12;

/**
 * "Coffee & tea" → "COFFEETEA". Uppercase, alphanumerics only, capped at 12 so
 * the mono tag never wraps or shifts a ledger column.
 */
export function slugifyCategoryName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_CATEGORY_SLUG_LENGTH);
}

export type CategoryValidationError =
  | 'name_empty'
  | 'name_too_long'
  | 'slug_empty'
  | 'slug_too_long'
  | 'slug_taken';

export interface CategoryDraft {
  readonly name: string;
  readonly slug: string;
}

/**
 * Validates a new or edited category. `existing` is compared case-insensitively
 * and includes ARCHIVED categories — un-archiving must never collide.
 *
 * @param editingId the category being edited, so it does not clash with itself.
 */
export function validateCategoryDraft(
  draft: CategoryDraft,
  existing: readonly Pick<Category, 'id' | 'slug'>[],
  editingId: string | null = null,
): CategoryValidationError | null {
  const name = draft.name.trim();
  if (name.length === 0) return 'name_empty';
  if (name.length > MAX_CATEGORY_NAME_LENGTH) return 'name_too_long';

  const slug = draft.slug.trim().toUpperCase();
  if (slug.length === 0) return 'slug_empty';
  if (slug.length > MAX_CATEGORY_SLUG_LENGTH) return 'slug_too_long';

  const clash = existing.some((c) => c.id !== editingId && c.slug.toUpperCase() === slug);
  return clash ? 'slug_taken' : null;
}

export function isArchived(category: Category): boolean {
  return category.archivedAt !== null;
}

/** `OTHER` is the fallback for orphaned expenses, so it can never be archived. */
export function canArchive(category: Category): boolean {
  return category.slug !== FALLBACK_CATEGORY_SLUG;
}

/** Only a category nothing points at can be deleted. Everything else archives. */
export function canDelete(category: Category, expenseCount: number): boolean {
  return category.kind !== 'essential' && expenseCount === 0;
}

/**
 * Entry-strip order: the user's manual order if they have ever reordered, else
 * most-used in the recent window, with everything else behind it by sortOrder.
 * This is what makes category selection a single tap for most entries.
 */
export function orderForEntry(
  categories: readonly Category[],
  usageCounts: ReadonlyMap<string, number>,
  hasManualOrder: boolean,
): Category[] {
  const active = categories.filter((c) => !isArchived(c));
  if (hasManualOrder) {
    return [...active].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
  }

  return [...active].sort((a, b) => {
    const used = (usageCounts.get(b.id) ?? 0) - (usageCounts.get(a.id) ?? 0);
    if (used !== 0) return used;
    return a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug);
  });
}

/** Builds a user-owned category from an essential or catalogue template. */
export function categoryFromTemplate(
  template: CategoryTemplate,
  options: {
    readonly id: string;
    readonly kind: CategoryKind;
    readonly sortOrder: number;
    readonly createdAt: string;
    readonly archivedAt?: string | null;
  },
): Category {
  return {
    id: options.id,
    slug: template.slug,
    name: template.name,
    icon: { kind: 'glyph', name: template.glyph },
    colorToken: template.colorToken,
    kind: options.kind,
    catalogueSlug: options.kind === 'catalogue' ? template.slug : null,
    sortOrder: options.sortOrder,
    createdAt: options.createdAt,
    archivedAt: options.archivedAt ?? null,
  };
}

/** The full set installed on a fresh account, in strip order. */
export function seedEssentialCategories(
  createdAt: string,
  idFor: (slug: string) => string = (slug) => `cat-${slug.toLowerCase()}`,
): Category[] {
  return ESSENTIAL_CATEGORIES.map((template, index) =>
    categoryFromTemplate(template, {
      id: idFor(template.slug),
      kind: 'essential',
      sortOrder: index,
      createdAt,
    }),
  );
}

/**
 * What a bootstrap must write: all eight essentials if this account has never
 * been seeded, otherwise nothing.
 *
 * Keyed on a marker (`profile.categoriesSeededAt`) rather than on whether
 * category documents exist, because re-seeding with a blind write would
 * overwrite any essential the user has renamed. The ids are deterministic, so
 * two launches racing to seed the same account write identical documents and
 * converge instead of duplicating.
 */
export function essentialCategoriesToSeed(categoriesSeededAt: string | null, now: string): Category[] {
  return categoriesSeededAt === null ? seedEssentialCategories(now) : [];
}

/** Building a brand-new custom category, chosen by the user rather than a template. */
export interface NewCategoryInput {
  readonly name: string;
  readonly slug: string;
  readonly icon: CategoryIcon;
  readonly colorToken: CategoryColorToken;
}

/** A custom category the user names and colours themselves — never from a template. */
export function newCustomCategory(
  input: NewCategoryInput,
  options: { readonly id: string; readonly sortOrder: number; readonly createdAt: string },
): Category {
  return {
    id: options.id,
    slug: input.slug.trim().toUpperCase(),
    name: input.name.trim(),
    icon: input.icon,
    colorToken: input.colorToken,
    kind: 'custom',
    catalogueSlug: null,
    sortOrder: options.sortOrder,
    createdAt: options.createdAt,
    archivedAt: null,
  };
}

/**
 * Applies a name/icon/colour edit. The slug and kind never change here — a
 * slug edit goes through validateCategoryDraft first and is applied by the
 * caller, since renaming the tag that already labels past expenses is a
 * separate, warned-about decision (docs/04-categories.md#editing).
 */
export function editCategory(
  category: Category,
  patch: { readonly name?: string; readonly icon?: CategoryIcon; readonly colorToken?: CategoryColorToken },
): Category {
  return {
    ...category,
    name: patch.name !== undefined ? patch.name.trim() : category.name,
    icon: patch.icon ?? category.icon,
    colorToken: patch.colorToken ?? category.colorToken,
  };
}

export function archiveCategory(category: Category, now: string): Category {
  return { ...category, archivedAt: now };
}

export function unarchiveCategory(category: Category): Category {
  return { ...category, archivedAt: null };
}

/**
 * Assigns fresh `sortOrder` values from a drag reorder, 0-based in the order
 * given. This is also what turns on manual ordering: any call here means
 * `orderForEntry` must be told `hasManualOrder: true` from now on.
 */
export function reorderCategories(orderedIds: readonly string[], categories: readonly Category[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const reordered: Category[] = [];
  orderedIds.forEach((id, index) => {
    const category = byId.get(id);
    if (category) reordered.push({ ...category, sortOrder: index });
  });
  return reordered;
}

// ── Uploaded logos ───────────────────────────────────────────────────────────

/** Cloud Storage rules enforce the same ceiling — see docs/11-firebase.md. */
export const MAX_LOGO_BYTES = 512_000;
export const LOGO_DIMENSION = 256;
const LOGO_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export type LogoValidationError = 'too_large' | 'wrong_type';

/**
 * Checked again client-side before ever starting an upload, so a bad file is
 * rejected instantly rather than after a round trip to Storage's own rules.
 */
export function validateLogoFile(file: { readonly size: number; readonly mimeType: string }): LogoValidationError | null {
  if (!LOGO_MIME_TYPES.includes(file.mimeType)) return 'wrong_type';
  if (file.size > MAX_LOGO_BYTES) return 'too_large';
  return null;
}

/** Catalogue entries the user has not already installed, grouped for browsing. */
export function catalogueFor(
  installed: readonly Category[],
): Map<CatalogueSection, CategoryTemplate[]> {
  const taken = new Set(
    installed.flatMap((c) => [c.slug.toUpperCase(), c.catalogueSlug?.toUpperCase() ?? '']),
  );

  const sections = new Map<CatalogueSection, CategoryTemplate[]>();
  for (const template of CATEGORY_CATALOGUE) {
    if (taken.has(template.slug)) continue;
    const bucket = sections.get(template.section) ?? [];
    bucket.push(template);
    sections.set(template.section, bucket);
  }
  return sections;
}
