/**
 * Alias table for known merchant name variants.
 * Maps every known variant to its canonical key.
 * Versioned with the template registry and overridable through Remote Config.
 */

export const MERCHANT_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  ['AMZN', 'AMAZON'],
  ['AMAZON IN', 'AMAZON'],
  ['AMAZON PAY', 'AMAZON'],
  ['AMAZONPAY', 'AMAZON'],
  ['AMAZON SELLER', 'AMAZON'],
  ['AMAZON PRIME', 'AMAZON'],
  ['FLIPKART INTERNET', 'FLIPKART'],
  ['FK', 'FLIPKART'],
  ['MYNTRA DESIGNS', 'MYNTRA'],
  ['SWIGGY IT', 'SWIGGY'],
  ['SWIGGY INSTAMART', 'SWIGGY'],
  ['BUNDL TECHNOLOGIES', 'SWIGGY'],
  ['ZOMATO INTERNET', 'ZOMATO'],
  ['ZOMATO MEDIA', 'ZOMATO'],
  ['ZOMATO ORDER', 'ZOMATO'],
  ['BLINKIT', 'BLINKIT'],
  ['GROFERS', 'BLINKIT'],
  ['GROFERS INDIA', 'BLINKIT'],
  ['BIG BASKET', 'BIGBASKET'],
  ['BIGBASKET', 'BIGBASKET'],
  ['SUPERMARKET GROCERY', 'BIGBASKET'],
  ['DUNZO DIGITAL', 'DUNZO'],
  ['ZEPTO', 'ZEPTO'],
  ['RELIANCE JIO', 'JIO'],
  ['JIO RELIANCE', 'JIO'],
  ['AIRTEL PAYMENTS', 'AIRTEL'],
  ['BHARTI AIRTEL', 'AIRTEL'],
  ['VODAFONE IDEA', 'VI'],
  ['VODAFONE', 'VI'],
  ['IDEA CELLULAR', 'VI'],
  ['NETFLIX INTL', 'NETFLIX'],
  ['NETFLIX INTERNET', 'NETFLIX'],
  ['SPOTIFY AB', 'SPOTIFY'],
  ['SPOTIFY INDIA', 'SPOTIFY'],
  ['HOTSTAR', 'DISNEY HOTSTAR'],
  ['STAR INDIA', 'DISNEY HOTSTAR'],
  ['PRIME VIDEO', 'AMAZON'],
  ['UBER INDIA', 'UBER'],
  ['UBER EATS', 'UBER'],
  ['UBER TRIP', 'UBER'],
  ['OLA CABS', 'OLA'],
  ['ANI TECHNOLOGIES', 'OLA'],
  ['RAPIDO BIKE', 'RAPIDO'],
  ['PAYTM QB', 'PAYTM'],
  ['PAYTM PAYMENT', 'PAYTM'],
  ['ONE97 COMMUNICATIONS', 'PAYTM'],
  ['RAZORPAY', 'RAZORPAY'],
  ['PHONEPE', 'PHONEPE'],
  ['GOOGLE PAY', 'GOOGLEPAY'],
  ['GPAY', 'GOOGLEPAY'],
  ['BOOKMYSHOW BIGTREE', 'BOOKMYSHOW'],
  ['BIGTREE ENTERTAINMENT', 'BOOKMYSHOW'],
  ['MCD', 'MCDONALDS'],
  ["MCDONALD'S", 'MCDONALDS'],
  ['KFC INDIA', 'KFC'],
  ['YUMRESTAURANTS', 'KFC'],
]);

/**
 * Patterns that identify merchant (non-person) VPAs.
 * Each is tested against the uppercased, NFKC-normalised full VPA.
 */
export const MERCHANT_VPA_PATTERNS: readonly RegExp[] = [
  /^PAYTMQR/,
  /^Q[^@]+@YBL$/,
  /^Q[^@]+@AXISBANK$/,
  /^Q[^@]+@ICICI$/,
  /^Q[^@]+@KOTAK$/,
  /^Q[^@]+@SBI$/,
  /^Q[^@]+@UNIONBANK$/,
  /@(PAYTM|YBL|UPI|RAZORPAY|IPPBONLINE|IDFCBANK|INDUS|JUPITERAXIS|SBI|SBIEPAY|AUBANK|KOTAK|BARODAMPAY|PINGPAY|APL|NAVIAXIS|SLICEAXIS|YESBANK)$/,
];

/**
 * Known payment aggregator / merchant UPI handles (exact @bank portion, uppercased).
 * VPAs ending in these are merchant VPAs.
 */
export const MERCHANT_UPI_BANKS: ReadonlySet<string> = new Set([
  'PAYTM',
  'UPI',
  'RAZORPAY',
  'IPPBONLINE',
  'IDFCBANK',
  'INDUS',
  'JUPITERAXIS',
  'SBIEPAY',
  'AUBANK',
  'BARODAMPAY',
  'PINGPAY',
  'APL',
  'NAVIAXIS',
  'SLICEAXIS',
]);
