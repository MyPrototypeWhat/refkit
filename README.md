# refkit

Neutral, dependency-light **reference-retrieval toolkit for creative work** — search images / video / text as creative references, with **per-result license normalization** so every result carries `source + license + attribution + canonicalUrl`.

> Status: **early (private)** — building `@refkit/core` P0. Apache-2.0.

## Why

Multimedia creators constantly "search X images as reference" / "find a Y script for structure". No existing library combines all five of: **multi-source aggregation × per-result license normalization × agent-callable × embeddable BYOK SDK × visual AND text**. refkit fills that gap.

The defensible core is **not** multi-source fan-out (a commodity) — it is the **license normalization + use-gating + dual-modal contract**, plus flowing results into a generation pipeline as provenance-carrying assets.

## Architecture

```
@refkit/core           neutral brain — zero network, zero providers, only zod
  Reference contract · RightsModel + license facts · strict-deny use-gate ·
  RRF cross-source merge/dedup · ReferenceProvider interfaces · dual-modal envelope

@refkit/provider-*      thin satellites — one source each (openverse / unsplash /
  pexels / pixabay / wikimedia / gutendex / poetrydb / …); the commodity layer

(host binding)          maps Reference → the host's asset/generation model;
  injects keys (BYOK), fetch, cache. Lives in the consuming app, not here.
```

**Dependency direction is one-way:** `provider-*` → `core`; hosts → `core`. `core` depends on nothing but `zod`, and never on any host or orchestration framework.

## Core invariants (enforced by tests in `@refkit/core`)

- **Zero network in `core`** — no `fetch` call, no hard-coded endpoint. Hosts inject `ProviderContext.fetch`.
- **No re-hosting** — keep `canonicalUrl` + thumbnails only; never store originals.
- **strict-deny** — when rights can't be determined, deny / needs-review (never fail-open).

## Not legal advice

`evaluateUse` returns a **conservative heuristic** based on source-declared license/ToS facts. It is **not legal advice** and does not determine legal rights. Every verdict carries a `disclaimer` and a `confidence`. For real legal posture (especially feeding references into AI generation), consult counsel.

## Develop

```bash
pnpm install
pnpm --filter @refkit/core test
pnpm --filter @refkit/core typecheck
pnpm test:run   # all packages
pnpm typecheck  # all packages
```
