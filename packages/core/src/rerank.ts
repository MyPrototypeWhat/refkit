import type { Reference } from './reference'

/** The arguments a {@link Reranker} receives: the user query, the merged
 *  candidate refs (read-only — copy before reordering), and the search's
 *  abort signal. */
export interface RerankInput {
  query: string
  refs: readonly Reference[]
  signal?: AbortSignal
}

/** A post-merge reordering strategy, injected via `SearchInput.rerank`. Pure or
 *  async — e.g. a CLIP/embedding reranker the host wires to its own API. Core
 *  ships no model; this is the only seam. */
export type Reranker = (input: RerankInput) => Reference[] | Promise<Reference[]>

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'with',
  'by', 'from', 'as', 'is', 'are', 'it', 'this', 'that',
])

/** Lowercase, split on runs of non-alphanumerics, drop stopwords and 1-char tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export interface LexicalRerankOptions {
  /** Weight of the query↔(title+excerpt) term-coverage score. Default 1. */
  lexicalWeight?: number
  /** Weight of the resolution quality boost (0 disables). Default 0.15. */
  qualityWeight?: number
  /** Weight of the license-permissiveness boost (0 disables). Default 0. */
  licenseWeight?: number
  /** Per-already-seen-source score penalty, spreading sources (0 disables). Default 0.1. */
  sourceDiversity?: number
}

/** Fraction of distinct query tokens present in the ref's title + text excerpt. 0..1. */
function lexicalScore(queryTokens: string[], ref: Reference): number {
  if (queryTokens.length === 0) return 0
  const hay = new Set(tokenize(`${ref.title ?? ''} ${ref.text?.excerpt ?? ''}`))
  let hit = 0
  for (const q of queryTokens) if (hay.has(q)) hit++
  return hit / queryTokens.length
}

/**
 * Zero-dependency default reranker. Scores each ref by query term-coverage over
 * its title + excerpt (later: resolution + license weighting + source diversity),
 * sorts descending, and rewrites `relevance` to the normalised score so order and
 * relevance stay consistent. Model-based reranking is the host's job via the hook.
 */
export function lexicalReranker(opts: LexicalRerankOptions = {}): Reranker {
  const lexW = opts.lexicalWeight ?? 1
  const total = lexW || 1
  return ({ query, refs }) => {
    const qTokens = [...new Set(tokenize(query))]
    return refs
      .map((r) => ({ ref: r, base: lexW * lexicalScore(qTokens, r) }))
      .sort((a, b) => b.base - a.base)
      .map((s) => ({ ...s.ref, relevance: Math.min(1, s.base / total) }))
  }
}
