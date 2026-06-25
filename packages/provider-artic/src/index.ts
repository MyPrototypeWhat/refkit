import {
  defineProvider, referenceId,
  type Reference, type RightsRecord, type NormalizedQuery, type ProviderContext,
} from '@refkit/core'

interface ArticArtwork {
  id: number
  title: string
  image_id: string | null
  is_public_domain: boolean
  artist_display: string | null
}
interface ArticResponse {
  data: ArticArtwork[]
  config?: { iiif_url?: string }
}

// AIC's artist_display packs name + nationality + dates across lines; keep the first line.
function artistName(display: string | null): string | undefined {
  if (!display) return undefined
  return display.split('\n')[0].trim() || undefined
}

function toReference(a: ArticArtwork, iiifUrl: string): Reference | null {
  // Open-access (public-domain) works are CC0; everything else has no usable image.
  if (!a.is_public_domain || !a.image_id) return null
  const canonicalUrl = `https://www.artic.edu/artworks/${a.id}`
  const rights: RightsRecord = {
    license: 'CC0-1.0',
    author: artistName(a.artist_display),
    rehostPolicy: 'cache-allowed',
    raw: { sourceTerms: 'https://www.artic.edu/terms', sourceUrl: canonicalUrl },
  }
  return {
    id: referenceId('artic', canonicalUrl),
    modality: 'image',
    title: a.title || undefined,
    source: { providerId: 'artic', sourceUrl: canonicalUrl },
    canonicalUrl,
    rights,
    verifiedAt: new Date().toISOString(),
    thumbnail: { url: `${iiifUrl}/${a.image_id}/full/200,/0/default.jpg` },
    preview: { url: `${iiifUrl}/${a.image_id}/full/843,/0/default.jpg`, mediaType: 'image/jpeg' },
    relevance: 0,
    raw: a,
  }
}

export function artic() {
  return defineProvider({
    id: 'artic',
    modalities: ['image'],
    queryFeatures: ['keyword'],
    capabilities: { controls: [] },
    async search(q: NormalizedQuery, ctx: ProviderContext): Promise<Reference[]> {
      const url = new URL('https://api.artic.edu/api/v1/artworks/search')
      url.searchParams.set('q', q.text)
      // relevance hint — toReference is authoritative on is_public_domain
      url.searchParams.set('query[term][is_public_domain]', 'true')
      url.searchParams.set('fields', 'id,title,image_id,is_public_domain,artist_display')
      url.searchParams.set('limit', String(q.limit ?? 20))
      const res = await ctx.fetch(url.toString(), { signal: ctx.signal })
      if (!res.ok) throw new Error(`artic search failed: ${res.status}`)
      const json = (await res.json()) as ArticResponse
      const iiif = json.config?.iiif_url ?? 'https://www.artic.edu/iiif/2'
      return json.data
        .map((a) => toReference(a, iiif))
        .filter((r): r is Reference => r !== null)
    },
  })
}
