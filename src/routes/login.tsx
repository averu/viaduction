// SCR-007 / API-019 / API-020 / UC-018 — ログイン route
//
// 役割:
//   - `/login` エントリ。viewer の有無で「ログインフォーム」「ログイン中 + ログアウト」
//     を切り替える `LoginForm` を描画する。
//   - mutation 系（login / logout）は server function を直接 import し、依存
//     （`UserRepository` / `allowlistRaw` / `isProduction`）を bind したクロージャを
//     `LoginActions` に詰めて渡す MVP wiring（TASK-037 と同方針、
//     task-breakdown.md TASK-040 §実装指針）。
//
// 認可・viewer 解決:
//   - 公開バイパス対象（API-019 / API-020）。loader は 401/404 を返さない（SCR-007 §
//     「権限による表示分岐」末尾）。
//   - viewer は本 TASK では `null` 固定。session middleware（TASK-053）で SSR の
//     Cookie ヘッダから resolveViewer() で解決する経路は別 TASK の責務。
//   - 実機での認証統合（route loader / context 経由の viewer 受け渡し）は TASK-053。
//
// 依存注入: `createInMemoryUserRepository(allowlistRaw)` を route 内で都度生成する
//   （src/routes/index.tsx / src/routes/proposals/new.tsx と同方針）。
//   実環境では context 経由で D1 / Workers バインディングに差し替えるが本 TASK の範囲外。
//
// CSRF / Set-Cookie:
//   - login / logout の Set-Cookie ヘッダ送出 / CSRF 検証は server function の wrapper
//     の責務（API-019 m-06、API-020 §認可）。本 route では `result.set_cookie` を
//     UI 表示には使わない（cookie はブラウザが自動で付与する想定。MVP では
//     ブラウザ側 cookie 反映が wrangler dev では効かないため、ログイン成功後の
//     viewer 反映は TASK-053 完了後に同期される）。
import { createFileRoute } from '@tanstack/react-router'

import { LoginForm, type LoginActions } from '#/components/login'
import type { LoginFormViewer } from '#/components/login'
import { login } from '#/server/functions/login'
import { logout } from '#/server/functions/logout'
import { createInMemoryUserRepository } from '#/server/repositories/users'

export const Route = createFileRoute('/login')({
  loader: () => ({
    // viewer 解決は TASK-053（session middleware）で SSR の Cookie ヘッダから
    // resolveViewer() を呼ぶ。本 TASK では guest 固定でフォーム描画のみ提供する。
    viewer: null as LoginFormViewer | null,
  }),
  component: LoginPage,
})

function LoginPage() {
  const { viewer } = Route.useLoaderData()

  const actions: LoginActions = buildActions()

  return <LoginForm viewer={viewer} actions={actions} />
}

/**
 * server function を依存注入済みの形で `LoginActions` に詰める。
 *
 * MVP wiring:
 *   - allowlistRaw / isProduction は route 実行環境（Node / Workers）の env から取り出す。
 *     `process.env` は SSR で動く Node ランタイム / Cloudflare Workers の互換実装の
 *     いずれでも読める前提（本 TASK の範囲では env 注入レイヤを別途設けない）。
 *   - login.ts / logout.ts は env を直接読まない（NFR-005 / TEST-012）。read 責務は
 *     route 側に集約する。
 *   - リポジトリは都度新規作成（永続性なし）。実機では context 経由で D1 に差し替える。
 *
 * TASK-037 の `buildActions()` と同様、render ごとの再生成を避けるための
 * useMemo は使わない（純関数なのでオブジェクト同一性は不要）。
 */
function buildActions(): LoginActions {
  const env = readEnv()
  const users = createInMemoryUserRepository(env.allowlistRaw)
  const loginDeps = {
    users,
    allowlistRaw: env.allowlistRaw,
    isProduction: env.isProduction,
  }
  const logoutDeps = { isProduction: env.isProduction }

  return {
    login: (input) => login(input, loginDeps),
    // logout は viewer 引数を持つが本 TASK では route 側 viewer を使わず null 固定で良い
    // （API-020 §idempotency: viewer の有無を問わず 200 相当）。
    logout: () => logout(null, logoutDeps),
  }
}

interface RouteEnv {
  readonly allowlistRaw: string | null
  readonly isProduction: boolean
}

/**
 * route 層で env を 1 箇所に集約して読む。
 *
 * - `AUTH_ALLOWLIST`: 許可リスト生文字列。未設定なら `null`（→ login は必ず 401）。
 * - `NODE_ENV === 'production'`: Set-Cookie に `Secure` を付ける判定（API-019 / API-020）。
 *
 * `process.env` を直接参照すると Workers ランタイムでは undefined のことがあるが、
 * 本実装では optional chaining で安全に読み取り、欠落時は `null` / `false` に fallback する。
 */
function readEnv(): RouteEnv {
  const proc = (
    typeof process !== 'undefined' ? process : undefined
  ) as { env?: Record<string, string | undefined> } | undefined
  const env = proc?.env ?? {}
  const allowlistRaw =
    typeof env['AUTH_ALLOWLIST'] === 'string' ? env['AUTH_ALLOWLIST'] : null
  const isProduction = env['NODE_ENV'] === 'production'
  return { allowlistRaw, isProduction }
}
