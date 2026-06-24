#!/usr/bin/env node
// Zero-config entry: `npx @refkit/mcp` boots a working MCP server with the keyless
// providers, plus any BYOK provider whose key is in the environment. No host code.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRefkit, type ReferenceProvider } from '@refkit/core'
import { openverse, openverseAudio } from '@refkit/provider-openverse'
import { wikimediaCommons } from '@refkit/provider-wikimedia-commons'
import { met } from '@refkit/provider-met'
import { artic } from '@refkit/provider-artic'
import { gutendex } from '@refkit/provider-gutendex'
import { poetrydb } from '@refkit/provider-poetrydb'
import { unsplash } from '@refkit/provider-unsplash'
import { pexels, pexelsVideo } from '@refkit/provider-pexels'
import { pixabay, pixabayVideo } from '@refkit/provider-pixabay'
import { flickr } from '@refkit/provider-flickr'
import { smithsonian } from '@refkit/provider-smithsonian'
import { brave } from '@refkit/provider-brave'
import { serveStdio } from './index'

/** Providers a zero-config server boots with: all keyless sources, plus any BYOK
 *  source whose key is present in `env`. Exported so the wiring is unit-testable. */
export function defaultProviders(env: NodeJS.ProcessEnv = process.env): ReferenceProvider[] {
  const providers: ReferenceProvider[] = [
    openverse(), openverseAudio(), wikimediaCommons(), met(), artic(), gutendex(), poetrydb(),
  ]
  if (env.UNSPLASH_KEY) providers.push(unsplash({ accessKey: env.UNSPLASH_KEY }))
  if (env.PEXELS_KEY) providers.push(pexels({ apiKey: env.PEXELS_KEY }), pexelsVideo({ apiKey: env.PEXELS_KEY }))
  if (env.PIXABAY_KEY) providers.push(pixabay({ key: env.PIXABAY_KEY }), pixabayVideo({ key: env.PIXABAY_KEY }))
  if (env.FLICKR_KEY) providers.push(flickr({ apiKey: env.FLICKR_KEY }))
  if (env.SI_KEY) providers.push(smithsonian({ apiKey: env.SI_KEY }))
  if (env.BRAVE_TOKEN) providers.push(brave({ token: env.BRAVE_TOKEN }))
  return providers
}

// Boot only when run as the CLI entry — not when imported (e.g. by tests). realpath
// so an npm bin symlink resolves to this file.
const isEntry = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (isEntry) {
  await serveStdio(createRefkit({ providers: defaultProviders() }))
}
