/**
 * Firebase App Check: callables only accept requests from this genuine app.
 * docs/11-firebase.md lists App Check with the rest of the Firebase stack.
 *
 * Play Integrity (Android) / App Attest with DeviceCheck fallback (iOS) in
 * release builds; the debug provider under __DEV__, whose token is printed to
 * logcat on first run and registered in the Firebase console (or set via
 * EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN).
 *
 * Never allowed to crash the app: a device that can't attest still opens,
 * reads its offline data and logs expenses. Only the callables refuse it.
 */

import { getApp } from '@react-native-firebase/app';
import { ReactNativeFirebaseAppCheckProvider, initializeAppCheck } from '@react-native-firebase/app-check';

let started = false;

export async function initAppCheck(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined;
    provider.configure({
      android: { provider: __DEV__ ? 'debug' : 'playIntegrity', debugToken },
      apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
    });
    await initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  } catch (error) {
    // H1's Crashlytics wrapper doesn't exist yet; when it does, report here.
    if (__DEV__) console.warn('[app-check] could not initialise', error);
  }
}
