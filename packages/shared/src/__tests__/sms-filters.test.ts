/**
 * Message shapes are illustrative, modelled on real Indian bank alerts; every
 * account number, reference and amount is invented.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyExclusion, isCredit } from '../sms/filters';

const DEBITS = [
  'Rs.450.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-12:20:15:11. Avl Lmt: Rs.84,550. Not you? Call 18002586161',
  'ICICI Bank Acct XX567 debited for Rs 1,299.00 on 12-Sep-26; CODECADEMY credited. UPI:625812345678. Call 18002662 for dispute.',
  'Dear Customer, Rs.2,000.00 has been debited from account **4321 to VPA zomato@icici on 12-09-26. UPI Ref 625899. Avl Bal Rs 10,240.55',
  'INR 3,450.00 debited from A/c no. XX8899 on 12-09-2026 at AMAZON PAY. Card valid till 08/29. Not you? SMS BLOCK 8899 to 5676791',
  'Sent Rs.120.00 from Kotak Bank AC X4455 to uber@axis on 12-09-26. UPI Ref 625811. Not you, https://kotak.com/fraud',
  'Your SBI Debit Card ending 7788 used for Rs 849 at BIGBASKET on 12Sep26. Txn of Rs 849 successful. Card expiry 11/27.',
  'Thank you for using your Axis Bank Card XX2211 for INR 5,000.00 at CROMA. Get 10% cashback on next purchase, T&C apply. Avl limit INR 45,000',
];

describe('classifyExclusion', () => {
  const cases: Record<string, readonly string[]> = {
    otp: [
      '482913 is your OTP for a transaction of Rs 450.00 at SWIGGY on HDFC Bank Card x1234. Valid for 5 mins. Do not share.',
      'Your one-time password to log in to ICICI iMobile is 772910. Never share it with anyone.',
      'Use verification code 551204 to add a payee. SBI never asks for this code.',
      'Your transaction PIN: 8841 for Axis Bank net banking. Do not disclose.',
    ],
    balance: [
      'Available Bal in HDFC Bank A/c XX1234 as on 12-SEP-26 is INR 24,510.00. Cheques are subject to clearing.',
      'Your balance is Rs 12,000.55 in A/c XX4321 as of 12/09/26 10:00. -SBI',
      'Mini statement for A/c XX8899: last 3 txns ... Call 1800-419 for details.',
    ],
    promo: [
      'Congrats! You are pre-approved for a Personal Loan of Rs 5,00,000 from HDFC Bank. Apply now: hdfc.bank/pl T&C',
      'Limited period offer: 0% EMI on electronics with your ICICI Card. Upgrade now to Sapphiro! T&C apply.',
      'Get cashback up to Rs 500 on bill payments with Axis Bank UPI this weekend. T&C apply.',
    ],
    declined: [
      'Your transaction of Rs 2,500 at FLIPKART on HDFC Bank Card x1234 was declined due to insufficient balance.',
      'Txn failed: Rs 850 payment to zomato@icici from A/c XX4321 was not successful. Amount if debited will be refunded.',
      'Your payment of INR 1,200 could not be processed. Kotak Bank',
    ],
    reversal: [
      'Rs 450.00 reversed to your HDFC Bank Card x1234 for the transaction at SWIGGY on 10-09-26.',
      'Refund of Rs 1,299 from CODECADEMY has been credited back to your A/c XX567. -ICICI',
      'INR 3,450.00 refunded to A/c XX8899 for AMAZON PAY order. Axis Bank',
    ],
  };

  for (const [label, messages] of Object.entries(cases)) {
    it(`labels ${messages.length} ${label} messages as ${label}`, () => {
      for (const message of messages) assert.equal(classifyExclusion(message), label, message);
    });
  }

  it('lets genuine debits through — including CODECADEMY, a card expiry line, Avl Bal and an offer footer', () => {
    for (const message of DEBITS) assert.equal(classifyExclusion(message), null, message);
  });
});

describe('isCredit', () => {
  it('is true for money arriving', () => {
    for (const message of [
      'Rs 25,000.00 credited to your A/c XX1234 on 01-09-26 by NEFT from ACME PVT LTD. -HDFC Bank',
      'Your a/c XX4321 is credited with INR 5,000.00 on 12-09-26 (UPI Ref 625800) from ravi@okaxis. -SBI',
      'You have received Rs 750 from priya@ybl in Kotak Bank AC X4455. UPI Ref 625877.',
    ]) {
      assert.equal(isCredit(message), true, message);
    }
  });

  it('is false for debits, even when the payee is "credited"', () => {
    for (const message of DEBITS) assert.equal(isCredit(message), false, message);
  });
});
