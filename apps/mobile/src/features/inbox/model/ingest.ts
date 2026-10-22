/**
 * One raw message in, one pending-expense draft (or nothing) out. Pure.
 * See docs/12-sms-ingest.md#the-pipeline.
 *
 *   enabled? → parse (sender allowlist, exclusions, templates) → dedupe → draft
 *
 * v1.2 (docs/12, docs/17 § Credit SMS): the draft also says what it proposes —
 * `kind`, `merchantKey`, the account its last4 matches, the income category,
 * and for a refund the purchase it most likely refunds. Transfer pairs are
 * found when the inbox renders (`inboxCards`), because a fresh draft has no id
 * to pair with yet.
 *
 * The raw body is read here and goes no further: the draft carries parsed
 * fields and a masked display hint only.
 */

import {
  type Account,
  BANK_SENDER_ENTITIES,
  type Category,
  type CompiledRegistry,
  type Expense,
  type DedupeManualExpense,
  type DedupePendingExpense,
  type ParsedTransaction,
  buildDisplayHint,
  isDuplicatePendingExpense,
  matchAccount,
  matchRefund,
  merchantKey,
  parseTransactionSms,
  senderEntity,
} from '@loop/shared';

import type { PendingExpense } from './approval';
import { classifyMessage } from './classify';

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
  // ——— v1.2, all optional: without them the draft just carries fewer suggestions ———
  /** For `suggestedAccountId` (docs/18 § SMS account matching). */
  readonly accounts?: readonly Account[];
  /** To resolve the income category slug to the user's category id. */
  readonly categories?: readonly Category[];
  /** Live expenses from the last 60 days, for `suggestedRefundOf` (docs/17 § Refund matching). */
  readonly refundCandidates?: readonly Expense[];
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
  const { kind, incomeSlug } = classifyMessage(parsed.direction, raw.body);
  const accounts = ctx.accounts ?? [];
  const incomeCategory = incomeSlug
    ? (ctx.categories ?? []).find((c) => c.archivedAt === null && c.slug === incomeSlug && (c.type ?? 'expense') === 'income')
    : undefined;
  const key = parsed.merchant ? merchantKey(parsed.merchant).key : null;

  const draft: PendingDraft = {
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
    kind,
    merchantKey: key,
    suggestedAccountId: matchAccount(parsed.accountLast4, accounts)?.id ?? null,
    ...(incomeCategory ? { suggestedCategoryId: incomeCategory.id } : {}),
  };
  if (kind !== 'refund') return draft;
  // matchRefund reads the pending's own fields; the id isn't assigned yet.
  const refund = matchRefund({ ...draft, id: '' }, ctx.refundCandidates ?? [], accounts);
  return { ...draft, suggestedRefundOf: refund?.expense.id ?? null };
}
