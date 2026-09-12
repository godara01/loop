/**
 * "Tactile Neo-Fin" design tokens, transcribed from the Stitch design system.
 *
 * Neo-Tactile Brutalism × Cyber-Fintech: a deep void canvas, 1.5px mechanical
 * borders, and hard offset shadows instead of soft blur — elements behave like
 * extruded arcade plates that physically depress when pressed.
 */

export const palette = {
  // Surface hierarchy (level 0 → 3)
  void: '#0B0F19',
  slate: '#121A2A',
  nested: '#182337',
  active: '#202D45',

  // Borders
  border: '#1F2E47',
  borderStrong: '#2B3D5E',

  // Accents
  lime: '#D4FF00',
  limeDeep: '#A3C700',
  limeShadow: '#8BA800',
  coral: '#FF5353',
  coralShadow: '#A82929',
  violet: '#8B5CF6',
  violetLight: '#A78BFA',
  violetShadow: '#5E35B1',

  // Category tag tints. Transcribed from the Stitch category sheet — these are
  // the only colors a category may take, so the palette cannot be diluted one
  // custom category at a time.
  ice: '#7DE2FF',
  amber: '#FFB020',
  rose: '#FF7BAC',
  steel: '#8F9CAE',

  // Text
  text: '#FFFFFF',
  textMuted: '#8F9CAE',
  onAccent: '#0B0F19',

  // Hard shadow plates
  shadowBase: '#06090F',
  shadowSecondary: '#080C14',
} as const;

/** Semantic roles — prefer these over raw palette entries in components. */
export const colors = {
  background: palette.void,
  card: palette.slate,
  input: palette.nested,
  chipActive: palette.active,

  border: palette.border,
  borderFocus: palette.lime,

  /** Money owed to you / positive flows / streaks. */
  credit: palette.lime,
  /** Money you owe / overspend / destructive. */
  debit: palette.coral,
  /** Squads, group tags, peer accents. */
  social: palette.violet,

  text: palette.text,
  textMuted: palette.textMuted,
  onAccent: palette.onAccent,
} as const;

/**
 * The eight tokens a category may use.
 *
 * `tint` is the outline-and-text color on a dark surface — how a MonoTag
 * renders. `onTint` is the text color when the token is a filled plate, such as
 * a bar in the category breakdown. Both directions are contrast-tested in
 * `__tests__/theme-contrast.test.ts`; nothing here may be changed by eye.
 *
 * Note `violet` tints with `violetLight`: the structural social violet is too
 * dark to read as text on a card. The structural token is unchanged.
 */
export const categoryColors = {
  lime: { tint: palette.lime, onTint: palette.onAccent },
  limeDeep: { tint: palette.limeDeep, onTint: palette.onAccent },
  coral: { tint: palette.coral, onTint: palette.onAccent },
  violet: { tint: palette.violetLight, onTint: palette.onAccent },
  ice: { tint: palette.ice, onTint: palette.onAccent },
  amber: { tint: palette.amber, onTint: palette.onAccent },
  rose: { tint: palette.rose, onTint: palette.onAccent },
  steel: { tint: palette.steel, onTint: palette.onAccent },
} as const;

export type CategoryColorToken = keyof typeof categoryColors;

export const CATEGORY_COLOR_TOKENS = Object.keys(categoryColors) as CategoryColorToken[];

export const radius = {
  /** Monospaced category tags: DINING, RENT, UBER */
  micro: 8,
  /** Inputs, inner transaction rows, segment toggles */
  control: 16,
  /** Expense cards, debt summary modules, split sheets */
  card: 24,
  /** Buttons, chips, badges, streak pills, the bottom dock */
  pill: 9999,
} as const;

/** 4px base unit, 8px structural grid. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const layout = {
  screenMargin: 16,
  gutter: 12,
  cardPaddingY: 12,
  cardPaddingX: 16,
  heroPadding: 20,
  /** Bottom dock and sticky actions clear the safe area by this much. */
  thumbZoneOffset: 16,
  tabletMaxWidth: 680,
} as const;

/** All borders are 1.5px — the mechanical edge is core to the brand. */
export const borderWidth = {
  hairline: 1,
  mechanical: 1.5,
} as const;

/**
 * Hard offset shadow plates. Pressing an element translates it down and
 * collapses the plate, which is what sells the arcade-button feel.
 */
export const elevation = {
  rest: { offsetY: 4, translateY: 0 },
  pressed: { offsetY: 1, translateY: 3 },
} as const;

export const fonts = {
  /** Totals, headers, modal alerts — industrial and engineered. */
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
  /** Transaction titles, member names, settings. */
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemi: 'HankenGrotesk_600SemiBold',
  /** Tabular numbers, split ratios, timestamps — never shifts column width. */
  mono: 'JetBrainsMono_700Bold',
  monoMedium: 'JetBrainsMono_600SemiBold',
} as const;

export const type = {
  displayLg: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.68 },
  headlineLg: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
  headlineSm: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  bodyMd: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, letterSpacing: 0.14 },
  bodySm: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.12 },
  monoLg: { fontFamily: fonts.mono, fontSize: 15, lineHeight: 18, letterSpacing: -0.15 },
  monoMd: { fontFamily: fonts.monoMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  monoSm: { fontFamily: fonts.monoMedium, fontSize: 10, lineHeight: 14, letterSpacing: 0.6 },
} as const;
