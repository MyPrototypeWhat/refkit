import { readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { RefkitClient, Reference, Verdict, Attribution } from '@refkit/core'

const MODALITIES = ['image', 'video', 'audio', 'text'] as const
const INTENTS = ['internal-moodboard', 'commercial-product', 'ai-generation-input', 'redistribution'] as const

// Reported in the MCP initialize handshake. Read the real version (the dist sits
// next to package.json, which npm always ships) instead of a hardcoded placeholder.
const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()

// Concise, agent-facing projection of a Reference (no raw provider dump). When an
// intent is supplied the use-gate verdict + attribution ride along, so the agent
// sees *whether it may use* each result — not just a bare license id it ignores.
function toAgentRef(r: Reference, assessment?: { verdict: Verdict; attribution: Attribution }) {
  const base = {
    id: r.id,
    title: r.title,
    modality: r.modality,
    provider: r.source.providerId,
    canonicalUrl: r.canonicalUrl,
    license: r.rights.license,
    thumbnail: r.thumbnail?.url,
    excerpt: r.text?.excerpt,
  }
  if (!assessment) return base
  const { verdict, attribution } = assessment
  return {
    ...base,
    useVerdict: { decision: verdict.decision, reason: verdict.reasons.join('; '), confidence: verdict.confidence },
    ...(attribution.required && attribution.text ? { attribution: attribution.text } : {}),
  }
}

const agentRefSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  modality: z.string(),
  provider: z.string(),
  canonicalUrl: z.string(),
  license: z.string(),
  thumbnail: z.string().optional(),
  excerpt: z.string().optional(),
  useVerdict: z
    .object({ decision: z.string(), reason: z.string(), confidence: z.string() })
    .optional()
    .describe('present when `intent` (or `gateFor`) is set: may this be used for that intent, and how confident'),
  attribution: z.string().optional().describe('ready-to-use credit line; present when the license requires attribution'),
})

/** Wrap a configured RefkitClient as an MCP server exposing `search_references`. */
export function createRefkitMcpServer(refkit: RefkitClient): McpServer {
  const server = new McpServer({ name: 'refkit', version: VERSION })

  server.registerTool(
    'search_references',
    {
      title: 'Search creative references',
      description:
        'Search license-normalized reference material (image / video / audio / text) across the configured sources. ' +
        'Every result carries a license id + canonical source link. Pass `intent` to annotate each result with a ' +
        'use-verdict (may I use this, is attribution required) WITHOUT filtering; pass `gateFor` to instead return ' +
        'only results whose license allows that intent. Results are references, not rights clearance — not legal advice.',
      inputSchema: {
        query: z.string().describe('what to search for, e.g. "cyberpunk alley at night"'),
        modalities: z.array(z.enum(MODALITIES)).optional().describe('default ["image"]'),
        limit: z.number().int().positive().optional(),
        intent: z.enum(INTENTS).optional().describe('annotate each result with a use-verdict for this intended use (no filtering)'),
        gateFor: z.enum(INTENTS).optional().describe('only return results whose license allows this intended use'),
      },
      outputSchema: { references: z.array(agentRefSchema) },
    },
    async ({ query, modalities, limit, intent, gateFor }) => {
      const refs = await refkit.search({ query, modalities: modalities ?? ['image'], limit, gateFor })
      const assessIntent = intent ?? gateFor
      const references = refs.map(r =>
        assessIntent
          ? toAgentRef(r, { verdict: refkit.evaluateUse(r, assessIntent), attribution: refkit.buildAttribution(r) })
          : toAgentRef(r),
      )
      return {
        content: [{ type: 'text', text: `${references.length} reference(s) for "${query}".` }],
        structuredContent: { references },
      }
    },
  )

  return server
}

/** Run the refkit MCP server over stdio (host wires the RefkitClient + its providers/keys). */
export async function serveStdio(refkit: RefkitClient): Promise<void> {
  const server = createRefkitMcpServer(refkit)
  await server.connect(new StdioServerTransport())
}
