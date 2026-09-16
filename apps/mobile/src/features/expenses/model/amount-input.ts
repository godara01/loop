/**
 * The amount pad's input model. See docs/03-expenses.md#the-number-pad.
 *
 * Pure: every keypress is a transition, and a rejected keypress is reported
 * rather than swallowed, so the pad can answer it with a `warning` haptic.
 * The typed text stays a string and becomes money only through `parseAmount`,
 * so there is no float anywhere between the key and the ledger.
 */

import { CURRENCY_SYMBOL, type CurrencyCode, type Money, minorDigits, parseAmount } from '@loop/shared';

export type AmountKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.'
  | 'backspace'
  | 'clear';

export interface AmountInput {
  readonly text: string;
}

export interface KeyResult {
  readonly input: AmountInput;
  /** False when the key was refused, such as a second decimal point. */
  readonly accepted: boolean;
}

export const EMPTY_AMOUNT: AmountInput = { text: '' };

/** 99,99,99,999 — far above any personal expense, and far inside integer precision. */
export const MAX_WHOLE_DIGITS = 9;

export function pressKey(input: AmountInput, key: AmountKey, currency: CurrencyCode): KeyResult {
  const { text } = input;
  const refuse: KeyResult = { input, accepted: false };

  if (key === 'clear') return { input: EMPTY_AMOUNT, accepted: text.length > 0 };
  if (key === 'backspace') return { input: { text: text.slice(0, -1) }, accepted: text.length > 0 };

  const dot = text.indexOf('.');
  const digits = minorDigits(currency);

  if (key === '.') {
    if (digits === 0 || dot !== -1) return refuse;
    return { input: { text: text === '' ? '0.' : `${text}.` }, accepted: true };
  }

  if (dot !== -1) {
    return text.length - dot - 1 >= digits ? refuse : { input: { text: text + key }, accepted: true };
  }
  // No leading zeros: "0" then "5" becomes "5", and "00" is refused.
  if (text === '0') return key === '0' ? refuse : { input: { text: key }, accepted: true };
  if (text.length >= MAX_WHOLE_DIGITS) return refuse;
  return { input: { text: text + key }, accepted: true };
}

/** The money the pad currently holds, or null while it is empty. */
export function amountOf(input: AmountInput, currency: CurrencyCode): Money | null {
  return input.text === '' ? null : parseAmount(input.text, currency);
}

export function canSave(input: AmountInput, currency: CurrencyCode): boolean {
  const amount = amountOf(input, currency);
  return amount !== null && amount.minor > 0;
}

/**
 * "₹1,20,000.5": the whole part grouped for the locale, the fraction exactly as
 * typed, so the display never jumps while someone is entering cents.
 */
export function displayAmount(input: AmountInput, currency: CurrencyCode, locale = 'en-IN'): string {
  const symbol = CURRENCY_SYMBOL[currency];
  if (input.text === '') return `${symbol}0`;
  const [whole = '0', fraction = ''] = input.text.split('.');
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(whole));
  return input.text.includes('.') ? `${symbol}${grouped}.${fraction}` : `${symbol}${grouped}`;
}

/** Pre-fills the pad for an edit: 12050 INR becomes "120.50", keeping visible cents. */
export function inputFromMoney(value: Money): AmountInput {
  const digits = minorDigits(value.currency);
  if (digits === 0) return { text: String(value.minor) };
  const padded = String(value.minor).padStart(digits + 1, '0');
  return { text: `${padded.slice(0, -digits)}.${padded.slice(-digits)}` };
}
