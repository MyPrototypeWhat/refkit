import { describe, expect, it } from 'vitest'
import { evaluateUse, type ProviderContext } from '@refkit/core'
import { jamendo, mapJamendoLicense } from '../index'

// Jamendo wraps results in { headers, results }. This ctx captures the request URL
// (to assert client_id/search/limit forwarding) and returns the supplied body.
const ctxCapturing = (body: unknown): { ctx: ProviderContext; url: () => string } => {
  let captured = ''
  const ctx: ProviderContext = {
    fetch: (async (input: Parameters<typeof fetch>[0]) => {
      captured = String(input)
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch,
  }
  return { ctx, url: () => captured }
}

const envelope = (results: unknown[]) => ({
  headers: { status: 'success', code: 0, error_message: '', results_count: results.length },
  results,
})

const TRACK_BY = {
  id: '1848357',
  name: 'Sunrise',
  artist_name: 'fankel',
  audio: 'https://prod-1.storage.jamendo.com/?trackid=1848357&format=mp31&from=app-devsite',
  audiodownload: 'https://prod-1.storage.jamendo.com/download/track/1848357/mp32/',
  image: 'https://usercontent.jamendo.com?type=album&id=368084&width=300&trackid=1848357',
  shareurl: 'https://www.jamendo.com/track/1848357',
  shorturl: 'https://jamen.do/t/1848357',
  license_ccurl: 'http://creativecommons.org/licenses/by/4.0/',
}

describe('mapJamendoLicense', () => {
  it('maps CC-BY and CC-BY-SA with version, NC/ND → proprietary, missing → unknown', () => {
    expect(mapJamendoLicense('http://creativecommons.org/licenses/by/4.0/')).toEqual({ license: 'CC-BY', version: '4.0' })
    expect(mapJamendoLicense('https://creativecommons.org/licenses/by-sa/3.0/')).toEqual({ license: 'CC-BY-SA', version: '3.0' })
    expect(mapJamendoLicense('http://creativecommons.org/licenses/by-nc-nd/3.0/')).toEqual({ license: 'proprietary' })
    expect(mapJamendoLicense('http://creativecommons.org/licenses/by-nc/2.0/')).toEqual({ license: 'proprietary' })
    expect(mapJamendoLicense('http://creativecommons.org/licenses/by-nd/4.0/')).toEqual({ license: 'proprietary' })
    expect(mapJamendoLicense('')).toEqual({ license: 'unknown' })
    expect(mapJamendoLicense('https://example.com/whatever')).toEqual({ license: 'unknown' })
  })
})

describe('jamendo provider', () => {
  it('maps a CC-BY track to a CC-BY audio reference (allowed-with-attribution)', async () => {
    const { ctx } = ctxCapturing(envelope([TRACK_BY]))
    const refs = await jamendo({ clientId: 'cid' }).search({ text: 'sunrise', modalities: ['audio'], limit: 5 }, ctx)
    expect(refs).toHaveLength(1)
    const r = refs[0]
    expect(r.modality).toBe('audio')
    expect(r.rights.license).toBe('CC-BY')
    expect(r.rights.licenseVersion).toBe('4.0')
    expect(r.rights.author).toBe('fankel')
    expect(r.title).toBe('Sunrise')
    expect(r.canonicalUrl).toBe('https://www.jamendo.com/track/1848357')
    expect(r.preview?.url).toContain('trackid=1848357')
    expect(r.preview?.mediaType).toBe('audio/mpeg')
    expect(r.thumbnail?.url).toContain('usercontent.jamendo.com')
    expect(evaluateUse(r.rights, 'commercial-product').decision).toBe('allowed-with-attribution')
  })
})
