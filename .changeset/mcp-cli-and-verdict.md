---
"@refkit/mcp": minor
---

- Zero-config `npx @refkit/mcp` server: a `bin` that boots with the keyless providers plus any BYOK provider whose key is in the environment — no host code.
- Expose the use-verdict + attribution at the agent boundary: a new `intent` param annotates each result with `{ decision, reason, confidence }` (+ a ready-to-use attribution credit line) without filtering; `gateFor` still filters.
- Report the real package version in the MCP `initialize` handshake (was hardcoded `0.0.0`).
