import {
  defineProvider, referenceId,
  type Reference, type RightsRecord, type LicenseId,
  type NormalizedQuery, type ProviderContext,
} from '@refkit/core'

export interface RijksmuseumConfig {
  /** Max records fetched per search. Search returns only IDs, so each result
   *  costs one extra Linked-Art fetch — this bounds that N+1 fan-out. Default 12. */
  maxObjects?: number
}

export interface RijksmuseumSearchOptions {
  /** Object type, e.g. 'painting'. */
  type?: string
  /** Material, e.g. 'canvas'. */
  material?: string
  /** Technique, e.g. 'oil paint'. */
  technique?: string
  /** Maker/artist (maps to `creator`). */
  creator?: string
  /** Free-text description match. */
  description?: string
  /** Restrict to objects with an image. */
  imageAvailable?: boolean
}

const SEARCH = 'https://data.rijksmuseum.nl/search/collection'
const RIJKS_TERMS = 'https://www.rijksmuseum.nl/en/data/policy'

// D7-style: map a CC deed URL to our LicenseId (+ CC version). Rijksmuseum open-access is
// effectively CC0/PDM; BY/BY-SA are implemented for correctness but not expected. CC-only —
// Rijksmuseum does not use rightsstatements.org, so this is replaced by core `mapCcDeedUrl`
// (NOT core `mapRightsUrl`) in helper-refactor Task 4. Named `mapRijksRights` to avoid clashing
// with the core `mapRightsUrl` helper, which additionally handles rightsstatements.org.
function mapRijksRights(url: string | undefined): { license: LicenseId; version?: string } {
  if (!url) return { license: 'unknown' }
  if (/creativecommons\.org\/publicdomain\/zero/.test(url)) return { license: 'CC0-1.0' }
  if (/creativecommons\.org\/publicdomain\/mark/.test(url)) return { license: 'PD' }
  if (/rightsstatements\.org\/(?:vocab|page)\/NoCopyright/i.test(url)) return { license: 'PD' }
  const sa = url.match(/creativecommons\.org\/licenses\/by-sa\/(\d\.\d)/)
  if (sa) return { license: 'CC-BY-SA', version: sa[1] }
  const by = url.match(/creativecommons\.org\/licenses\/by\/(\d\.\d)/)
  if (by) return { license: 'CC-BY', version: by[1] }
  return { license: 'unknown' }
}

// The Linked-Art graph is deeply nested and varies per record, so we extract by
// shape, not by fixed index paths (see plan Open Questions).

/** First string anywhere in the record matching a known rights-deed host. */
function findRightsUrl(node: unknown, depth = 0): string | undefined {
  if (depth > 8 || node == null) return undefined
  if (typeof node === 'string') {
    return /creativecommons\.org\/(publicdomain|licenses)|rightsstatements\.org/.test(node) ? node : undefined
  }
  if (Array.isArray(node)) {
    for (const v of node) { const hit = findRightsUrl(v, depth + 1); if (hit) return hit }
    return undefined
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const hit = findRightsUrl(v, depth + 1); if (hit) return hit
    }
  }
  return undefined
}

// We must not put a NON-image URL (a viewer/collection web page) into preview.url.
// The API carries the answer: a DigitalObject's `format` (a MIME type) and IIIF
// `conforms_to` say which access_point is the image. So: read the type first, then
// fall back to a cheap URL heuristic, then give up (no network probe — `core` never
// fetches bytes, and that would add an extra request per item). See Open Questions #1.
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|tiff?)(?:$|\?)/i

/** URL-string heuristic only (no network): does this look like an image resource? */
function isLikelyImageUrl(url: string): boolean {
  return IMAGE_EXT.test(url)
    || /iiif/i.test(url)                       // IIIF image endpoint
    || /\/full\/[^/]+\/\d+\/default/i.test(url) // IIIF Image API request URL
    || /googleusercontent\.com/.test(url)       // Rijksmuseum/Met image CDN
}

interface LaDigitalObject {
  type?: string
  format?: string
  conforms_to?: Array<{ id?: string }>
  access_point?: Array<{ id?: string }>
}

/** Collect every node that carries an `access_point` (the DigitalObjects) anywhere. */
function collectDigitalObjects(node: unknown, out: LaDigitalObject[] = [], depth = 0): LaDigitalObject[] {
  if (depth > 8 || node == null) return out
  if (Array.isArray(node)) { for (const v of node) collectDigitalObjects(v, out, depth + 1); return out }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (Array.isArray(o.access_point)) out.push(o as LaDigitalObject)
    for (const v of Object.values(o)) collectDigitalObjects(v, out, depth + 1)
  }
  return out
}

/** Best usable IMAGE url + its mediaType, or undefined.
 *  Tier 1: a DigitalObject explicitly typed `image/*` or IIIF → trust it.
 *  Tier 2: any access_point whose URL heuristically looks like an image.
 *  Otherwise undefined → the item is dropped (an image provider with no image is useless). */
function findImage(rec: Record<string, unknown>): { url: string; mediaType: string } | undefined {
  const objs = collectDigitalObjects(rec)
  // Tier 1 — explicit type from the data.
  for (const o of objs) {
    const fmt = typeof o.format === 'string' ? o.format : undefined
    const isIiif = Array.isArray(o.conforms_to) && o.conforms_to.some(c => typeof c?.id === 'string' && /iiif/i.test(c.id))
    if ((fmt && fmt.startsWith('image/')) || isIiif) {
      const url = o.access_point?.find(a => typeof a?.id === 'string')?.id
      if (url) return { url, mediaType: fmt && fmt.startsWith('image/') ? fmt : 'image/jpeg' }
    }
  }
  // Tier 2 — URL heuristic fallback.
  for (const o of objs) {
    const hit = o.access_point?.find(a => typeof a?.id === 'string' && isLikelyImageUrl(a.id))?.id
    if (hit) return { url: hit, mediaType: 'image/jpeg' }
  }
  return undefined
}

interface LaName { type?: string; content?: string }
function findTitle(rec: Record<string, unknown>): string | undefined {
  const names = rec.identified_by
  if (Array.isArray(names)) {
    for (const n of names as LaName[]) {
      if (n?.type === 'Name' && typeof n.content === 'string' && n.content) return n.content
    }
  }
  return undefined
}

function findCreator(rec: Record<string, unknown>): string | undefined {
  const prod = rec.produced_by as Record<string, unknown> | undefined
  if (!prod) return undefined
  const direct = prod.carried_out_by
  const parts = Array.isArray(prod.part) ? (prod.part as Record<string, unknown>[]) : []
  const actors = [
    ...(Array.isArray(direct) ? (direct as Record<string, unknown>[]) : []),
    ...parts.flatMap(p => (Array.isArray(p.carried_out_by) ? (p.carried_out_by as Record<string, unknown>[]) : [])),
  ]
  for (const a of actors) {
    const label = a._label ?? (a as { notation?: unknown }).notation
    if (typeof label === 'string' && label) return label
  }
  return undefined
}

function toReference(rec: Record<string, unknown>): Reference | null {
  const id = typeof rec.id === 'string' ? rec.id : undefined
  if (!id) return null
  const img = findImage(rec)
  if (!img) return null // no usable IMAGE url (e.g. only a viewer/collection page) → drop
  const { license, version } = mapRijksRights(findRightsUrl(rec))
  const rights: RightsRecord = {
    license,
    licenseVersion: license === 'CC-BY' || license === 'CC-BY-SA' ? version : undefined,
    author: findCreator(rec) || undefined,
    rehostPolicy: 'cache-allowed',
    raw: { sourceTerms: RIJKS_TERMS, sourceUrl: id },
  }
  return {
    id: referenceId('rijksmuseum', id),
    modality: 'image',
    title: findTitle(rec),
    source: { providerId: 'rijksmuseum', sourceUrl: id },
    canonicalUrl: id,
    rights,
    verifiedAt: new Date().toISOString(),
    thumbnail: { url: img.url },
    preview: { url: img.url, mediaType: img.mediaType },
    relevance: 0,
    raw: rec,
  }
}

function setIfString(url: URL, key: string, value: unknown) {
  if (typeof value !== 'string' || !value) return
  url.searchParams.set(key, value)
}
function setIfBoolean(url: URL, key: string, value: unknown) {
  if (typeof value !== 'boolean') return
  url.searchParams.set(key, String(value))
}

interface SearchPage { orderedItems?: Array<{ id?: string }> }

export function rijksmuseum(config: RijksmuseumConfig = {}) {
  return defineProvider({
    id: 'rijksmuseum',
    modalities: ['image'],
    queryFeatures: ['keyword'],
    capabilities: { controls: [] },
    async search(q: NormalizedQuery, ctx: ProviderContext): Promise<Reference[]> {
      const opts = q.providerOptions as RijksmuseumSearchOptions | undefined
      const n = Math.min(config.maxObjects ?? q.limit ?? 12, 30)
      const searchUrl = new URL(SEARCH)
      // No global free-text param; `title` is a partial keyword match → use it as the keyword.
      if (q.text) searchUrl.searchParams.set('title', q.text)
      setIfString(searchUrl, 'type', opts?.type)
      setIfString(searchUrl, 'material', opts?.material)
      setIfString(searchUrl, 'technique', opts?.technique)
      setIfString(searchUrl, 'creator', opts?.creator)
      setIfString(searchUrl, 'description', opts?.description)
      setIfBoolean(searchUrl, 'imageAvailable', opts?.imageAvailable)
      searchUrl.searchParams.set('pageSize', String(n)) // best-effort cap; server caps at 100

      const res = await ctx.fetch(searchUrl.toString(), { signal: ctx.signal })
      if (!res.ok) throw new Error(`rijksmuseum search failed: ${res.status}`)
      const page = (await res.json()) as SearchPage
      const ids = (page.orderedItems ?? [])
        .map(it => it.id)
        .filter((u): u is string => typeof u === 'string')
        .slice(0, n)
      if (ids.length === 0) return []

      const records = await Promise.all(ids.map(async (idUrl) => {
        try {
          // Content-negotiate the Linked-Art JSON-LD. id.rijksmuseum.nl 303s to
          // data.rijksmuseum.nl; ?_profile=la selects the Linked-Art profile.
          const recUrl = `${idUrl}${idUrl.includes('?') ? '&' : '?'}_profile=la`
          const r = await ctx.fetch(recUrl, { signal: ctx.signal })
          if (!r.ok) return null
          return (await r.json()) as Record<string, unknown>
        } catch {
          return null // one bad record fetch must not drop the whole batch
        }
      }))
      return records
        .map(rec => (rec ? toReference(rec) : null))
        .filter((r): r is Reference => r !== null)
    },
  })
}
