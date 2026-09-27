/**
 * One message in, one debit (or nothing) out. See docs/12-sms-ingest.md#the-parser.
 *
 *   sender allowlist → hard exclusions → credit? → template match → confidence ≥ 0.6
 *
 * Each stage can only say no. A message that is not from a registered bank is
 * dropped before its body is looked at; an OTP or a declined payment never
 * reaches the templates; credits are dropped because v1 has no income model.
 *
 * Pure and body-blind on the way out: the result carries parsed fields only.
 */

import { parseAmount } from '../money';
import { classifyExclusion, isCredit } from './filters';
import { isAllowlistedSender, senderEntity } from './sender';
import { COMPILED_BUNDLED_REGISTRY, DEFAULT_TEMPLATE_CONFIDENCE } from './templates';
import type { CompiledRegistry, ParsedTransaction } from './types';

/** Below this, a match is not trusted enough to put in front of the user. */
export const MIN_PARSE_CONFIDENCE = 0.6;

export interface ParseOptions {
  /** Defaults to the bundled registry; N2 passes the Remote Config merge. */
  readonly registry?: CompiledRegistry;
  /** Sender entities beyond the shipped bank list (Remote Config, dev sender). */
  readonly extraEntities?: readonly string[];
}

export function parseTransactionSms(
  body: string,
  sender: string,
  receivedAt: string,
  opts: ParseOptions = {},
): ParsedTransaction | null {
  const { registry = COMPILED_BUNDLED_REGISTRY, extraEntities = [] } = opts;

  if (!isAllowlistedSender(sender, extraEntities)) return null;
  const entity = senderEntity(sender)!;
  if (classifyExclusion(body) !== null) return null;
  if (isCredit(body)) return null;

  for (const template of registry.templates) {
    if (template.entity.toUpperCase() !== entity) continue;
    const confidence = template.confidence ?? DEFAULT_TEMPLATE_CONFIDENCE;
    if (confidence < MIN_PARSE_CONFIDENCE) continue;

    template.pattern.lastIndex = 0;
    const groups = template.pattern.exec(body)?.groups;
    if (!groups) continue;

    const rawAmount = groups[template.fields.amount];
    const amount = rawAmount ? parseAmount(rawAmount, 'INR') : null;
    if (!amount || !Number.isInteger(amount.minor) || amount.minor <= 0) continue;

    const merchant = template.fields.merchant ? groups[template.fields.merchant]?.trim() || null : null;
    const accountLast4 = template.fields.last4 ? groups[template.fields.last4] ?? null : null;

    return {
      amountMinor: amount.minor,
      currency: amount.currency,
      direction: 'debit',
      merchant,
      accountLast4,
      // Bank timestamps come in a dozen formats; until a template extracts
      // one, the moment the phone received the message stands in for it.
      occurredAt: receivedAt,
      templateId: template.id,
      confidence,
    };
  }

  return null;
}
