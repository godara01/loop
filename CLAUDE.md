# Loop

Gamified, haptic expense tracking and group settlement for iOS and Android.
Personal spending plus "Squads" — shared tabs for dinners, rent, and trips —
wrapped in an arcade-tactile interface where every interaction has physical weight.

## Product docs

`docs/` holds the product requirements — scope, flows, and rules, one file per
functional area. Read [docs/README.md](docs/README.md) before adding a feature;
the v1 cut line in `docs/00-product.md` is binding.

## Repo layout

```
apps/mobile/        Expo (React Native) app — the product
packages/shared/    Domain logic: money, splits, settlement, streaks. Framework-free.
```

`packages/shared` is deliberately free of React and React Native imports. It is
consumed by the app today and by the MCP server later, so it must stay portable.

## Stack

- **Expo SDK 57 / React Native 0.86 / React 19**, TypeScript strict
- **Expo Router** — file-based routing in `apps/mobile/src/app`, typed routes on
- **Reanimated 4 + Gesture Handler** — all animation runs on the UI thread
- **React Native Skia** — arcade visuals: streak meters, particle bursts, gauges
- **Firebase** (`@react-native-firebase`) — Auth, Firestore, Functions, Storage,
  App Check. Firestore offline persistence is the local store; the app must be
  fully usable offline. See `docs/11-firebase.md`.

## Non-negotiables

**Money is never a float.** Every amount is an integer count of minor units
(`Money.minor`) plus a currency code. Use `packages/shared/src/money.ts` for all
arithmetic. Splits use the largest-remainder method so allocations always sum
back to the total exactly — `allocate()` throws if they ever don't.

**Haptics go through the semantic layer.** Never import `expo-haptics` in a
component. Call `haptic('splitConfirm')` from `apps/mobile/src/lib/haptics.ts`.
iOS and Android have genuinely different capabilities and that file is the only
place that knows about it.

**The design system is fixed.** "Tactile Neo-Fin" tokens live in
`packages/shared/src/theme.ts`, transcribed from the Stitch project. Key rules:
- 1.5px solid borders on every card, chip, and container — never blurred shadows
- Hard offset shadow plates (`0px 4px 0px`), collapsing to `0px 1px 0px` with a
  3px downward translate on press. This is what sells the arcade-button feel.
- Text on Electric Lime `#D4FF00` is always Deep Void `#0B0F19`
- JetBrains Mono for every number, ratio, and timestamp so columns never shift
- Dark mode only. There is no light theme.

## Design source

Screens come from the Stitch project "Gamified Haptic Expense Tracker"
(`projects/11249192348559067173`), 24 mobile screens including the Orbit
dashboard, Squads space, Drag & Split flow, Settle Up payment, and the Arcade
Gamified Dashboard. Stitch exports HTML + Tailwind; port class names to the
tokens in `theme.ts` rather than re-deriving colors by eye.

## Commands

```bash
npm run mobile          # start the dev server
npm run mobile:android  # start and open on Android
npm run typecheck       # all workspaces
```

## Environment notes

This machine has no Android SDK and JDK 25 (React Native's Gradle wants JDK 17).
Development runs on an **EAS development build, not Expo Go** — the native
Firebase SDK and the Android SMS module both require it. All native builds go
through EAS; iOS builds require EAS since this is Linux.

Backend work runs against the Firebase Emulator Suite by default.
