# Task 6 — Phase 5 (M7): native SMS reader module + Remote Config

**Depends on:** Task 4 (M6 gated)
**Blocks:** Tasks 7, 8
**Runs independently of:** Task 5 (parser) — no shared files, safe to do in
parallel with it once Task 4 is closed.

## Objective

Build the Android-only native module that reads SMS, plus the Remote Config
plumbing that makes the parser's template registry updatable without a store
release and gives the feature a server-side kill switch. This is judgment work
(native Kotlin + a config plugin), not mechanical — read `docs/12` and
`docs/10-architecture.md` before writing code, and design the module's JS
surface to match the contract below exactly, since Tasks 7 and 8 depend on it.

**This module can only be compiled and tested via an EAS development build.**
It does not run in Expo Go. Say so explicitly if you reach a point where you'd
need to fall back to Expo Go to make progress — that means something is wrong
with the approach, not that Expo Go is an acceptable substitute.

## Context

Read [`docs/12-sms-ingest.md`](../12-sms-ingest.md) in full, especially
"Native integration," "Play Store risk," and "Permissions UX." Read
[`docs/10-architecture.md`](../10-architecture.md#build-and-workflow-consequence)
for why this has to be an EAS dev build. Read the "Native rebuild schedule"
table in [`docs/15-mvp-completion-plan.md`](../15-mvp-completion-plan.md#native-rebuild-schedule)
— this is native rebuild #2, adding the SMS module and
`@react-native-firebase/remote-config`.

## Flow

1. Create a local Expo config plugin + native Android module at
   `apps/mobile/modules/sms-reader/`, exposing this JS API (match this exactly
   — Task 7/8 code against it):
   ```ts
   // apps/mobile/src/lib/sms-reader.ts
   export function requestPermissions(): Promise<'granted' | 'denied'>;
   export function getRecentSms(sinceDays: number): Promise<RawSmsMessage[]>;
   export function startSmsListener(onMessage: (msg: RawSmsMessage) => void): () => void; // returns unsubscribe
   export function stopSmsListener(): void;

   interface RawSmsMessage { body: string; sender: string; receivedAt: string; }
   ```
2. Kotlin side: a `BroadcastReceiver` on `SMS_RECEIVED` for live messages that
   does the absolute minimum on the main thread — hand the message to a JS
   task and return immediately, no parsing on the native side. A
   `ContentResolver` query over the SMS inbox for the 30-day backfill
   (`getRecentSms`). The config plugin adds `RECEIVE_SMS` and `READ_SMS` to
   the manifest.
3. `apps/mobile/src/lib/remote-config.ts`: wrap
   `@react-native-firebase/remote-config` exposing at minimum
   `smsIngestEnabled: boolean` (the kill switch) and a way to fetch a template
   registry override that Task 5's parser can merge over its bundled copy —
   coordinate the exact shape with `packages/shared/src/sms/templates.ts`'s
   registry format (read Task 5's output, or if working in parallel, match the
   registry shape described in `docs/12`: versioned, one entry per bank
   format).
4. Wire the permission bridge so `requestPermissions()` triggers the native
   Android permission dialog and resolves with the result — never call this
   at launch; it's invoked only from the explainer screen or Orbit card that
   Task 8 builds.

## Edge cases to handle

- **Permission denied must be permanent-friendly**: nothing in this module
  should re-prompt automatically, and every other feature must keep working
  unchanged when SMS permission is denied.
- **`remoteConfig.smsIngestEnabled = false` must fully disable capture at
  runtime** — the listener must stop and the backfill must not run, without
  requiring an app restart if Remote Config updates mid-session.
- **Turning the feature off must stop the receiver** and (per `docs/12`'s
  privacy commitments) the rest of the pipeline is responsible for deleting
  pending items — this module just needs to make "stop listening" a real,
  callable, idempotent operation.
- **No SMS body may leave this module uninspected** — this module hands raw
  messages to JS in-memory; it must not log them, write them to native storage,
  or include them in any crash report. This is a Play policy requirement, not
  just a style preference.
- The doc flags `adb emu sms send` may reject alphanumeric senders (the Indian
  DLT header format like `AD-HDFCBK`) — verify this early. If it's rejected,
  the fallback is a `__DEV__`-only allowlist entry for the emulator's numeric
  sender format, noted in `docs/12` and used only in dev builds.

## Files owned

`apps/mobile/modules/sms-reader/*` (Kotlin + config plugin),
`apps/mobile/src/lib/sms-reader.ts`, `apps/mobile/src/lib/remote-config.ts`.
Do not touch `packages/shared/src/sms/*` (Task 5's ownership) or anything under
`apps/mobile/src/features/inbox/` (Tasks 7/8's ownership).

## Testing

There is no L1 path for native code. This task's tests are L4, against a real
EAS dev build on `Loop_API35`:
- `adb emu sms send <sender> <body>` — confirm delivery reaches the JS
  listener with correct `body`/`sender`/`receivedAt`.
- Grant permission → confirm 30-day backfill returns messages.
- Deny permission → confirm every other app feature (expenses, categories,
  insights, gamification) works completely unchanged.
- Toggle `smsIngestEnabled` to `false` in the Remote Config emulator/console →
  confirm the listener stops without an app restart.
- `npm run typecheck` (the JS/TS side must still typecheck cleanly).

## Definition of done

- [ ] Native module compiles into an EAS dev build and installs on `Loop_API35`
- [ ] `adb emu sms send` delivers a message end-to-end to the JS listener
- [ ] 30-day backfill via `getRecentSms` verified
- [ ] Permission denial leaves the rest of the app fully functional
- [ ] `smsIngestEnabled = false` stops capture at runtime with no restart needed
- [ ] No SMS body appears in logs, Crashlytics, or native storage — verified by inspection
- [ ] `npm run typecheck` green
- [ ] One commit

## Working method

Use the `unlazy` skill. This leaf is judgment-tier (native design decisions,
not a fixed mechanical pattern) — write `GATES.md` before implementing. Since
several gates require the real emulator and `adb`, mark them runnable only if
you can actually execute the check yourself; if the environment can't run
`adb emu sms send` (e.g. no emulator booted in this session), mark that gate
manual and say so plainly rather than claiming an automated pass you didn't
observe.
