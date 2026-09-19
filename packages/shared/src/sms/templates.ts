/**
 * SMS template registry for Indian bank transaction formats.
 * See docs/12-sms-ingest.md#the-parser.
 */

import type { ParsedTransaction, SmsTemplate } from './types';
import { parseAmount, type CurrencyCode } from '../money';

/**
 * Parse amount with Indian lakh grouping support, returning amountMinor (integer).
 * "1,00,000.00" → 10000000, "500" → 50000
 */
function parseIndianAmount(text: string): number | null {
  const normalized = text.trim().replace(/\s+/g, '');
  const money = parseAmount(normalized, 'INR');
  if (!money) return null;
  return money.minor;
}

/**
 * HDFC Bank debit: "Dear Customer, your account xxxx1234 has been debited for Rs. 500/-"
 */
export const HDFC_DEBIT: SmsTemplate = {
  id: 'hdfc_debit',
  name: 'HDFC Bank Debit',
  pattern: /(?:account|xxxx).*?(\d{4})\D+?(?:debited|spent|charged)\D+?(?:Rs\.?\s*)?([0-9,]+(?:\.\d{2})?)/i,
  extract: (match) => {
    const account = match[1];
    const amount = match[2];
    if (!account || !amount) return null;
    
    const amountMinor = parseIndianAmount(amount);
    if (!amountMinor) return null;
    
    return {
      amountMinor,
      currency: 'INR' as CurrencyCode,
      direction: 'debit',
      merchant: null,
      accountLast4: account,
      occurredAt: new Date().toISOString(),
      templateId: 'hdfc_debit',
      confidence: 0.85,
    };
  },
};

/**
 * ICICI Bank debit: "Your account 1234 has been debited with Rs 500"
 */
export const ICICI_DEBIT: SmsTemplate = {
  id: 'icici_debit',
  name: 'ICICI Bank Debit',
  pattern: /account\s+(\d{4})\D+?debited\D+?(?:Rs\.?\s*)?([0-9,]+(?:\.\d{2})?)/i,
  extract: (match) => {
    const account = match[1];
    const amount = match[2];
    if (!account || !amount) return null;
    
    const amountMinor = parseIndianAmount(amount);
    if (!amountMinor) return null;
    
    return {
      amountMinor,
      currency: 'INR' as CurrencyCode,
      direction: 'debit',
      merchant: null,
      accountLast4: account,
      occurredAt: new Date().toISOString(),
      templateId: 'icici_debit',
      confidence: 0.85,
    };
  },
};

/**
 * SBI debit: "Amount Rs.500/- debited from your account xxxx1234"
 */
export const SBI_DEBIT: SmsTemplate = {
  id: 'sbi_debit',
  name: 'SBI Debit',
  pattern: /(?:Rs\.?\s*)?([0-9,]+(?:\.\d{2})?).+?debited.+?(?:xxxx)?(\d{4})/i,
  extract: (match) => {
    const amount = match[1];
    const account = match[2];
    if (!account || !amount) return null;
    
    const amountMinor = parseIndianAmount(amount);
    if (!amountMinor) return null;
    
    return {
      amountMinor,
      currency: 'INR' as CurrencyCode,
      direction: 'debit',
      merchant: null,
      accountLast4: account,
      occurredAt: new Date().toISOString(),
      templateId: 'sbi_debit',
      confidence: 0.85,
    };
  },
};

/**
 * Axis Bank debit: "Rs 500 has been debited from your Axis Bank account xxxx1234"
 */
export const AXIS_DEBIT: SmsTemplate = {
  id: 'axis_debit',
  name: 'Axis Bank Debit',
  pattern: /Rs\s+([0-9,]+(?:\.\d{2})?).+?debited.+?(\d{4})/i,
  extract: (match) => {
    const amount = match[1];
    const account = match[2];
    if (!account || !amount) return null;
    
    const amountMinor = parseIndianAmount(amount);
    if (!amountMinor) return null;
    
    return {
      amountMinor,
      currency: 'INR' as CurrencyCode,
      direction: 'debit',
      merchant: null,
      accountLast4: account,
      occurredAt: new Date().toISOString(),
      templateId: 'axis_debit',
      confidence: 0.85,
    };
  },
};

export const SMS_TEMPLATES: readonly SmsTemplate[] = [
  HDFC_DEBIT,
  ICICI_DEBIT,
  SBI_DEBIT,
  AXIS_DEBIT,
];

/**
 * Attempt to parse an SMS against all templates.
 */
export function parseTransactionSms(
  body: string,
  sender: string,
  receivedAt: string,
  confidenceThreshold: number = 0.6,
): ParsedTransaction | null {
  const isOtp = /(?:otp|password|one-time|verification|code|expire)/i.test(body);
  const isPromo = /(?:offer|promo|deal|cashback|reward|limited|apply now)/i.test(body);
  const isFailed = /(?:failed|declined|rejected|unable|sorry)/i.test(body);
  const isReversal = /(?:reversal|reversed|cancelled|refund)/i.test(body);
  
  if (isOtp || isPromo || isFailed || isReversal) {
    return null;
  }
  
  for (const template of SMS_TEMPLATES) {
    const match = template.pattern.exec(body);
    if (match) {
      const result = template.extract(match);
      if (result && result.confidence >= confidenceThreshold) {
        return result;
      }
    }
  }
  
  return null;
}
