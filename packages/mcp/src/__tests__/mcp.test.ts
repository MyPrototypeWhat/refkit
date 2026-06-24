import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createRefkit } from '@refkit/core'
import { openverse } from '@refkit/provider-openverse'
import { createRefkitMcpServer } from '../index'
import { defaultProviders } from '../cli'

const OPENVERSE = { results: [
  { id: 'aaa', title: 'cc0 sky', creator: 'Alice', foreign_landing_url: 'https://ov/aaa', url: 'https://cdn/aaa.jpg', thumbnail: 'https://ov/aaa/thumb', width: 10, height: 10, license: 'cc0', license_version: '1.0', license_url: 'https://cc/cc0' },
] }
const CC_BY = { results: [
  { id: 'bbb', title: 'attribution pic', creator: 'Bob', foreign_landing_url: 'https://ov/bbb', url: 'https://cdn/bbb.jpg', thumbnail: 'https://ov/bbb/thumb', width: 10, height: 10, license: 'by', license_version: '4.0', license_url: 'https://cc/by' },
] }

async function clientForPayload(payload: unknown) {
  const fakeFetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch
  const refkit = createRefkit({ providers: [openverse()], fetch: fakeFetch })
  const server = createRefkitMcpServer(refkit)
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([client.connect(clientT), server.connect(serverT)])
  return client
}

const connectedClient = () => clientForPayload(OPENVERSE)

describe('@refkit/mcp', () => {
  it('lists the search_references tool', async () => {
    const client = await connectedClient()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('search_references')
    await client.close()
  })

  it('search_references returns license-normalized structured references', async () => {
    const client = await connectedClient()
    const res = await client.callTool({ name: 'search_references', arguments: { query: 'sky', modalities: ['image'] } })
    const structured = res.structuredContent as { references: Array<{ title?: string; license: string; canonicalUrl: string; provider: string }> }
    expect(structured.references).toHaveLength(1)
    expect(structured.references[0].title).toBe('cc0 sky')
    expect(structured.references[0].license).toBe('CC0-1.0')
    expect(structured.references[0].canonicalUrl).toBe('https://ov/aaa')
    expect(structured.references[0].provider).toBe('openverse')
    await client.close()
  })

  it('gateFor flows through to the license gate', async () => {
    const client = await connectedClient()
    // cc0 is commercial-allowed, so it survives the gate
    const res = await client.callTool({ name: 'search_references', arguments: { query: 'sky', modalities: ['image'], gateFor: 'commercial-product' } })
    const structured = res.structuredContent as { references: Array<{ useVerdict?: { decision: string } }> }
    expect(structured.references).toHaveLength(1)
    // gateFor also annotates survivors with their verdict (assessIntent = intent ?? gateFor)
    expect(structured.references[0].useVerdict?.decision).toBe('allowed')
    await client.close()
  })

  it('intent annotates each result with a use-verdict (no filtering)', async () => {
    const client = await connectedClient()
    const res = await client.callTool({ name: 'search_references', arguments: { query: 'sky', modalities: ['image'], intent: 'commercial-product' } })
    const structured = res.structuredContent as { references: Array<{ useVerdict?: { decision: string; confidence: string }; attribution?: string }> }
    expect(structured.references).toHaveLength(1)
    expect(structured.references[0].useVerdict?.decision).toBe('allowed') // cc0 → commercial allowed
    expect(structured.references[0].useVerdict?.confidence).toBe('high')
    expect(structured.references[0].attribution).toBeUndefined() // cc0 needs no attribution
    await client.close()
  })

  it('omits the verdict when neither intent nor gateFor is given (bare projection)', async () => {
    const client = await connectedClient()
    const res = await client.callTool({ name: 'search_references', arguments: { query: 'sky', modalities: ['image'] } })
    const structured = res.structuredContent as { references: Array<{ useVerdict?: unknown }> }
    expect(structured.references[0].useVerdict).toBeUndefined()
    await client.close()
  })

  it('a CC-BY result carries a use-verdict + attribution credit line under an intent', async () => {
    const client = await clientForPayload(CC_BY)
    const res = await client.callTool({ name: 'search_references', arguments: { query: 'x', modalities: ['image'], intent: 'commercial-product' } })
    const structured = res.structuredContent as { references: Array<{ useVerdict?: { decision: string }; attribution?: string }> }
    expect(structured.references[0].useVerdict?.decision).toBe('allowed-with-attribution')
    expect(structured.references[0].attribution).toContain('CC-BY')
    await client.close()
  })
})

describe('defaultProviders (zero-config CLI wiring)', () => {
  it('includes every keyless provider by default', () => {
    const ids = defaultProviders({}).map(p => p.id)
    for (const id of ['openverse', 'wikimedia-commons', 'met', 'artic', 'gutendex', 'poetrydb']) {
      expect(ids).toContain(id)
    }
  })

  it('adds a BYOK provider only when its env key is present', () => {
    expect(defaultProviders({}).map(p => p.id)).not.toContain('unsplash')
    expect(defaultProviders({ UNSPLASH_KEY: 'k' }).map(p => p.id)).toContain('unsplash')
  })
})
