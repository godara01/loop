/**
 * Stored document shapes, and the converters between them and domain types.
 *
 * This is the one place a Firestore document becomes a `Category` or a
 * `UserProfile`, and it VALIDATES rather than coerces. A malformed document
 * throws `DocumentShapeError` naming the path and the field. It never quietly
 * yields NaN, an unknown colour, or a half-built object that renders wrong three
 * screens later. See docs/08-data-model.md.
 *
 * Timestamps are ISO-8601 strings generated on the device, not Firestore server
 * timestamps. A server timestamp reads as null in the local snapshot until the
 * write syncs, and every document here must be complete and renderable the
 * instant it is written offline.
 *
 * Reads are strict about types and enums but lenient about lengths: a length
 * limit is a rule for writing new data, and tightening one later must not make
 * existing documents unreadable.
 */

import type { Category, CategoryIcon, CategoryKind } from '../categories';
import type { PeriodKind } from '../insights';
import { CURRENCY_SYMBOL, type CurrencyCode } from '../money';
import { CATEGORY_COLOR_TOKENS } from '../theme';
import type { UserProfile, UserSettings } from '../types';
import { firestorePaths } from './paths';

export class DocumentShapeError extends Error {
  constructor(
    readonly path: string,
    readonly field: string,
    readonly problem: string,
  ) {
    super(`${path}: field "${field}" ${problem}`);
    this.name = 'DocumentShapeError';
  }
}

type Fields = Readonly<Record<string, unknown>>;

const CURRENCIES = Object.keys(CURRENCY_SYMBOL) as CurrencyCode[];
const CATEGORY_KINDS: readonly CategoryKind[] = ['essential', 'catalogue', 'custom'];
const ICON_KINDS = ['glyph', 'image'] as const;
const PERIOD_KINDS: readonly PeriodKind[] = ['week', 'month', 'rolling30'];
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function record(path: string, field: string, value: unknown): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DocumentShapeError(path, field, 'must be an object');
  }
  return value as Fields;
}

function text(path: string, d: Fields, field: string): string {
  const value = d[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocumentShapeError(path, field, 'must be a non-empty string');
  }
  return value;
}

function optionalText(path: string, d: Fields, field: string): string | null {
  return d[field] === null || d[field] === undefined ? null : text(path, d, field);
}

function instant(path: string, d: Fields, field: string): string {
  const value = d[field];
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DocumentShapeError(path, field, 'must be an ISO-8601 instant');
  }
  return value;
}

function optionalInstant(path: string, d: Fields, field: string): string | null {
  return d[field] === null || d[field] === undefined ? null : instant(path, d, field);
}

function integer(path: string, d: Fields, field: string): number {
  const value = d[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DocumentShapeError(path, field, 'must be an integer');
  }
  return value;
}

function oneOf<T extends string>(path: string, d: Fields, field: string, allowed: readonly T[]): T {
  const value = d[field];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new DocumentShapeError(path, field, `must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function flag(path: string, d: Fields, field: string, fallback: boolean): boolean {
  const value = d[field];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new DocumentShapeError(path, field, 'must be a boolean');
  return value;
}

// ── Profile ────────────────────────────────────────────────────────────────

export interface ProfileDoc {
  readonly displayName: string;
  readonly currency: CurrencyCode;
  readonly onboardedAt: string | null;
  readonly categoriesSeededAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The profile a brand-new account starts with. Currency defaults to INR until
 * onboarding (M6) asks; `onboardedAt` stays null so that onboarding still runs.
 */
export function newProfile(uid: string, isAnonymous: boolean, now: string): UserProfile {
  return {
    uid,
    displayName: 'You',
    currency: 'INR',
    onboardedAt: null,
    categoriesSeededAt: null,
    isAnonymous,
    createdAt: now,
    updatedAt: now,
  };
}

/** `uid` is the document id and `isAnonymous` comes from auth; neither is stored. */
export function profileToDoc(profile: UserProfile): ProfileDoc {
  return {
    displayName: profile.displayName,
    currency: profile.currency,
    onboardedAt: profile.onboardedAt,
    categoriesSeededAt: profile.categoriesSeededAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function parseProfile(uid: string, isAnonymous: boolean, data: unknown): UserProfile {
  const path = firestorePaths.user(uid);
  const d = record(path, '(document)', data);
  return {
    uid,
    isAnonymous,
    displayName: text(path, d, 'displayName'),
    currency: oneOf(path, d, 'currency', CURRENCIES),
    onboardedAt: optionalInstant(path, d, 'onboardedAt'),
    categoriesSeededAt: optionalInstant(path, d, 'categoriesSeededAt'),
    createdAt: instant(path, d, 'createdAt'),
    updatedAt: instant(path, d, 'updatedAt'),
  };
}

// ── Categories ─────────────────────────────────────────────────────────────

export interface CategoryDoc {
  readonly slug: string;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly colorToken: Category['colorToken'];
  readonly kind: CategoryKind;
  readonly catalogueSlug: string | null;
  readonly sortOrder: number;
  readonly createdAt: string;
  /** Sync bookkeeping. Not part of the domain `Category`. */
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

/** `id` is the document id, so it is not stored inside the document. */
export function categoryToDoc(category: Category, updatedAt: string): CategoryDoc {
  return {
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    colorToken: category.colorToken,
    kind: category.kind,
    catalogueSlug: category.catalogueSlug,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt,
    archivedAt: category.archivedAt,
  };
}

function parseIcon(path: string, value: unknown): CategoryIcon {
  const iconPath = `${path}#icon`;
  const icon = record(path, 'icon', value);
  const kind = oneOf(iconPath, icon, 'kind', ICON_KINDS);
  return kind === 'glyph'
    ? { kind, name: text(iconPath, icon, 'name') }
    : { kind, path: text(iconPath, icon, 'path'), fallbackGlyph: text(iconPath, icon, 'fallbackGlyph') };
}

export function parseCategory(uid: string, categoryId: string, data: unknown): Category {
  const path = firestorePaths.category(uid, categoryId);
  const d = record(path, '(document)', data);
  return {
    id: categoryId,
    slug: text(path, d, 'slug'),
    name: text(path, d, 'name'),
    icon: parseIcon(path, d.icon),
    colorToken: oneOf(path, d, 'colorToken', CATEGORY_COLOR_TOKENS),
    kind: oneOf(path, d, 'kind', CATEGORY_KINDS),
    catalogueSlug: optionalText(path, d, 'catalogueSlug'),
    sortOrder: integer(path, d, 'sortOrder'),
    createdAt: instant(path, d, 'createdAt'),
    archivedAt: optionalInstant(path, d, 'archivedAt'),
  };
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface SettingsDoc extends UserSettings {
  readonly updatedAt: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  hapticsEnabled: true,
  keepItPlain: false,
  insightsPeriod: 'month',
};

/**
 * Settings gain keys over time, so a MISSING key takes its default. A key that
 * is present with the wrong type still throws — that is corruption, not age.
 */
export function parseSettings(uid: string, data: unknown): UserSettings {
  if (data === undefined || data === null) return DEFAULT_SETTINGS;
  const path = firestorePaths.settings(uid);
  const d = record(path, '(document)', data);
  return {
    hapticsEnabled: flag(path, d, 'hapticsEnabled', DEFAULT_SETTINGS.hapticsEnabled),
    keepItPlain: flag(path, d, 'keepItPlain', DEFAULT_SETTINGS.keepItPlain),
    insightsPeriod:
      d.insightsPeriod === undefined
        ? DEFAULT_SETTINGS.insightsPeriod
        : oneOf(path, d, 'insightsPeriod', PERIOD_KINDS),
  };
}

export function settingsToDoc(settings: UserSettings, updatedAt: string): SettingsDoc {
  return { ...settings, updatedAt };
}
