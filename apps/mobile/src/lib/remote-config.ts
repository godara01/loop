/**
 * Remote Config for SMS auto-capture: a kill switch and the template override.
 * See docs/12-sms-ingest.md.
 *
 * `smsIngestEnabled` is false until a fetch says otherwise — the feature must
 * be turned on deliberately, and a device that has never reached the server
 * never reads a message. The template override is validated in
 * packages/shared (parseTemplateOverride); an invalid one is ignored.
 */

import {
  activate,
  fetchAndActivate,
  getBoolean,
  getRemoteConfig,
  getString,
  onConfigUpdate,
} from '@react-native-firebase/remote-config';
import { type CompiledRegistry, parseTemplateOverride } from '@loop/shared';

export const REMOTE_CONFIG_KEYS = {
  smsIngestEnabled: 'sms_ingest_enabled',
  smsTemplateOverride: 'sms_template_override',
} as const;

const DEFAULTS = {
  [REMOTE_CONFIG_KEYS.smsIngestEnabled]: false,
  [REMOTE_CONFIG_KEYS.smsTemplateOverride]: '',
};

type Listener = (enabled: boolean) => void;

let enabled = false;
const listeners = new Set<Listener>();
let started = false;

function config() {
  const rc = getRemoteConfig();
  rc.defaultConfig = DEFAULTS;
  return rc;
}

function refresh(): void {
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
