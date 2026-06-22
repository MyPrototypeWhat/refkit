import { describe, expect, it } from 'vitest'
import * as refkit from '../index'

describe('@refkit/core barrel', () => {
  it('module loads', () => {
    expect(refkit).toBeTypeOf('object')
  })
})
