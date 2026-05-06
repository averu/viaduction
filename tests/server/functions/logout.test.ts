// TEST-033 — logout（ログアウト）server function
// API-020 / REQ-015 / NFR-005 / NFR-006 / UC-018
//
// 観点（API-020 設計優先 / TASK-033 指針 6 項目に対応）:
//   1. idempotent: viewer === null（guest）でも 200 相当（cookie 破棄文字列を返す）
//   2. role を問わない: user / reviewer / admin / auditor / 複合 すべて 200 相当
//   3. Set-Cookie 構成（cookie 名空値 / Path / HttpOnly / SameSite=Lax / Max-Age=0 /
//      isProduction=true で Secure / false / undefined で Secure 無し）
//   4. 副作用なし: console.* が呼ばれない
//   5. 戻り値の漏洩なし: Object.keys(result) === ['set_cookie']
//   6. ソース静的検査: CSRF / authorize の loader 内呼び出しなし
//      （API-020 §認可「CSRF は呼び出し側 wrapper の責務」、
//       authorize.ts §PUBLIC_BYPASS_ACTIONS に `auth.logout` 登録済）

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_COOKIE_NAME,
  type AuthenticatedRole,
  type Viewer,
} from '../../../src/server/auth/session'
import {
  logout,
  type LogoutDeps,
  type LogoutResult,
} from '../../../src/server/functions/logout'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeViewer(roles: ReadonlyArray<AuthenticatedRole>): Viewer {
  return {
    user_id: 'U1',
    roles,
  }
}

function makeDeps(overrides: Partial<LogoutDeps> = {}): LogoutDeps {
  return {
    isProduction: overrides.isProduction,
  }
}

// ---------------------------------------------------------------------------
// 1. idempotent: viewer === null（guest）でも 200 相当
// ---------------------------------------------------------------------------

describe('REQ-015 / API-020 / TEST-033: idempotent (viewer null is accepted)', () => {
  it('REQ-015 / TEST-033: viewer null でも cookie 破棄文字列を返す（API-020 §idempotency）', async () => {
    const result: LogoutResult = await logout(null, makeDeps())

    expect(typeof result.set_cookie).toBe('string')
    expect(result.set_cookie.length).toBeGreaterThan(0)
    expect(result.set_cookie).toContain('Max-Age=0')
  })

  it('TEST-033: viewer null でも throw しない（API-020 §4xx「401/404 は本 API では発生しない」）', async () => {
    await expect(logout(null, makeDeps())).resolves.toBeDefined()
  })

  it('TEST-033: viewer null + isProduction=true でも 200 相当（環境に依存しない）', async () => {
    const { set_cookie } = await logout(null, makeDeps({ isProduction: true }))

    expect(set_cookie).toContain('Max-Age=0')
    expect(set_cookie).toContain('Secure')
  })

  it('API-020 / TEST-033: 戻り値に余分なフィールドが無い（Object.keys === ["set_cookie"]）', async () => {
    const result = await logout(null, makeDeps())

    expect(Object.keys(result)).toEqual(['set_cookie'])
  })
})

// ---------------------------------------------------------------------------
// 2. 認証済 viewer でも 200 相当（role を問わない）
// ---------------------------------------------------------------------------

describe('API-020 / TEST-033: any authenticated role can logout', () => {
  const roles: ReadonlyArray<AuthenticatedRole> = ['user', 'reviewer', 'admin', 'auditor']

  for (const role of roles) {
    it(`TEST-033: role=${role} のみ持つ viewer は 200 相当`, async () => {
      const viewer = makeViewer([role])
      const result = await logout(viewer, makeDeps())
      expect(result.set_cookie).toContain('Max-Age=0')
    })
  }

  it('TEST-033: 複合 role（user + reviewer）も 200 相当', async () => {
    const viewer = makeViewer(['user', 'reviewer'])
    const result = await logout(viewer, makeDeps())
    expect(result.set_cookie).toContain('Max-Age=0')
  })

  it('TEST-033: 複合 role（admin + auditor）も 200 相当', async () => {
    const viewer = makeViewer(['admin', 'auditor'])
    const result = await logout(viewer, makeDeps())
    expect(result.set_cookie).toContain('Max-Age=0')
  })

  it('TEST-033: 認証済 viewer でも戻り値は ["set_cookie"] のみ', async () => {
    const viewer = makeViewer(['user'])
    const result = await logout(viewer, makeDeps())
    expect(Object.keys(result)).toEqual(['set_cookie'])
  })
})

// ---------------------------------------------------------------------------
// 3. Set-Cookie 構成
// ---------------------------------------------------------------------------

describe('NFR-006 / API-020 / TEST-033: Set-Cookie attributes (cookie 破棄)', () => {
  it('TEST-033: starts with `${SESSION_COOKIE_NAME}=` (空値で破棄を指示)', async () => {
    const viewer = makeViewer(['user'])
    const { set_cookie } = await logout(viewer, makeDeps())

    expect(set_cookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true)
    // "session=" の直後は ";" または末尾。値は空文字列であること。
    expect(set_cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=(;|$)`))
  })

  it('TEST-033: cookie name matches SESSION_COOKIE_NAME ("session")', async () => {
    const viewer = makeViewer(['user'])
    const { set_cookie } = await logout(viewer, makeDeps())
    expect(SESSION_COOKIE_NAME).toBe('session')
    expect(set_cookie.startsWith('session=')).toBe(true)
  })

  it('TEST-033: contains Path=/ / HttpOnly / SameSite=Lax / Max-Age=0', async () => {
    const viewer = makeViewer(['user'])
    const { set_cookie } = await logout(viewer, makeDeps())

    expect(set_cookie).toContain('Path=/')
    expect(set_cookie).toContain('HttpOnly')
    expect(set_cookie).toContain('SameSite=Lax')
    expect(set_cookie).toContain('Max-Age=0')
  })

  it('TEST-033: isProduction=true -> Secure を含む', async () => {
    const viewer = makeViewer(['user'])
    const { set_cookie } = await logout(viewer, makeDeps({ isProduction: true }))
    expect(set_cookie).toContain('Secure')
  })

  it('TEST-033: isProduction=false -> Secure を含まない（dev で http 検証可能）', async () => {
    const viewer = makeViewer(['user'])
    const { set_cookie } = await logout(viewer, makeDeps({ isProduction: false }))
    expect(set_cookie).not.toContain('Secure')
  })

  it('TEST-033: isProduction=undefined -> Secure を含まない（デフォルト dev）', async () => {
    const viewer = makeViewer(['user'])
    const { set_cookie } = await logout(viewer, makeDeps({ isProduction: undefined }))
    expect(set_cookie).not.toContain('Secure')
  })

  it('TEST-033: cookie 値部分は空文字（`session=` の右辺に値が続かない）', async () => {
    const viewer = makeViewer(['admin'])
    const { set_cookie } = await logout(viewer, makeDeps())

    // 最初の "; " より前が "session=" だけであること（値が混入していない）。
    const firstAttrEnd = set_cookie.indexOf(';')
    const head =
      firstAttrEnd === -1 ? set_cookie : set_cookie.slice(0, firstAttrEnd)
    expect(head).toBe(`${SESSION_COOKIE_NAME}=`)
  })

  it('TEST-033: viewer null でも Set-Cookie 構成は同一（idempotent）', async () => {
    const guestResult = await logout(null, makeDeps())
    const userResult = await logout(makeViewer(['user']), makeDeps())

    // viewer の有無で Set-Cookie が変わらない（cookie 状態を「無し」に揃えるだけ）。
    expect(guestResult.set_cookie).toBe(userResult.set_cookie)
  })
})

// ---------------------------------------------------------------------------
// 4. 副作用なし: console.* 呼ばれない
// ---------------------------------------------------------------------------

describe('NFR-003 / NFR-005 / API-020 / TEST-033: side-effect free (no console.*)', () => {
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

  it('TEST-033: 認証済 viewer で console.* が一度も呼ばれない', async () => {
    const viewer = makeViewer(['user'])
    await logout(viewer, makeDeps())

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('TEST-033: viewer null（idempotent path）でも console.* が一度も呼ばれない', async () => {
    await logout(null, makeDeps())

    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5. ソース静的検査: CSRF / authorize の loader 内呼び出しなし
// ---------------------------------------------------------------------------

describe('NFR-006 / API-020 / TEST-033: 公開バイパス & CSRF は wrapper 責務（静的検査）', () => {
  it('TEST-033: src/server/functions/logout.ts が verifyCsrf / csrfCheckFromRequest を import / 呼び出していない', () => {
    // API-020 §認可「CSRF 検証は呼び出し側 wrapper の責務」、
    // API-019 m-06 整理「公開バイパスと CSRF 検証は独立」。
    // 本 loader では verifyCsrf を呼ばない（runtime spy で示しにくいため、
    // ソース静的検査で担保）。
    const source = readFileSync(
      new URL('../../../src/server/functions/logout.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/from\s+['"][^'"]*\/middleware\/csrf['"]/)
    expect(source).not.toMatch(/\bverifyCsrf\s*\(/)
    expect(source).not.toMatch(/\bcsrfCheckFromRequest\s*\(/)
  })

  it('TEST-033: src/server/functions/logout.ts が authorize() を呼び出していない（公開バイパス）', () => {
    // API-020 §認可で `auth.logout` は authorize.ts §PUBLIC_BYPASS_ACTIONS に
    // 含まれているため、本 loader では authorize() を呼ばない。
    // 判定は「`authorize(` という関数呼び出しが出現しないこと」で行う。
    const source = readFileSync(
      new URL('../../../src/server/functions/logout.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/\bauthorize\s*\(/)
  })

  it('TEST-033: src/server/functions/logout.ts が authorize モジュールから何も import していない（公開バイパス完全分離）', () => {
    // 設計優先方針: viewer null でも throw しないため AuthorizationError も import 不要。
    // authorize.ts に依存しないことで「公開バイパス」を構造的に明確化する。
    const source = readFileSync(
      new URL('../../../src/server/functions/logout.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/from\s+['"][^'"]*\/auth\/authorize['"]/)
  })
})
