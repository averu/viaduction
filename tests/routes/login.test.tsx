// @vitest-environment jsdom
//
// TEST-040 — SCR-007 ログイン画面
// REQ-010 / REQ-015 / NFR-003 / NFR-005 / NFR-006 / API-019 / API-020 / UC-018
//
// 範囲:
//   - LoginForm（presentational + 状態管理）の振る舞いを spy 注入で検証する。
//   - 未ログイン (viewer=null): 入力フォーム表示、送信時 actions.login が呼ばれる、
//     LoginAuthError でエラーメッセージ表示。
//   - ログイン中 (viewer!=null): user_id 表示、ログアウトボタン押下で actions.logout。
//   - 副作用: console.* を一切呼ばない（NFR-003）。
//
// route 全体（createFileRoute の loader / SSR レスポンス）の統合検証は
// TanStack Start の test util がまだ整っていないため本 TEST では行わない（TASK-037 と同方針）。
// 統合経路は TASK-053 (wrangler dev で SSR 200 確認) と TASK-047 (E2E) で扱う。

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginForm } from '../../src/components/login'
import type {
  LoginActions,
  LoginFormViewer,
} from '../../src/components/login'
import type {
  LoginInput,
  LoginResult,
} from '../../src/server/functions/login'
import type { LogoutResult } from '../../src/server/functions/logout'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// fixtures / helpers
// ---------------------------------------------------------------------------

const USER_ID = 'U-test-001'
const COOKIE_VALUE = 'cookie-test-001'

function makeLoginResult(overrides: Partial<LoginResult> = {}): LoginResult {
  return {
    user: {
      id: USER_ID,
      roles: ['user'],
    },
    set_cookie: `session=${COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax`,
    ...overrides,
  }
}

function makeLogoutResult(overrides: Partial<LogoutResult> = {}): LogoutResult {
  return {
    set_cookie: 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    ...overrides,
  }
}

function makeViewer(overrides: Partial<LoginFormViewer> = {}): LoginFormViewer {
  return {
    user_id: USER_ID,
    roles: ['user'],
    ...overrides,
  }
}

interface ActionsBundle {
  readonly actions: LoginActions
  readonly login: ReturnType<
    typeof vi.fn<(input: LoginInput) => Promise<LoginResult>>
  >
  readonly logout: ReturnType<typeof vi.fn<() => Promise<LogoutResult>>>
}

function makeActions(): ActionsBundle {
  const login = vi.fn(
    async (_input: LoginInput): Promise<LoginResult> => makeLoginResult(),
  )
  const logout = vi.fn(async (): Promise<LogoutResult> => makeLogoutResult())
  const actions: LoginActions = { login, logout }
  return { actions, login, logout }
}

/**
 * `LoginAuthError` 相当の擬似例外。LoginForm の `name` ベース判定に従って
 * 「ログインに失敗しました」を表示させるため、`name === 'LoginAuthError'` を持たせる。
 *
 * `instanceof LoginAuthError` ではなく duck typing で判定する設計（toErrorMessage）
 * のため、本テストは server function 実装を import せずに済む（依存最小化）。
 */
function makeLoginAuthError(
  reason: 'unknown_identifier' | 'invalid_input',
): Error & { name: 'LoginAuthError'; reason: typeof reason } {
  const e = new Error(`login failed: ${reason}`) as Error & {
    name: 'LoginAuthError'
    reason: typeof reason
  }
  e.name = 'LoginAuthError'
  e.reason = reason
  return e
}

// ---------------------------------------------------------------------------
// 1. レンダリング: 未ログイン (viewer=null)
// ---------------------------------------------------------------------------
describe('REQ-010 / REQ-015 / TEST-040: LoginForm (guest)', () => {
  it('SCR-007 §画面項目: viewer=null で `user_identifier` 入力 + 「ログイン」ボタンが表示される', () => {
    const { actions } = makeActions()
    render(<LoginForm viewer={null} actions={actions} />)

    expect(screen.getByTestId('login-page').getAttribute('data-state')).toBe(
      'guest',
    )
    expect(screen.getByTestId('login-user-identifier')).toBeDefined()
    expect(screen.getByTestId('login-submit')).toBeDefined()
    // ログアウトボタンは出ない
    expect(screen.queryByTestId('logout-button')).toBeNull()
    // 初期状態ではエラーは出ない
    expect(screen.queryByTestId('login-error')).toBeNull()
  })

  it('SCR-007 §UX 補助: 未入力 / 空白のみだとログインボタンが disabled', () => {
    const { actions } = makeActions()
    render(<LoginForm viewer={null} actions={actions} />)

    const submit = screen.getByTestId('login-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    // 空白のみ入力
    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: '   ' },
    })
    expect(submit.disabled).toBe(true)
  })

  it('REQ-010 / TEST-040: 入力後にログインボタンが有効化され、押下で actions.login が `{ user_identifier: 入力値 }` で呼ばれる', async () => {
    const bundle = makeActions()
    render(<LoginForm viewer={null} actions={bundle.actions} />)

    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: COOKIE_VALUE },
    })
    const submit = screen.getByTestId('login-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(false)

    // form の submit イベントで送信（Enter / submit ボタンの両方を網羅する）
    fireEvent.submit(screen.getByTestId('login-form'))

    await vi.waitFor(() => {
      expect(bundle.login).toHaveBeenCalledTimes(1)
    })
    expect(bundle.login).toHaveBeenCalledWith({
      user_identifier: COOKIE_VALUE,
    })
    expect(bundle.logout).toHaveBeenCalledTimes(0)
  })

  it('REQ-010 / TEST-040: 入力値の前後空白は trim せずそのまま送る（許可リスト側の比較に委ねる、SCR-007 §バリデーション）', async () => {
    const bundle = makeActions()
    render(<LoginForm viewer={null} actions={bundle.actions} />)

    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: '  cookie-with-spaces  ' },
    })
    fireEvent.submit(screen.getByTestId('login-form'))

    await vi.waitFor(() => {
      expect(bundle.login).toHaveBeenCalledTimes(1)
    })
    expect(bundle.login).toHaveBeenCalledWith({
      user_identifier: '  cookie-with-spaces  ',
    })
  })

  it('REQ-010 / TEST-040: ログイン成功で onLoggedIn が LoginResult 付きで呼ばれる', async () => {
    const bundle = makeActions()
    const onLoggedIn = vi.fn()
    render(
      <LoginForm
        viewer={null}
        actions={bundle.actions}
        onLoggedIn={onLoggedIn}
      />,
    )

    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: COOKIE_VALUE },
    })
    fireEvent.submit(screen.getByTestId('login-form'))

    await vi.waitFor(() => {
      expect(onLoggedIn).toHaveBeenCalledTimes(1)
    })
    const arg = onLoggedIn.mock.calls[0]?.[0] as LoginResult
    expect(arg.user.id).toBe(USER_ID)
    expect(arg.set_cookie).toContain(`session=${COOKIE_VALUE}`)
  })
})

// ---------------------------------------------------------------------------
// 2. エラー表示（LoginAuthError → 統一文言）
// ---------------------------------------------------------------------------
describe('REQ-015 / NFR-006 / TEST-040: LoginAuthError の表示（統一文言）', () => {
  it('SCR-007 §401: LoginAuthError が throw されるとバナー「ログインに失敗しました」が表示される', async () => {
    const bundle = makeActions()
    bundle.login.mockRejectedValueOnce(makeLoginAuthError('unknown_identifier'))

    render(<LoginForm viewer={null} actions={bundle.actions} />)

    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: 'not-in-allowlist' },
    })
    fireEvent.submit(screen.getByTestId('login-form'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeDefined()
    })
    // タイミング攻撃対策の統一文言：「許可リストにあるかどうか」を漏らさない
    expect(screen.getByTestId('login-error').textContent ?? '').toBe(
      'ログインに失敗しました',
    )
    // reason ('unknown_identifier' / 'invalid_input') を UI に出してはならない
    expect(screen.getByTestId('login-error').textContent ?? '').not.toContain(
      'unknown_identifier',
    )
    expect(screen.getByTestId('login-error').textContent ?? '').not.toContain(
      'invalid_input',
    )
  })

  it('SCR-007 §例外: 想定外エラー (Error / non-LoginAuthError) は汎用メッセージを表示', async () => {
    const bundle = makeActions()
    bundle.login.mockRejectedValueOnce(new Error('network down'))

    render(<LoginForm viewer={null} actions={bundle.actions} />)

    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: COOKIE_VALUE },
    })
    fireEvent.submit(screen.getByTestId('login-form'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeDefined()
    })
    // 「ログインに失敗しました」とは別の文言（想定外を 401 と取り違えない）
    expect(screen.getByTestId('login-error').textContent ?? '').toContain(
      'エラーが発生しました',
    )
    // 例外メッセージそのもの（"network down"）は出さない
    expect(screen.getByTestId('login-error').textContent ?? '').not.toContain(
      'network down',
    )
  })
})

// ---------------------------------------------------------------------------
// 3. ログイン中 (viewer != null): user_id 表示 + ログアウトボタン
// ---------------------------------------------------------------------------
describe('REQ-015 / TEST-040: LoginForm (authenticated)', () => {
  it('SCR-007 §「権限による表示分岐」: viewer 付きで現在の user_id とログアウトボタンが表示される', () => {
    const { actions } = makeActions()
    render(<LoginForm viewer={makeViewer()} actions={actions} />)

    expect(screen.getByTestId('login-page').getAttribute('data-state')).toBe(
      'authenticated',
    )
    expect(screen.getByTestId('login-current-user').textContent ?? '').toContain(
      USER_ID,
    )
    expect(screen.getByTestId('logout-button')).toBeDefined()
    // ログイン入力フォームは出ない
    expect(screen.queryByTestId('login-form')).toBeNull()
    expect(screen.queryByTestId('login-user-identifier')).toBeNull()
  })

  it('REQ-015 / TEST-040: ログアウトボタン押下で actions.logout が引数なしで呼ばれる', async () => {
    const bundle = makeActions()
    render(<LoginForm viewer={makeViewer()} actions={bundle.actions} />)

    fireEvent.click(screen.getByTestId('logout-button'))

    await vi.waitFor(() => {
      expect(bundle.logout).toHaveBeenCalledTimes(1)
    })
    expect(bundle.logout).toHaveBeenCalledWith()
    expect(bundle.login).toHaveBeenCalledTimes(0)
  })

  it('REQ-015 / TEST-040: ログアウト成功で onLoggedOut が LogoutResult 付きで呼ばれる', async () => {
    const bundle = makeActions()
    const onLoggedOut = vi.fn()
    render(
      <LoginForm
        viewer={makeViewer()}
        actions={bundle.actions}
        onLoggedOut={onLoggedOut}
      />,
    )

    fireEvent.click(screen.getByTestId('logout-button'))

    await vi.waitFor(() => {
      expect(onLoggedOut).toHaveBeenCalledTimes(1)
    })
    const arg = onLoggedOut.mock.calls[0]?.[0] as LogoutResult
    expect(arg.set_cookie).toContain('Max-Age=0')
  })

  it('NFR-003 / TEST-040: logout 中はボタンが disabled になり、二重押下で重複呼び出しが起きない', async () => {
    const bundle = makeActions()
    let resolveLogout: ((result: LogoutResult) => void) | undefined
    bundle.logout.mockImplementationOnce(
      () =>
        new Promise<LogoutResult>((resolve) => {
          resolveLogout = resolve
        }),
    )

    render(<LoginForm viewer={makeViewer()} actions={bundle.actions} />)

    const button = screen.getByTestId('logout-button') as HTMLButtonElement
    fireEvent.click(button)

    // pending 状態で disabled
    await vi.waitFor(() => {
      expect(button.disabled).toBe(true)
    })

    // 二重押下しても呼び出しは増えない
    fireEvent.click(button)
    fireEvent.click(button)
    expect(bundle.logout).toHaveBeenCalledTimes(1)

    // 解放
    resolveLogout?.(makeLogoutResult())
    await vi.waitFor(() => {
      expect(button.disabled).toBe(false)
    })
  })

  it('SCR-007 §例外: logout 失敗時はバナーエラーを表示し、ボタンが再度押せる状態に戻る', async () => {
    const bundle = makeActions()
    bundle.logout.mockRejectedValueOnce(new Error('csrf denied'))

    render(<LoginForm viewer={makeViewer()} actions={bundle.actions} />)

    fireEvent.click(screen.getByTestId('logout-button'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeDefined()
    })
    expect(screen.getByTestId('login-error').textContent ?? '').toContain(
      'エラーが発生しました',
    )
    // 想定外エラーの message ('csrf denied') は UI に出さない
    expect(screen.getByTestId('login-error').textContent ?? '').not.toContain(
      'csrf denied',
    )
    // 再試行可能（disabled が解ける）
    const button = screen.getByTestId('logout-button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. 副作用検査: console.* を一切呼ばない（NFR-003 / NFR-005）
// ---------------------------------------------------------------------------
describe('NFR-003 / NFR-005 / TEST-040: 副作用検査', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('レンダリング → 入力 → login → エラー表示 まで console.* を呼ばない', async () => {
    const bundle = makeActions()
    bundle.login.mockRejectedValueOnce(makeLoginAuthError('unknown_identifier'))
    render(<LoginForm viewer={null} actions={bundle.actions} />)

    fireEvent.change(screen.getByTestId('login-user-identifier'), {
      target: { value: 'bad' },
    })
    fireEvent.submit(screen.getByTestId('login-form'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeDefined()
    })

    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
    expect(vi.mocked(console.info)).not.toHaveBeenCalled()
    expect(vi.mocked(console.debug)).not.toHaveBeenCalled()
  })

  it('レンダリング → ログアウト までの流れで console.* を呼ばない', async () => {
    const bundle = makeActions()
    render(<LoginForm viewer={makeViewer()} actions={bundle.actions} />)

    fireEvent.click(screen.getByTestId('logout-button'))
    await vi.waitFor(() => {
      expect(bundle.logout).toHaveBeenCalledTimes(1)
    })

    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
    expect(vi.mocked(console.info)).not.toHaveBeenCalled()
    expect(vi.mocked(console.debug)).not.toHaveBeenCalled()
  })
})
