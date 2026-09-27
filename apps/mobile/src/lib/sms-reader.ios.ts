/**
 * iOS has no SMS access for third-party apps. Same exports as sms-reader.ts,
 * never touching a native module, so shared code needs no platform checks.
 */

export interface RawSmsMessage {
  readonly body: string;
  readonly sender: string;
  readonly receivedAt: string;
}

export async function requestPermissions(): Promise<'granted' | 'denied'> {
  return 'denied';
}

export async function getRecentSms(_sinceDays: number): Promise<RawSmsMessage[]> {
  return [];
}

export function startSmsListener(_onMessage: (message: RawSmsMessage) => void): () => void {
  return () => {};
}

export function stopSmsListener(): void {}
