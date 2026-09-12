/**
 * Money is stored as an integer count of minor units (paise, cents) — never a float.
 * Every split must sum back to the original total exactly, so all arithmetic here
 * is integer arithmetic and all division uses the largest-remainder method.
 */

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY';

export interface Money {
  /** Integer minor units. 1250 with currency INR means ₹12.50. */
  readonly minor: number;
  readonly currency: CurrencyCode;
}

const MINOR_DIGITS: Record<CurrencyCode, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function money(minor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minor)) {
    throw new Error(`Money.minor must be an integer, got ${minor}`);
  }
  return { minor, currency };
}

/** Parse user input like "12.50" into Money. Returns null on malformed input. */
export function parseAmount(input: string, currency: CurrencyCode): Money | null {
  const cleaned = input.trim().replace(/[,\s]/g, '');
  if (cleaned === '' || !/^-?\d*(\.\d*)?$/.test(cleaned)) return null;

  const digits = MINOR_DIGITS[currency];
  const negative = cleaned.startsWith('-');
  const [whole = '0', fraction = ''] = cleaned.replace('-', '').split('.');
  const paddedFraction = fraction.padEnd(digits, '0').slice(0, digits);
  const minor = Number(`${whole || '0'}${paddedFraction}`);
  if (!Number.isFinite(minor)) return null;

  return money(negative ? -minor : minor, currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function sum(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce<Money>((acc, v) => add(acc, v), money(0, currency));
}

export function isZero(a: Money): boolean {
  return a.minor === 0;
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minor - b.minor;
}

/** Formats for display. Uses Intl so locale grouping is correct. */
export function formatMoney(
  value: Money,
  options: { showSymbol?: boolean; locale?: string } = {},
): string {
  const { showSymbol = true, locale = 'en-IN' } = options;
  const digits = MINOR_DIGITS[value.currency];
  const major = value.minor / 10 ** digits;

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(major));

  const sign = value.minor < 0 ? '-' : '';
  return showSymbol
    ? `${sign}${CURRENCY_SYMBOL[value.currency]}${formatted}`
    : `${sign}${formatted}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
