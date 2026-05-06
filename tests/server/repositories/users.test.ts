// TEST-012 — UserRepository（モック認証用 / インメモリ実装 + factory）
// REQ-015 / DB-006 / NFR-005 / BR-AUTHZ-01
//
// DB-006 を正典として実装している。TASK-012 完了条件の `findByIdentifier`
// は cookie 値 / id / display_name のいずれかでの軽量ルックアップとして実装し、
// `findById` のみを export する DB-006 §不変条件 4 の制約と両立させている。
// 「メールアドレス」は DB-006 に存在しないため、PII の検証対象は `display_name`
// （DB-006 §不変条件 3）に置き換えている。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES, type Role } from '../../../src/lib/domain/types'
import {
  createInMemoryUserRepository,
  makeUser,
  parseUserAllowlist,
  toSafeUser,
  type AllowlistEntry,
  type SafeUser,
  type UserRepository,
} from '../../../src/server/repositories/users'

const FIXED_NOW = new Date('2026-05-05T00:00:00.000Z')

// ---------------------------------------------------------------------------
// 1. parseUserAllowlist
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: parseUserAllowlist', () => {
  it('REQ-015 / TEST-012: returns [] for undefined input', () => {
    expect(parseUserAllowlist(undefined)).toEqual([])
  })

  it('REQ-015 / TEST-012: returns [] for null input', () => {
    expect(parseUserAllowlist(null)).toEqual([])
  })

  it('REQ-015 / TEST-012: returns [] for empty string', () => {
    expect(parseUserAllowlist('')).toEqual([])
  })

  it('REQ-015 / TEST-012: returns [] for whitespace-only string', () => {
    expect(parseUserAllowlist('   \n\t  ')).toEqual([])
  })

  it('REQ-015 / TEST-012: parses single 3-field entry (display_name omitted -> null)', () => {
    const result = parseUserAllowlist('cookie-alice:user-001:user')
    expect(result).toEqual<ReadonlyArray<AllowlistEntry>>([
      {
        cookie_value: 'cookie-alice',
        user_id: 'user-001',
        roles: ['user'],
        display_name: null,
      },
    ])
  })

  it('REQ-015 / TEST-012: parses single 4-field entry (display_name present)', () => {
    const result = parseUserAllowlist('cookie-bob:user-002:reviewer:Bob')
    expect(result).toEqual<ReadonlyArray<AllowlistEntry>>([
      {
        cookie_value: 'cookie-bob',
        user_id: 'user-002',
        roles: ['reviewer'],
        display_name: 'Bob',
      },
    ])
  })

  it('REQ-015 / TEST-012: parses multiple entries separated by ";"', () => {
    const result = parseUserAllowlist(
      'cookie-alice:user-001:user;cookie-bob:user-002:reviewer,admin:Bob',
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.user_id).toBe('user-001')
    expect(result[0]?.roles).toEqual(['user'])
    expect(result[0]?.display_name).toBeNull()
    expect(result[1]?.user_id).toBe('user-002')
    // DB-006 §不変条件 1 のソート: admin < reviewer
    expect(result[1]?.roles).toEqual(['admin', 'reviewer'])
    expect(result[1]?.display_name).toBe('Bob')
  })

  it('REQ-015 / TEST-012: drops malformed segments (too few fields)', () => {
    // 1 件目はフィールド数 2 で不正、2 件目は正常
    const result = parseUserAllowlist('only-cookie:user-x;cookie-ok:user-y:user')
    expect(result).toHaveLength(1)
    expect(result[0]?.user_id).toBe('user-y')
  })

  it('REQ-015 / TEST-012: drops malformed segments (too many fields)', () => {
    // 1 件目はフィールド数 5 で不正、2 件目は正常
    const result = parseUserAllowlist(
      'a:b:c:d:e;cookie-ok:user-y:user',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.user_id).toBe('user-y')
  })

  it('REQ-015 / TEST-012: drops segments with empty role_csv', () => {
    const result = parseUserAllowlist('cookie-x:user-x:;cookie-y:user-y:user')
    expect(result).toHaveLength(1)
    expect(result[0]?.user_id).toBe('user-y')
  })

  it('REQ-015 / TEST-012: drops segments where all roles are out of ROLES domain', () => {
    const result = parseUserAllowlist('cookie-x:user-x:superuser,owner;cookie-y:user-y:user')
    expect(result).toHaveLength(1)
    expect(result[0]?.user_id).toBe('user-y')
  })

  it('REQ-015 / TEST-012: drops "guest" role from CSV but keeps remaining valid roles', () => {
    const result = parseUserAllowlist('cookie-x:user-x:guest,user')
    expect(result).toHaveLength(1)
    expect(result[0]?.roles).toEqual(['user'])
  })

  it('REQ-015 / TEST-012: drops segment when only "guest" is provided (DB-006 §不変条件 2)', () => {
    const result = parseUserAllowlist('cookie-x:user-x:guest')
    expect(result).toEqual([])
  })

  it('REQ-015 / TEST-012: ignores empty entries between ";"', () => {
    const result = parseUserAllowlist(';;cookie-x:user-x:user;;')
    expect(result).toHaveLength(1)
    expect(result[0]?.user_id).toBe('user-x')
  })

  it('REQ-015 / TEST-012: rejects user_id longer than 128 chars (DB-006 §カラム)', () => {
    const longId = 'u'.repeat(129)
    const result = parseUserAllowlist(`cookie-x:${longId}:user`)
    expect(result).toEqual([])
  })

  it('REQ-015 / TEST-012: drops display_name longer than 128 chars (falls back to null)', () => {
    const longName = 'n'.repeat(129)
    const result = parseUserAllowlist(`cookie-x:user-x:user:${longName}`)
    expect(result).toHaveLength(1)
    expect(result[0]?.display_name).toBeNull()
  })

  it('REQ-015 / TEST-012: trims whitespace around display_name and treats empty as null', () => {
    const result = parseUserAllowlist('cookie-x:user-x:user:   ')
    expect(result).toHaveLength(1)
    expect(result[0]?.display_name).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. roles 正規化
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: roles normalization (DB-006 §不変条件 1)', () => {
  it('REQ-015 / TEST-012: lowercases, dedupes, and sorts ascending', () => {
    const result = parseUserAllowlist('cookie-x:user-x:User,Admin,user')
    expect(result[0]?.roles).toEqual(['admin', 'user'])
  })

  it('REQ-015 / TEST-012: preserves all unique valid roles in alphabetical order', () => {
    const result = parseUserAllowlist('cookie-x:user-x:auditor,user,user')
    expect(result[0]?.roles).toEqual(['auditor', 'user'])
  })

  it('REQ-015 / TEST-012: alphabetical order is admin < auditor < reviewer < user', () => {
    const result = parseUserAllowlist(
      'cookie-x:user-x:user,reviewer,auditor,admin',
    )
    expect(result[0]?.roles).toEqual(['admin', 'auditor', 'reviewer', 'user'])
  })

  it('REQ-015 / TEST-012: drops segment when all roles are whitespace', () => {
    const result = parseUserAllowlist('cookie-x:user-x:   ,   ')
    expect(result).toEqual([])
  })

  it('REQ-015 / TEST-012: ignores blank tokens within CSV', () => {
    const result = parseUserAllowlist('cookie-x:user-x:user, ,reviewer')
    expect(result[0]?.roles).toEqual(['reviewer', 'user'])
  })
})

// ---------------------------------------------------------------------------
// 3. createInMemoryUserRepository — 構築
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: createInMemoryUserRepository (build)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-015 / TEST-012: empty allowlist yields a repo with no users', async () => {
    const repo = createInMemoryUserRepository(undefined)
    expect(await repo.findById('user-001')).toBeNull()
    expect(await repo.findByIdentifier('user-001')).toBeNull()
  })

  it('REQ-015 / TEST-012: single entry is observable via findById', async () => {
    const repo = createInMemoryUserRepository('cookie-alice:user-001:user')
    const found = await repo.findById('user-001')
    expect(found).not.toBeNull()
    expect(found?.id).toBe('user-001')
    expect(found?.roles).toEqual(['user'])
    expect(found?.display_name).toBeNull()
    expect(found?.created_at).toBe(FIXED_NOW.getTime())
    expect(found?.updated_at).toBe(FIXED_NOW.getTime())
  })

  it('REQ-015 / TEST-012: multiple entries are all observable', async () => {
    const repo = createInMemoryUserRepository(
      'cookie-alice:user-001:user;cookie-bob:user-002:reviewer:Bob',
    )
    const a = await repo.findById('user-001')
    const b = await repo.findById('user-002')
    expect(a?.id).toBe('user-001')
    expect(b?.id).toBe('user-002')
    expect(b?.display_name).toBe('Bob')
  })

  it('REQ-015 / TEST-012: duplicate user_id keeps the last entry (last-wins)', async () => {
    const repo = createInMemoryUserRepository(
      'cookie-old:user-001:user;cookie-new:user-001:admin:NewName',
    )
    const found = await repo.findById('user-001')
    expect(found?.roles).toEqual(['admin'])
    expect(found?.display_name).toBe('NewName')
  })
})

// ---------------------------------------------------------------------------
// 4. findById
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: findById', () => {
  it('REQ-015 / TEST-012: returns user when id matches', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user')
    const found = await repo.findById('user-001')
    expect(found?.id).toBe('user-001')
  })

  it('REQ-015 / TEST-012: returns null when id is unknown', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user')
    expect(await repo.findById('user-999')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. findByIdentifier — 優先順
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: findByIdentifier (priority: id > cookie > display_name)', () => {
  it('REQ-015 / TEST-012: hits via id', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user')
    const found = await repo.findByIdentifier('user-001')
    expect(found?.id).toBe('user-001')
  })

  it('REQ-015 / TEST-012: hits via cookie_value', async () => {
    const repo = createInMemoryUserRepository('cookie-alice:user-001:user')
    const found = await repo.findByIdentifier('cookie-alice')
    expect(found?.id).toBe('user-001')
  })

  it('REQ-015 / TEST-012: hits via display_name', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user:Alice')
    const found = await repo.findByIdentifier('Alice')
    expect(found?.id).toBe('user-001')
  })

  it('REQ-015 / TEST-012: id wins over cookie_value when both match', async () => {
    // user-002 の cookie 値を `user-001` という文字列にして衝突させる
    const repo = createInMemoryUserRepository(
      'cookie-x:user-001:user;user-001:user-002:reviewer',
    )
    const found = await repo.findByIdentifier('user-001')
    expect(found?.id).toBe('user-001')
    expect(found?.roles).toEqual(['user'])
  })

  it('REQ-015 / TEST-012: cookie_value wins over display_name when both match', async () => {
    // user-001 の display_name を `cookie-z` に、user-002 の cookie_value を `cookie-z` にする
    const repo = createInMemoryUserRepository(
      'cookie-x:user-001:user:cookie-z;cookie-z:user-002:reviewer',
    )
    const found = await repo.findByIdentifier('cookie-z')
    expect(found?.id).toBe('user-002')
  })

  it('REQ-015 / TEST-012: returns null when nothing matches', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user:Alice')
    expect(await repo.findByIdentifier('unknown')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. toSafeUser — PII 除外
// ---------------------------------------------------------------------------
describe('REQ-015 / NFR-005 / TEST-012: toSafeUser (PII filtering)', () => {
  it('REQ-015 / NFR-005 / TEST-012: result has only id and roles keys', () => {
    const user = makeUser(
      { id: 'user-001', roles: ['user'] },
      { display_name: 'Alice' },
    )
    const safe = toSafeUser(user)
    expect(Object.keys(safe).sort()).toEqual(['id', 'roles'])
  })

  it('REQ-015 / NFR-005 / TEST-012: JSON.stringify(toSafeUser(user)) does not contain display_name', () => {
    const user = makeUser(
      { id: 'user-001', roles: ['user'] },
      { display_name: 'Alice-PII' },
    )
    const json = JSON.stringify(toSafeUser(user))
    expect(json).not.toContain('display_name')
    expect(json).not.toContain('Alice-PII')
  })

  it('REQ-015 / NFR-005 / TEST-012: SafeUser shape is structurally compatible with User.id / User.roles', () => {
    const user = makeUser({ id: 'user-001', roles: ['admin'] })
    const safe: SafeUser = toSafeUser(user)
    expect(safe.id).toBe(user.id)
    expect(safe.roles).toEqual(user.roles)
  })
})

// ---------------------------------------------------------------------------
// 7. makeUser — factory デフォルト値
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: makeUser (factory)', () => {
  it('REQ-015 / TEST-012: applies sensible defaults', () => {
    const user = makeUser({ id: 'user-001', roles: ['user'] })
    expect(user.id).toBe('user-001')
    expect(user.roles).toEqual(['user'])
    expect(user.display_name).toBeNull()
    expect(user.created_at).toBe(1_700_000_000_000)
    expect(user.updated_at).toBe(1_700_000_000_000)
  })

  it('REQ-015 / TEST-012: overrides win over defaults', () => {
    const user = makeUser(
      { id: 'user-001', roles: ['user'] },
      { display_name: 'Alice', created_at: 1, updated_at: 2 },
    )
    expect(user.display_name).toBe('Alice')
    expect(user.created_at).toBe(1)
    expect(user.updated_at).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 8. 防御コピー / 副作用ガード
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: defensive copying (no leak of internal state)', () => {
  it('REQ-015 / TEST-012: mutating the returned User does not affect subsequent reads', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user:Alice')
    const first = await repo.findById('user-001')
    expect(first).not.toBeNull()
    // 戻り値を mutate（roles 配列も新しい配列で返るため push が反映されない）
    ;(first as { display_name: string | null }).display_name = 'Hacker'
    ;(first?.roles as Role[]).push('admin')

    const second = await repo.findById('user-001')
    expect(second?.display_name).toBe('Alice')
    expect(second?.roles).toEqual(['user'])
  })

  it('REQ-015 / TEST-012: roles returned from findByIdentifier is a fresh array', async () => {
    const repo = createInMemoryUserRepository('cookie-x:user-001:user')
    const a = await repo.findById('user-001')
    const b = await repo.findByIdentifier('user-001')
    expect(a).not.toBe(b)
    expect(a?.roles).not.toBe(b?.roles)
    expect(a?.roles).toEqual(b?.roles)
  })
})

// ---------------------------------------------------------------------------
// 9. 構造的強制 — export 名 / repository instance キー
// ---------------------------------------------------------------------------
describe('REQ-015 / DB-006 / TEST-012: structural enforcement (no write APIs)', () => {
  const sourcePath = resolve(__dirname, '../../../src/server/repositories/users.ts')
  const source = readFileSync(sourcePath, 'utf-8')

  it('REQ-015 / DB-006 / TEST-012: source file does not export update/delete/patch/remove/clear/reset symbols', () => {
    // `export ` で始まる宣言だけを抜き出して、禁止プレフィクスを含まないか検査する。
    const exportLines = source
      .split('\n')
      .filter((line) => /^\s*export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s/.test(line))

    const forbiddenPrefixes = ['create', 'update', 'delete', 'patch', 'remove', 'clear', 'reset']
    // ただし `createInMemoryUserRepository` は許可（factory）。それ以外の create* は禁止。
    const allowed = new Set(['createInMemoryUserRepository'])

    for (const line of exportLines) {
      const match = line.match(
        /^\s*export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
      )
      if (match === null) continue
      const name = match[1]!
      if (allowed.has(name)) continue
      for (const prefix of forbiddenPrefixes) {
        if (name.toLowerCase().startsWith(prefix)) {
          throw new Error(
            `forbidden export symbol detected: ${name} (prefix=${prefix}). DB-006 §不変条件 4 に違反`,
          )
        }
      }
    }
  })

  it('REQ-015 / DB-006 / TEST-012: repository instance has exactly findById and findByIdentifier', () => {
    const repo: UserRepository = createInMemoryUserRepository(
      'cookie-x:user-001:user',
    )
    const keys = Object.keys(repo).sort()
    expect(keys).toEqual(['findById', 'findByIdentifier'])
  })

  it('REQ-015 / DB-006 / TEST-012: source does not import logger / authorize / other repositories', () => {
    expect(source).not.toMatch(/from ['"][^'"]*observability\/logger['"]/)
    expect(source).not.toMatch(/from ['"][^'"]*auth\/authorize['"]/)
    expect(source).not.toMatch(/from ['"][^'"]*repositories\/proposals['"]/)
    expect(source).not.toMatch(/from ['"][^'"]*repositories\/policy-agreements['"]/)
    expect(source).not.toMatch(/from ['"][^'"]*audit\/repository['"]/)
  })

  it('REQ-015 / NFR-005 / TEST-012: source does not call console.* directly', () => {
    expect(source).not.toMatch(/\bconsole\.(log|info|warn|error|debug|trace)\b/)
  })

  it('REQ-015 / TEST-012: source does not read process.env directly', () => {
    expect(source).not.toMatch(/\bprocess\.env\b/)
  })
})

// ---------------------------------------------------------------------------
// 10. ROLES 値域に対する網羅
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-012: ROLES domain coverage', () => {
  it('REQ-015 / TEST-012: every authenticated role from ROLES is accepted as-is', () => {
    const authenticated = ROLES.filter((r): r is Exclude<Role, 'guest'> => r !== 'guest')
    for (const role of authenticated) {
      const result = parseUserAllowlist(`cookie-x:user-x:${role}`)
      expect(result).toHaveLength(1)
      expect(result[0]?.roles).toEqual([role])
    }
  })
})
