/**
 * The masked one-line label shown on a pending-expense card.
 * See docs/12-sms-ingest.md — the pending expense has no `body` field, ever.
 *
 * The hint exists so the user can recognise a transaction at a glance without
 * the raw message being stored or displayed. It is built from already-parsed
 * fields plus the DLT sender entity; the raw SMS never reaches this function,
 * which is why there is no `body` parameter and why one must never be added.
 *
 * Shape: `HDFC ••1234 · SWIGGY`, degrading to the parts that exist.
 */

/** Separator between the account part and the merchant part. */
const SEPARATOR = ' · ';

/** Mask shown before the account digits. */
const MASK = '••';

/** How many account digits may ever be shown. */
const MAX_ACCOUNT_DIGITS = 4;

/**
 * Six-character DLT entity → the short label a user recognises.
 * Anything not listed falls back to the entity code itself, which is still
 * more useful than a blank: the user sees where the message came from.
 */
const BANK_LABELS: Readonly<Record<string, string>> = {
  HDFCBK: 'HDFC',
  ICICIB: 'ICICI',
  SBIINB: 'SBI',
  AXISBK: 'Axis',
  KOTAKB: 'Kotak',
};

/** The parsed fields the hint is built from. Deliberately not `ParsedTransaction`: no body, no amount, nothing unnecessary. */
export interface DisplayHintFields {
  readonly merchant: string | null;
  readonly accountLast4: string | null;
}

/** The short bank label for a DLT entity, or the entity itself when unknown. */
export function bankLabel(senderEntity: string): string {
  return BANK_LABELS[senderEntity.toUpperCase()] ?? senderEntity;
}

/**
 * Last four digits of an account reference, whatever length came in.
 *
 * Upstream templates are supposed to capture four digits, but a registry
 * override shipped through Remote Config could capture more. This is the one
 * place that guarantees the invariant, so a bad pattern can never leak a full
 * account number into a stored document: non-digits are dropped, then the last
 * four digits are taken.
 */
function maskedAccount(accountLast4: string): string | null {
  const digits = accountLast4.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return `${MASK}${digits.slice(-MAX_ACCOUNT_DIGITS)}`;
}

/**
 * Builds the masked hint for a pending expense.
 *
 * - both parts present → `HDFC ••1234 · SWIGGY`
 * - no merchant        → `HDFC ••1234`
 * - no account         → `HDFC · SWIGGY`
 * - neither            → `HDFC`
 *
 * The output never contains more than four digits of the account.
 */
export function buildDisplayHint(parsed: DisplayHintFields, senderEntity: string): string {
  const label = bankLabel(senderEntity);
  const account = parsed.accountLast4 === null ? null : maskedAccount(parsed.accountLast4);
  const merchant = parsed.merchant === null ? null : parsed.merchant.trim() || null;

  const head = account === null ? label : `${label} ${account}`;
  return merchant === null ? head : `${head}${SEPARATOR}${merchant}`;
}
