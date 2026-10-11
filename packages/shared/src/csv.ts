/**
 * Expense export. See docs/03-expenses.md and TASKS.md X1.
 *
 * `amountMinor` is the authoritative column: an exact integer, so a round trip
 * through the file loses nothing. `amount` is a display-only major-unit string
 * built by digit shifting — never by dividing a float — so even
 * Number.MAX_SAFE_INTEGER prints exactly.
 *
 * RFC 4180: CRLF line endings, fields quoted when they hold a comma, quote, CR
 * or LF, quotes doubled. A UTF-8 BOM leads the file so spreadsheet apps read
 * emoji and ₹ correctly. Text cells that a spreadsheet would run as a formula
 * (starting = + - @) get a leading apostrophe.
 */

import { type CurrencyCode, minorDigits } from './money';
import type { Expense } from './types';

export const CSV_COLUMNS = [
  'occurredAt',
  'localDate',
  'amountMinor',
  'currency',
  'amount',
  'kind',
  'account',
  'toAccount',
  'refundOf',
  'merchant',
  'tags',
  'lines',
  'recurring',
  'categoryId',
  'description',
  'note',
  'source',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvExpenseRow {
  readonly occurredAt: string;
  readonly localDate: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly amount: string;
  readonly kind: string;
  readonly account: string;
  readonly toAccount: string;
  readonly refundOf: string;
  readonly merchant: string;
  readonly tags: string;
  readonly lines: string;
  readonly recurring: string;
  readonly categoryId: string;
  readonly description: string;
  readonly note: string;
  readonly source: string;
}

const BOM = '﻿';
const CRLF = '\r\n';
const FORMULA_START = /^[=+\-@]/;

/** Exact major-unit text for an integer minor amount: 1234567 INR -> "12345.67", 99 JPY -> "99". */
export function majorUnits(minor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(minor)) throw new Error(`amountMinor must be a safe integer, got ${minor}`);
  const digits = minorDigits(currency);
  const sign = minor < 0 ? '-' : '';
  const text = String(Math.abs(minor));
  if (digits === 0) return sign + text;
  const padded = text.padStart(digits + 1, '0');
  return `${sign}${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

function textCell(value: string): string {
  return quote(FORMULA_START.test(value) ? `'${value}` : value);
}

/** Live expenses only, oldest first. Soft-deleted expenses are never exported. */
export function buildExpensesCsv(expenses: readonly Expense[]): string {
  const rows = expenses
    .filter((e) => e.deletedAt === null)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .map((e) =>
      [
        quote(e.occurredAt),
        quote(e.localDate),
        String(e.total.minor),
        e.total.currency,
        majorUnits(e.total.minor, e.total.currency),
        e.kind ?? '',
        '', // account name (populated when accounts repo exists, or via accountId map if passed)
        '', // toAccount name
        e.refundOf ?? '',
        e.merchant ?? '',
        e.tagIds ? e.tagIds.join(';') : '',
        e.lines ? e.lines.map((l) => `${l.categoryId}:${l.amountMinor}`).join('|') : '',
        '', // recurring rule description
        textCell(e.categoryId),
        textCell(e.description),
        textCell(e.note ?? ''),
        e.source,
      ].join(','),
    );
  return [CSV_COLUMNS.join(','), ...rows].join(CRLF) + CRLF;
}

/** RFC 4180 records. Quoted fields may contain commas, doubled quotes and line breaks. */
function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let i = csv.startsWith(BOM) ? 1 : 0;

  for (; i < csv.length; i += 1) {
    const ch = csv[i]!;
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r' && csv[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 1;
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

const unformula = (value: string) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value);

/** The inverse of buildExpensesCsv. Exists for the round-trip test. */
export function parseExpensesCsv(csv: string): CsvExpenseRow[] {
  const records = parseRecords(csv);
  const [header, ...rows] = records;
  if (!header) throw new Error('Not a Loop expenses CSV');
  
  const isV1 = header.join(',') === [
    'occurredAt',
    'localDate',
    'amountMinor',
    'currency',
    'amount',
    'categoryId',
    'description',
    'note',
    'source',
  ].join(',');

  const isV2 = header.join(',') === CSV_COLUMNS.join(',');

  if (!isV1 && !isV2) throw new Error('Not a Loop expenses CSV');

  return rows.map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`Row ${index + 1} has ${cells.length} fields`);
    const getCol = (colName: string) => {
      const idx = header.indexOf(colName);
      return idx >= 0 ? cells[idx]! : '';
    };

    const amountMinor = Number(getCol('amountMinor'));
    if (!Number.isSafeInteger(amountMinor)) throw new Error(`Row ${index + 1}: amountMinor is not an exact integer`);

    return {
      occurredAt: getCol('occurredAt'),
      localDate: getCol('localDate'),
      amountMinor,
      currency: getCol('currency'),
      amount: getCol('amount'),
      kind: getCol('kind'),
      account: getCol('account'),
      toAccount: getCol('toAccount'),
      refundOf: getCol('refundOf'),
      merchant: getCol('merchant'),
      tags: getCol('tags'),
      lines: getCol('lines'),
      recurring: getCol('recurring'),
      categoryId: unformula(getCol('categoryId')),
      description: unformula(getCol('description')),
      note: unformula(getCol('note')),
      source: getCol('source'),
    };
  });
}
