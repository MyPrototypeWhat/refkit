# @refkit/core

Neutral reference-retrieval core. **Zero network, zero providers, only depends on `zod`.**

Invariants (enforced by `src/__tests__/no-network.test.ts`):
- No `fetch` call and no hard-coded endpoint in this package. Hosts inject `ProviderContext.fetch`.
- No import of any host/orchestration framework. This package is substrate-agnostic.
- Only `zod` as a non-relative dependency.

This is a heuristic tool, **not legal advice**. `evaluateUse` returns a conservative
verdict based on source-declared license/ToS facts; it does not determine legal rights.
Never re-host originals: keep `canonicalUrl` + thumbnails only.
