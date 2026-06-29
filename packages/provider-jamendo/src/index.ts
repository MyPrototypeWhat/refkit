import {
  defineProvider, referenceId,
  type Reference, type RightsRecord, type LicenseId,
  type NormalizedQuery, type ProviderContext,
} from '@refkit/core'

export interface JamendoConfig {
  /** Jamendo API client_id (BYOK). Register at https://devportal.jamendo.com/. */
  clientId: string
}

export interface JamendoSearchOptions {
  /** mp3 stream quality. Default 'mp31' (96 kbps). */
  audioformat?: 'mp31' | 'mp32' | 'ogg' | 'flac'
  order?: 'relevance' | 'popularity_total' | 'popularity_month' | 'popularity_week' | 'releasedate_asc' | 'releasedate_desc' | 'buzzrate'
  /** Restrict to tracks whose license permits a given use, server-side. Relevance
   *  hint only — mapJamendoLicense below is the authoritative rights gate. */
  ccsa?: boolean
  ccnd?: boolean
  ccnc?: boolean
  tags?: string | readonly string[]
  artist_name?: string
  offset?: number
}

const BASE = 'https://api.jamendo.com/v3.0/tracks/'

// The `audioformat` request param decides what `t.audio` streams; reflect it in mediaType
// rather than hardcoding audio/mpeg (which would mislabel ogg/flac requests).
const JAMENDO_AUDIO_MIME: Record<string, string> = {
  mp31: 'audio/mpeg', mp32: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac',
}

interface JamendoTrack {
  id: string
  name: string
  artist_name: string
  audio: string
  audiodownload?: string
  image: string
  shareurl: string
  shorturl?: string
  license_ccurl: string
}
interface JamendoResponse {
  headers: { status: string; code: number; error_message?: string; results_count: number }
  results: JamendoTrack[]
}

// Jamendo deed URLs look like http(s)://creativecommons.org/licenses/<variant>/<v>/.
// Only by/by-sa fit our enum (D5); capture the version (D7). Any nc/nd variant is
// non-commercial or no-derivatives → 'proprietary'. Missing/unrecognized → 'unknown'.
export function mapJamendoLicense(ccurl: string): { license: LicenseId; version?: string } {
  if (!ccurl) return { license: 'unknown' }
  const by = ccurl.match(/\/licenses\/by\/(\d\.\d)\//)
  if (by) return { license: 'CC-BY', version: by[1] }
  const bySa = ccurl.match(/\/licenses\/by-sa\/(\d\.\d)\//)
  if (bySa) return { license: 'CC-BY-SA', version: bySa[1] }
  if (/\/licenses\/by-(nc|nd)/.test(ccurl)) return { license: 'proprietary' }
  return { license: 'unknown' }
}

function toAudioReference(t: JamendoTrack, mediaType: string): Reference {
  const { license, version } = mapJamendoLicense(t.license_ccurl)
  const canonicalUrl = t.shareurl
  const rights: RightsRecord = {
    license,
    // CC version is metadata only (attribution/audit), kept for the BY/BY-SA family.
    licenseVersion: license === 'CC-BY' || license === 'CC-BY-SA' ? version : undefined,
    author: t.artist_name || undefined,
    // governed by the per-item CC license; the mp3 stream is served directly by Jamendo
    rehostPolicy: 'cache-allowed',
    raw: { sourceTerms: t.license_ccurl, sourceUrl: canonicalUrl },
  }
  return {
    id: referenceId('jamendo', canonicalUrl),
    modality: 'audio',
    title: t.name || undefined,
    source: { providerId: 'jamendo', sourceUrl: canonicalUrl },
    canonicalUrl,
    rights,
    verifiedAt: new Date().toISOString(),
    // audio has no native thumbnail; the album art is the closest visual handle
    ...(t.image ? { thumbnail: { url: t.image } } : {}),
    preview: { url: t.audio, mediaType },
    relevance: 0, // per-source order; mergeReferences assigns the final RRF relevance
    raw: t,
  }
}

function setIfString(url: URL, key: string, value: unknown, allowed?: readonly string[]) {
  if (typeof value !== 'string' || !value) return
  if (allowed && !allowed.includes(value)) return
  url.searchParams.set(key, value)
}

function setIfStringList(url: URL, key: string, value: unknown) {
  if (typeof value === 'string' && value) url.searchParams.set(key, value)
  if (Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string' && v)) url.searchParams.set(key, value.join(' '))
}

function setIfBooleanFlag(url: URL, key: string, value: unknown) {
  if (typeof value !== 'boolean') return
  url.searchParams.set(key, value ? 'true' : 'false')
}

function setIfPositiveInt(url: URL, key: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return
  url.searchParams.set(key, String(value))
}

export function jamendo(config: JamendoConfig) {
  return defineProvider({
    id: 'jamendo',
    modalities: ['audio'],
    queryFeatures: ['keyword'],
    capabilities: { controls: [] },
    async search(q: NormalizedQuery, ctx: ProviderContext): Promise<Reference[]> {
      const url = new URL(BASE)
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('format', 'json')
      url.searchParams.set('search', q.text)
      url.searchParams.set('limit', String(Math.min(q.limit ?? 20, 200)))
      const opts = q.providerOptions as JamendoSearchOptions | undefined
      setIfString(url, 'audioformat', opts?.audioformat, ['mp31', 'mp32', 'ogg', 'flac'])
      setIfString(url, 'order', opts?.order, ['relevance', 'popularity_total', 'popularity_month', 'popularity_week', 'releasedate_asc', 'releasedate_desc', 'buzzrate'])
      setIfBooleanFlag(url, 'ccsa', opts?.ccsa)
      setIfBooleanFlag(url, 'ccnd', opts?.ccnd)
      setIfBooleanFlag(url, 'ccnc', opts?.ccnc)
      setIfStringList(url, 'tags', opts?.tags)
      setIfString(url, 'artist_name', opts?.artist_name)
      setIfPositiveInt(url, 'offset', opts?.offset)
      const res = await ctx.fetch(url.toString(), { signal: ctx.signal })
      if (!res.ok) throw new Error(`jamendo search failed: ${res.status}`)
      const json = (await res.json()) as JamendoResponse
      if (json.headers?.status !== 'success') throw new Error(`jamendo search error: ${json.headers?.error_message || json.headers?.status}`)
      const mediaType = JAMENDO_AUDIO_MIME[opts?.audioformat ?? 'mp31'] ?? 'audio/mpeg'
      return (json.results ?? []).map((t) => toAudioReference(t, mediaType))
    },
  })
}
