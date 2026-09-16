/**
 * Which Firebase this bundle talks to. Read from `apps/mobile/.env` by Expo at
 * bundle time, so changing it needs a Metro restart.
 *
 * EAS builds have no `.env` (it is gitignored), so a built APK always talks to
 * the real project. Only a local Metro session opts into the emulators.
 */
export const firebaseEnv = {
  useEmulators: process.env.EXPO_PUBLIC_USE_EMULATORS === 'true',
  /**
   * `localhost` works on the Android emulator because RNFirebase rewrites it to
   * 10.0.2.2, the emulator's alias for this machine. A physical phone needs the
   * machine's LAN IP instead.
   */
  emulatorHost: process.env.EXPO_PUBLIC_EMULATOR_HOST || 'localhost',
} as const;
