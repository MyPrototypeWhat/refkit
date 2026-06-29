import {
  defineProvider, referenceId,
  type Reference, type RightsRecord, type LicenseId,
  type NormalizedQuery, type ProviderContext,
} from '@refkit/core'

const BASE = 'https://api.europeana.eu/record/v2/search.json'

/** Map a Europeana `edm:rights` controlled-vocabulary URI to a core license id (+ CC version,
 *  + jurisdiction for jurisdiction-scoped PD). Conservative (D5): only clearly-open CC deeds and
 *  PD/CC0 become open grants; CC NC/ND → proprietary; rightsstatements.org is mapped faithfully
 *  per token (see below); anything unrecognized/empty → unknown. */
// rightsstatements.org is a rights-STATUS vocabulary (not license grants). Map each token
// FAITHFULLY (index D5-style): InC* → proprietary (copyrighted, no grant); NoC-US → PD scoped
// to the US via the jurisdiction field; NoC-NC → proprietary (non-commercial → commercial out);
// opaque/undetermined (NoC-OKLR/CR, CNE, UND, NKC) → unknown. (This mirrors core `mapRightsUrl`;
// the helper-refactor Task 4 replaces this inlined copy with that import.)
const RIGHTS_STATEMENT: Record<string, { license: LicenseId; jurisdiction?: string }> = {
  'inc': { license: 'proprietary' }, 'inc-ow-eu': { license: 'proprietary' }, 'inc-edu': { license: 'proprietary' },
  'inc-nc': { license: 'proprietary' }, 'inc-ruu': { license: 'proprietary' },
  'noc-us': { license: 'PD', jurisdiction: 'US' },
  'noc-nc': { license: 'proprietary' },
  'noc-oklr': { license: 'unknown' }, 'noc-cr': { license: 'unknown' },
  'cne': { license: 'unknown' }, 'und': { license: 'unknown' }, 'nkc': { license: 'unknown' },
}

export function mapEuropeanaRights(uri: string): { license: LicenseId; version?: string; jurisdiction?: string } {
  const u = (uri || '').toLowerCase()
  if (!u) return { license: 'unknown' }
  // rightsstatements.org — faithful per-token mapping (not blanket unknown).
  const rs = u.match(/rightsstatements\.org\/(?:vocab|page)\/([a-z-]+)/)
  if (rs) return RIGHTS_STATEMENT[rs[1]] ?? { license: 'unknown' }
  // Public domain dedications / marks (no version surfaced).
  if (u.includes('creativecommons.org/publicdomain/zero')) return { license: 'CC0-1.0' }
  if (u.includes('creativecommons.org/publicdomain/mark')) return { license: 'PD' }
  // Non-commercial / no-derivatives variants are NOT open grants → proprietary.
  // Checked before plain by/by-sa because "by-nc-sa" contains "by-sa".
  if (/creativecommons\.org\/licenses\/by-(?:nc|nd)/.test(u)) return { license: 'proprietary' }
  // Open CC deeds: capture the version (D7) for the attribution families only.
  const bySa = u.match(/creativecommons\.org\/licenses\/by-sa\/(\d\.\d)/)
  if (bySa) return { license: 'CC-BY-SA', version: bySa[1] }
  const by = u.match(/creativecommons\.org\/licenses\/by\/(\d\.\d)/)
  if (by) return { license: 'CC-BY', version: by[1] }
  return { license: 'unknown' }
}

export interface EuropeanaConfig {
  /** Free BYOK Europeana API key (sent as the `wskey` query param). */
  apiKey: string
}

interface EuropeanaItem {
  id: string
  type?: string
  title?: string[]
  dataProvider?: string[]
  provider?: string[]
  edmPreview?: string[]
  edmIsShownBy?: string[]
  edmIsShownAt?: string[]
  /** MIME type of the media resource when the record declares it. */
  ebucoreHasMimeType?: string[]
  rights?: string[]
}
interface EuropeanaResponse { success?: boolean; items?: EuropeanaItem[] }

/** First element of an array-typed Europeana field, or undefined. */
function first<T>(arr: T[] | undefined): T | undefined {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined
}

// edmIsShownBy is the MEDIA resource; edmIsShownAt is a LANDING PAGE (a web page, not
// an image) — it must never become preview.url. The record usually tells us the media
// type (ebucoreHasMimeType); otherwise fall back to a URL-string heuristic (no network —
// `core` never fetches bytes, and a probe would add a request per item).
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|tiff?)(?:$|\?)/i

/** URL-string heuristic only (no network): does this look like an image resource? */
function isLikelyImageUrl(url: string): boolean {
  return IMAGE_EXT.test(url) || /iiif/i.test(url) || /\/thumbnail\//i.test(url)
}

/** Best image mediaType: the declared MIME if it's an image, else inferred from the
 *  URL extension, else a safe default. */
function imageMediaType(mime: string | undefined, url: string): string {
  if (mime && mime.startsWith('image/')) return mime
  const m = url.match(IMAGE_EXT)
  if (m) { const e = m[1].toLowerCase(); return e === 'jpg' ? 'image/jpeg' : `image/${e === 'tif' ? 'tiff' : e}` }
  return 'image/jpeg'
}

function toReference(it: EuropeanaItem): Reference | null {
  // v1 image-only scope (D1): defensively re-check type even though the search is
  // server-filtered with qf=TYPE:IMAGE.
  if (it.type && it.type !== 'IMAGE') return null
  if (!it.id) return null

  // id is "/datasetId/recordId" (leading slash) → canonical Europeana item page.
  const canonicalUrl = `https://www.europeana.eu/item${it.id}`

  // preview = the actual IMAGE media (edmIsShownBy) ONLY — NEVER edmIsShownAt, which is
  // a landing web page. Trust edmIsShownBy when the record's MIME says image/*, or the
  // URL looks like an image, or no MIME contradicts it (type is already IMAGE). thumbnail
  // = edmPreview (Europeana's own thumbnail image service — reliable). Drop the item only
  // when there is neither a usable preview nor a thumbnail (nothing visual to surface).
  const shownBy = first(it.edmIsShownBy)
  const mime = first(it.ebucoreHasMimeType)
  const thumbUrl = first(it.edmPreview)
  const previewUrl = shownBy && (mime?.startsWith('image/') || isLikelyImageUrl(shownBy) || !mime)
    ? shownBy
    : undefined
  if (!previewUrl && !thumbUrl) return null

  const rightsUri = first(it.rights) ?? ''
  const { license, version, jurisdiction } = mapEuropeanaRights(rightsUri)

  const rights: RightsRecord = {
    license,
    licenseVersion: license === 'CC-BY' || license === 'CC-BY-SA' ? version : undefined,
    // jurisdiction-scoped PD (e.g. NoC-US → PD in the US); metadata for evaluateUse.
    ...(jurisdiction ? { jurisdiction } : {}),
    author: first(it.dataProvider) ?? first(it.provider) ?? undefined,
    // D6: media is hotlinked from data providers — caching/rehosting not permitted.
    rehostPolicy: 'hotlink-required',
    raw: { sourceTerms: rightsUri || 'https://www.europeana.eu/rights', sourceUrl: canonicalUrl },
  }
  return {
    id: referenceId('europeana', canonicalUrl),
    modality: 'image',
    title: first(it.title) || undefined,
    source: { providerId: 'europeana', sourceUrl: canonicalUrl },
    canonicalUrl,
    rights,
    verifiedAt: new Date().toISOString(),
    ...(thumbUrl ? { thumbnail: { url: thumbUrl } } : {}),
    ...(previewUrl ? { preview: { url: previewUrl, mediaType: imageMediaType(mime, previewUrl) } } : {}),
    relevance: 0,
    raw: it,
  }
}

export function europeana(config: EuropeanaConfig) {
  return defineProvider({
    id: 'europeana',
    modalities: ['image'],
    queryFeatures: ['keyword'],
    capabilities: { controls: [] },
    async search(q: NormalizedQuery, ctx: ProviderContext): Promise<Reference[]> {
      const url = new URL(BASE)
      url.searchParams.set('wskey', config.apiKey)
      url.searchParams.set('query', q.text)
      url.searchParams.set('rows', String(q.limit ?? 20))
      url.searchParams.set('media', 'true')   // only items that actually carry media
      url.searchParams.set('qf', 'TYPE:IMAGE') // v1 image-only scope (D1)
      const res = await ctx.fetch(url.toString(), { signal: ctx.signal })
      if (!res.ok) throw new Error(`europeana search failed: ${res.status}`)
      const json = (await res.json()) as EuropeanaResponse
      if (!json.items || json.items.length === 0) return []
      return json.items
        .map(toReference)
        .filter((r): r is Reference => r !== null)
    },
  })
}
