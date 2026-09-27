/**
 * SMS auto-capture, Android only. See docs/12-sms-ingest.md.
 *
 *   enable()  — the ONLY caller of requestPermissions(); used by the explainer
 *               (You → Auto-capture) and the one-time Orbit card
 *   runner    — mounted on Orbit: while permission is granted and the Remote
 *               Config kill switch is on, every incoming SMS goes through
 *               ingestMessage → createPendingExpense; the switch flipping off
 *               stops the listener at once
 *
 * Raw messages are parsed where they arrive and dropped; nothing here logs or
 * stores a body. Failures are surfaced in useCaptureStatus, never swallowed.
 */

import { COMPILED_BUNDLED_REGISTRY, type DedupeManualExpense, type DedupePendingExpense } from '@loop/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { useSession } from '@/core/providers/bootstrap-provider';
import { useSettings } from '@/core/providers/settings-provider';
import { useExpensesForLastDays } from '@/features/expenses';
import { getTemplateOverride, initRemoteConfig, onSmsIngestEnabledChange, smsIngestEnabled } from '@/lib/remote-config';
import { type RawSmsMessage, getRecentSms, requestPermissions, startSmsListener } from '@/lib/sms-reader';

import { createPendingExpense, newPendingExpenseId } from '../api/pending-expenses-repository';
import { BACKFILL_DAYS } from '../model/capture-prompt';
import { ingestMessage } from '../model/ingest';
import { usePendingExpenses } from './use-pending-expenses';

export const SMS_CAPTURE_SUPPORTED = Platform.OS === 'android';

interface CaptureStatus {
  readonly error: string | null;
  readonly lastBackfill: number | null;
  readonly setError: (error: string | null) => void;
  readonly setBackfill: (count: number) => void;
}

/** Shared by the explainer, the Orbit card and the runner, so an error shows wherever the user is. */
export const useCaptureStatus = create<CaptureStatus>()((set) => ({
  error: null,
  lastBackfill: null,
  setError: (error) => set({ error }),
  setBackfill: (lastBackfill) => set({ lastBackfill, error: null }),
}));

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface IngestInputs {
  readonly uid: string;
  readonly pending: readonly DedupePendingExpense[];
  readonly manual: readonly DedupeManualExpense[];
}

/**
 * Parses and stores a batch. New items join the dedupe set as they are
 * created, so a bank alert and its card-network twin in one backfill still
 * collapse to one. Returns how many pending items were created.
 */
function ingestAll(messages: readonly RawSmsMessage[], inputs: IngestInputs): number {
  const registry = getTemplateOverride() ?? COMPILED_BUNDLED_REGISTRY;
  const pending: DedupePendingExpense[] = [...inputs.pending];
  let created = 0;
  // Oldest first, so the earlier of two twins is the one kept.
  for (const message of [...messages].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
    const draft = ingestMessage(message, {
      enabled: smsIngestEnabled(),
      source: 'sms',
      registry,
      existingPending: pending,
      existingManual: inputs.manual,
    });
    if (!draft) continue;
    pending.push(draft);
    created += 1;
    createPendingExpense(inputs.uid, { id: newPendingExpenseId(inputs.uid), ...draft }).catch((error: unknown) =>
      useCaptureStatus.getState().setError(`Couldn't save a captured transaction: ${describe(error)}`),
    );
  }
  return created;
}

/** The dedupe inputs, kept current in a ref so the SMS listener never reads stale lists. */
function useIngestInputs(): React.MutableRefObject<IngestInputs> {
  const { uid } = useSession();
  const pending = usePendingExpenses();
  // Backfill reaches 30 days back; the manual-expense window is ±30 min around each message.
  const recent = useExpensesForLastDays(BACKFILL_DAYS + 1);
  const inputs = useMemo<IngestInputs>(
    () => ({
      uid,
      pending: pending.status === 'ready' ? pending.snapshot.items : [],
      manual:
        recent.status === 'ready'
          ? recent.snapshot.expenses.map((e) => ({ amountMinor: e.total.minor, occurredAt: e.occurredAt, source: e.source }))
          : [],
    }),
    [uid, pending, recent],
  );
  const ref = useRef(inputs);
  ref.current = inputs;
  return ref;
}

/** For the explainer and the Orbit card. */
export function useSmsCapture() {
  const { settings, update } = useSettings();
  const inputs = useIngestInputs();
  const { error, lastBackfill, setError, setBackfill } = useCaptureStatus();
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async (): Promise<'granted' | 'denied' | 'unsupported'> => {
    if (!SMS_CAPTURE_SUPPORTED) return 'unsupported';
    setBusy(true);
    try {
      const permission = await requestPermissions();
      update({ smsCapture: permission });
      if (permission === 'denied') return 'denied';

      await initRemoteConfig();
      if (!smsIngestEnabled()) {
        setError('Auto-capture is switched off for now. Your permission is saved — it starts when it is back on.');
        return 'granted';
      }
      const messages = await getRecentSms(BACKFILL_DAYS);
      setBackfill(ingestAll(messages, inputs.current));
      return 'granted';
    } catch (failure) {
      setError(`Auto-capture couldn't read your messages: ${describe(failure)}`);
      return 'granted';
    } finally {
      setBusy(false);
    }
  }, [inputs, update, setBackfill, setError]);

  /** Records the Orbit card as shown (on display) or dismissed (Not now). Never asks the OS. */
  const dismissAs = useCallback((state: 'shown' | 'dismissed') => update({ smsCapture: state }), [update]);

  return { supported: SMS_CAPTURE_SUPPORTED, state: settings.smsCapture, busy, error, lastBackfill, enable, dismissAs };
}

/** Mounted once on Orbit. Keeps the listener in step with the permission and the kill switch. */
export function useSmsCaptureRunner(): void {
  const { settings } = useSettings();
  const inputs = useIngestInputs();
  const setError = useCaptureStatus((s) => s.setError);
  const [killSwitchOn, setKillSwitchOn] = useState(smsIngestEnabled());
  const granted = SMS_CAPTURE_SUPPORTED && settings.smsCapture === 'granted';

  useEffect(() => {
    if (!granted) return;
    const unsubscribe = onSmsIngestEnabledChange(setKillSwitchOn);
    initRemoteConfig()
      .then(() => setKillSwitchOn(smsIngestEnabled()))
      .catch((failure: unknown) => setError(`Couldn't check whether auto-capture is on: ${describe(failure)}`));
    return unsubscribe;
  }, [granted, setError]);

  useEffect(() => {
    if (!granted || !killSwitchOn) return;
    try {
      // Returned stop function runs when the kill switch flips off or permission changes.
      return startSmsListener((message) => {
        try {
          ingestAll([message], inputs.current);
        } catch (failure) {
          setError(`Couldn't read an incoming message: ${describe(failure)}`);
        }
      });
    } catch (failure) {
      setError(`Auto-capture couldn't start listening: ${describe(failure)}`);
      return undefined;
    }
  }, [granted, killSwitchOn, inputs, setError]);
}
