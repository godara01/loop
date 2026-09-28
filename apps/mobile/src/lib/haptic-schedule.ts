/**
 * docs/07 sequencing: never two haptics within 150ms, or they merge into one
 * mushy buzz. Enforced here, in one place, rather than trusted to call sites.
 *
 * The gap runs from the END of the previous event — a multi-beat pattern such as
 * `streakAdvance` occupies the motor for its whole length. An event that arrives
 * too soon is deferred into the next free slot, except continuous ticks
 * (`selection`, `dragTick`), which are dropped: a fast drag must not build a
 * backlog that keeps buzzing after the finger stops.
 */
import type { HapticEvent } from './haptics';

export const MIN_GAP_MS = 150;

/** How long each multi-beat pattern keeps the motor busy (the longer platform). */
const PATTERN_MS: Partial<Record<HapticEvent, number>> = {
  streakAdvance: 140,
  settleSuccess: 90,
  destructive: 90,
};

const CONTINUOUS: ReadonlySet<HapticEvent> = new Set<HapticEvent>(['selection', 'dragTick']);

export interface HapticSlot {
  /** Milliseconds to wait before firing. */
  readonly delay: number;
  /** The earliest the next event may start. */
  readonly nextFreeAt: number;
}

/** When `event`, arriving at `now`, may fire — or null to drop it. */
export function scheduleHaptic(nextFreeAt: number, event: HapticEvent, now: number): HapticSlot | null {
  const delay = Math.max(0, nextFreeAt - now);
  if (delay > 0 && CONTINUOUS.has(event)) return null;
  const start = now + delay;
  return { delay, nextFreeAt: start + (PATTERN_MS[event] ?? 0) + MIN_GAP_MS };
}
