// TEST-032 — login（モック認証ログイン）server function
// API-019 / REQ-015 / NFR-005 / NFR-006 / UC-018 / DB-006
//
// 観点（タスク指示 8 項目に対応）:
//   1. happy path: cookie_value 一致 → SafeUser + Set-Cookie 文字列を返す
//   2. user_identifier 未指定 / empty / whitespace-only → invalid_input
//   3. 許可リスト外 → unknown_identifier
//   4. UserRepository 不在（整合性破壊）→ unknown_identifier
//   5. Set-Cookie 構成（HttpOnly / SameSite=Lax / Path=/ / Secure (prod) / cookie 名）
//   6. PII 不在: result.user は display_name キーを持たない
//   7. 副作用: console.* 呼ばれない / authorize() を import / 呼び出していない
//   8. CSRF 検証は loader 内で行わない（verifyCsrf を import / 呼び出していない）
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_COOKIE_NAME,
  type AllowedSession,
} from '../../../src/server/auth/session'
import {
  login,
  LoginAuthError,
  type LoginDeps,
  type LoginResult,
} from '../../../src/server/functions/login'
import {
  createInMemoryUserRepository,
  type UserRepository,
} from '../../../src/server/repositories/users'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

// session.ts.parseAllowlist: 3 フィールド固定 (cookie_value:user_id:role_csv)
// users.ts.parseUserAllowlist: 3 〜 4 フィールド (display_name 付与可)
// 両者を 1 つの環境変数で同時に満たすには「3 フィールドのみ」または「両方が 3 フィールド
// 行を含む」状態にする。テストでは display_name 付き 4 フィールドを用い、display_name は
// users 側のみに反映される（session 側は 3 フィールド以外を drop するため当該行も drop）。
// よって以下は「3 フィールド」でそろえ、必要な display_name 検証は別途別 raw を用意する。
const ALLOWLIST_RAW = 'c-reviewer:U1:reviewer;c-admin:U2:admin'

function makeDeps(overrides: Partial<LoginDeps> = {}): LoginDeps {
  const allowlistRaw = overrides.allowlistRaw ?? ALLOWLIST_RAW
  const users: UserRepository =
    overrides.users ?? createInMemoryUserRepository(allowlistRaw)
  return {
    users,
    allowlistRaw,
    isProduction: overrides.isProduction,
  }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-015 / API-019 / TEST-032: login happy path', () => {
  it('REQ-015 / TEST-032: returns SafeUser and Set-Cookie when cookie_value matches', async () => {
    const deps = makeDeps()
    const result: LoginResult = await login({ user_identifier: 'c-reviewer' }, deps)

    expect(result.user.id).toBe('U1')
    expect(result.user.roles).toEqual(['reviewer'])
    expect(typeof result.set_cookie).toBe('string')
    expect(result.set_cookie.length).toBeGreaterThan(0)
  })

  it('API-019 / TEST-032: handles a different cookie_value mapping to a different user', async () => {
    const deps = makeDeps()
    const result = await login({ user_identifier: 'c-admin' }, deps)

    expect(result.user.id).toBe('U2')
    expect(result.user.roles).toEqual(['admin'])
  })
})

// ---------------------------------------------------------------------------
// 2. invalid_input（empty / whitespace-only / 非文字列）
// ---------------------------------------------------------------------------

describe('API-019 / TEST-032: invalid_input rejects empty / whitespace user_identifier', () => {
  it('TEST-032: empty string -> LoginAuthError(reason=invalid_input)', async () => {
    const deps = makeDeps()
    await expect(login({ user_identifier: '' }, deps)).rejects.toBeInstanceOf(
      LoginAuthError,
    )
    await expect(login({ user_identifier: '' }, deps)).rejects.toMatchObject({
      reason: 'invalid_input',
      httpStatus: 401,
      errorCode: 'UNAUTHENTICATED',
    })
  })

  it('TEST-032: whitespace-only string -> LoginAuthError(reason=invalid_input)', async () => {
    const deps = makeDeps()
    await expect(
      login({ user_identifier: '   ' }, deps),
    ).rejects.toMatchObject({ reason: 'invalid_input' })
    await expect(
      login({ user_identifier: '\t\n ' }, deps),
    ).rejects.toMatchObject({ reason: 'invalid_input' })
  })

  it('TEST-032: non-string user_identifier (forced any) -> LoginAuthError(reason=invalid_input)', async () => {
    const deps = makeDeps()
    // 型システム外からの侵入（HTTP body の任意値）を模擬する。
    // 公開 API は string で固定するが、ランタイム検証が機能することを確認する。
    const bad = { user_identifier: 123 } as unknown as { user_identifier: string }
    await expect(login(bad, deps)).rejects.toMatchObject({
      reason: 'invalid_input',
    })
  })
})

// ---------------------------------------------------------------------------
// 3. unknown_identifier（許可リスト外）
// ---------------------------------------------------------------------------

describe('API-019 / TEST-032: unknown_identifier when not in allowlist', () => {
  it('TEST-032: identifier not found in allowlist -> 401 unknown_identifier', async () => {
    const deps = makeDeps()
    await expect(
      login({ user_identifier: 'c-unknown' }, deps),
    ).rejects.toMatchObject({
      reason: 'unknown_identifier',
      httpStatus: 401,
      errorCode: 'UNAUTHENTICATED',
    })
  })

  it('TEST-032: empty allowlist -> any identifier returns unknown_identifier', async () => {
    const deps = makeDeps({
      allowlistRaw: '',
      users: createInMemoryUserRepository(''),
    })
    await expect(
      login({ user_identifier: 'c-reviewer' }, deps),
    ).rejects.toMatchObject({ reason: 'unknown_identifier' })
  })

  it('TEST-032: null allowlist -> unknown_identifier', async () => {
    const deps = makeDeps({
      allowlistRaw: null,
      users: createInMemoryUserRepository(null),
    })
    await expect(
      login({ user_identifier: 'c-reviewer' }, deps),
    ).rejects.toMatchObject({ reason: 'unknown_identifier' })
  })

  it('TEST-032: identifier matching user_id (not cookie_value) is rejected', async () => {
    // user_identifier の解釈は「cookie_value と一致する不透明 ID」であることを固定する。
    // U1 は user_id であって cookie_value ではないので 401 になる。
    const deps = makeDeps()
    await expect(
      login({ user_identifier: 'U1' }, deps),
    ).rejects.toMatchObject({ reason: 'unknown_identifier' })
  })
})

// ---------------------------------------------------------------------------
// 4. UserRepository 不在（許可リストと users の整合性が崩れている）
// ---------------------------------------------------------------------------

describe('API-019 / TEST-032: unknown_identifier when allowlist matches but UserRepository misses', () => {
  it('TEST-032: cookie_value 一致 but findByIdentifier=null -> unknown_identifier', async () => {
    // 整合性が崩れている状況を再現するため、allowlistRaw は本物の 3 フィールドを持ちつつ、
    // users 側には何も登録しない（空 raw を渡す）。session.ts は U1 を解決するが
    // users.ts は U1 を返さない。
    const users = createInMemoryUserRepository('')
    const deps: LoginDeps = {
      users,
      allowlistRaw: ALLOWLIST_RAW,
    }
    await expect(
      login({ user_identifier: 'c-reviewer' }, deps),
    ).rejects.toMatchObject({
      reason: 'unknown_identifier',
      httpStatus: 401,
    })
  })

  it('TEST-032: 整合性破壊時に findByIdentifier が呼ばれていることを確認する', async () => {
    const findByIdentifier = vi.fn(async () => null)
    const findById = vi.fn(async () => null)
    const users: UserRepository = { findById, findByIdentifier }
    const deps: LoginDeps = { users, allowlistRaw: ALLOWLIST_RAW }

    await expect(
      login({ user_identifier: 'c-reviewer' }, deps),
    ).rejects.toMatchObject({ reason: 'unknown_identifier' })

    expect(findByIdentifier).toHaveBeenCalledTimes(1)
    expect(findByIdentifier).toHaveBeenCalledWith('U1')
  })
})

// ---------------------------------------------------------------------------
// 5. Set-Cookie 構成（属性 / cookie 名 / Secure 環境別）
// ---------------------------------------------------------------------------

describe('NFR-006 / API-019 / TEST-032: Set-Cookie attributes', () => {
  it('TEST-032: contains HttpOnly / SameSite=Lax / Path=/ and starts with SESSION_COOKIE_NAME', async () => {
    const deps = makeDeps()
    const { set_cookie } = await login({ user_identifier: 'c-reviewer' }, deps)

    expect(set_cookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true)
    expect(set_cookie).toContain('HttpOnly')
    expect(set_cookie).toContain('SameSite=Lax')
    expect(set_cookie).toContain('Path=/')
  })

  it('TEST-032: cookie name matches SESSION_COOKIE_NAME ("session")', async () => {
    const deps = makeDeps()
    const { set_cookie } = await login({ user_identifier: 'c-reviewer' }, deps)
    // "session=c-reviewer" のような形式で先頭にあること。
    expect(set_cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=c-reviewer(;|$)`))
  })

  it('TEST-032: cookie value === user_identifier (cookie_value のまま再利用)', async () => {
    const deps = makeDeps()
    const { set_cookie } = await login({ user_identifier: 'c-admin' }, deps)
    expect(set_cookie).toContain(`${SESSION_COOKIE_NAME}=c-admin`)
  })

  it('TEST-032: isProduction=true -> Secure を含む', async () => {
    const deps = makeDeps({ isProduction: true })
    const { set_cookie } = await login({ user_identifier: 'c-reviewer' }, deps)
    expect(set_cookie).toContain('Secure')
  })

  it('TEST-032: isProduction=false -> Secure を含まない（dev で http 検証可能）', async () => {
    const deps = makeDeps({ isProduction: false })
    const { set_cookie } = await login({ user_identifier: 'c-reviewer' }, deps)
    expect(set_cookie).not.toContain('Secure')
  })

  it('TEST-032: isProduction=undefined -> Secure を含まない', async () => {
    const deps = makeDeps({ isProduction: undefined })
    const { set_cookie } = await login({ user_identifier: 'c-reviewer' }, deps)
    expect(set_cookie).not.toContain('Secure')
  })
})

// ---------------------------------------------------------------------------
// 6. PII 不在（NFR-005）
// ---------------------------------------------------------------------------

describe('NFR-005 / API-019 / TEST-032: result.user excludes PII (display_name)', () => {
  it('TEST-032: result.user は display_name キーを持たず、Object.keys は ["id","roles"] のみ', async () => {
    // display_name 付き 4 フィールド行を含む raw を使う。
    // ただし session.ts は 3 フィールド以外を drop するため、別途 3 フィールド行も併記する。
    const allowlistRaw =
      'c-reviewer:U1:reviewer:山田 太郎;c-reviewer-3:U1:reviewer'
    const users = createInMemoryUserRepository(allowlistRaw)
    const deps: LoginDeps = { users, allowlistRaw }

    const result = await login({ user_identifier: 'c-reviewer-3' }, deps)

    // 4 フィールド行の display_name が users に登録されていることを前提にする。
    // findByIdentifier(U1) は display_name 付き User を返すが、result.user は SafeUser。
    expect(Object.keys(result.user).sort()).toEqual(['id', 'roles'])
    expect(
      (result.user as unknown as Record<string, unknown>).display_name,
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 7. 副作用なし: console / authorize 不使用
// ---------------------------------------------------------------------------

describe('NFR-003 / API-019 / TEST-032: side-effect free / public bypass (no authorize, no console)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>
  let debugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    infoSpy.mockRestore()
    debugSpy.mockRestore()
  })

  it('TEST-032: happy path で console.* が一度も呼ばれない', async () => {
    const deps = makeDeps()
    await login({ user_identifier: 'c-reviewer' }, deps)

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('TEST-032: 失敗パス（401）でも console.* が一度も呼ばれない', async () => {
    const deps = makeDeps()
    await expect(
      login({ user_identifier: 'c-unknown' }, deps),
    ).rejects.toBeInstanceOf(LoginAuthError)

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('TEST-032: src/server/functions/login.ts が authorize を import / 呼び出していない', () => {
    // 公開バイパス対象（API-019 §認可）。authorize 呼び出しが紛れ込まないことを静的に確認する。
    // （runtime spy だと「import すらしていない」ことを示しにくいので、ソース読み取りで担保。）
    const source = readFileSync(
      new URL('../../../src/server/functions/login.ts', import.meta.url),
      'utf8',
    )
    // import 行および関数呼び出しの両方を禁止する。コメント中の "authorize" 参照は許容
    // するため、パターンは「実コード上の使用」に該当するもののみを検査する。
    expect(source).not.toMatch(/from\s+['"][^'"]*\/auth\/authorize['"]/)
    expect(source).not.toMatch(/\bauthorize\s*\(/)
  })
})

// ---------------------------------------------------------------------------
// 8. CSRF 検証を loader 内で行わない（呼び出し側 wrapper の責務）
// ---------------------------------------------------------------------------

describe('NFR-006 / API-019 / TEST-032: CSRF 検証は loader 内で呼ばない', () => {
  it('TEST-032: src/server/functions/login.ts が verifyCsrf / csrf middleware を import / 呼び出していない', () => {
    // API-019 §"公開バイパスと CSRF 検証は独立"（m-06 整理）。
    // CSRF 検証は呼び出し側 wrapper の責務であり、本 loader では verifyCsrf を呼ばない。
    const source = readFileSync(
      new URL('../../../src/server/functions/login.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/from\s+['"][^'"]*\/middleware\/csrf['"]/)
    expect(source).not.toMatch(/\bverifyCsrf\s*\(/)
    expect(source).not.toMatch(/\bcsrfCheckFromRequest\s*\(/)
  })
})

// ---------------------------------------------------------------------------
// AllowedSession 型契約の確認（型 import が無駄になっていないか軽く確認）
// ---------------------------------------------------------------------------

describe('TEST-032: AllowedSession contract reuse', () => {
  it('TEST-032: allowlistRaw から parseAllowlist 経由で得たエントリと cookie_value が一致する', async () => {
    // login() は parseAllowlist を内部で再呼び出しする。同じ raw を session.parseAllowlist に
    // 直接渡したときの cookie_value と、login が照合に使うキーが一致することを示す。
    const { parseAllowlist } = await import('../../../src/server/auth/session')
    const entries: ReadonlyArray<AllowedSession> = parseAllowlist(ALLOWLIST_RAW)
    const found = entries.find((e) => e.cookie_value === 'c-reviewer')
    expect(found).toBeDefined()
    expect(found?.user_id).toBe('U1')
  })
})
