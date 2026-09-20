# Task 13 — Phase 6 (M8): App Check & Crashlytics

**Depends on:** Task 9 (Phase 5 closed)
**Independent of:** Tasks 10, 11, 12

## Objective

Add the two release-readiness integrations `docs/13-build-plan.md` places in
M8: App Check (debug provider on the emulator, Play Integrity live) and
Crashlytics, with the hard privacy constraint that neither may ever transmit
PII or SMS content.

## Context

Read `docs/13-build-plan.md#m8--hardening-and-release` for the feature line
item. Read [`docs/12-sms-ingest.md#privacy-commitments`](../12-sms-ingest.md)
again — Crashlytics is explicitly named there as a surface that must never
receive an SMS body, so this task's Crashlytics setup needs to actively guard
against that, not just avoid it by omission (e.g. don't let a native crash
handler capture in-memory state that happens to include a raw message).
This is native rebuild #3 per `docs/15`'s schedule
(`@react-native-firebase/app-check`, `@react-native-firebase/crashlytics`,
plus `expo-file-system`/`expo-sharing` which Task 12 also needs, and dropping
unused `expo-sqlite`).

## Flow

1. Install `@react-native-firebase/app-check` and
   `@react-native-firebase/crashlytics`, drop `expo-sqlite` if genuinely
   unused (grep for any import first — don't remove it on the doc's say-so
   alone if something quietly depends on it).
2. **App Check**: debug provider wired for the `Loop_API35` emulator (so local
   development and this task's own testing don't require a live Play
   Integrity token), Play Integrity provider configured for the eventual live
   build. Enforce App Check on Cloud Functions calls (the callables from
   Tasks 10/11/12: `rebuildRollups`, `onUserDelete`) and on Firestore/Storage
   per whatever `firebase.json`/console configuration the project needs —
   this is server-side enforcement, confirm it's actually toggled on for the
   `loop-app-0403` project when Phase 6 goes live (that's a Task 15/user-action
   concern; this task's job is making the client emit valid tokens and
   confirming enforcement works against the emulator now).
3. **Crashlytics**: initialize without PII. Explicitly do not set a user
   identifier, email, or any custom key that could contain user-entered text
   (category names, descriptions, notes) or SMS-derived fields (`merchant`,
   `displayHint`). If custom keys are useful for debugging, allowlist a small
   fixed set of non-identifying ones (e.g. `screen`, `errorCode`) rather than
   passing through arbitrary context objects.

## Edge cases to handle

- **App Check must not lock out the emulator dev loop** — confirm
  `npm run mobile` / `npm run emulator` still work end to end with the debug
  provider; a misconfigured App Check is exactly the kind of change that
  silently breaks every other feature's manual testing.
- **Crashlytics must never receive an SMS body or a category/expense note
  verbatim** — write an explicit test or code-review pass confirming no
  crash-reporting call site is fed a value sourced from
  `packages/shared/src/sms/*` output or free-text user fields. If Task 5's
  parser or Task 8's inbox UI has an error boundary, confirm its Crashlytics
  report strips the raw input before logging.
- App Check token failures (e.g. expired token, clock skew) must degrade
  gracefully — the app should retry or surface a real error, not hard-crash,
  especially offline where the app is required to be "fully usable" per
  `CLAUDE.md`.

## Files owned

`apps/mobile/app.json`/`app.config.ts` (native plugin config),
`apps/mobile/src/lib/app-check.ts` (new), `apps/mobile/src/lib/crashlytics.ts`
(new), `apps/mobile/src/app/_layout.tsx` (initialization wiring only — don't
restructure the bootstrap sequence, just add the two init calls at the right
point per `docs/10-architecture.md`'s bootstrap sequence).

## Testing

- L4, manual/emulator: `app-check-debug` flow (new) — confirm a Firestore
  write and a callable Function invocation both succeed against the emulator
  with the debug provider active, and confirm they're rejected without it (a
  negative control, same principle as Task 7's rules positive-control gate).
- Manual: force a JS error and a native crash in a debug build, confirm a
  Crashlytics report is created, and inspect its payload to confirm it
  contains no SMS body, note text, or description text.
- `npm run typecheck` — the app must still boot cleanly with both integrations added.

## Definition of done

- [ ] App Check debug provider works against `Loop_API35`; Play Integrity path configured for live
- [ ] Function calls and Firestore/Storage access enforce App Check (verified with a negative control)
- [ ] Crashlytics initialized with zero PII, no SMS-derived or free-text fields in any report
- [ ] `app-check-debug` Maestro flow passes twice
- [ ] Emulator dev loop (`npm run mobile`, `npm run emulator`) still works unchanged
- [ ] `npm run typecheck` green
- [ ] One commit

## Working method

Use the `unlazy` skill, solo mode. Write `GATES.md` with a negative-control
gate for App Check enforcement (unauthenticated/no-token request is rejected)
and a specific gate for the Crashlytics PII check — inspect an actual captured
report's payload rather than trusting that "no PII passed as an argument"
holds by code inspection alone, since a wrapping object could carry more than
intended.
