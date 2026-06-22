// FNV-1a 32-bit, base36. Deterministic, dependency-free, runtime-agnostic.
// Used only for content-addressed ids / dedup keys — not for security.
export function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
