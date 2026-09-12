/**
 * Semantic haptics for Loop.
 *
 * Components never call expo-haptics directly — they name the *event*
 * ("splitConfirm", "dragTick") and this module picks the best available
 * pattern for the platform. That indirection matters because the two
 * platforms are genuinely unequal:
 *
 *   iOS     — CoreHaptics via UIFeedbackGenerator. Rich, consistent, reliable.
 *   Android — VibrationEffect primitives on API 30+, but OEM coverage is
 *             wildly uneven and budget devices have coarse rotational motors
 *             that cannot render anything subtle. We map to the closest
 *             stock constant and accept a blunter feel.
 *
 * Every call is fire-and-forget and swallows failures: a missing motor must
 * never break a money flow.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticEvent =
  /** Generic light acknowledgement — icon taps, nav. */
  | 'tap'
  /** Moving between chips, segments, category pills. */
  | 'selection'
  /** An arcade plate button physically depressing. */
  | 'press'
  /** Lifting an expense card to begin a drag-and-split. */
  | 'dragStart'
  /** Crossing a member boundary while dragging — the ratchet feel. */
  | 'dragTick'
  /** Releasing onto a member. */
  | 'dragDrop'
  /** The split is committed and the ledger balances. */
  | 'splitConfirm'
  /** A debt is settled and cleared. */
  | 'settleSuccess'
  /** A streak day is banked. */
  | 'streakAdvance'
  /** Toggle switches. */
  | 'toggleOn'
  | 'toggleOff'
  /** Rejected input — over budget, percentages that don't total 100. */
  | 'warning'
  | 'error';

let enabled = true;

/** Wire this to the user's settings toggle. */
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

export function areHapticsEnabled(): boolean {
  return enabled;
}

/**
 * Trigger a semantic haptic. Safe to call from anywhere, including gesture
 * callbacks — it never throws and never blocks.
 */
export function haptic(event: HapticEvent): void {
  if (!enabled) return;
  void run(event).catch(() => {
    // A device without a motor, or a denied vibrate permission, is not an error.
  });
}

async function run(event: HapticEvent): Promise<void> {
  if (Platform.OS === 'android') return runAndroid(event);
  if (Platform.OS === 'ios') return runIOS(event);
  // Web and anything else: no-op.
}

async function runIOS(event: HapticEvent): Promise<void> {
  const { ImpactFeedbackStyle, NotificationFeedbackType } = Haptics;

  switch (event) {
    case 'tap':
      return Haptics.impactAsync(ImpactFeedbackStyle.Light);
    case 'selection':
    case 'dragTick':
      return Haptics.selectionAsync();
    case 'press':
      // Rigid reads as a hard mechanical plate rather than a soft cushion.
      return Haptics.impactAsync(ImpactFeedbackStyle.Rigid);
    case 'dragStart':
      return Haptics.impactAsync(ImpactFeedbackStyle.Soft);
    case 'dragDrop':
      return Haptics.impactAsync(ImpactFeedbackStyle.Medium);
    case 'splitConfirm':
      return Haptics.notificationAsync(NotificationFeedbackType.Success);
    case 'settleSuccess':
      // Two-beat flourish: the thud of the plate, then the confirmation.
      await Haptics.impactAsync(ImpactFeedbackStyle.Heavy);
      await wait(90);
      return Haptics.notificationAsync(NotificationFeedbackType.Success);
    case 'streakAdvance':
      // Three quick ascending taps — the arcade "level up".
      await Haptics.impactAsync(ImpactFeedbackStyle.Light);
      await wait(70);
      await Haptics.impactAsync(ImpactFeedbackStyle.Medium);
      await wait(70);
      return Haptics.impactAsync(ImpactFeedbackStyle.Heavy);
    case 'toggleOn':
      return Haptics.impactAsync(ImpactFeedbackStyle.Rigid);
    case 'toggleOff':
      return Haptics.impactAsync(ImpactFeedbackStyle.Soft);
    case 'warning':
      return Haptics.notificationAsync(NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(NotificationFeedbackType.Error);
  }
}

async function runAndroid(event: HapticEvent): Promise<void> {
  const { AndroidHaptics, ImpactFeedbackStyle, NotificationFeedbackType } = Haptics;

  // Stock Android constants are tuned by the OEM and feel far better than
  // raw durations, so we prefer them wherever one fits the gesture.
  switch (event) {
    case 'tap':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Virtual_Key);
    case 'selection':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Segment_Tick);
    case 'dragTick':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Clock_Tick);
    case 'press':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Context_Click);
    case 'dragStart':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Drag_Start);
    case 'dragDrop':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Gesture_End);
    case 'splitConfirm':
    case 'settleSuccess':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Confirm);
    case 'streakAdvance':
      // No stock "celebrate" constant, so we build one from impacts.
      await Haptics.impactAsync(ImpactFeedbackStyle.Light);
      await wait(80);
      return Haptics.impactAsync(ImpactFeedbackStyle.Heavy);
    case 'toggleOn':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Toggle_On);
    case 'toggleOff':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Toggle_Off);
    case 'warning':
      return Haptics.notificationAsync(NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.performAndroidHapticsAsync(AndroidHaptics.Reject);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
