import { describe, expect, it } from 'vitest'
import { tokenize, lexicalReranker } from '../rerank'
import type { Reference } from '../reference'

const ref = (id: string, title: string, opts: Partial<Reference> = {}): Reference => ({
  id,
  modality: 'image',
  title,
  source: { providerId: 'p', sourceUrl: `https://x/${id}` },
  canonicalUrl: `https://x/${id}`,
  rights: { license: 'CC0-1.0', rehostPolicy: 'cache-allowed', raw: { sourceTerms: 't', sourceUrl: 'u' } },
  verifiedAt: '2026-06-24T00:00:00.000Z',
  relevance: 0,
  ...opts,
})

describe('lexicalReranker', () => {
  it('ranks a title that matches the query above one that does not', async () => {
    const refs = [
      ref('a', 'Interior of the National Gallery'),
      ref('b', 'Cyberpunk neon city at night'),
    ]
    const out = await lexicalReranker()({ query: 'cyberpunk neon city', refs })
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('returns a single ref unchanged and rewrites relevance into 0..1', async () => {
    const refs = [ref('a', 'cyberpunk city')]
    const out = await lexicalReranker()({ query: 'cyberpunk', refs })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
    expect(out[0].relevance).toBeGreaterThan(0)
    expect(out[0].relevance).toBeLessThanOrEqual(1)
  })

  it('keeps input order and zeroes relevance when nothing matches (lexical-only)', async () => {
    const refs = [ref('a', 'red lion'), ref('b', 'blue whale')]
    const out = await lexicalReranker({ qualityWeight: 0, sourceDiversity: 0 })({ query: 'cyberpunk neon', refs })
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
    expect(out.every((r) => r.relevance === 0)).toBe(true)
  })
})

describe('tokenize', () => {
  it('lowercases, splits on non-alphanumerics, drops stopwords and 1-char tokens', () => {
    expect(tokenize('A Cyberpunk Neon-City at Night!')).toEqual(['cyberpunk', 'neon', 'city', 'night'])
  })

  it('returns [] for empty / stopword-only input', () => {
    expect(tokenize('   the of a   ')).toEqual([])
    expect(tokenize('')).toEqual([])
  })
})
