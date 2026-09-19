/** Indian DLT sender entity pattern. */
const DLT_HEADER_PATTERN = /^[A-Z]{2}-[A-Z0-9]{6}$/;

export function isAllowlistedSender(sender: string): boolean {
  // Matches AD-HDFCBK, VM-ICICIB, etc.
  return DLT_HEADER_PATTERN.test(sender);
}
