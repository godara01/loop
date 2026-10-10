# 16 — Account Linking and Sign-in

> **Release:** v1.1 (Phase P1 of [27-full-ledger-plan.md](27-full-ledger-plan.md)).
> **Tasks:** `L*` in [`TASKS.md`](../TASKS.md).

Every Loop install starts as an anonymous Firebase user ([11-firebase.md](11-firebase.md#auth-model)).
That keeps onboarding to zero forms. The catch is that the data is tied to that
one install: reinstalling or losing the phone loses everything. This doc covers
how a user makes their data durable, how they get it back on a new phone, and
how they leave.

## Principles

- **Never a wall.** An anonymous user can use every feature, Squads included.
  Linking is offered when the user would benefit, and declining costs nothing.
- **Same uid, data intact.** Linking attaches a credential to the existing
  anonymous user with `linkWithCredential`. Nothing is copied or migrated.
- **No identity data in Firestore.** Email and phone number live only in Firebase
  Auth. The profile stores `isAnonymous` and nothing else about the credential.
- **Never merge two accounts.** Merging two ledgers needs category-id remapping,
  coin-ledger reconciliation and squad seat conflicts. A merge that gets any of
  that wrong corrupts money data. When two accounts collide, the user picks one,
  and the app is explicit about what is lost.
- **Online only, and the UI says so.** Every action in this doc needs the
  network. Offline, the buttons are disabled with the copy *"Needs a connection."*.
  They never spin forever.

## Providers

| Provider | Ships in | Package | Notes |
|---|---|---|---|
| **Google** | v1.1 | `@react-native-google-signin/google-signin` | Needs the SHA-1 and SHA-256 of the EAS dev key, the upload key **and** the Play App Signing key in Firebase ([14](14-environment-setup.md)). The free tier of this library wraps Google's legacy sign-in API, which Google has deprecated; see [Risks](#risks). |
| **Phone (OTP)** | v1.1 | `@react-native-firebase/auth` (`verifyPhoneNumber`) | Uses Play Integrity on Android. The SMS region policy MUST allow **India only** at launch, to limit SMS-pumping fraud. Each SMS is billed on Blaze. |
| **Apple** | iOS track | `expo-apple-authentication` | App Store rule 4.8 requires it once Google is offered on iOS. Needs an Apple Developer account, so it ships with the iOS build. |

The provider list is data (`AUTH_PROVIDERS` in `core/auth`), so the iOS track adds
Apple by adding a row, not by rewriting screens.

## Where linking is offered

| Surface | Trigger | Copy |
|---|---|---|
| **You → Account → "Back up my data"** | Always visible while anonymous | *"Your data lives on this phone only. Link an account to keep it if you reinstall or switch phones."* |
| End of onboarding (step 5 success) | Once, as a muted line under the success state. **Not a button, not a sheet** | *"Your data lives on this phone. You can back it up from You any time."* |
| Squads → accept invite / create squad | Before the first squad action while anonymous | A sheet with **Link Google**, **Use phone** and **Not now**. *Not now* proceeds. [23-squads.md](23-squads.md#anonymous-members) explains why the prompt is there. |
| Reset app | When an anonymous user opens Reset | One muted line: *"Export first — an anonymous account can't be recovered."* |

No other surface prompts. No timed nags, no badge on the avatar.

## Flow: link an anonymous account

**Route:** `/settings/account` (modal sheet).

1. The user taps **Continue with Google** or **Use phone number**. Haptic: `press`.
2. The app gets a credential:
   - Google: `GoogleSignin.signIn()` → `GoogleAuthProvider.credential(idToken)`.
   - Phone: the number is entered on a mono keypad pre-filled with `+91`. Then
     `verifyPhoneNumber`, then a 6-digit code field. On Android, auto-retrieval
     can fill the code. Resend is allowed after a 30s countdown, at most 3 times.
3. `currentUser.linkWithCredential(credential)`.
4. On success:
   - `updateProfile(uid, { isAnonymous: false })`.
   - If `displayName` is empty or the default, fill it from the Google profile
     name. Never overwrite a name the user typed.
   - The sheet shows *"Backed up as <masked email or phone>"*. Mask format:
     `s•••••0@gmail.com`, `+91 ••••• •4321`.
   - Haptic: `splitConfirm`.
5. The You → Account row now shows the provider tag (`GOOGLE` / `PHONE`) instead
   of `ANONYMOUS`.

### Link errors

| Error code | What the user sees | What happens |
|---|---|---|
| `auth/credential-already-in-use` | *"That Google account already has Loop data."* with **Switch to that account** and **Cancel** | See [Switching to an existing account](#flow-switching-to-an-existing-account) |
| `auth/provider-already-linked` | *"Already linked."* | Close the sheet and refresh the provider list |
| `auth/invalid-verification-code` | *"That code didn't match."* inline, code field cleared | Haptic: `warning`. Retry allowed |
| `auth/code-expired` / `auth/session-expired` | *"Code expired — send a new one."* | Back to the send-code step |
| `auth/too-many-requests` | *"Too many tries. Try again later."* | Disable for the remaining back-off |
| `auth/network-request-failed` | *"Needs a connection."* | No state changes |
| User cancels the Google picker (`SIGN_IN_CANCELLED`) | Nothing | Silent return, no haptic |
| Anything else | *"Couldn't link right now."* | `recordError(err, 'errorCode', code)` via the crashlytics wrapper. Haptic: `error` |

## Flow: switching to an existing account

This happens when the credential already belongs to another Loop user. Usually
that is the user's own account from an old phone.

The device holds an anonymous ledger, and the credential belongs to a different
uid. The user chooses one, and **the anonymous one is erased**.

1. **Count local data.** Read the cached count of live transactions.
   - **0 transactions**: skip to step 5 with no confirmation. A fresh install
     that taps "I already use Loop" must not see scary copy.
2. **Explain.** *"Switching signs this phone into your other account. The N
   expenses on this phone will be erased."*
3. **Offer export.** The **Export CSV first** button runs the existing export
   ([08-data-model.md](08-data-model.md#export)). Switching is not blocked on it.
4. **Confirm.** The user types `SWITCH`. Haptic: `warning` when the sheet opens.
5. **Erase and switch.** Each step is safe to re-run if the network drops
   part-way through:
   1. Check the device is online. If not, stop with *"Needs a connection."*
   2. Call `deleteUserData`. Once Squads exist, this first turns the user's
      squad seats into placeholders ([23-squads.md](23-squads.md#account-deletion)).
   3. Call `currentUser.delete()` on the anonymous user.
   4. Run the existing reset path in `features/onboarding/api/reset.ts`:
      `terminate()` → `clearPersistence()`.
   5. `signInWithCredential(credential)`.
   6. `reloadAppAsync()`. The bootstrap gate then reads the account's profile.
      If `onboardedAt` is set, the user lands on Orbit with their old data
      streaming in. Otherwise onboarding runs with that uid.
6. Haptic: `destructive` on confirm.

If step 5.2 succeeds and 5.5 fails, the user ends up signed out with no local
data. On relaunch the app signs in anonymously and shows Welcome. They can tap
**I already use Loop** and finish. Nothing is lost that wasn't already being
erased.

## Flow: "I already use Loop" (new device)

**Route:** `/onboarding` (Welcome) gets a secondary text button under **Start**.

1. At this point the splash has already signed in anonymously and seeded a
   profile and categories. That is fine.
2. The user picks a provider and gets a credential, as above.
3. The app calls `signInWithCredential(credential)` directly, without trying to
   link first. Before switching, it calls `deleteUserData` for the throwaway
   anonymous uid. That uid has only seed data, so nothing of value is lost and no
   confirmation is shown.
4. The app reloads.
   - If the account's profile has `onboardedAt`, the user goes straight to Orbit.
     Categories, settings, streak and coins all come from the server.
   - If the account exists but never finished onboarding, it resumes at its
     stored `settings.onboardingStep`.
   - If the credential is brand new (no Loop user), Firebase creates a new uid.
     The user goes through onboarding normally, already linked.
5. **Offline at Welcome:** the button is disabled with *"Needs a connection."*.

## Flow: sign out

Only for **linked** users. Anonymous users have no sign-out, only Reset
([02-onboarding.md](02-onboarding.md#re-onboarding-and-reset)), because signing
out of an anonymous account is the same as deleting it.

1. **You → Account → Sign out.**
2. Call `waitForPendingWrites()` with a **5s timeout**.
   - Resolves: continue.
   - Times out: *"Some changes haven't synced yet. Signing out now loses them."*
     with **Wait** (retry) and **Sign out anyway**. Haptic: `warning`.
3. `terminate()` → `clearPersistence()` → `signOut()` → `reloadAppAsync()`. The
   splash signs in anonymously and the user lands on Welcome. They can tap
   **I already use Loop** to come back.
4. Local-only state is cleared too: the draft store, undo store, reminder
   schedule ([25](25-notifications.md)), widget snapshot ([26](26-shortcuts-and-widget.md))
   and the stored FCM token row (`users/{uid}/devices/{token}` is deleted before
   `signOut`).

## Unlinking a provider

You → Account lists the linked providers. **Unlink** appears only when **two or
more** are linked. A linked account can never go back to anonymous, because that
would strand the data.

## Account deletion

This is the existing Reset app flow ([02](02-onboarding.md#re-onboarding-and-reset),
C3 in TASKS.md), with two changes:

- Linked accounts: if `deleteUserData` or `user.delete()` returns
  `auth/requires-recent-login`, the app re-authenticates with the same provider.
  That is a Google picker or a fresh OTP. Then it retries.
- Once Squads exist, `deleteUserData` turns the user's seats into placeholders
  instead of leaving dangling `memberUids`.

## Data

| Field | Where | Notes |
|---|---|---|
| `isAnonymous` | `users/{uid}` profile | Already exists. The client sets it to `false` after a successful link. Rules: owner-writable, as today |
| Provider list, email, phone | Firebase Auth only | Read with `currentUser.providerData` for display. **Never written to Firestore** |

There are no new collections and no new Functions. `deleteUserData` (C3) gains
seat conversion in Phase P5.

## Module layout

```
apps/mobile/src/core/auth/
  providers.ts          AUTH_PROVIDERS table; credential getters per provider
  link-service.ts       linkWithProvider, signInWithProvider, switchAccount, signOutSafely
  link-errors.ts        error code → user-facing state (pure; unit tested)
  mask.ts               maskEmail / maskPhone (pure; unit tested)
apps/mobile/src/features/account/
  screens/account-screen.tsx       /settings/account
  components/phone-otp-sheet.tsx
  components/switch-account-sheet.tsx
```

Only `core/auth/*` imports the Google sign-in SDK or calls Firebase Auth linking
APIs (import rule 5 in [10-architecture.md](10-architecture.md#import-rules)).

## Haptics

| Action | Event |
|---|---|
| Provider button | `press` |
| Link success | `splitConfirm` |
| Wrong OTP code | `warning` |
| Switch-account sheet opens | `warning` |
| Switch confirmed | `destructive` |
| Sign-out with unsynced writes warning | `warning` |
| Unexpected failure | `error` |

## Edge cases

| Case | Behaviour |
|---|---|
| Offline when opening `/settings/account` | Provider buttons disabled with *"Needs a connection."*. The current status still renders from cache |
| App killed during the Google picker | Nothing changed. The next open shows the same state |
| App killed between `deleteUserData` and `signInWithCredential` | Relaunch signs in anonymously and lands on Welcome. **I already use Loop** completes the switch |
| The same Google account is linked on two phones | Both phones are the same uid, which is expected. Both stay in sync through Firestore |
| Two anonymous phones want to share one account | Not possible. Each anonymous install is its own uid. Link one, then on the other use **I already use Loop**, which erases that phone's anonymous data after a warning and the export offer |
| A linked user on an old app build | The `minSupportedBuild` gate ([27](27-full-ledger-plan.md#force-update-gate)) forces an update before v2 data shapes exist |
| Phone number already used by another Loop user | Same as `credential-already-in-use`: offer to switch |
| Google returns no `idToken` (misconfigured SHA) | `error` and *"Couldn't link right now."*. Logged with `errorCode=google-no-id-token`. This is an owner config fix, see [14](14-environment-setup.md) |
| The user revokes Loop from their Google account | Firebase keeps the session until token refresh fails. Then the user is signed out and `onAuthStateChanged` with `null` sends them to the anonymous flow |
| SMS region policy blocks a non-Indian number | *"Phone sign-in isn't available for this country yet. Use Google."* |
| Anonymous uid with squad seats links successfully | Seats stay, because the uid is unchanged. Nothing to do |
| Anonymous uid with squad seats switches account | `deleteUserData` turns the seats into placeholders. The other squad members can re-invite the user to claim them |

## Validation

| Rule | Where |
|---|---|
| Phone number must be valid E.164 after normalisation | `core/auth/phone.ts` (pure) |
| OTP code is exactly 6 digits | Input mask |
| The `SWITCH` confirmation is exact, case-sensitive | Sheet |
| Unlink is allowed only when `providerData.length >= 2` | Screen and service both check |

## Risks

- **Legacy Google sign-in API.** The free `google-signin` build wraps Google's
  deprecated legacy API. If Google removes it, move to the Credential Manager
  build. The `providers.ts` abstraction confines that change to one file.
- **SMS pumping.** Phone auth is a known fraud target. Mitigations: the India-only
  region policy, Play Integrity, App Check, and a Cloud Billing budget alert on
  Identity Platform SMS spend.

## Acceptance criteria

- [ ] An anonymous user with 50 expenses links Google, and the uid is unchanged
      before and after (checked in the emulator Auth export).
- [ ] After linking, a reinstall followed by **I already use Loop** with the same
      Google account shows all 50 expenses, the categories, streak and coin
      balance.
- [ ] Phone OTP link works on the emulator with a test phone number, including a
      wrong-code retry.
- [ ] `credential-already-in-use` shows the switch sheet. Cancel changes nothing,
      and Switch erases the anonymous data and lands in the other account.
- [ ] The switch sheet is skipped silently when the device has 0 transactions.
- [ ] Sign-out with an unsynced write (airplane mode) shows the warning, and
      **Wait** keeps the user signed in.
- [ ] Every button in this doc is disabled offline with *"Needs a connection."*.
- [ ] No email, phone number or provider uid appears in any Firestore document
      (grep the emulator export).
- [ ] `mask.ts` and `link-errors.ts` have unit tests for every row of the error
      table.
