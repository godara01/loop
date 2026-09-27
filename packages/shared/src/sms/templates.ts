import type { CompiledRegistry, CompiledTemplate, TemplateRegistry, TemplateSpec } from './types';

/** Used when a template does not state its own confidence. */
export const DEFAULT_TEMPLATE_CONFIDENCE = 0.85;

/** Building blocks for the bundled patterns. JSON-serialisable strings, like everything in the registry. */
const CUR = String.raw`(?:Rs\.?|INR|₹)\s*`;
const AMT = String.raw`(?<amount>[0-9][0-9,]*(?:\.\d{1,2})?)`;
const MASK = String.raw`[xX*]*`;

/**
 * Specific shapes first — they also capture the merchant — then the older
 * generic per-bank patterns as a fallback. Message shapes follow the banks'
 * public alert formats; see __tests__/fixtures/sms-corpus.ts.
 */
export const BUNDLED_REGISTRY = {
  version: 2,
  templates: [
    {
      // Rs.450.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-12:20:15:11.
      id: 'hdfc_card_spent',
      entity: 'HDFCBK',
      pattern: `${CUR}${AMT}\\s+spent on HDFC Bank Card ${MASK}(?<last4>\\d{4}) at (?<merchant>.+?) on `,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 12/09/26
      id: 'hdfc_upi_sent',
      entity: 'HDFCBK',
      pattern: `Sent ${CUR}${AMT}\\s+From HDFC Bank A/C ${MASK}(?<last4>\\d{4})\\s+To (?<merchant>[^\\n]+?)\\s*(?:\\n|$)`,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // ICICI Bank Acct XX567 debited for Rs 1,299.00 on 12-Sep-26; CODECADEMY credited.
      id: 'icici_upi_debit',
      entity: 'ICICIB',
      pattern: `Acct ${MASK}(?<last4>\\d{3,4}) debited for ${CUR}${AMT} on [^;]+; (?<merchant>.+?) credited`,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // INR 2,500.00 spent using ICICI Bank Card XX9012 on 12-Sep-26 on AMAZON. Avl Limit: ...
      id: 'icici_card_spent',
      entity: 'ICICIB',
      pattern: `${CUR}${AMT} spent (?:using|on) ICICI Bank Card ${MASK}(?<last4>\\d{4}) on \\S+ (?:on|at) (?<merchant>.+?)\\.\\s`,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // Dear UPI user A/C X4321 debited by 200.0 on date 12Sep26 trf to SWIGGY Refno 625812345678.
      id: 'sbi_upi_debit',
      entity: 'SBIINB',
      pattern: `A/C ${MASK}(?<last4>\\d{4}) debited by ${AMT} on date \\S+ trf to (?<merchant>.+?) Ref`,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.9,
    },
    {
      // Rs.849.00 spent on your SBI Credit Card ending 7788 at BIGBASKET on 12/09/26.
      id: 'sbicard_spent',
      entity: 'SBICRD',
      pattern: `${CUR}${AMT} spent on your SBI Credit Card ending (?<last4>\\d{4}) at (?<merchant>.+?) on `,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // INR 5,000.00 debited\nA/c no. XX2211\n12-09-26, 18:04:33\nUPI/P2M/625812345678/CROMA
      id: 'axis_upi_debit',
      entity: 'AXISBK',
      pattern: `${CUR}${AMT}\\s+debited\\s+A/c no\\. ${MASK}(?<last4>\\d{4})\\s+[\\d-]+,? [\\d:]+\\s+UPI/P2[AM]/\\d+/(?<merchant>[^\\n]+?)\\s*(?:\\n|$)`,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // Spent\nCard no. XX2211\nINR 1,200\n12-09-26 18:04:33 IST\nZOMATO\nAvl Limit: INR 45,000
      id: 'axis_card_spent',
      entity: 'AXISBK',
      pattern: `Spent\\s+Card no\\. ${MASK}(?<last4>\\d{4})\\s+${CUR}${AMT}\\s+[\\d-]+ [\\d:]+(?: IST)?\\s+(?<merchant>[^\\n]+?)\\s*\\n`,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.95,
    },
    {
      // Sent Rs.120.00 from Kotak Bank AC X4455 to uber@axis on 12-09-26.UPI Ref 625811.
      id: 'kotak_upi_sent',
      entity: 'KOTAKB',
      pattern: `Sent ${CUR}${AMT} from Kotak Bank AC ${MASK}(?<last4>\\d{4}) to (?<merchant>\\S+?) on `,
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4', merchant: 'merchant' },
      confidence: 0.9,
    },
    {
      id: 'hdfc_debit',
      entity: 'HDFCBK',
      pattern: '(?=.*(?:debited|spent|charged))(?=.*?(?<last4>\\d{4}))(?=.*?Rs\\.?\\s*(?<amount>[0-9,]+(?:\\.\\d{1,2})?))',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
      confidence: 0.7,
    },
    {
      id: 'icici_debit',
      entity: 'ICICIB',
      pattern: 'account\\s+(?<last4>\\d{4})\\D+?debited\\D+?(?:Rs\\.?\\s*)?(?<amount>[0-9,]+(?:\\.\\d{1,2})?)',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
      confidence: 0.8,
    },
    {
      id: 'sbi_debit',
      entity: 'SBIINB',
      pattern: 'Amount\\s+(?:Rs\\.?\\s*)?(?<amount>[0-9,]+(?:\\.\\d{1,2})?)\\D+?debited\\D+?(?:account|a/c).*?(?<last4>\\d{4})',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
      confidence: 0.8,
    },
    {
      id: 'axis_debit',
      entity: 'AXISBK',
      pattern: '(?:INR|Rs\\.?)\\s*(?<amount>[0-9,]+(?:\\.\\d{1,2})?)\\s+(?:has been )?debited.*?(?:A/c|account).*?(?<last4>\\d{4})',
      flags: 'i',
      fields: { amount: 'amount', last4: 'last4' },
      confidence: 0.8,
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
  if (
    template.confidence !== undefined &&
    !(Number.isFinite(template.confidence) && template.confidence >= 0 && template.confidence <= 1)
  ) {
    throw new Error(`SMS template "${template.id}" confidence must be between 0 and 1`);
  }

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
