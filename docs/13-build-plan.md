# 13 — Build Plan

> **Status and remaining work live in [`TASKS.md`](../TASKS.md).** This doc is
> the plan and rationale; don't track progress here.

The order to build v1 in, sized so that **every milestone ends in an installable
build you can use**. No milestone leaves the app broken, and no milestone is
"plumbing you can't see" — each one either adds something you can tap or removes
a thing that was faked.

## The two rules this order follows

1. **Vertical slices, not layers.** Never "build all repositories, then all
   screens". Build one feature end-to-end — domain → Firestore → screen — then
   the next. A half-finished layer is untestable; a half-finished app is not.
2. **Fight the toolchain before you write code that depends on it.** The riskiest
   thing in this project is not the code, it's the native build. Prove it works
   on day one, on a real device, before there is anything to debug alongside it.

## Two blockers to clear immediately

| Blocker | Why now | Who |
|---|---|---|
| **EAS dev build installs and runs on a device** | `@react-native-firebase` and the SMS module are native. Until a dev build works, none of it can be tested — and this machine has no Android SDK and JDK 25, so it all goes through EAS ([10-architecture.md](10-architecture.md#build-and-workflow-consequence)) | You (EAS account, first build) |
| **Google Play restricted-permission declaration for SMS** | Longest lead time in v1, and it may be refused ([12-sms-ingest.md](12-sms-ingest.md#play-store-risk)). Nothing else depends on the answer, so ask early and build the rest either way | You |

Neither blocks M1, which is why M1 is pure domain code.

## Milestones

### M0 — Dev build proof

**Goal:** an installable `Loop (dev)` on a physical Android and iPhone, with the
native dependencies already in place even though nothing uses them yet.

- EAS project, three Firebase projects (`loop-dev` / `staging` / `prod`)
- Install `@react-native-firebase/app` + `auth` + `firestore`, config plugins,
  `google-services.json` / `GoogleService-Info.plist` as EAS secrets
- One dev build per platform

**You can test:** the current mock app runs on device from a dev build, fonts
load, the haptics debug list in **You** fires every event.
**Do not skip:** if the build is broken, everything after this is undebuggable.

### M1 — Domain foundation *(pure code, no device needed)*

**Goal:** `packages/shared` matches the docs, with tests.

- `Category`, `CategoryIcon`, `CategoryColorToken`, bundled catalogue
- `Expense.category` → `categoryId`, plus the group-ready fields
- `coins.ts` (rules, caps, deterministic ids), `insights.ts` (totals, shares)
- Palette additions: `ice`, `amber`, `rose` + `onAccent` pairs
- Tests for every one, in the existing `node:test` suite

**You can test:** `npm test` and `npm run typecheck`. The app still runs on mock
data, updated to the new shapes.
**Runs in parallel with M0** — this is the piece to start today.

### M2 — Firebase spine

> **Done — 2026-09-13.** Verified on the `Loop_API35` emulator against the local
> emulator suite. First launch creates one anonymous user, a profile, and exactly
> 8 category documents in a single batch. Force-stopping and relaunching in airplane
> mode restores the session and all 8 categories, marked OFFLINE, with no JS
> errors. On reconnecting they flip to SYNCED within ~2 s, still 8 documents with
> identical ids and timestamps (no re-seed). The haptics setting persists through
> `settings/app` across a relaunch. Rules suite: 28 tests. Decisions are recorded
> in [11-firebase.md](11-firebase.md#decisions-made-while-building-m2).

**Goal:** real identity and real persistence, with one visible feature proving it.

- `core/firebase/*`, converters, path builders, `AuthProvider`, bootstrap gate
- Anonymous sign-in, profile doc, settings doc
- Category repository + **essentials seeded on first launch**
- `firestore.rules` v1 **and its emulator test suite** — rules are code from day
  one, not a hardening pass later

**You can test:** install, see your 8 categories, kill the app, reopen in
airplane mode, they're still there. Wipe data, reinstall, they come back.

### M3 — The core loop 🎯

> **Done — 2026-09-16.** Verified on `Loop_API35` against the local emulator
> suite: `expense-add`, `expense-discard`, `expense-edit-delete-undo` and
> `expense-offline` all pass, twice consecutively (flake check), plus a
> 5,000-expense ledger scroll with no crash. `mock.ts` and the Squads screen are
> deleted. Two cross-cutting bugs found and fixed along the way — see
> [03-expenses.md](03-expenses.md#implementation-notes) and
> [10-architecture.md](10-architecture.md#dev-build-only-hazards).


**Goal:** the app becomes genuinely useful. **Start dogfooding here.**

- Expense entry sheet: amount pad, category strip, date, save
- Ledger: grouped by day, row detail, edit, soft delete + undo
- Everything through the expense repository, everything offline-first
- Haptics on all of it (`tap`, `selection`, `expenseSaved`, `warning`, `error`)
- **Delete `mock.ts`** — nothing is faked after this point

**You can test:** use Loop as your actual expense tracker for a week. This is the
milestone that tells you whether the 10-second target is real.

### M4 — Categories, in full

> **Native deps registered — 2026-09-20.** All four M4 native dependencies
> (`@react-native-firebase/storage`, `expo-image-manipulator`,
> `expo-file-system`, `react-native-draggable-flatlist`) are now declared in
> `package.json` and registered as config plugins in `app.json`. App layer
> complete: catalogue browse + add, custom creation (glyph or uploaded logo),
> manage screen with archive/unarchive/delete/drag reorder, and the "+" chip in
> the entry strip. Full gate green: typecheck, 155 unit tests, 40 rules tests
> (Firestore + Storage rules). **Ready for EAS dev build and device
> verification on Loop_API35.**
>
> Decisions and a rules bug the tests caught are in
> [11-firebase.md](11-firebase.md#decisions-made-while-building-m4).
>
> **Device-verified — 2026-09-27 (D1).** On the Loop_API35 emulator with EAS
> dev build `3b37050f`, `catalogue-add`, `category-archive-unarchive`,
> `category-custom-glyph`, `category-custom-logo` and
> `category-from-entry-sheet` each passed twice. Correction to the note above:
> `@react-native-firebase/storage`, `expo-image-manipulator` and
> `react-native-draggable-flatlist` ship no config plugin — listing them in
> `app.json` broke `expo config` / prebuild; they autolink and are no longer
> listed there.
>
> **Scope trim:** the catalogue is bundled-only in v1 — no live
> `catalog/categories/entries/*` override from Firestore. Docs 04/11 described
> that as a way to add catalogue entries without an app update; it earns its
> place once there's a reason to change the catalogue between releases, not
> before. `catalogueFor()` already takes the templates as data, so wiring in a
> Firestore override later is additive, not a rewrite.

- Catalogue browse + add (bundled `CATEGORY_CATALOGUE`)
- Custom category creation, glyph and uploaded logo
- Manage screen, archive/unarchive, drag reorder
- Most-used-first ordering in the entry strip

**You can test:** build the category set you actually want, and notice entry
getting faster as the strip learns.

### M5 — Insights

- `insights.ts` wired to the cached expenses, current period computed on device
- Category ranked bars, period control, day calendar strip, day detail
- **No rollup Functions yet** — client-side is correct and fast at your data size

**You can test:** a month of your own M3/M4 data, answering "where did it go".

### M6 — Streak, check-in, coins

- Check-in plate, streak capsule, optimistic prediction on device
- `onExpenseWrite` / `onCheckInCreate` Functions, coin ledger, wallet
- Coins history screen; **Keep it plain** switch
- The polished 5-step onboarding — built **now**, not first, because by this
  point you know exactly what you are onboarding people into

**You can test:** a real streak accumulating over days, and that deleting an
expense never claws anything back.

### M7 — SMS inbox (Android)

- Native SMS module + config plugin, permission explainer, 30-day backfill
- Parser + template registry in `packages/shared/src/sms/`, tested against a
  fixture corpus with no device
- Inbox screen, approve / edit / dismiss, dedupe against manual entries
- Remote Config kill switch; iOS share-sheet + paste path into the same inbox

**You can test:** your own bank messages proposing real expenses. Watch the
approve-vs-dismiss ratio — below 70% means tighten the parser, not ship it.

### M8 — Hardening and release

- Rollup Functions + `rebuildRollups`, once there's enough data to need them
- App Check enforced, account deletion Function, CSV export
- Crashlytics, perf pass at 3,000 expenses, empty states, accessibility
- **Physical-device haptic pass** — every event in [07-haptics.md](07-haptics.md)
  felt and tuned on a mid-range Android, and an iPhone once enrolled. Deferred to
  here on purpose: emulators do not vibrate, and tuning the feel of half-built
  interactions is wasted effort
- Store listings, privacy policy, data-safety form

## Sequencing notes worth arguing about

**Onboarding is built at M6, not M1.** It is the first thing a user sees and one
of the last things worth building — until the app exists, you are onboarding
people into a guess. M2 ships a silent gate (anonymous auth + auto-seeded
categories) that does onboarding's *job* in ten lines; the five polished screens
replace it once there's something to introduce.

**Cloud Functions arrive at M6, not M2.** Nothing before coins needs a trusted
server. Writing Functions earlier means maintaining them through every schema
change of M3–M5.

**Security rules arrive at M2, not M8.** The opposite call, for the opposite
reason: rules are the only thing standing between a money app and a data leak,
and retrofitting them means discovering every place the client wrote something it
shouldn't have.

**Groups stay untouched throughout.** The `squads` screen and `settle.ts` keep
compiling and keep their tests green. Do not start them ([09](09-roadmap.md)).

## Definition of done, per milestone

1. `npm run typecheck` and `npm test` pass
2. Exercised by hand on the **Android emulator** ([14-environment-setup.md](14-environment-setup.md))
3. The feature works in airplane mode
4. Every new interaction calls its haptic event from [07-haptics.md](07-haptics.md).
   *Feeling* them on a physical device is batched into M8, not done per milestone
5. Its acceptance criteria in the relevant doc are ticked
6. Docs updated in the same PR if reality diverged from them
