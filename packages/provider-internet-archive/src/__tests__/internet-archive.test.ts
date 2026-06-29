import { describe, expect, it } from 'vitest'
import { mapIaLicense, mediatypeToModality } from '../index'

describe('mapIaLicense', () => {
  it('maps CC0 / PD mark / PD dedication URLs', () => {
    expect(mapIaLicense('https://creativecommons.org/publicdomain/zero/1.0/')).toEqual({ license: 'CC0-1.0' })
    expect(mapIaLicense('http://creativecommons.org/publicdomain/mark/1.0/')).toEqual({ license: 'PD' })
  })

  it('maps CC-BY and CC-BY-SA with version (D7)', () => {
    expect(mapIaLicense('https://creativecommons.org/licenses/by/4.0/')).toEqual({ license: 'CC-BY', version: '4.0' })
    expect(mapIaLicense('http://creativecommons.org/licenses/by-sa/3.0/')).toEqual({ license: 'CC-BY-SA', version: '3.0' })
  })

  it('maps NC/ND variants to proprietary (D5)', () => {
    expect(mapIaLicense('https://creativecommons.org/licenses/by-nc/4.0/').license).toBe('proprietary')
    expect(mapIaLicense('https://creativecommons.org/licenses/by-nd/4.0/').license).toBe('proprietary')
    expect(mapIaLicense('https://creativecommons.org/licenses/by-nc-sa/4.0/').license).toBe('proprietary')
  })

  it('falls back to unknown for absent / unrecognized URLs (D3)', () => {
    expect(mapIaLicense(undefined)).toEqual({ license: 'unknown' })
    expect(mapIaLicense('')).toEqual({ license: 'unknown' })
    expect(mapIaLicense('https://example.com/some-license')).toEqual({ license: 'unknown' })
  })

  it('maps rightsstatements.org faithfully (InC→proprietary, NoC-US→PD+US, opaque→unknown)', () => {
    expect(mapIaLicense('http://rightsstatements.org/vocab/InC/1.0/')).toEqual({ license: 'proprietary' })
    expect(mapIaLicense('http://rightsstatements.org/vocab/NoC-US/1.0/')).toEqual({ license: 'PD', jurisdiction: 'US' })
    expect(mapIaLicense('http://rightsstatements.org/vocab/NoC-NC/1.0/')).toEqual({ license: 'proprietary' })
    expect(mapIaLicense('http://rightsstatements.org/vocab/CNE/1.0/')).toEqual({ license: 'unknown' })
  })
})

describe('mediatypeToModality (D1)', () => {
  it('maps movies→video and texts→text', () => {
    expect(mediatypeToModality('movies')).toBe('video')
    expect(mediatypeToModality('texts')).toBe('text')
  })
  it('returns null for unsupported mediatypes (filtered out of v1)', () => {
    expect(mediatypeToModality('audio')).toBeNull()
    expect(mediatypeToModality('image')).toBeNull()
    expect(mediatypeToModality('collection')).toBeNull()
    expect(mediatypeToModality('software')).toBeNull()
  })
})
