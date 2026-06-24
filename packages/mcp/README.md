# @refkit/mcp

An MCP server that exposes refkit's **license-normalized reference search** as an agent tool (`search_references`).

## Zero-config (`npx`)

Point any MCP client at:

```bash
npx -y @refkit/mcp
```

It boots with the keyless sources (Met, Art Institute of Chicago, Wikimedia Commons, Openverse + audio, Project Gutenberg, PoetryDB) and auto-adds any BYOK source whose key is in the environment:

```bash
UNSPLASH_KEY=… PEXELS_KEY=… PIXABAY_KEY=… FLICKR_KEY=… SI_KEY=… BRAVE_TOKEN=… npx -y @refkit/mcp
```

Example MCP client config:

```json
{ "mcpServers": { "refkit": { "command": "npx", "args": ["-y", "@refkit/mcp"] } } }
```

## Programmatic (bring your own providers)

The host owns wiring — which providers, which BYOK keys — and passes a configured `RefkitClient`:

```ts
import { serveStdio } from '@refkit/mcp'
import { createRefkit } from '@refkit/core'
import { openverse } from '@refkit/provider-openverse'
import { unsplash } from '@refkit/provider-unsplash'

await serveStdio(createRefkit({
  providers: [openverse(), unsplash({ accessKey: process.env.UNSPLASH_KEY! })],
  // fetch defaults to globalThis.fetch
}))
```

## The `search_references` tool

Input: `{ query, modalities?, limit?, intent?, gateFor? }`.

- `intent` — annotate each result with a **use-verdict** for that intended use (no filtering).
- `gateFor` — return only results whose license allows that intent.

Output: `{ references: [{ id, title?, modality, provider, canonicalUrl, license, thumbnail?, excerpt?, useVerdict?, attribution? }] }`. When `intent` (or `gateFor`) is set, each result carries `useVerdict { decision, reason, confidence }` and — if the license requires it — a ready-to-use `attribution` credit line.

> Results are references with a license id + source link — **not rights clearance, not legal advice**. `unknown` / `needs-review` results require the caller to verify the source's terms.

## Discovery (web) source

refkit's clean providers give license-normalized results. For open-web **breadth** (e.g. "cyberpunk alley"), add the Brave discovery provider — its results carry `license: 'unknown'`, so refkit's use-gate returns `needs-review` for every one (never auto-allowed):

```ts
import { brave } from '@refkit/provider-brave'

createRefkit({
  providers: [
    openverse(),                                  // clean (license-normalized)
    brave({ token: process.env.BRAVE_TOKEN! }),   // discovery (license: unknown → needs-review)
  ],
})
```

Use discovery results for inspiration / internal moodboards; for commercial or generation use they're `needs-review` — verify the source first. Pass `gateFor: 'commercial-product'` to `search_references` to drop them automatically. Other web engines (Google CSE, Bing) are host-injectable via the same `ReferenceProvider` contract.
