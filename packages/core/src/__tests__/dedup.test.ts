import { describe, expect, it } from 'vitest'
import { hammingDistance, dedupeReferences } from '../dedup'
import type { Reference } from '../reference'

const make = (over: Partial<Reference>): Reference => ({
  id: over.id ?? 'x',
  modality: 'image',
  source: over.source ?? { providerId: 'p', sourceUrl: 'https://x/1' },
  canonicalUrl: over.canonicalUrl ?? 'https://x/1',
  rights: { license: 'CC0-1.0', rehostPolicy: 'cache-allowed', raw: { sourceTerms: 't', sourceUrl: 'u' } },
  verifiedAt: '2026-06-22T00:00:00.000Z',
  relevance: over.relevance ?? 0.5,
  perceptualHash: over.perceptualHash,
  ...over,
})

describe('hammingDistance', () => {
  it('counts differing hex nibbles bit-by-bit', () => {
    expect(hammingDistance('ffff', 'ffff')).toBe(0)
    expect(hammingDistance('ffff', 'fffe')).toBe(1) // e = 1110, one bit off
    expect(hammingDistance('0000', 'ffff')).toBe(16)
  })

  it('returns Infinity for unequal lengths', () => {
    expect(hammingDistance('ff', 'ffff')).toBe(Infinity)
  })
})

describe('dedupeReferences', () => {
  it('collapses same canonicalUrl, keeping highest relevance', () => {
    const out = dedupeReferences([
      make({ id: 'a', canonicalUrl: 'https://x/1', relevance: 0.4 }),
      make({ id: 'b', canonicalUrl: 'https://x/1/#frag', relevance: 0.8 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('b')
  })

  it('collapses near-identical perceptual hashes within threshold', () => {
    const out = dedupeReferences([
      make({ id: 'a', canonicalUrl: 'https://x/1', perceptualHash: 'ffff', relevance: 0.9 }),
      make({ id: 'b', canonicalUrl: 'https://y/2', perceptualHash: 'fffe', relevance: 0.3 }),
    ], { hashThreshold: 4 })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
  })

  it('keeps distinct images apart', () => {
    const out = dedupeReferences([
      make({ id: 'a', canonicalUrl: 'https://x/1', perceptualHash: 'ffff' }),
      make({ id: 'b', canonicalUrl: 'https://y/2', perceptualHash: '0000' }),
    ], { hashThreshold: 4 })
    expect(out).toHaveLength(2)
  })
})
