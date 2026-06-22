import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...sourceFiles(p))
    } else if (entry.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

describe('@refkit/core neutral-core invariants', () => {
  const files = sourceFiles(srcDir)

  it('contains no fetch call and no hard-coded http(s) endpoint', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      expect(code, `${f} must not call a global fetch`).not.toMatch(/(?<!\.)\bfetch\s*\(/)
      expect(code, `${f} must not hard-code an endpoint`).not.toMatch(/https?:\/\//)
    }
  })

  it('imports neither @orchestral/* nor @slate/*', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      expect(code, `${f} must stay substrate-agnostic`).not.toMatch(/from\s+['"]@(orchestral|slate)\//)
    }
  })

  it('depends only on zod (no other non-relative imports)', () => {
    const allowed = new Set(['zod'])
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      const imports = [...code.matchAll(/from\s+['"]([^'".][^'"]*)['"]/g)].map(m => m[1])
      for (const imp of imports) {
        const pkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0]
        expect(allowed.has(pkg), `${f} imports disallowed dependency: ${pkg}`).toBe(true)
      }
    }
  })
})
