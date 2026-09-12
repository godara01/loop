# 02 — Onboarding

## Goal

Get a first expense logged inside 90 seconds, and teach the app's one novel
idea — that it feels like something — while doing it. No account, no email, and
no permission prompts at all.

## Principles

- **Nothing here is a form to be endured.** Five steps, one decision each.
- **Every step is skippable except the name and currency**, and skipping never
  leaves the app in a broken state.
- **No sign-up.** The app calls `signInAnonymously()` during the splash, so a
  real `uid` exists before the first screen and every security rule works, with
  zero friction ([11-firebase.md](11-firebase.md#auth-model)). Linking a Google,
  Apple or phone credential is offered later, in context, and never as a wall.
- **No permission prompts here.** Not notifications, not camera, and not SMS.
  Each is requested at the moment it is first useful
  ([12-sms-ingest.md](12-sms-ingest.md#permissions-ux)).

## The gate

On launch, the bootstrap sequence
([10-architecture.md](10-architecture.md#feature-bootstrap-sequence)) resolves the
anonymous session and reads `profile.onboardedAt`.

| State | Behaviour |
|---|---|
| No profile doc, or `onboardedAt` null | Redirect to `/onboarding`, tabs unreachable |
| `onboardedAt` set | Redirect away from `/onboarding` to `/(tabs)` |

The gate reads through the **local cache**, so a returning user offline lands on
their ledger, never back in onboarding. The splash stays up until fonts, auth and
this read have resolved — with a 2s budget, after which the app proceeds in
degraded mode rather than hanging on the network. Fonts already gate the splash in
[`_layout.tsx`](../apps/mobile/src/app/_layout.tsx); the rest joins that gate.

## Steps

### Step 1 — Welcome

**Route:** `/onboarding`

One screen, one sentence, one button.

- Wordmark, the line *"Track what you spend. Feel it land."*
- A single `TactileButton` — **Start**. Pressing it is the user's first taste of
  the plate collapsing.
- Haptic: `press` on the button.

### Step 2 — Profile

**Route:** `/onboarding/profile`

The only required step.

| Field | Rules |
|---|---|
| Display name | 1–40 chars after trim. Required. Used only for greetings; never leaves the device in v1. |
| Currency | One of `INR`, `USD`, `EUR`, `GBP`, `JPY` (from `CurrencyCode`). Defaults from device locale, falling back to `INR`. |

- Currency is presented as a row of monospace chips, not a picker wheel.
- **Currency is effectively permanent.** Changing it later does not convert
  historical amounts, so the setting screen requires an explicit typed
  confirmation ([04](04-categories.md) style destructive pattern) and the
  onboarding copy says *"You can't change this later without starting over."*
- Continue is disabled until the name is non-empty. A disabled press fires
  `warning`, never silence.
- Haptic: `selection` on each currency chip, `press` on Continue.

### Step 3 — Feel

**Route:** `/onboarding/feel`

The step that explains the product.

- Copy: *"Loop talks back. Every save, every streak, every mistake has its own
  feel."*
- A **Try it** plate that fires `splitConfirm`, and a second that fires `error`,
  so the user learns the two ends of the vocabulary.
- A single toggle: **Haptics on**. Default **on**. Writing it calls
  `setHapticsEnabled()` from [`haptics.ts`](../apps/mobile/src/lib/haptics.ts) and
  persists to `settings`.
- If `expo-device` reports an emulator, or the device has no vibrator, show
  *"This device can't do haptics — everything else still works."* and skip the
  demo plates rather than firing silent no-ops.
- Haptic: `toggleOn` / `toggleOff` on the switch.

### Step 4 — Categories

**Route:** `/onboarding/categories`

- The **8 essentials** from [04-categories.md](04-categories.md#tier-1--essentials)
  are shown as selectable tags with their logos, all **on** by default.
- The user may deselect any (deselected are still written, with `archivedAt` set,
  so re-enabling later is one tap and no data is lost).
- **Browse more** opens the catalogue inline; anything added there is installed
  with the essentials in the same write.
- An inline **+ New** creates a custom category without leaving the step.
- At least one category must remain active; deselecting the last fires `warning`
  and refuses.
- Haptic: `selection` per tag, `press` on Continue.

### Step 5 — First expense

**Route:** `/onboarding/first-expense`

The same entry sheet as [03-expenses.md](03-expenses.md), presented inline with
the heading *"Log something you spent today."*

- **Skip** is available and prominent enough to find, but the primary action is
  Save.
- On save: write the expense and the check-in ([06](06-gamification.md)) — the
  `first_expense` and `check_in` coins follow from the Cloud Function — then set
  `profile.onboardedAt` and hand off to Orbit.
- On skip: set `onboardedAt`, land on Orbit with the empty state below.
- Haptic: `expenseSaved` on save, then `streakAdvance` when Orbit mounts and the
  streak reads 1.

## Empty states after onboarding

These matter more than the onboarding screens — most users will see them.

| Surface | Empty copy | Action |
|---|---|---|
| Orbit | *"Nothing logged today."* + the check-in plate | Add expense |
| Ledger | *"Your ledger starts here."* | Add expense |
| Insights | *"Log a few days and this fills in."* | Add expense |
| Insights, <3 days of data | Show real data, plus a muted note *"Trends need about a week."* — never fake a chart | — |
| Inbox | *"Transaction messages will show up here for you to approve."* | Turn on auto-capture (Android) |

## Re-onboarding and reset

- **You → Reset app** deletes the user's Firestore subtree and Storage prefix via
  the account-deletion Function, clears the local cache, and returns to step 1.
  It is destructive: typed confirmation ("RESET"), `error` haptic on the confirm,
  no silent path. A linked account is signed out; an anonymous one is deleted.
- There is no partial "redo onboarding" flow. Categories, name and haptics are
  all editable in **You**.

## Acceptance criteria

- [ ] A cold install lands on `/onboarding` and cannot reach the tabs by any
      route until `onboardedAt` is set.
- [ ] Killing the app mid-onboarding resumes at the same step, with earlier
      answers preserved.
- [ ] Completing all five steps with no skips produces: a profile doc, 8 active
      categories, one expense, a streak of 1, and a coin balance that settles to
      a non-zero value once the Function runs.
- [ ] Skipping steps 3–5 produces a usable app with haptics on and 8 categories.
- [ ] The whole flow is completable in under 90 seconds by someone who has seen
      it once.
- [ ] The entire flow completes in airplane mode, and syncs when connectivity
      returns.
- [ ] No permission dialog appears at any point in onboarding.
