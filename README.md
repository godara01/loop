# Loop

Gamified, haptic expense tracking and group settlement for iOS and Android.

Personal spending plus **Squads** — shared tabs for dinners, rent, and trips —
in an arcade-tactile interface where every interaction has physical weight.

## Docs

Product requirements live in [`docs/`](docs/) — one file per functional area,
starting with [docs/README.md](docs/README.md).

## Getting started

```bash
npm install
npm run mobile
```

The app runs on an **EAS development build**, not Expo Go — the native Firebase
SDK requires it. Day-to-day testing happens on the Android emulator; full setup,
including the emulator, is in [docs/14-environment-setup.md](docs/14-environment-setup.md).

> Haptics do not fire in an emulator. Every interaction still calls its haptic
> event as it is built, but *feeling* them on a physical mid-range Android is a
> single pass during hardening (M8) — see [docs/07-haptics.md](docs/07-haptics.md#testing).

## Layout

```
apps/mobile/
  src/app/            Expo Router routes (file-based)
  src/components/ui/  Tactile primitives — buttons, cards, dock, streak capsule
  src/lib/haptics.ts  Semantic haptic layer (the only file importing expo-haptics)
  src/data/           Seed data, to be replaced by the SQLite repository

packages/shared/
  money.ts    Integer-minor-unit money. No floats, ever.
  split.ts    Even / shares / exact / percentage allocation, largest-remainder
  settle.ts   Debt netting and greedy transfer minimisation
  streak.ts   Streak and gauge rules for the arcade dashboard
  theme.ts    "Tactile Neo-Fin" design tokens
  types.ts    Domain entities
```

`packages/shared` imports nothing from React or React Native. The MCP server
will consume it directly.

## Scripts

| Command | Does |
|---|---|
| `npm run mobile` | Start the Expo dev server |
| `npm run mobile:android` | Start and open on Android |
| `npm run typecheck` | Typecheck every workspace |

## Design

Screens originate from the Stitch project *Gamified Haptic Expense Tracker*.
The design system is dark-only: Deep Void `#0B0F19`, Electric Lime `#D4FF00`
for credit and confirmation, Neon Coral `#FF5353` for debt, Electric Violet
`#8B5CF6` for social. Borders are always 1.5px and solid; depth comes from hard
offset shadow plates that collapse on press, never from blur.

## Toolchain notes

Native builds need **JDK 17** (JDK 25 will fail Gradle) and the Android SDK.
Neither is required for Expo Go development. iOS builds require macOS or
EAS Build.
