import {
  defineProvider, referenceId,
  type Reference, type RightsRecord, type LicenseId, type Modality,
  type NormalizedQuery, type ProviderContext,
} from '@refkit/core'

const BASE = 'https://archive.org/advancedsearch.php'

export interface InternetArchiveConfig {
  /** Max docs requested per search (advancedsearch `rows`). Default falls back to
   *  the query limit, then 20. Bounded to 100. */
  maxRows?: number
}

// rightsstatements.org is a rights-STATUS vocabulary (not license grants). Mapped faithfully
// per token (mirrors core `mapRightsUrl`; helper-refactor Task 4 dedups this): InC* →
// proprietary; NoC-US → PD scoped to the US; NoC-NC → proprietary; opaque/undetermined → unknown.
const RIGHTS_STATEMENT: Record<string, { license: LicenseId; jurisdiction?: string }> = {
  'inc': { license: 'proprietary' }, 'inc-ow-eu': { license: 'proprietary' }, 'inc-edu': { license: 'proprietary' },
  'inc-nc': { license: 'proprietary' }, 'inc-ruu': { license: 'proprietary' },
  'noc-us': { license: 'PD', jurisdiction: 'US' },
  'noc-nc': { license: 'proprietary' },
  'noc-oklr': { license: 'unknown' }, 'noc-cr': { license: 'unknown' },
  'cne': { license: 'unknown' }, 'und': { license: 'unknown' }, 'nkc': { license: 'unknown' },
}

/** Map an Internet Archive `licenseurl` to our license id (+ CC version, + jurisdiction for
 *  jurisdiction-scoped PD). **ABSENT licenseurl → 'unknown' (D3)** — IA rarely carries one, so
 *  most items legitimately land here → needs-review; this is the "never guess PD" rule and it
 *  governs the ABSENT case only. A PRESENT rightsstatements.org statement is a real declaration
 *  and is mapped faithfully (NoC-US → PD is the source's word, not a guess). NC/ND → proprietary
 *  (D5); PD mark/dedication → PD; CC0 → CC0-1.0; unrecognized → unknown. */
export function mapIaLicense(licenseurl?: string): { license: LicenseId; version?: string; jurisdiction?: string } {
  if (!licenseurl) return { license: 'unknown' }
  const u = licenseurl.toLowerCase()
  const rs = u.match(/rightsstatements\.org\/(?:vocab|page)\/([a-z-]+)/)
  if (rs) return RIGHTS_STATEMENT[rs[1]] ?? { license: 'unknown' }
  if (/\/publicdomain\/zero\b/.test(u)) return { license: 'CC0-1.0' }
  if (/\/publicdomain\/mark\b/.test(u)) return { license: 'PD' }
  // Exclude any NC / ND variant before matching the open by / by-sa families.
  if (/\/licenses\/by-(?:nc|nd)/.test(u)) return { license: 'proprietary' }
  const bySa = u.match(/\/licenses\/by-sa\/(\d(?:\.\d)?)\b/)
  if (bySa) return { license: 'CC-BY-SA', version: bySa[1] }
  const by = u.match(/\/licenses\/by\/(\d(?:\.\d)?)\b/)
  if (by) return { license: 'CC-BY', version: by[1] }
  // by / by-sa with no version still maps to the family (version omitted).
  if (/\/licenses\/by-sa\b/.test(u)) return { license: 'CC-BY-SA' }
  if (/\/licenses\/by\b/.test(u)) return { license: 'CC-BY' }
  return { license: 'unknown' }
}

const MEDIATYPE_MODALITY: Record<string, Modality> = { movies: 'video', texts: 'text' }

/** v1 scope (D1): only `movies`→video and `texts`→text. Everything else → null
 *  (filtered out). audio / image / etc. are a documented follow-up. */
export function mediatypeToModality(mt: string): Modality | null {
  return MEDIATYPE_MODALITY[mt] ?? null
}
