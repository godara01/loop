/**
 * Is the native Firebase SDK actually linked into this binary?
 *
 * This exists for one reason: to make the M0 acceptance check visible on device.
 * `@react-native-firebase/*` is a native module, so it is present in an EAS
 * development build and absent in Expo Go — and the failure mode of "absent" is
 * a red screen at import time, which tells you nothing useful.
 *
 * So the import is guarded. In Expo Go this reports `linked: false` and the rest
 * of the app carries on working; in a dev build it reports the project id the
 * binary was actually compiled against, which is the thing worth verifying.
 *
 * Delete this once M2 has a real AuthProvider that would fail loudly anyway.
 */

export interface FirebaseStatus {
  readonly linked: boolean;
  readonly projectId: string | null;
  readonly appId: string | null;
  readonly error: string | null;
}

export function firebaseStatus(): FirebaseStatus {
  try {
    // Deliberately dynamic: a static import would crash Expo Go at load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const firebase = require('@react-native-firebase/app') as {
      getApp: () => { options: { projectId?: string; appId?: string } };
    };

    const options = firebase.getApp().options;
    return {
      linked: true,
      projectId: options.projectId ?? null,
      appId: options.appId ?? null,
      error: null,
    };
  } catch (error) {
    return {
      linked: false,
      projectId: null,
      appId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
