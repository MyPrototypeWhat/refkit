import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@refkit/core'
import { pixabay } from '../index'

const FIXTURE = {
  total: 4692, totalHits: 500,
  hits: [{
    id: 195893, pageURL: 'https://pixabay.com/en/blossom-bloom-flower-195893/', type: 'photo',
    tags: 'blossom, bloom, flower',
    previewURL: 'https://cdn.pixabay.com/photo/flower-195893_150.jpg', previewWidth: 150, previewHeight: 84,
    webformatURL: 'https://pixabay.com/get/x_640.jpg', webformatWidth: 640, webformatHeight: 360,
    largeImageURL: 'https://pixabay.com/get/x_1280.jpg',
    imageWidth: 4000, imageHeight: 2250, user_id: 48777, user: 'Josch13',
  }],
}

describe('pixabay provider', () => {
  it('maps a hit (license pixabay, cache-allowed, tags as title, thumb dims, key in query)', async () => {
    let calledUrl = ''
    const ctx: ProviderContext = {
      fetch: (async (input: Parameters<typeof fetch>[0]) => { calledUrl = String(input); return new Response(JSON.stringify(FIXTURE), { status: 200 }) }) as typeof fetch,
    }
    const refs = await pixabay({ key: 'SECRET' }).search({ text: 'flowers', modalities: ['image'] }, ctx)
    const r = refs[0]
    expect(calledUrl).toContain('key=SECRET')
    expect(r.rights.license).toBe('pixabay')
    expect(r.rights.rehostPolicy).toBe('cache-allowed')
    expect(r.canonicalUrl).toBe('https://pixabay.com/en/blossom-bloom-flower-195893/')
    expect(r.title).toBe('blossom, bloom, flower')
    expect(r.rights.author).toBe('Josch13')
    expect(r.thumbnail).toEqual({ url: 'https://cdn.pixabay.com/photo/flower-195893_150.jpg', width: 150, height: 84 })
    expect(r.visual).toEqual({ width: 4000, height: 2250 })
  })
})
