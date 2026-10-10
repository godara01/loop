export function isBuildSupported(current: number, minSupported: number | null): boolean {
  if (minSupported === null) return true;
  if (Number.isNaN(current)) return true;
  return current >= minSupported;
}
