/**
 * Which senders may be read at all. See docs/12-sms-ingest.md#filtering.
 *
 * Indian commercial SMS carry a DLT header: a 2-letter operator/circle prefix
 * and a 6-character entity registered to the business — `AD-HDFCBK`,
 * `VM-HDFCBK`, `JD-SBIINB`. The prefix varies by route; the entity does not.
 * So only the entity is matched, against a shipped registry of banks and card
 * issuers. A message from anyone else is dropped before it is parsed.
 *
 * `extraEntities` extends the registry at runtime: Remote Config ships new
 * banks without an app release, and a dev build adds a test sender.
 */

/** DLT header: `XX-ENTITY`, optionally with the TRAI category suffix (`-S`, `-T`, `-P`, `-G`). */
const DLT_HEADER = /^[A-Z]{2}-([A-Z0-9]{6})(?:-[SPTG])?$/;

/**
 * Bank and card-issuer entities. Deliberately a list, not a pattern: any
 * business can register a 6-character entity, and an `AD-AMAZON` or a
 * lookalike must never reach the parser.
 */
export const BANK_SENDER_ENTITIES: readonly string[] = [
  'HDFCBK', // HDFC Bank
  'ICICIB', // ICICI Bank
  'SBIINB', // State Bank of India
  'SBICRD', // SBI Card
  'AXISBK', // Axis Bank
  'KOTAKB', // Kotak Mahindra Bank
  'IDFCFB', // IDFC FIRST Bank
  'YESBNK', // Yes Bank
  'INDUSB', // IndusInd Bank
  'PNBSMS', // Punjab National Bank
  'BOBTXN', // Bank of Baroda
  'CANBNK', // Canara Bank
  'AUBANK', // AU Small Finance Bank
  'RBLBNK', // RBL Bank
];

const REGISTRY: ReadonlySet<string> = new Set(BANK_SENDER_ENTITIES);

/** The 6-character entity of a DLT header, or null for anything else (phone numbers, bare entities, ""). */
export function senderEntity(sender: string): string | null {
  const match = DLT_HEADER.exec(sender.trim().toUpperCase());
  return match ? match[1]! : null;
}

export function isAllowlistedSender(sender: string, extraEntities: readonly string[] = []): boolean {
  const entity = senderEntity(sender);
  if (entity === null) return false;
  return REGISTRY.has(entity) || extraEntities.some((extra) => extra.toUpperCase() === entity);
}
