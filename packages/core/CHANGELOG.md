# @refkit/core

## 0.2.0

### Minor Changes

- 5e27c09: Widen the rerank seam to { query, refs, signal } and add a zero-dependency
  lexicalReranker (query term-coverage + resolution/license weighting + MMR-lite
  source diversity). Model-based rerankers stay BYO via the hook.
