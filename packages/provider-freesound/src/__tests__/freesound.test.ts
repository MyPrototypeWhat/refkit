import { describe, expect, it } from 'vitest'
import { mapFreesoundLicense } from '../index'

describe('mapFreesoundLicense', () => {
  it('maps CC name strings (D4 — no version)', () => {
    expect(mapFreesoundLicense('Attribution')).toEqual({ license: 'CC-BY' })
    expect(mapFreesoundLicense('Attribution NonCommercial')).toEqual({ license: 'proprietary' })
    expect(mapFreesoundLicense('Attribution Noncommercial')).toEqual({ license: 'proprietary' })
    expect(mapFreesoundLicense('Creative Commons 0')).toEqual({ license: 'CC0-1.0' })
    expect(mapFreesoundLicense('Sampling+')).toEqual({ license: 'proprietary' })
    expect(mapFreesoundLicense('Attribution Sampling+')).toEqual({ license: 'proprietary' })
  })

  it('maps CC deed URLs and extracts version for BY/BY-SA (D7)', () => {
    expect(mapFreesoundLicense('http://creativecommons.org/licenses/by/4.0/')).toEqual({ license: 'CC-BY', version: '4.0' })
    expect(mapFreesoundLicense('http://creativecommons.org/licenses/by-sa/3.0/')).toEqual({ license: 'CC-BY-SA', version: '3.0' })
    expect(mapFreesoundLicense('http://creativecommons.org/publicdomain/zero/1.0/')).toEqual({ license: 'CC0-1.0' })
    expect(mapFreesoundLicense('http://creativecommons.org/licenses/by-nc/3.0/')).toEqual({ license: 'proprietary' })
  })

  it('returns unknown for anything unrecognized', () => {
    expect(mapFreesoundLicense('Weird Custom License')).toEqual({ license: 'unknown' })
    expect(mapFreesoundLicense('')).toEqual({ license: 'unknown' })
  })
})
