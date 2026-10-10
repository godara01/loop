/**
 * Remote Config for SMS auto-capture: a kill switch and the template override.
 * See docs/12-sms-ingest.md.
 *
 * `smsIngestEnabled` is false until a fetch says otherwise — the feature must
 * be turned on deliberately, and a device that has never reached the server
 * never reads a message. The template override is validated in
 * packages/shared (parseTemplateOverride); an invalid one is ignored.
 *
 * `min_supported_build` is the force-update gate (docs/27). Returns null until
 * a fetch succeeds, so an offline-only device is never blocked.
 */

import {
  activate,
  fetchAndActivate,
  getBoolean,
  getNumber,
  getRemoteConfig,
  getString,
  getValue,
  onConfigUpdate,
} from '@react-native-firebase/remote-config';
import { AppState } from 'react-native';
import { type CompiledRegistry, parseTemplateOverride } from '@loop/shared';

export const REMOTE_CONFIG_KEYS = {
  smsIngestEnabled: 'sms_ingest_enabled',
  smsTemplateOverride: 'sms_template_override',
  minSupportedBuild: 'min_supported_build',
} as const;

const DEFAULTS = {
  [REMOTE_CONFIG_KEYS.smsIngestEnabled]: false,
  [REMOTE_CONFIG_KEYS.smsTemplateOverride]: '',
  [REMOTE_CONFIG_KEYS.minSupportedBuild]: 0,
};

type Listener = (enabled: boolean) => void;

let enabled = false;
const listeners = new Set<Listener>();
/** Notified after every activation, whatever changed (the update gate listens). */
const activationListeners = new Set<() => void>();
let started = false;

/**
 * The SDK default is 12h, which would leave a flipped kill switch unseen for
 * half a day. Real-time updates are meant to cover that, but on device
 * (2026-09-28, D5) the stream never delivered, so every foreground re-fetches
 * too, at most this often.
 */
const MINIMUM_FETCH_INTERVAL_MS = __DEV__ ? 0 : 15 * 60 * 1000;

let instance: ReturnType<typeof getRemoteConfig> | null = null;

function config() {
  if (instance) return instance;
  instance = getRemoteConfig();
  instance.defaultConfig = DEFAULTS;
  instance.settings = { minimumFetchIntervalMillis: MINIMUM_FETCH_INTERVAL_MS, fetchTimeoutMillis: 60_000 };
  return instance;
}

function refresh(): void {
  for (const listener of activationListeners) listener();
  const next = getBoolean(config(), REMOTE_CONFIG_KEYS.smsIngestEnabled);
  if (next === enabled) return;
  enabled = next;
  for (const listener of listeners) listener(enabled);
}

/**
 * Fetches once and subscribes to real-time updates. Safe to call repeatedly;
 * a failed fetch (offline) leaves the defaults in place.
 */
export async function initRemoteConfig(): Promise<void> {
  if (started) return;
  started = true;
  const rc = config();
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline or throttled: keep the last activated values (or the defaults).
  }
  refresh();
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    fetchAndActivate(config()).then(refresh, () => {
      // Offline or throttled: keep what is active.
    });
  });
  onConfigUpdate(rc, {
    next: () => {
      activate(rc).then(refresh, () => {});
    },
    error: () => {},
    complete: () => {},
  });
}

/** The kill switch. False until fetched. */
export function smsIngestEnabled(): boolean {
  return enabled;
}

/** Called whenever the kill switch flips. Returns an unsubscribe. */
export function onSmsIngestEnabledChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The registry to parse with: bundled when the key is missing, bundled plus a
 * valid override, or null when the override is invalid (use the bundled one).
 */
export function getTemplateOverride(): CompiledRegistry | null {
  return parseTemplateOverride(getString(config(), REMOTE_CONFIG_KEYS.smsTemplateOverride));
}

/**
 * The minimum build number required to use the app, or null when this device
 * has never activated a value from the server. Offline-first: a device that
 * never reached Remote Config is never blocked. Activated values persist
 * across launches, so a device offline today keeps the last server value.
 */
export function minSupportedBuild(): number | null {
  const value = getValue(config(), REMOTE_CONFIG_KEYS.minSupportedBuild);
  if (value.getSource() !== 'remote') return null;
  return getNumber(config(), REMOTE_CONFIG_KEYS.minSupportedBuild);
}

/** Runs `listener` after each Remote Config activation. Returns an unsubscribe. */
export function onRemoteConfigActivated(listener: () => void): () => void {
  activationListeners.add(listener);
  return () => activationListeners.delete(listener);
}
