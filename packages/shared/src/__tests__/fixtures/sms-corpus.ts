/**
 * Message shapes modelled on Indian bank alert formats. Every account number,
 * reference, phone number and amount is invented. `expect: null` means the
 * message must never become a pending expense.
 */

import type { ParsedTransaction } from '../../sms/types';

export interface CorpusEntry {
  readonly sender: string;
  readonly body: string;
  readonly expect: null | Partial<ParsedTransaction>;
}

export const SMS_CORPUS: readonly CorpusEntry[] = [
  // ── HDFC ────────────────────────────────────────────────────────────────
  {
    sender: 'AD-HDFCBK',
    body: 'Rs.450.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-12:20:15:11.Avl bal: Rs.84,550.00. Not you? Call 18002586161',
    expect: { amountMinor: 45000, accountLast4: '1234', merchant: 'SWIGGY', templateId: 'hdfc_card_spent' },
  },
  {
    sender: 'VM-HDFCBK-S',
    body: 'Rs.1,25,000.00 spent on HDFC Bank Card x9988 at CROMA RETAIL on 2026-09-10:11:02:45.Avl bal: Rs.2,10,000.00',
    expect: { amountMinor: 12500000, accountLast4: '9988', merchant: 'CROMA RETAIL' },
  },
  {
    sender: 'JD-HDFCBK',
    body: 'Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo ZOMATO LTD\nOn 12/09/26\nRef 625812345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808',
    expect: { amountMinor: 50000, accountLast4: '1234', merchant: 'ZOMATO LTD', templateId: 'hdfc_upi_sent' },
  },
  {
    sender: 'AD-HDFCBK',
    body: 'Sent INR 2,499.50\nFrom HDFC Bank A/C x5678\nTo AIRTEL PAYMENTS\nOn 11/09/26\nRef 625811112222',
    expect: { amountMinor: 249950, accountLast4: '5678', merchant: 'AIRTEL PAYMENTS' },
  },
  {
    sender: 'AD-HDFCBK',
    body: 'Dear Customer, your account xxxx1234 has been debited for Rs. 500/- at Swiggy on 19-Sep-2026 12:30.',
    expect: { amountMinor: 50000, accountLast4: '1234', templateId: 'hdfc_debit' },
  },
  {
    sender: 'BZ-HDFCBK',
    body: '₹ 99.00 spent on HDFC Bank Card x4321 at BLUE TOKAI COFFEE on 2026-09-12:08:01:10.',
    expect: { amountMinor: 9900, accountLast4: '4321', merchant: 'BLUE TOKAI COFFEE' },
  },
  // ── ICICI ───────────────────────────────────────────────────────────────
  {
    sender: 'VM-ICICIB',
    body: 'ICICI Bank Acct XX567 debited for Rs 1,299.00 on 12-Sep-26; CODECADEMY credited. UPI:625812345678. Call 18002662 for dispute. SMS BLOCK 567 to 9215676766.',
    expect: { amountMinor: 129900, accountLast4: '567', merchant: 'CODECADEMY', templateId: 'icici_upi_debit' },
  },
  {
    sender: 'AD-ICICIB',
    body: 'ICICI Bank Acct XX3344 debited for INR 75.00 on 11-Sep-26; RAPIDO BIKE credited. UPI:625800001111.',
    expect: { amountMinor: 7500, accountLast4: '3344', merchant: 'RAPIDO BIKE' },
  },
  {
    sender: 'JD-ICICIB-T',
    body: 'INR 2,500.00 spent using ICICI Bank Card XX9012 on 12-Sep-26 on AMAZON. Avl Limit: INR 1,20,000.00. If not you, call 1800 2662/SMS BLOCK 9012 to 9215676766.',
    expect: { amountMinor: 250000, accountLast4: '9012', merchant: 'AMAZON', templateId: 'icici_card_spent' },
  },
  {
    sender: 'VM-ICICIB',
    body: 'INR 10,00,000.00 spent using ICICI Bank Card XX1122 on 01-Sep-26 on MAKEMYTRIP INDIA. Avl Limit: INR 2,00,000.00.',
    expect: { amountMinor: 100000000, accountLast4: '1122', merchant: 'MAKEMYTRIP INDIA' },
  },
  {
    sender: 'VM-ICICIB',
    body: 'Your account 5678 has been debited with Rs 1,50,000 on 19-Sep-2026 14:15.',
    expect: { amountMinor: 15000000, accountLast4: '5678', templateId: 'icici_debit' },
  },
  // ── SBI / SBI Card ──────────────────────────────────────────────────────
  {
    sender: 'JD-SBIINB',
    body: 'Dear UPI user A/C X4321 debited by 200.0 on date 12Sep26 trf to SWIGGY Refno 625812345678. If not u? call 1800111109. -SBI',
    expect: { amountMinor: 20000, accountLast4: '4321', merchant: 'SWIGGY', templateId: 'sbi_upi_debit' },
  },
  {
    sender: 'AD-SBIINB',
    body: 'Dear UPI user A/C X9876 debited by 15,000.00 on date 01Sep26 trf to RENT HOUSE OWNER Refno 625800009999. If not u? call 1800111109. -SBI',
    expect: { amountMinor: 1500000, accountLast4: '9876', merchant: 'RENT HOUSE OWNER' },
  },
  {
    sender: 'JD-SBIINB',
    body: 'Amount Rs.2,00,000/- debited from your account xxxx9876 for online transfer.',
    expect: { amountMinor: 20000000, accountLast4: '9876', templateId: 'sbi_debit' },
  },
  {
    sender: 'AD-SBICRD',
    body: 'Rs.849.00 spent on your SBI Credit Card ending 7788 at BIGBASKET on 12/09/26. Trxn. not done by you? Report at https://sbicard.com/Dispute',
    expect: { amountMinor: 84900, accountLast4: '7788', merchant: 'BIGBASKET', templateId: 'sbicard_spent' },
  },
  {
    sender: 'VM-SBICRD',
    body: 'Rs.3,999.00 spent on your SBI Credit Card ending 1010 at NYKAA FASHION on 10/09/26.',
    expect: { amountMinor: 399900, accountLast4: '1010', merchant: 'NYKAA FASHION' },
  },
  // ── Axis ────────────────────────────────────────────────────────────────
  {
    sender: 'AD-AXISBK',
    body: 'INR 5,000.00 debited\nA/c no. XX2211\n12-09-26, 18:04:33\nUPI/P2M/625812345678/CROMA\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank',
    expect: { amountMinor: 500000, accountLast4: '2211', merchant: 'CROMA', templateId: 'axis_upi_debit' },
  },
  {
    sender: 'VM-AXISBK',
    body: 'INR 350.00 debited\nA/c no. XX6655\n11-09-26, 09:15:02\nUPI/P2A/625800002222/RAVI KUMAR\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank',
    expect: { amountMinor: 35000, accountLast4: '6655', merchant: 'RAVI KUMAR' },
  },
  {
    sender: 'AD-AXISBK',
    body: 'Spent\nCard no. XX2211\nINR 1,200\n12-09-26 18:04:33 IST\nZOMATO\nAvl Limit: INR 45,000\nNot you? SMS BLOCK 2211 to 919951860002\nAxis Bank',
    expect: { amountMinor: 120000, accountLast4: '2211', merchant: 'ZOMATO', templateId: 'axis_card_spent' },
  },
  {
    sender: 'JD-AXISBK',
    body: 'INR 12,345.60 has been debited from your A/c no. XX7788 on 12-09-26 towards NEFT.',
    expect: { amountMinor: 1234560, accountLast4: '7788', templateId: 'axis_debit' },
  },
  // ── Kotak ───────────────────────────────────────────────────────────────
  {
    sender: 'AD-KOTAKB',
    body: 'Sent Rs.120.00 from Kotak Bank AC X4455 to uber@axis on 12-09-26.UPI Ref 625811. Not you, https://kotak.com/KBANKT/Fraud',
    expect: { amountMinor: 12000, accountLast4: '4455', merchant: 'uber@axis', templateId: 'kotak_upi_sent' },
  },
  {
    sender: 'VM-KOTAKB',
    body: 'Sent Rs.8,000.00 from Kotak Bank AC X1212 to landlord.sharma@okicici on 01-09-26.UPI Ref 625800.',
    expect: { amountMinor: 800000, accountLast4: '1212', merchant: 'landlord.sharma@okicici' },
  },

  // ── Must never become a pending expense ────────────────────────────────
  // OTP
  { sender: 'AD-HDFCBK', body: '482913 is your OTP for a transaction of Rs 450.00 at SWIGGY on HDFC Bank Card x1234. Valid for 5 mins. Do not share.', expect: null },
  { sender: 'VM-ICICIB', body: 'Your one-time password to log in to ICICI iMobile is 772910. Never share it with anyone.', expect: null },
  { sender: 'AD-SBIINB', body: 'Use verification code 551204 to add a payee. SBI never asks for this code.', expect: null },
  // Balance
  { sender: 'AD-HDFCBK', body: 'Available Bal in HDFC Bank A/c XX1234 as on 12-SEP-26 is INR 24,510.00. Cheques are subject to clearing.', expect: null },
  { sender: 'JD-SBIINB', body: 'Your balance is Rs 12,000.55 in A/c XX4321 as of 12/09/26 10:00. -SBI', expect: null },
  // Promo
  { sender: 'AD-HDFCBK', body: 'Congrats! You are pre-approved for a Personal Loan of Rs 5,00,000 from HDFC Bank. Apply now: hdfc.bank/pl T&C', expect: null },
  { sender: 'VM-ICICIB', body: 'Limited period offer: 0% EMI on electronics with your ICICI Card. Upgrade now to Sapphiro! T&C apply.', expect: null },
  // Declined
  { sender: 'AD-HDFCBK', body: 'Your transaction of Rs 2,500 at FLIPKART on HDFC Bank Card x1234 was declined due to insufficient balance.', expect: null },
  { sender: 'AD-AXISBK', body: 'Txn failed: INR 850 debited to zomato@icici from A/c no. XX4321 was not successful. Amount if debited will be refunded.', expect: null },
  // Reversal
  { sender: 'AD-HDFCBK', body: 'Rs.450.00 reversed to your HDFC Bank Card x1234 for the transaction at SWIGGY on 10-09-26.', expect: null },
  { sender: 'VM-ICICIB', body: 'Refund of Rs 1,299 from CODECADEMY has been credited back to your ICICI Bank Acct XX567.', expect: null },
  // Credit
  { sender: 'AD-HDFCBK', body: 'Rs 25,000.00 credited to your A/c XX1234 on 01-09-26 by NEFT from ACME PVT LTD. -HDFC Bank', expect: null },
  { sender: 'JD-SBIINB', body: 'Dear UPI user A/C X4321 credited by 5,000.00 on date 12Sep26 from ravi@okaxis Refno 625800. -SBI', expect: null },
  { sender: 'AD-KOTAKB', body: 'Received Rs.750.00 in your Kotak Bank AC X4455 from priya@ybl on 12-09-26.UPI Ref 625877.', expect: null },
  // Non-bank senders, even with a perfect debit body
  { sender: 'AD-AMAZON', body: 'Rs.450.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-12:20:15:11.', expect: null },
  { sender: 'VM-SWIGGY', body: 'Your order of Rs 450 is confirmed. Rs 450 debited from your account xxxx1234.', expect: null },
  { sender: '+919876543210', body: 'Sent Rs.500.00\nFrom HDFC Bank A/C *1234\nTo ZOMATO LTD\nOn 12/09/26', expect: null },
  { sender: 'HDFCBK', body: 'Dear Customer, your account xxxx1234 has been debited for Rs. 500/- at Swiggy.', expect: null },
  // A bank, but a shape no template knows
  { sender: 'AD-HDFCBK', body: 'Your HDFC Bank statement for August is ready. Download it from NetBanking.', expect: null },
];
