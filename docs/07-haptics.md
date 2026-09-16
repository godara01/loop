# 07 — Haptics

## The rule

Components never import `expo-haptics`. They name an **event**; the semantic
layer at [`apps/mobile/src/lib/haptics.ts`](../apps/mobile/src/lib/haptics.ts)
decides what that feels like on this platform.

```ts
import { haptic } from '@/lib/haptics';
haptic('expenseSaved');
```

The indirection is not ceremony. iOS renders CoreHaptics patterns reliably;
Android's coverage is uneven and budget devices have coarse rotational motors
that cannot render anything subtle. One file knows that; nothing else should.

## Events

The vocabulary already implemented — `tap`, `selection`, `press`, `dragStart`,
`dragTick`, `dragDrop`, `splitConfirm`, `settleSuccess`, `streakAdvance`,
`toggleOn`, `toggleOff`, `warning`, `error` — stays as-is.

v1 adds **two** events to `HapticEvent`, because reusing `splitConfirm` for a
personal expense would be a lie the code has to keep telling:

| New event | Meaning | iOS | Android |
|---|---|---|---|
| `expenseSaved` | An expense is committed to the ledger | `notificationAsync(Success)` | `AndroidHaptics.Confirm` |
| `destructive` | A soft-delete or archive is confirmed | `notificationAsync(Warning)` then `impactAsync(Heavy)` | `AndroidHaptics.Reject` |

`splitConfirm`, `settleSuccess`, `dragTick` and friends remain defined and are
used by v1 only where genuinely applicable (`dragStart`/`dragTick`/`dragDrop` for
category reordering); the rest wait for Squads.

## Where each event fires in v1

| Surface | Action | Event |
|---|---|---|
| Any tactile plate | Press down | `press` |
| Tab dock | Switch tab | `tap` |
| Number pad | Digit key | `tap` |
| Number pad | Backspace | `selection` |
| Number pad | Invalid keystroke (second `.`, extra decimal) | `warning` |
| Entry sheet | Select category chip | `selection` |
| Entry sheet | Save success | `expenseSaved` |
| Entry sheet | Save failure / validation block | `error` |
| Entry sheet | Discard prompt appears | `warning` |
| Ledger | Row tap | `tap` |
| Ledger | Swipe passes delete threshold | `dragStart` |
| Ledger | Delete confirmed | `destructive` |
| Ledger | Undo delete | `tap` |
| Categories | Create success | `splitConfirm` |
| Categories | Reorder drag | `dragStart` → `dragTick` → `dragDrop` |
| Categories | Archive / delete confirmed | `destructive` |
| Inbox | Approve a proposed expense | `expenseSaved` |
| Inbox | Approve all | `expenseSaved`, once for the batch |
| Inbox | Dismiss a proposal | `destructive` |
| Categories | Add from the catalogue | `selection` per tile, `splitConfirm` on add |
| Insights | Change period, swipe day | `selection` |
| Orbit | Check-in plate | `press`, then `streakAdvance` |
| Orbit | Streak milestone | `streakAdvance` |
| You | Any switch | `toggleOn` / `toggleOff` |
| You | Reset app confirmed | `error` |
| Onboarding | Demo plates | `splitConfirm`, `error` |

Anything not on this list does **not** vibrate. Restraint is the whole point: if
everything buzzes, nothing means anything.

## Sequencing

- **Never fire two haptics within 150ms.** They merge into one mushy buzz and the
  vocabulary collapses. Where a flow needs two (save → streak advance), the second
  fires after the sheet dismisses.
- Multi-beat patterns (`streakAdvance`, `settleSuccess`) are *one* event, composed
  inside `haptics.ts`. Never compose them at the call site.
- Haptics fire on **press-in** for plates (the physical metaphor: the plate
  bottoms out) and on **completion** for outcomes.

## Gesture-thread safety

`haptic()` is fire-and-forget, never throws, and never awaits at the call site.
It is safe from Reanimated gesture callbacks. When called from a worklet, hop to
the JS thread with `runOnJS(haptic)('dragTick')`.

## User control

- A master **Haptics** switch in **You**, persisted to `settings`, wired to
  `setHapticsEnabled()`. Default on.
- The **Keep it plain** switch ([06](06-gamification.md#restraint-rules))
  additionally suppresses `streakAdvance`.
- With haptics off, every call is a silent no-op — no visual substitute, no
  fallback sound.
- Missing motor, denied VIBRATE permission, or an emulator: silently no-op. A
  device without a motor MUST never break a money flow.

## Accessibility

- Haptics are **never the only signal.** Every event on the list above has a
  visual counterpart — a colour change, a shake, a chip. A user with haptics off,
  or a device without a motor, loses nothing but pleasure.
- Respect the system reduce-motion setting for celebrations. Reduce-motion
  suppresses the *animation*, not the haptic.

## Testing

**Wire haptics in as features are built; verify them at the end.** Every new
interaction calls its semantic event the day it is written, so nothing is
retrofitted. But emulators do not vibrate, and tuning the feel of interactions
that are still changing is wasted effort — so the physical-device pass happens
once, in M8 ([13-build-plan.md](13-build-plan.md)), on:

1. A physical iPhone (the reference feel), and
2. A physical **mid-range Android** — this is where the feel is hardest to get
   right and where most users are.

Until then, the only per-feature haptic requirement is that the right event is
called at the right moment, which is reviewable in code.

The **You** screen keeps a debug list of every `HapticEvent` (already present in
[`profile.tsx`](../apps/mobile/src/app/%28tabs%29/profile.tsx)) so a device can be
audited in one pass. Keep it updated as events are added; it is the fastest
regression test the tactile layer has.

## Acceptance criteria

- [ ] `expo-haptics` is imported in exactly one file in the repo.
- [ ] `expenseSaved` and `destructive` exist for both platforms and appear in the
      **You** debug list.
- [ ] No code path fires two haptics within 150ms.
- [ ] With haptics off, the full expense flow works and nothing vibrates.
- [ ] On a device reporting no vibrator, no unhandled rejection is logged.
