import { parseAmount, type CurrencyCode } from '../money';
import type {
  CompiledRegistry,
  CompiledTemplate,
  ParsedTransaction,
  TemplateRegistry,
  TemplateSpec,
} from './types';

export const BUNDLED_REGISTRY = {
  version: 1,
  templates: [
    {
      id: 'hdfc_debit',
      entity: 'HDFCBK',
      pattern: '(?=.*(?:debited|spent|charged))(?=.*?(?<last4>\\d{4}))(?=.*?Rs\\.?\\s*(?<amount>[0-9,]+(?:\\.\\d{1,2})?))',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
    },
    {
      id: 'icici_debit',
      entity: 'ICICIB',
      pattern: 'account\\s+(?<last4>\\d{4})\\D+?debited\\D+?(?:Rs\\.?\\s*)?(?<amount>[0-9,]+(?:\\.\\d{1,2})?)',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
    },
    {
      id: 'sbi_debit',
      entity: 'SBIINB',
      pattern: 'Amount\\s+(?:Rs\\.?\\s*)?(?<amount>[0-9,]+(?:\\.\\d{1,2})?)\\D+?debited\\D+?(?:account|a/c).*?(?<last4>\\d{4})',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
    },
    {
      id: 'axis_debit',
      entity: 'AXISBK',
      pattern: '(?:INR|Rs\\.?)\\s*(?<amount>[0-9,]+(?:\\.\\d{1,2})?)\\s+(?:has been )?debited.*?(?:A/c|account).*?(?<last4>\\d{4})',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
    },
  ],
} as const satisfies TemplateRegistry;

function namedGroupNames(pattern: string): ReadonlySet<string> {
  const groups = new Set<string>();
  for (const match of pattern.matchAll(/\(\?<([A-Za-z][A-Za-z0-9_]*)>/g)) {
    if (match[1]) groups.add(match[1]);
  }
  return groups;
}

function validateTemplate(template: TemplateSpec): void {
  if (!template.id) throw new Error('SMS template id must not be empty');
  if (!template.entity) throw new Error(`SMS template "${template.id}" entity must not be empty`);
  if (!template.fields.amount) throw new Error(`SMS template "${template.id}" must define an amount field`);

  let pattern: RegExp;
  try {
    pattern = new RegExp(template.pattern, template.flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SMS template "${template.id}" has an invalid pattern: ${message}`);
  }

  const groups = namedGroupNames(pattern.source);
  for (const field of [template.fields.amount, template.fields.merchant, template.fields.last4]) {
    if (field && !groups.has(field)) {
      throw new Error(`SMS template "${template.id}" is missing named group "${field}"`);
    }
  }
}

export function compileRegistry(registry: TemplateRegistry): CompiledRegistry {
  if (!Number.isInteger(registry.version) || registry.version < 1) {
    throw new Error('SMS template registry version must be a positive integer');
  }

  const ids = new Set<string>();
  const templates: CompiledTemplate[] = registry.templates.map((template) => {
    if (ids.has(template.id)) throw new Error(`SMS template registry has duplicate id "${template.id}"`);
    ids.add(template.id);
    validateTemplate(template);
    return { ...template, pattern: new RegExp(template.pattern, template.flags) };
  });

  return { version: registry.version, templates };
}

export function mergeRegistry(
  bundled: TemplateRegistry,
  override: TemplateRegistry | null | undefined,
): TemplateRegistry {
  if (!override || override.version < bundled.version) return bundled;

  const overrides = new Map(override.templates.map((template) => [template.id, template]));
  const templates = bundled.templates.map((template) => overrides.get(template.id) ?? template);
  for (const template of override.templates) {
    if (!bundled.templates.some((bundledTemplate) => bundledTemplate.id === template.id)) {
      templates.push(template);
    }
  }

  return { version: override.version, templates };
}

export const COMPILED_BUNDLED_REGISTRY = compileRegistry(BUNDLED_REGISTRY);
export const SMS_TEMPLATES = COMPILED_BUNDLED_REGISTRY.templates;

function senderEntity(sender: string): string | null {
  const match = /^[A-Z]{2}-([A-Z0-9]{6})$/i.exec(sender);
  return match?.[1]?.toUpperCase() ?? null;
}

function parseIndianAmount(text: string): number | null {
  const money = parseAmount(text, 'INR');
  return money?.minor ?? null;
}

export function parseTransactionSms(
  body: string,
  sender: string,
  receivedAt: string,
  minConfidence = 0,
): ParsedTransaction | null {
  const entity = senderEntity(sender);
  if (!entity) return null;

  for (const template of SMS_TEMPLATES) {
    if (template.entity !== entity) continue;
    template.pattern.lastIndex = 0;
    const match = template.pattern.exec(body);
    if (!match?.groups) continue;

    const amount = match.groups[template.fields.amount];
    if (!amount) continue;
    const amountMinor = parseIndianAmount(amount);
    if (amountMinor === null) continue;

    if (0.85 < minConfidence) continue;

    return {
      amountMinor,
      currency: 'INR' as CurrencyCode,
      direction: 'debit',
      merchant: template.fields.merchant ? match.groups[template.fields.merchant] ?? null : null,
      accountLast4: template.fields.last4 ? match.groups[template.fields.last4] ?? null : null,
      occurredAt: receivedAt,
      templateId: template.id,
      confidence: 0.85,
    };
  }

  return null;
}
