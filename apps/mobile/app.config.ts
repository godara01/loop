/**
 * Dynamic layer over app.json.
 *
 * `google-services.json` and `GoogleService-Info.plist` are gitignored, and EAS
 * Build only uploads files tracked by git — so on the builder they arrive as
 * EAS file environment variables instead, whose value is the PATH to the
 * materialised file. A static app.json cannot read an env var, which is the
 * whole reason this file exists.
 *
 * Locally the env vars are unset and the committed paths under ./firebase/ are
 * used, so `expo prebuild` and local runs behave exactly as before.
 *
 * Everything else stays in app.json. Do not migrate config here for its own
 * sake — static config is easier to read and diff.
 */

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Loop',
  slug: config.slug ?? 'loop',
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
  ios: {
    ...config.ios,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_PLIST ?? config.ios?.googleServicesFile,
  },
});
