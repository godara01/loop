/**
 * The template registry that Remote Config can ship without an app release.
 * See docs/12-sms-ingest.md and TASKS.md N2.
 *
 * The override arrives as a JSON string. Anything wrong with it — bad JSON, a
 * wrong shape, a regex that doesn't compile, a template missing its amount
 * group — makes the whole override invalid, and the app keeps the bundled
 * registry. A half-applied override is worse than none.
 */

import { BUNDLED_REGISTRY, COMPILED_BUNDLED_REGISTRY, compileRegistry, mergeRegistry } from './templates';
import type { CompiledRegistry, TemplateRegistry, TemplateSpec } from './types';

const isString = (value: unknown): value is string => typeof value === 'string';

function asTemplateSpec(value: unknown): TemplateSpec | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = value as Record<string, unknown>;
  const fields = t.fields as Record<string, unknown> | undefined;
  if (!isString(t.id) || !isString(t.entity) || !isString(t.pattern) || !isString(t.flags)) return null;
  if (typeof fields !== 'object' || fields === null || !isString(fields.amount)) return null;
  if (fields.merchant !== undefined && !isString(fields.merchant)) return null;
  if (fields.last4 !== undefined && !isString(fields.last4)) return null;
  if (t.confidence !== undefined && typeof t.confidence !== 'number') return null;
  return {
    id: t.id,
    entity: t.entity,
    pattern: t.pattern,
    flags: t.flags,
    fields: {
      amount: fields.amount,
      ...(fields.merchant !== undefined ? { merchant: fields.merchant as string } : {}),
      ...(fields.last4 !== undefined ? { last4: fields.last4 as string } : {}),
    },
    ...(t.confidence !== undefined ? { confidence: t.confidence as number } : {}),
  };
}

function asRegistry(value: unknown): TemplateRegistry | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (!Number.isInteger(r.version) || !Array.isArray(r.templates)) return null;
  const templates = r.templates.map(asTemplateSpec);
  if (templates.some((t) => t === null)) return null;
  return { version: r.version as number, templates: templates as TemplateSpec[] };
}

/**
 * The registry to parse with, given Remote Config's raw string:
 *   - empty / missing key -> the bundled registry
 *   - a valid override     -> bundled merged with it (mergeRegistry: newer
 *                             version wins, same id replaces), compiled
 *   - anything invalid     -> null (the caller keeps the bundled registry)
 */
export function parseTemplateOverride(json: string): CompiledRegistry | null {
  if (json.trim() === '') return COMPILED_BUNDLED_REGISTRY;
  try {
    const override = asRegistry(JSON.parse(json));
    if (!override) return null;
    return compileRegistry(mergeRegistry(BUNDLED_REGISTRY, override));
  } catch {
    return null;
  }
}
