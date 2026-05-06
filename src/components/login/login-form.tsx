// SCR-007 / API-019 / API-020 / UC-018 — ログインフォーム本体
//
// 役割:
//   - guest（viewer === null）向けに `user_identifier` 入力フォームを提供し、
//     送信で API-019 (login) を呼ぶ。
//   - ログイン済（viewer !== null）の再到達時は現在の user_id 表示と
//     API-020 (logout) を呼ぶ「ログアウト」ボタンを提供する。
//   - server function 群は `actions` プロップ経由で受け取る DI 構造（TASK-037 と同形式）。
//
// MVP の妥協（task-breakdown.md TASK-040 §実装指針）:
//   - TanStack Start の form action / mutation 統合は Phase 5 で wiring 確定（TASK-053）。
//     本 TASK では `actions.login` / `actions.logout` を直接呼び、成功時は
//     `onLoggedIn` / `onLoggedOut` で route 層に通知する。デフォルト遷移先決定
//     （SCR-007 §UC-018 の roles → ロール別画面）は本コンポーネント外の責務。
//   - viewer 解決は session middleware（TASK-053）で route loader / context 経由
//     になる予定。本 TASK では route 側で `viewer = null` 固定とし、本コンポーネントは
//     props から viewer を受け取るに留める（SCR-007 §「公開バイパス対象」）。
//
// 検証規約（NFR-003 / SCR-007 §「server-side 検証の徹底」）:
//   - UI 側の disabled は UX 補助に過ぎない。`user_identifier` の許可リスト照合は
//     API-019 側で行う。本コンポーネントは送信そのものを止めない（空文字でも送る）。
//     ただし「未入力で送ると確実に 401 になる」UX を避けるため、空文字 / 空白のみの
//     ときはボタンを disabled にする。
//
// エラー表示（SCR-007 §エラー・空状態）:
//   - LoginAuthError (401 UNAUTHENTICATED) → 「ログインに失敗しました」（統一文言、
//     タイミング攻撃対策で原因を漏らさない）。
//   - その他の例外 → 「エラーが発生しました。時間をおいて再度お試しください。」
//
// 副作用:
//   - console.* / logger / fetch を呼ばない（NFR-003）。状態は useState のみ。

import { useState } from 'react'
import type { FormEvent } from 'react'

import type { AuthenticatedRole } from '#/server/auth/session'
import type {
  LoginInput,
  LoginResult,
} from '#/server/functions/login'
import type { LogoutResult } from '#/server/functions/logout'

/**
 * LoginForm が呼び出す mutation 群（依存注入）。
 *
 * route 層では server function (`login` / `logout`) を直接 import し、
 * 必要な依存（`UserRepository` / `allowlistRaw` / `isProduction`）を bind した
 * クロージャとして渡す。テストでは vitest の `vi.fn()` で spy を注入する。
 */
export interface LoginActions {
  /** API-019. ログインボタン押下で呼ばれる。 */
  readonly login: (input: LoginInput) => Promise<LoginResult>
  /** API-020. ログアウトボタン押下で呼ばれる。 */
  readonly logout: () => Promise<LogoutResult>
}

/**
 * ログイン状態を表す viewer（API-019 のレスポンスに対応）。
 *
 * - `user_id`: SCR-007 §「権限による表示分岐」の「現在のセッション: <user_id>」表示用。
 * - `roles`: 表示分岐用（ログアウトボタンの表示判定そのものは viewer の有無で行うが、
 *   将来「user_id (admin)」のような表示拡張のために保持）。
 *
 * `null` は未認証 / cookie 不在 / 許可リスト外を表す。
 */
export interface LoginFormViewer {
  readonly user_id: string
  readonly roles: ReadonlyArray<AuthenticatedRole>
}

export interface LoginFormProps {
  readonly viewer: LoginFormViewer | null
  readonly actions: LoginActions
  /** ログイン成功時に route 層が呼ぶ後処理（例: ロール別画面へ navigate）。 */
  readonly onLoggedIn?: (result: LoginResult) => void
  /** ログアウト成功時に route 層が呼ぶ後処理（例: SCR-002 へ navigate）。 */
  readonly onLoggedOut?: (result: LogoutResult) => void
  readonly className?: string
}

type Pending = 'idle' | 'logging-in' | 'logging-out'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2'
const BUTTON_DEFAULT = 'bg-primary text-primary-foreground hover:bg-primary/90'
const BUTTON_OUTLINE =
  'border border-input bg-background hover:bg-accent hover:text-accent-foreground'

/**
 * 例外を表示用メッセージに正規化する。
 *
 * - `LoginAuthError` (`name === 'LoginAuthError'`) は SCR-007 §エラー・空状態 §401 に
 *   従い「ログインに失敗しました」の統一文言を返す（タイミング攻撃対策）。
 * - それ以外（ネットワーク / 5xx / 想定外） は汎用メッセージを返す。
 *
 * `instanceof` ではなく `name` で判定するのは TASK-037 と同方針（モジュール境界を
 * 増やさず、また再 throw された Error でも検出できるようにするため）。
 */
function toErrorMessage(e: unknown): string {
  if (e !== null && typeof e === 'object') {
    const obj = e as { name?: unknown }
    if (obj.name === 'LoginAuthError') {
      return 'ログインに失敗しました'
    }
  }
  return 'エラーが発生しました。時間をおいて再度お試しください。'
}

export function LoginForm({
  viewer,
  actions,
  onLoggedIn,
  onLoggedOut,
  className,
}: LoginFormProps) {
  const [identifier, setIdentifier] = useState<string>('')
  const [pending, setPending] = useState<Pending>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ログイン済の場合: ユーザ ID 表示 + ログアウトボタン
  if (viewer !== null) {
    async function handleLogout() {
      if (pending !== 'idle') return
      setPending('logging-out')
      setErrorMessage(null)
      try {
        const result = await actions.logout()
        onLoggedOut?.(result)
      } catch (err) {
        setErrorMessage(toErrorMessage(err))
      } finally {
        setPending('idle')
      }
    }

    return (
      <main
        data-testid="login-page"
        data-state="authenticated"
        className={className}
      >
        <h1 className="text-3xl font-bold tracking-tight">ログイン中</h1>
        <p className="mt-4 text-muted-foreground" data-testid="login-current-user">
          現在のセッション: <code>{viewer.user_id}</code>
        </p>
        {errorMessage !== null ? (
          <div
            data-testid="login-error"
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}
        <div className="mt-6">
          <button
            type="button"
            data-testid="logout-button"
            disabled={pending !== 'idle'}
            onClick={() => {
              void handleLogout()
            }}
            className={`${BUTTON_BASE} ${BUTTON_OUTLINE}`}
          >
            ログアウト
          </button>
        </div>
      </main>
    )
  }

  // guest: ログインフォーム
  const trimmedIdentifier = identifier.trim()
  const submitDisabledByUx =
    pending !== 'idle' || trimmedIdentifier.length === 0

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitDisabledByUx) return
    setPending('logging-in')
    setErrorMessage(null)
    try {
      const result = await actions.login({ user_identifier: identifier })
      onLoggedIn?.(result)
    } catch (err) {
      setErrorMessage(toErrorMessage(err))
    } finally {
      setPending('idle')
    }
  }

  return (
    <main
      data-testid="login-page"
      data-state="guest"
      className={className}
    >
      <h1 className="text-3xl font-bold tracking-tight">ログイン</h1>
      <p className="mt-4 text-muted-foreground">
        ユーザ識別子を入力してログインしてください。
      </p>
      <form
        data-testid="login-form"
        onSubmit={handleSubmit}
        className="mt-8 space-y-4"
      >
        {errorMessage !== null ? (
          <div
            data-testid="login-error"
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className="text-sm font-medium">ユーザ識別子</span>
          <input
            type="text"
            data-testid="login-user-identifier"
            name="user_identifier"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
            }}
            disabled={pending !== 'idle'}
            maxLength={128}
            autoComplete="username"
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div>
          <button
            type="submit"
            data-testid="login-submit"
            disabled={submitDisabledByUx}
            className={`${BUTTON_BASE} ${BUTTON_DEFAULT}`}
          >
            ログイン
          </button>
        </div>
      </form>
    </main>
  )
}
