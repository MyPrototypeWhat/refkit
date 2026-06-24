---
"@refkit/core": minor
---

Add `SearchInput.poolFactor`: overfetch a wider candidate pool per provider (default 4×, capped at 100/source) before merge/rerank/gate, then narrow to `limit`. Fixes pool starvation — dedup and ranking now operate on real candidates instead of a source-truncated slice. Non-finite or `< 1` factors fall back to the default.

Also: `buildAttribution` now includes the precise `licenseVersion` (e.g. "CC-BY 4.0" instead of "CC-BY") when the source provides it.
