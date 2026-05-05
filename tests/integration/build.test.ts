// TEST-002 — プロジェクト初期化の疎通確認
// TEST-003 — ディレクトリ構成スケルトンの存在確認
// TASK 詳細: 種別 untestable（環境設定）。`pnpm typecheck` 緑 + 主要設定ファイルの形が正しいことで代替する。
import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..', '..')

function readJsonc(relativePath: string): unknown {
  const raw = readFileSync(resolve(repoRoot, relativePath), 'utf-8')
  // jsonc: 行コメント / 末尾カンマを最低限ストリップ
  const stripped = raw
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(stripped)
}

describe('REQ-meta / TEST-002: project bootstrap', () => {
  it('package.json keeps trace scripts and declares typecheck', () => {
    const pkg = readJsonc('package.json') as {
      name: string
      scripts: Record<string, string>
    }
    expect(pkg.name).toBe('viaduction')
    expect(pkg.scripts.trace).toMatch(/validate-traceability\.ts/)
    expect(pkg.scripts['trace:emit']).toMatch(/--emit/)
    expect(pkg.scripts['trace:json']).toMatch(/--json/)
    expect(pkg.scripts.typecheck).toBeDefined()
  })

  it('vite.config.ts orders plugins as cloudflare -> tanstackStart -> react -> tsconfigPaths (BD-ARCH)', () => {
    const text = readFileSync(resolve(repoRoot, 'vite.config.ts'), 'utf-8')
    const indices = {
      cloudflare: text.indexOf('cloudflare('),
      tanstackStart: text.indexOf('tanstackStart('),
      viteReact: text.indexOf('viteReact('),
      tsconfigPaths: text.indexOf('tsconfigPaths('),
    }
    expect(indices.cloudflare).toBeGreaterThan(-1)
    expect(indices.tanstackStart).toBeGreaterThan(indices.cloudflare)
    expect(indices.viteReact).toBeGreaterThan(indices.tanstackStart)
    expect(indices.tsconfigPaths).toBeGreaterThan(indices.viteReact)
  })

  it('wrangler.jsonc points main to @tanstack/react-start/server-entry with nodejs_compat (NFR-002 / Q-014 確定)', () => {
    const wrangler = readJsonc('wrangler.jsonc') as {
      main: string
      compatibility_flags: string[]
    }
    expect(wrangler.main).toBe('@tanstack/react-start/server-entry')
    expect(wrangler.compatibility_flags).toContain('nodejs_compat')
  })

  it('tsconfig.app.json enables strict + noUncheckedIndexedAccess (BD-ARCH)', () => {
    const ts = readJsonc('tsconfig.app.json') as {
      include: string[]
      compilerOptions: Record<string, unknown>
    }
    expect(ts.include).toContain('src/**/*.ts')
    expect(ts.compilerOptions.strict).toBe(true)
    expect(ts.compilerOptions.noUncheckedIndexedAccess).toBe(true)
  })

  it('tsconfig.scripts.json keeps include for trace scripts', () => {
    const ts = readJsonc('tsconfig.scripts.json') as {
      include: string[]
      compilerOptions: Record<string, unknown>
    }
    expect(ts.include).toContain('scripts/**/*.ts')
    expect(ts.compilerOptions.strict).toBe(true)
  })
})

describe('REQ-meta / TEST-003: directory skeleton (BD-ARCH)', () => {
  // BD-ARCH §構成図 / §技術選定 で要求される server サブディレクトリ群。
  const requiredDirs = [
    'src/routes',
    'src/components',
    'src/lib',
    'src/server',
    'src/server/auth',
    'src/server/observability',
    'src/server/audit',
    'src/server/repositories',
    'src/server/functions',
    'src/server/middleware',
    'src/server/loaders',
  ] as const

  for (const dir of requiredDirs) {
    it(`provides skeleton directory: ${dir}`, () => {
      const stat = statSync(resolve(repoRoot, dir))
      expect(stat.isDirectory()).toBe(true)
    })
  }

  // 各サーバサブディレクトリには用途を記述した index.ts（または README.md）が存在する。
  const requiredEntryPoints = [
    'src/server/index.ts',
    'src/server/auth/index.ts',
    'src/server/observability/index.ts',
    'src/server/audit/index.ts',
    'src/server/repositories/index.ts',
    'src/server/functions/index.ts',
    'src/server/middleware/index.ts',
    'src/server/loaders/index.ts',
  ] as const

  for (const entry of requiredEntryPoints) {
    it(`provides purpose-annotated entry file: ${entry}`, () => {
      const text = readFileSync(resolve(repoRoot, entry), 'utf-8')
      // BD-ARCH 由来の用途コメントを必ず置く運用にする（中身ゼロのファイル化を防ぐ）。
      expect(text).toMatch(/BD-ARCH/)
    })
  }
})
