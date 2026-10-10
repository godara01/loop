# 25 — Notifications (Reminders and Squad Push)

> **Release:** the daily reminder and recurring-due reminders ship in v1.4 (P4).
> Squad push ships in v1.5 (P5). See [27-full-ledger-plan.md](27-full-ledger-plan.md).
> **Tasks:** `NT*` in [`TASKS.md`](../TASKS.md).

v1 sends no notifications at all ([06](06-gamification.md#restraint-rules), rule 7).
This doc allows exactly three kinds, all **opt-in**, and forbids the rest.

## What is allowed, and what never is

| Allowed (opt-in) | Never |
|---|---|
| **Daily reminder**: one a day, at an hour the user picks, neutral copy | Streak-loss warnings (*"Your 12-day streak ends tonight!"*) |
| **Recurring due**: *"Rent is due today"* | Coin or reward notifications |
| **Squad activity**: entries, settlements, joins in squads the user didn't mute | Re-engagement nags (*"We miss you"*) |
| | Marketing |
| | Budget warnings. Budgets are in-app only ([19](19-budgets.md#principles-applied)) |
| | Anything sent when the user already did the thing today |

The `check:invariants` rule `mobile-no-push-registration` is **narrowed**, not
removed. It now allows push and notification APIs **only** under
`apps/mobile/src/core/notifications/`, and its positive-control test is updated.

## One library: `expo-notifications`

- **Local notifications** (reminders) are scheduled on the device.
- **Remote push** uses `getDevicePushTokenAsync()`, which returns the **raw FCM
  token** on Android. The Admin SDK `messaging().send()` in Functions sends to it
  directly. No Expo push service is involved.
- **`@react-native-firebase/messaging` is not installed.** Both libraries register
  a `FirebaseMessagingService` on Android, and two of them conflict. One library
  for local and remote is simpler.
- **iOS** remote push needs an APNs key, which needs Apple enrolment, so it ships
  on the iOS track. Local reminders work on iOS from v1.4.

### Permission

- Never requested at launch or in onboarding ([02](02-onboarding.md#principles)).
- Requested at the moment the user **turns on** a notification switch. That is
  `POST_NOTIFICATIONS` on Android 13+ and `requestPermissionsAsync` on iOS.
- **Denied**: the switch flips back off, and an inline note says *"Notifications
  are off for Loop in system settings."* with an **Open settings** link. The app
  never asks again by itself.
- **Revoked later in system settings**: on foreground, the app reads the
  permission. If it was revoked, every switch shows as off with the same note.
  Settings are not rewritten, so re-granting restores them.

## Settings

**You → Notifications** (`/settings/notifications`), stored in `settings/app.notifications`:

```ts
interface NotificationSettings {
  readonly dailyReminder: { readonly enabled: boolean; readonly hour: number; readonly minute: number };  // default off, 21:00
  readonly recurringDue: boolean;   // default off
  readonly squadActivity: boolean;  // default off; per-squad mute on top
}
```

## Daily reminder

- **Copy:** title *"Loop"*, body *"Anything to log today?"*. Never a streak count,
  never an amount, never the user's name.
- **Fires** at the chosen local time, **only if today isn't banked yet**: no
  check-in exists for today's local date.

### Scheduling

There is no server and no background task. A pure **planner** decides what to
schedule:

```ts
// apps/mobile/src/core/notifications/reminder-plan.ts  (pure, unit-tested)
function planReminders(now, settings, bankedDates: Set<string>, horizonDays = 7): ScheduledReminder[];
```

1. On **every app foreground**, on **day banked** (check-in or a logged
   transaction), and on **settings change**:
   - cancel all Loop reminder notifications (they're identified by
     `data.kind === 'dailyReminder'`), then
   - schedule **one-shot** notifications for each of the next 7 local days at
     `hour:minute`, **skipping today if it's banked** or if the time has passed.
2. Local scheduling can't check "is today banked?" at fire time, so the app
   cancels today's reminder **the moment the day is banked**. Opening the app at
   any point re-plans the next 7 days. That is enough: a user who doesn't open
   the app for 7 days gets 7 reminders, then nothing. **Silence after a week is
   intended.** The app stops reminding someone who has stopped using it.
3. Time zone change: re-planning on foreground uses the new local time.

**Tap** opens the app to `/expense/new`. The reminder exists to get an entry
logged in under 10 seconds.

## Recurring due

When `recurringDue` is on, the planner also schedules, for each active recurring
rule ([20](20-recurring.md)), a notification at **09:00 local** on each occurrence
date in the next 7 days that is not already handled or skipped.

- **Copy:** *"Rent is due today · ₹25,000"*. The amount shows here because the
  user wrote this rule. This is the one notification with an amount, and the
  settings text says so.
- **Tap** opens `/inbox`, scrolled to the Due group.
- Approving or skipping an occurrence cancels its notification (identified by
  `data.occurrenceId`).

## Squad push

### Tokens

- When `squadActivity` is turned on (and on every foreground while it is on),
  `getDevicePushTokenAsync()` is called and upserted into
  `users/{uid}/devices/{installationId}`:
  `{token, platform, appVersion, lastSeenAt}`. `installationId` is a random id
  stored in SecureStore, so reinstalling gives a fresh row. This collection
  already exists in the rules (owner read/write).
- Turning the switch off deletes the row. Sign-out deletes it before signing out
  ([16](16-account-linking.md#flow-sign-out)).

### Sending

The squad Functions ([23](23-squads.md#notifications)) build the recipient list:
active members who are involved in the event, are not the actor, have
`squadActivity` on, and have not muted this squad in `groupIndex/{g}.muted`. Then:

- `sendEach` to all of their `devices` tokens.
- **Prune:** tokens that fail with `messaging/registration-token-not-registered`
  or `invalid-argument` are deleted.
- **Content:** `notification: {title: <squad name>, body: "Ana added 'Dinner'"}`
  and `data: {route: '/squads/<id>'}`. **No amounts by default.**
- **Collapse:** `android.collapseKey = groupId`, so a burst of 10 entries shows as
  one updated notification, not 10.
- **Quiet hours:** none server-side. Android channels let the user silence them.
  Two channels: `reminders` (default importance) and `squads` (default
  importance).

### Delivery while the app is open

A foreground message never shows a system notification. It fires no haptic,
because it isn't the user's action. The squad's unread dot updates through
Firestore anyway.

## Module layout

```
apps/mobile/src/core/notifications/
  notifications.ts        the only file importing expo-notifications
  reminder-plan.ts        pure planner (+ tests)
  tokens.ts               device token registration / removal
apps/mobile/src/features/settings/screens/notifications-screen.tsx
functions/src/push.ts     sendToMembers(groupId, recipients, payload) + token pruning
```

## Haptics

| Action | Event |
|---|---|
| Notification switches | `toggleOn` / `toggleOff` |
| Reminder time change | `selection` |
| Incoming notification | **None** |

## Edge cases

| Case | Behaviour |
|---|---|
| The user logs at 20:55 with the reminder at 21:00 | Banking cancels today's notification immediately |
| The user banks the day on another device | This device doesn't know until it re-plans on foreground. The reminder may fire. **Accepted.** At most one extra neutral notification. Documented in the setting description: *"If you use Loop on two phones, each reminds separately."* |
| Exact alarms not permitted (Android 14) | Inexact scheduling (± a few minutes). No `SCHEDULE_EXACT_ALARM` permission is requested |
| The device reboots | expo-notifications reschedules persisted notifications. The next foreground re-plans anyway |
| Keep it plain on | Reminders are unaffected. They are a utility, not gamification |
| A muted squad | No pushes for it, and the unread dot still works |
| A token belongs to a signed-out install | Deleted at sign-out. If that failed, it is pruned on the first send failure |
| One user, two phones, both opted in | Both receive squad pushes. Each phone schedules its own reminders |

## Acceptance criteria

- [ ] `planReminders` tests: banked today skips today; a past time today skips
      today; 7-day horizon; turning off cancels everything; time zone change.
- [ ] No notification permission prompt appears anywhere except on a switch turned
      on (Maestro: fresh install → full journey → no system dialog).
- [ ] Reminder copy never contains a number other than the time (grep the copy
      module).
- [ ] The narrowed `mobile-no-push-registration` invariant fails a
      positive-control file outside `core/notifications`.
- [ ] Squad push: the actor never receives their own event; muted squads send
      nothing; invalid tokens are deleted (Functions test with a stubbed
      messaging).
- [ ] Device: the reminder arrives at the set time on `Loop_API35` when the day is
      not banked, and doesn't arrive when it is (D queue).
