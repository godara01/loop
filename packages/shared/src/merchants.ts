/**
 * Merchant key normalisation.
 *
 * `merchantKey(raw)` is a pure function that collapses raw merchant strings
 * (from SMS, manual entry, or UPI handles) into a stable identity key used
 * for memory and refund matching.
 *
 * See docs/22-merchants-and-suggestions.md § Merchant keys for the full spec.
 */

import { MERCHANT_ALIASES, MERCHANT_UPI_BANKS, MERCHANT_VPA_PATTERNS } from './merchants-aliases';

export interface MerchantKeyResult {
  /** The normalised key, or null if the input is empty / reduces to nothing. */
  readonly key: string | null;
  /** True when the VPA is a person-to-person handle rather than a merchant. */
  readonly isPerson: boolean;
}

const LEGAL_SUFFIXES = /\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|INDIA|IN)\b[^A-Z0-9]*$/;

const REF_NOISE = [
  /REF\s*\d+/g,
  /TXN\s*\w+/g,
  /\b\d{6,}\b/g,
  /[*#][^*#\s]*/g,
];

const VPA_REGEX = /^([^@]+)@([^@]+)$/;

function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h.toString(16).padStart(8, '0');
}

function isMerchantVpa(localPart: string, bankPart: string, fullVpa: string): boolean {
  if (MERCHANT_UPI_BANKS.has(bankPart)) return true;
  for (const pat of MERCHANT_VPA_PATTERNS) {
    if (pat.test(fullVpa)) return true;
  }
  return false;
}

function stripLegalSuffixes(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(LEGAL_SUFFIXES, '').trimEnd();
  } while (s !== prev);
  return s;
}

/**
 * Normalise a raw merchant string into a stable key.
 *
 * @param raw - The raw merchant string from SMS, user input, or UPI metadata.
 * @param aliasTable - Optional alias table override (for Remote Config). Defaults to the shipped table.
 * @returns `{ key, isPerson }`. `key` is null when the input is empty or reduces to nothing.
 */
export function merchantKey(
  raw: string,
  aliasTable: ReadonlyMap<string, string> = MERCHANT_ALIASES,
): MerchantKeyResult {
  if (!raw || raw.trim() === '') return { key: null, isPerson: false };

  // Step 1: uppercase + NFKC
  let s = raw.trim().normalize('NFKC').toUpperCase();

  // Step 2: UPI handle detection
  const vpaMatch = VPA_REGEX.exec(s);
  if (vpaMatch) {
    const localPart = vpaMatch[1]!;
    const bankPart = vpaMatch[2]!;
    const fullVpa = s;

    if (isMerchantVpa(localPart, bankPart, fullVpa)) {
      // merchant VPA: strip digits from local part
      const merchantPart = localPart.replace(/\d+/g, '').trim();
      const key = merchantPart.length > 0 ? merchantPart : null;
      return { key, isPerson: false };
    } else {
      // person VPA: hash the full uppercased VPA
      const hash = simpleHash(fullVpa);
      return { key: `P2P:${hash}`, isPerson: true };
    }
  }

  // Step 3: strip trailing reference noise
  for (const re of REF_NOISE) {
    s = s.replace(re, ' ');
  }

  // Step 4: strip legal suffixes (repeatedly)
  s = stripLegalSuffixes(s.trim());

  // Step 5: strip punctuation (keep Unicode letters, marks, digits, spaces), collapse whitespace
  s = s.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Step 6: apply alias table
  const alias = aliasTable.get(s);
  if (alias !== undefined) s = alias;

  // Step 7: if empty, no key
  if (s.length === 0) return { key: null, isPerson: false };

  return { key: s, isPerson: false };
}
