import {
  defineProvider, referenceId,
  type Reference, type RightsRecord, type LicenseId,
  type NormalizedQuery, type ProviderContext,
} from '@refkit/core'

// Freesound's `license` is usually a CC NAME string ("Attribution", "Creative
// Commons 0") but has historically also been a CC DEED URL. Handle both.
// D4: name → family LicenseId, no version. D7: URL → family (+ version for BY/BY-SA).
// Conservative: noncommercial / sampling / unrecognized → proprietary or unknown.
const FREESOUND_NAME_LICENSE: Record<string, { license: LicenseId }> = {
  'attribution': { license: 'CC-BY' },
  'attribution noncommercial': { license: 'proprietary' },      // NC → not commercially usable
  'creative commons 0': { license: 'CC0-1.0' },
  'sampling+': { license: 'proprietary' },                       // bespoke CC sampling licence, not a clean free grant
  'attribution sampling+': { license: 'proprietary' },
}

/** Map a Freesound `license` value (CC name string OR CC deed URL) to our
 *  license + optional CC version. Unrecognized → `unknown` (strict-deny). */
export function mapFreesoundLicense(value: string): { license: LicenseId; version?: string } {
  const v = (value ?? '').trim()
  if (!v) return { license: 'unknown' }

  // D7 — deed URL form
  if (/^https?:\/\//i.test(v)) {
    if (/\/publicdomain\/zero\//i.test(v)) return { license: 'CC0-1.0' }
    const m = v.match(/\/licenses\/(by(?:-sa)?|by-nc[a-z-]*|by-nd[a-z-]*)\/(\d\.\d)\//i)
    if (m) {
      const fam = m[1].toLowerCase()
      const version = m[2]
      if (fam === 'by') return { license: 'CC-BY', version }
      if (fam === 'by-sa') return { license: 'CC-BY-SA', version }
      return { license: 'proprietary' } // any NC/ND variant
    }
    return { license: 'unknown' }
  }

  // D4 — name string form (case-insensitive)
  return FREESOUND_NAME_LICENSE[v.toLowerCase()] ?? { license: 'unknown' }
}
