// TEST-005 — モック認証セッション解決
// REQ-015 / NFR-006 / API-019 / API-020 / DB-006
import { describe, expect, it } from 'vitest'
import {
  parseAllowlist,
  resolveViewer,
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_COOKIE_NAME,
  type AllowedSession,
  type Viewer,
} from '../../../src/server/auth/session'

const fixture: ReadonlyArray<AllowedSession> = [
  { cookie_value: 'c-abc', user_id: 'U1', roles: ['reviewer'] },
  { cookie_value: 'c-xyz', user_id: 'U2', roles: ['user', 'reviewer'] },
]

describe('REQ-015 / TEST-005: SESSION_COOKIE_NAME', () => {
  it('matches API-019 Set-Cookie header (`session=`)', () => {
    expect(SESSION_COOKIE_NAME).toBe('session')
  })
})

describe('NFR-006 / TEST-005: SESSION_COOKIE_ATTRIBUTES', () => {
  it('declares HttpOnly / Secure / SameSite=Lax / Path=/ as the source of truth', () => {
    expect(SESSION_COOKIE_ATTRIBUTES.HttpOnly).toBe(true)
    expect(SESSION_COOKIE_ATTRIBUTES.Secure).toBe(true)
    expect(SESSION_COOKIE_ATTRIBUTES.SameSite).toBe('Lax')
    expect(SESSION_COOKIE_ATTRIBUTES.Path).toBe('/')
  })
})

describe('REQ-015 / TEST-005: resolveViewer happy path', () => {
  it('returns Viewer when cookie matches an allowlist entry', () => {
    const viewer = resolveViewer('session=c-abc', fixture)
    expect(viewer).not.toBeNull()
    expect(viewer?.user_id).toBe('U1')
    expect(viewer?.roles).toEqual(['reviewer'])
  })

  it('preserves multi-role OR composition (BR-AUTHZ-01)', () => {
    const viewer = resolveViewer('session=c-xyz', fixture)
    expect(viewer?.roles).toEqual(['user', 'reviewer'])
  })

  it('extracts session from a header containing other cookies (any order)', () => {
    const viewer = resolveViewer('other=foo; session=c-abc; tracker=bar', fixture)
    expect(viewer?.user_id).toBe('U1')
  })

  it('also handles cookies separated by `;` without trailing space', () => {
    const viewer = resolveViewer('other=foo;session=c-abc;tracker=bar', fixture)
    expect(viewer?.user_id).toBe('U1')
  })
})

describe('REQ-015 / TEST-005: resolveViewer null cases', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('returns null for cookie header = %s', (_label, header) => {
    expect(resolveViewer(header, fixture)).toBeNull()
  })

  it('returns null when no `session` cookie is present', () => {
    expect(resolveViewer('other=foo; tracker=bar', fixture)).toBeNull()
  })

  it('returns null when cookie value is not in the allowlist (NOT guest fallback)', () => {
    // BD-ARCH "許可リスト外 cookie の挙動" の暫定方針: null（guest フォールバックではない）
    expect(resolveViewer('session=unknown-value', fixture)).toBeNull()
  })

  it('returns null for empty cookie value (`session=`)', () => {
    expect(resolveViewer('session=', fixture)).toBeNull()
  })

  it('returns null when cookie name differs only by case (RFC 6265 §4.1.1: case-sensitive name)', () => {
    expect(resolveViewer('SESSION=c-abc', fixture)).toBeNull()
    expect(resolveViewer('Session=c-abc', fixture)).toBeNull()
  })

  it('returns null when allowlist is empty', () => {
    expect(resolveViewer('session=c-abc', [])).toBeNull()
  })
})

describe('REQ-015 / TEST-005: resolveViewer duplicate `session` cookies', () => {
  it('uses the FIRST occurrence when `session` appears multiple times (deterministic)', () => {
    const viewer = resolveViewer('session=c-abc; session=c-xyz', fixture)
    // 仕様: 最初の出現を採用する（実装コメント参照）
    expect(viewer?.user_id).toBe('U1')
  })

  it('falls through to second occurrence is NOT performed (returns null if first is invalid)', () => {
    // 最初の値が許可リスト外なら、後続の有効な値を探さずに null を返す
    const viewer = resolveViewer('session=unknown; session=c-abc', fixture)
    expect(viewer).toBeNull()
  })
})

describe('REQ-015 / TEST-005: parseAllowlist empty / undefined', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('returns [] for %s', (_label, raw) => {
    expect(parseAllowlist(raw)).toEqual([])
  })
})

describe('REQ-015 / TEST-005: parseAllowlist valid input', () => {
  it('parses a single entry', () => {
    const list = parseAllowlist('c-abc:U1:reviewer')
    expect(list).toEqual<AllowedSession[]>([
      { cookie_value: 'c-abc', user_id: 'U1', roles: ['reviewer'] },
    ])
  })

  it('parses multiple entries separated by `;`', () => {
    const list = parseAllowlist('c-abc:U1:reviewer;c-xyz:U2:user,reviewer')
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({ cookie_value: 'c-abc', user_id: 'U1', roles: ['reviewer'] })
    expect(list[1]).toEqual({
      cookie_value: 'c-xyz',
      user_id: 'U2',
      roles: ['user', 'reviewer'],
    })
  })

  it('deduplicates roles within a single entry', () => {
    const list = parseAllowlist('c-abc:U1:user,user,reviewer')
    expect(list[0]?.roles).toEqual(['user', 'reviewer'])
  })

  it('accepts all 4 authenticated roles', () => {
    const list = parseAllowlist('c-1:U1:user;c-2:U2:reviewer;c-3:U3:admin;c-4:U4:auditor')
    expect(list.map((e) => e.roles[0])).toEqual(['user', 'reviewer', 'admin', 'auditor'])
  })
})

describe('REQ-015 / DB-006 / TEST-005: parseAllowlist invalid input is silently dropped', () => {
  it('drops entries with unknown roles (does not throw)', () => {
    const list = parseAllowlist('c-abc:U1:superuser;c-xyz:U2:reviewer')
    expect(list).toHaveLength(1)
    expect(list[0]?.user_id).toBe('U2')
  })

  it('drops entries containing `guest` role (DB-006 不変条件 2)', () => {
    const list = parseAllowlist('c-abc:U1:guest;c-xyz:U2:user')
    expect(list).toHaveLength(1)
    expect(list[0]?.user_id).toBe('U2')
  })

  it('drops entries with the wrong number of fields', () => {
    expect(parseAllowlist('only-one-field')).toEqual([])
    expect(parseAllowlist('two:fields')).toEqual([])
    expect(parseAllowlist('a:b:c:d')).toEqual([])
  })

  it('drops entries with empty fields', () => {
    expect(parseAllowlist(':U1:reviewer')).toEqual([])
    expect(parseAllowlist('c-abc::reviewer')).toEqual([])
    expect(parseAllowlist('c-abc:U1:')).toEqual([])
  })

  it('drops entries with user_id longer than 128 chars (DB-006 制約)', () => {
    const longId = 'x'.repeat(129)
    const list = parseAllowlist(`c-abc:${longId}:reviewer;c-xyz:U2:user`)
    expect(list).toHaveLength(1)
    expect(list[0]?.user_id).toBe('U2')
  })

  it('skips empty entries between separators', () => {
    const list = parseAllowlist(';;c-abc:U1:reviewer;;')
    expect(list).toHaveLength(1)
    expect(list[0]?.user_id).toBe('U1')
  })

  it('does not throw on completely malformed input', () => {
    expect(() => parseAllowlist(';;;;:::::,,,,;;;')).not.toThrow()
    expect(parseAllowlist(';;;;:::::,,,,;;;')).toEqual([])
  })
})

describe('REQ-015 / TEST-005: end-to-end resolveViewer + parseAllowlist', () => {
  it('resolves a Viewer when both helpers are composed', () => {
    const allowed = parseAllowlist('c-abc:U1:reviewer;c-xyz:U2:user,admin')
    const viewer: Viewer | null = resolveViewer('session=c-xyz', allowed)
    expect(viewer).toEqual<Viewer>({ user_id: 'U2', roles: ['user', 'admin'] })
  })

  it('returns null for an entry that was dropped during parsing', () => {
    // `superuser` を含むため drop される → cookie が許可リスト外扱いになる
    const allowed = parseAllowlist('c-abc:U1:superuser')
    expect(resolveViewer('session=c-abc', allowed)).toBeNull()
  })
})
