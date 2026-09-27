/**
 * Android SMS access for auto-capture. See docs/12-sms-ingest.md.
 *
 * The native module (modules/sms-reader) hands over raw messages untouched;
 * callers must parse them straight away and keep nothing but the parsed
 * fields. Never log a RawSmsMessage.
 *
 * The module is optional at runtime: on a build made before it was added,
 * everything resolves to "denied" / empty instead of crashing.
 */

import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid } from 'react-native';

export interface RawSmsMessage {
  readonly body: string;
  readonly sender: string;
  /** ISO-8601 instant the phone received the message. */
  readonly receivedAt: string;
}

interface NativeSms {
  readonly body: string;
  readonly sender: string;
  readonly timestamp: number;
}

interface SmsReaderNative {
  getRecentSms(sinceDays: number): Promise<NativeSms[]>;
  startListening(): void;
  stopListening(): void;
  addListener(event: 'onSms', listener: (message: NativeSms) => void): { remove(): void };
}

const native = requireOptionalNativeModule<SmsReaderNative>('SmsReader');

const toRaw = (m: NativeSms): RawSmsMessage => ({
  body: m.body,
  sender: m.sender,
  receivedAt: new Date(m.timestamp).toISOString(),
});

/** Asks for RECEIVE_SMS and READ_SMS together. Call only from the explicit opt-in. */
export async function requestPermissions(): Promise<'granted' | 'denied'> {
  if (!native) return 'denied';
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_SMS,
  ]);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED) ? 'granted' : 'denied';
}

/** Backfill: inbox messages from the last `sinceDays` days, newest first. */
export async function getRecentSms(sinceDays: number): Promise<RawSmsMessage[]> {
  if (!native) return [];
  return (await native.getRecentSms(sinceDays)).map(toRaw);
}

let subscription: { remove(): void } | null = null;

/** Forwards each incoming SMS. One listener at a time; returns its stop function. */
export function startSmsListener(onMessage: (message: RawSmsMessage) => void): () => void {
  if (!native) return () => {};
  stopSmsListener();
  subscription = native.addListener('onSms', (m) => onMessage(toRaw(m)));
  native.startListening();
  return stopSmsListener;
}

/** Idempotent. */
export function stopSmsListener(): void {
  subscription?.remove();
  subscription = null;
  native?.stopListening();
}
