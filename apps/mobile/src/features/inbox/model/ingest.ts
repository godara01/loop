/**
 * One raw message in, one pending-expense draft (or nothing) out. Pure.
 * See docs/12-sms-ingest.md#the-pipeline.
 *
 *   enabled? → parse (sender allowlist, exclusions, templates) → dedupe → draft
 *
 * The raw body is read here and goes no further: the draft carries parsed
 * fields and a masked display hint only.
 */

import {
  BANK_SENDER_ENTITIES,
  type CompiledRegistry,
  type DedupeManualExpense,
  type DedupePendingExpense,
  type ParsedTransaction,
  buildDisplayHint,
  isDuplicatePendingExpense,
  parseTransactionSms,
  senderEntity,
} from '@loop/shared';

import type { PendingExpense } from './approval';

export interface RawMessage {
  readonly body: string;
  /** The DLT header for a received SMS; null for pasted text, whose sender is unknown. */
  readonly sender: string | null;
  /** ISO instant the message arrived (or was pasted). */
  readonly receivedAt: string;
}

/** The create payload for createPendingExpense, minus the id the repository assigns. */
export type PendingDraft = Omit<PendingExpense, 'id'> & { readonly source: 'sms' | 'pasted' };

export interface IngestContext {
  readonly enabled: boolean;
  readonly source: 'sms' | 'pasted';
  readonly registry?: CompiledRegistry;
  readonly extraEntities?: readonly string[];
  readonly existingPending: readonly DedupePendingExpense[];
  readonly existingManual: readonly DedupeManualExpense[];
  /** When the draft is created; defaults to the message's receivedAt. */
  readonly now?: string;
}

interface Match {
  readonly parsed: ParsedTransaction;
  readonly entity: string;
}

/**
 * Pasted text has no sender, so each registered bank's templates are tried in
 * turn — the "pasted sender path". Exclusions still apply: a pasted OTP is
 * still an OTP.
 */
function parse(raw: RawMessage, ctx: IngestContext): Match | null {
  const opts = { registry: ctx.registry, extraEntities: ctx.extraEntities };
  if (raw.sender !== null) {
    const parsed = parseTransactionSms(raw.body, raw.sender, raw.receivedAt, opts);
    const entity = senderEntity(raw.sender);
    return parsed && entity ? { parsed, entity } : null;
  }
  for (const entity of [...BANK_SENDER_ENTITIES, ...(ctx.extraEntities ?? [])]) {
    const parsed = parseTransactionSms(raw.body, `XX-${entity}`, raw.receivedAt, opts);
    if (parsed) return { parsed, entity };
  }
  return null;
}

export function ingestMessage(raw: RawMessage, ctx: IngestContext): PendingDraft | null {
  if (!ctx.enabled) return null;

  const match = parse(raw, ctx);
  if (!match) return null;
  const { parsed, entity } = match;

  const candidate = { amountMinor: parsed.amountMinor, accountLast4: parsed.accountLast4, occurredAt: parsed.occurredAt };
  if (isDuplicatePendingExpense(candidate, ctx.existingPending, ctx.existingManual)) return null;

  const now = ctx.now ?? raw.receivedAt;
  return {
    status: 'pending',
    amountMinor: parsed.amountMinor,
    currency: parsed.currency,
    merchant: parsed.merchant,
    accountLast4: parsed.accountLast4,
    occurredAt: parsed.occurredAt,
    receivedAt: raw.receivedAt,
    source: ctx.source,
    templateId: parsed.templateId,
    confidence: parsed.confidence,
    suggestedCategoryId: null,
    suggestionConfidence: null,
    suggestionModelVersion: null,
    expenseId: null,
    displayHint: buildDisplayHint(parsed, entity),
    createdAt: now,
    updatedAt: now,
  };
}
