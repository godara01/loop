import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { merchantKey } from '../merchants';

// ---------------------------------------------------------------------------
// Spec examples
// ---------------------------------------------------------------------------
describe('merchantKey — spec examples', () => {
  it('strips legal suffixes and ref noise (spec example)', () => {
    const { key, isPerson } = merchantKey('Swiggy Pvt Ltd REF 88812');
    assert.equal(key, 'SWIGGY');
    assert.equal(isPerson, false);
  });

  it('person VPA produces P2P: key and isPerson=true (spec example)', () => {
    const { key, isPerson } = merchantKey('ravi.k93@okaxis');
    assert.ok(key?.startsWith('P2P:'), `expected P2P: prefix, got ${key}`);
    assert.equal(isPerson, true);
  });
});

// ---------------------------------------------------------------------------
// Empty / whitespace
// ---------------------------------------------------------------------------
describe('merchantKey — empty input', () => {
  it('returns null key for empty string', () => {
    assert.deepEqual(merchantKey(''), { key: null, isPerson: false });
  });

  it('returns null key for whitespace-only string', () => {
    assert.deepEqual(merchantKey('   '), { key: null, isPerson: false });
  });
});

// ---------------------------------------------------------------------------
// Legal suffix stripping (step 4)
// ---------------------------------------------------------------------------
describe('merchantKey — legal suffixes', () => {
  it('strips PVT', () => assert.equal(merchantKey('SWIGGY PVT').key, 'SWIGGY'));
  it('strips PRIVATE', () => assert.equal(merchantKey('SWIGGY PRIVATE').key, 'SWIGGY'));
  it('strips LTD', () => assert.equal(merchantKey('ACME LTD').key, 'ACME'));
  it('strips LIMITED', () => assert.equal(merchantKey('ACME LIMITED').key, 'ACME'));
  it('strips LLP', () => assert.equal(merchantKey('ACME LLP').key, 'ACME'));
  it('strips INC', () => assert.equal(merchantKey('ACME INC').key, 'ACME'));
  it('strips INDIA', () => assert.equal(merchantKey('SPOTIFY INDIA').key, 'SPOTIFY'));
  it('strips IN at end', () => assert.equal(merchantKey('AMAZON IN').key, 'AMAZON'));
  it('strips multiple suffixes repeatedly', () => {
    assert.equal(merchantKey('ACME PVT LTD').key, 'ACME');
  });
  it('strips INDIA then LTD in right order', () => {
    assert.equal(merchantKey('SWIGGY INDIA PVT LTD').key, 'SWIGGY');
  });
});

// ---------------------------------------------------------------------------
// Reference noise stripping (step 3)
// ---------------------------------------------------------------------------
describe('merchantKey — reference noise', () => {
  it('strips REF followed by digits', () =>
    assert.equal(merchantKey('SWIGGY REF 12345678').key, 'SWIGGY'));
  it('strips REF without space before digits', () =>
    assert.equal(merchantKey('SWIGGY REF123456').key, 'SWIGGY'));
  it('strips TXN followed by alphanumeric', () =>
    assert.equal(merchantKey('ZOMATO TXN A1B2C3').key, 'ZOMATO'));
  it('strips runs of 6+ digits', () =>
    assert.equal(merchantKey('SWIGGY 123456789').key, 'SWIGGY'));
  it('does NOT strip 5-digit number', () => {
    const key = merchantKey('SHOP 12345').key;
    assert.equal(key, 'SHOP 12345');
  });
  it('strips * segments', () => assert.equal(merchantKey('SWIGGY *FOOD').key, 'SWIGGY'));
  it('strips # segments', () => assert.equal(merchantKey('SWIGGY #101').key, 'SWIGGY'));
});

// ---------------------------------------------------------------------------
// Alias table (step 6)
// ---------------------------------------------------------------------------
describe('merchantKey — alias table', () => {
  it('AMZN → AMAZON', () => assert.equal(merchantKey('AMZN').key, 'AMAZON'));
  it('AMAZON IN → AMAZON (after suffix stripping)', () =>
    assert.equal(merchantKey('AMAZON IN').key, 'AMAZON'));
  it('AMAZON PAY → AMAZON', () => assert.equal(merchantKey('AMAZON PAY').key, 'AMAZON'));
  it('GROFERS → BLINKIT', () => assert.equal(merchantKey('GROFERS').key, 'BLINKIT'));
  it('GROFERS INDIA → BLINKIT', () =>
    assert.equal(merchantKey('GROFERS INDIA').key, 'BLINKIT'));
  it('BUNDL TECHNOLOGIES → SWIGGY', () =>
    assert.equal(merchantKey('BUNDL TECHNOLOGIES').key, 'SWIGGY'));
  it('BIGTREE ENTERTAINMENT → BOOKMYSHOW', () =>
    assert.equal(merchantKey('BIGTREE ENTERTAINMENT').key, 'BOOKMYSHOW'));
  it('ONE97 COMMUNICATIONS → PAYTM', () =>
    assert.equal(merchantKey('ONE97 COMMUNICATIONS').key, 'PAYTM'));

  it('custom alias table can override shipped table', () => {
    const custom = new Map([['TESTCO', 'CANONICAL']]);
    assert.equal(merchantKey('TESTCO', custom).key, 'CANONICAL');
  });
});

// ---------------------------------------------------------------------------
// Merchant VPAs (step 2)
// ---------------------------------------------------------------------------
describe('merchantKey — merchant VPAs', () => {
  it('paytmqr…@paytm is a merchant VPA', () => {
    const { key, isPerson } = merchantKey('paytmqr.abc123@paytm');
    assert.equal(isPerson, false);
    assert.ok(key && key.length > 0, 'expected a non-null key');
  });

  it('q-prefixed@ybl is a merchant VPA', () => {
    const { key, isPerson } = merchantKey('qswiggy0001@ybl');
    assert.equal(isPerson, false);
    assert.ok(key && !key.startsWith('P2P:'));
  });

  it('@razorpay handle is a merchant VPA', () => {
    const { key, isPerson } = merchantKey('merchant@razorpay');
    assert.equal(isPerson, false);
  });

  it('merchant VPA: digits stripped from local part', () => {
    const { key } = merchantKey('paytmqr.swiggy123@paytm');
    assert.ok(key && !/\d/.test(key), `digits remain in key: ${key}`);
  });

  it('@okaxis is a person VPA (not a merchant aggregator)', () => {
    const { isPerson } = merchantKey('ravi@okaxis');
    assert.equal(isPerson, true);
  });
});

// ---------------------------------------------------------------------------
// Person VPAs (step 2)
// ---------------------------------------------------------------------------
describe('merchantKey — person VPAs', () => {
  it('produces P2P: prefix', () => {
    const { key } = merchantKey('ravi.k93@okaxis');
    assert.ok(key?.startsWith('P2P:'));
  });

  it('isPerson is true', () => {
    assert.equal(merchantKey('john.doe@upibank').isPerson, true);
  });

  it('rahul.sharma@okhdfcbank is a person VPA (ok* banks are retail, not merchant aggregators)', () => {
    const { key, isPerson } = merchantKey('rahul.sharma@okhdfcbank');
    assert.ok(key?.startsWith('P2P:'), `expected P2P: prefix, got ${key}`);
    assert.equal(isPerson, true);
  });

  it('ravi.k93@okaxis is a person VPA', () => {
    const { key, isPerson } = merchantKey('ravi.k93@okaxis');
    assert.ok(key?.startsWith('P2P:'), `expected P2P: prefix, got ${key}`);
    assert.equal(isPerson, true);
  });

  it('same VPA always produces same key (deterministic hash)', () => {
    const a = merchantKey('ravi.k93@okaxis').key;
    const b = merchantKey('ravi.k93@okaxis').key;
    assert.equal(a, b);
  });

  it('different VPAs produce different keys', () => {
    const a = merchantKey('ravi.k93@okaxis').key;
    const b = merchantKey('priya.s01@okaxis').key;
    assert.notEqual(a, b);
  });

  it('hash is case-insensitive via NFKC+uppercase normalisation', () => {
    const a = merchantKey('Ravi.K93@okaxis').key;
    const b = merchantKey('ravi.k93@OKAXIS').key;
    assert.equal(a, b);
  });

  it('plain text of VPA does not appear in key (only hash)', () => {
    const { key } = merchantKey('rahul.sharma@okhdfcbank');
    assert.ok(!key?.toLowerCase().includes('rahul'), `plain text leaked into key: ${key}`);
  });
});

// ---------------------------------------------------------------------------
// Unicode handling (step 1 + step 5)
// ---------------------------------------------------------------------------
describe('merchantKey — Unicode / NFKC', () => {
  it('normalises NFKC: full-width digits become ASCII', () => {
    const { key } = merchantKey('SHOP１２３');
    assert.ok(key === 'SHOP' || (key !== null && !key.includes('１')),
      `expected ASCII normalisation, got ${key}`);
  });

  it('ligature fi (\\uFB01) is expanded via NFKC', () => {
    const { key } = merchantKey('\uFB01nancial services');
    assert.equal(key, 'FINANCIAL SERVICES');
  });

  it('accented letters survive punctuation stripping — Café Déjà Vu #4521 → CAFÉ DÉJÀ VU', () => {
    const { key } = merchantKey('Café Déjà Vu #4521');
    assert.equal(key, 'CAFÉ DÉJÀ VU');
  });

  it('accented Latin name round-trips correctly — Ñoño → ÑOÑO', () => {
    const { key } = merchantKey('Ñoño');
    assert.equal(key, 'ÑOÑO');
  });

  it('Devanagari merchant name preserves combining marks (virama/matras) — स्विगी stays intact', () => {
    const expected = 'स्विगी'.normalize('NFKC').toUpperCase();
    const { key } = merchantKey('स्विगी');
    assert.equal(key, expected);
  });

  it('CJK merchant name is preserved through punctuation stripping', () => {
    const { key } = merchantKey('星巴克');
    assert.ok(key && key.length > 0, `CJK name should not become empty, got ${key}`);
    assert.ok(key.includes('星') || key.includes('巴') || key.includes('克'), `CJK chars should survive: ${key}`);
  });

  it('spec example: Swiggy Pvt Ltd REF 88812 → SWIGGY', () => {
    assert.equal(merchantKey('Swiggy Pvt Ltd REF 88812').key, 'SWIGGY');
  });
});

// ---------------------------------------------------------------------------
// Punctuation stripping / whitespace collapse (step 5)
// ---------------------------------------------------------------------------
describe('merchantKey — punctuation / whitespace', () => {
  it('strips punctuation', () =>
    assert.equal(merchantKey('SWIGGY, INC.').key, 'SWIGGY'));
  it('collapses internal whitespace', () =>
    assert.equal(merchantKey('BLUE  TOKAI').key, 'BLUE TOKAI'));
  it('trims leading/trailing whitespace', () =>
    assert.equal(merchantKey('  SWIGGY  ').key, 'SWIGGY'));
});
