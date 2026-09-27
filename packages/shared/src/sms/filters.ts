/**
 * Hard exclusions and direction. See docs/12-sms-ingest.md#filtering.
 *
 * Every pattern here is specific on purpose. Real debit alerts routinely carry
 * words a lazy filter trips on — "Avl Bal" after the amount, "Card valid till",
 * a merchant called CODECADEMY, "credited to VPA" naming the payee, an offer
 * footer — and a filter that drops a real debit is worse than one that lets a
 * promo through to the template stage, which will not match it anyway.
 *
 * Pure: the body is read, never stored or logged.
 */

export type ExclusionReason = 'otp' | 'balance' | 'promo' | 'declined' | 'reversal';

/** Money left the account. Present in every debit alert, absent from pure enquiries and promos. */
const DEBIT_VERB = /\b(?:debited|spent|withdrawn|paid|charged|sent|purchase[ds]?|txn of|transaction of)\b/i;

const OTP = [
  /\bOTP\b/i,
  /\bone[\s-]?time[\s-]?pass(?:word|code)\b/i,
  /\bverification code\b/i,
  // "code is 482913" / "PIN: 4829" — a code followed by digits, never the bare word.
  /\b(?:code|pin)\s*(?:is|:)\s*\d{4,8}\b/i,
];

const DECLINED = [
  /\bdeclined\b/i,
  /\b(?:transaction|txn|payment)\s+(?:has\s+)?failed\b/i,
  /\bunsuccessful\b/i,
  /\bwas not successful\b/i,
  /\bcould not be (?:processed|completed)\b/i,
  /\binsufficient (?:funds|balance)\b/i,
];

const REVERSAL = [/\brevers(?:ed|al)\b/i, /\brefund(?:ed)?\b/i, /\bcredited back\b/i];

/** A balance enquiry or statement — only when no money moved. */
const BALANCE = [
  /\b(?:available|avl\.?|a\/c|account|closing|ledger)\s+bal(?:ance)?\b.*\b(?:is|as on|as of)\b/i,
  /\byour (?:account |a\/c )?balance is\b/i,
  /\bmini statement\b/i,
];

/** Marketing — only when no money moved. */
const PROMO = [
  /\bpre[\s-]?approved\b/i,
  /\b(?:personal|instant|home|car) loan\b/i,
  /\bapply now\b/i,
  /\blimited[\s-]period\b/i,
  /\bcashback (?:of )?up to\b/i,
  /\bupgrade (?:your|now)\b/i,
  /\b(?:0|zero)% (?:interest|EMI)\b/i,
  /\bT&C\b/i,
];

const CREDIT_VERB = /\b(?:credited|received|deposited)\b/i;

const any = (patterns: readonly RegExp[], body: string) => patterns.some((p) => p.test(body));

/**
 * Why this message must be dropped, or null if it may go on to the templates.
 * Order matters: an OTP for a payment mentions an amount and a merchant, and a
 * declined or reversed payment still says "debited".
 */
export function classifyExclusion(body: string): ExclusionReason | null {
  if (any(OTP, body)) return 'otp';
  if (any(DECLINED, body)) return 'declined';
  if (any(REVERSAL, body)) return 'reversal';
  const moved = DEBIT_VERB.test(body);
  if (!moved && any(BALANCE, body)) return 'balance';
  if (!moved && any(PROMO, body)) return 'promo';
  return null;
}

/**
 * Money arrived. MVP ingests debits only. A UPI debit says the payee was
 * "credited", so a credit verb counts only when no debit verb is present.
 */
export function isCredit(body: string): boolean {
  return CREDIT_VERB.test(body) && !DEBIT_VERB.test(body);
}
