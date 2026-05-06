// API-020 / REQ-015 / NFR-005 / NFR-006 / UC-018
// — logout（ログアウト server function、cookie 破棄）
//
// 役割:
//   - Set-Cookie ヘッダ用の「破棄文字列」を組み立てて返す純粋関数。
//     `Max-Age=0` の Set-Cookie を発行することで、ブラウザに既存の `session`
//     cookie の即時削除を指示する（API-020 §Set-Cookie ヘッダ）。
//   - 「Set-Cookie ヘッダの送出」「CSRF 検証」「access log」は呼び出し側 wrapper の責務。
//     本関数は cookie 破棄文字列の **生成** までで止める（API-019 / login.ts と対称）。
//
// 不変条件:
//   - **idempotent / 公開バイパス**（API-020 §認可 / §idempotency / §レスポンス）:
//     viewer の有無を問わず 200 相当の戻り値（cookie 破棄文字列）を返す。
//     viewer === null（未認証 / cookie なし）でも例外は throw せず、cookie 状態を
//     「無し」に揃える Set-Cookie を返すことで、API-020.md §idempotency
//     「未認証で呼ばれても 200」を満たす。
//
//   - 公開バイパス対象（authorize.ts §PUBLIC_BYPASS_ACTIONS の `auth.logout`）。
//     本関数では認可ヘルパー（authorize 関数）を呼ばない。viewer 引数は受け取るが、
//     呼び出し側 API（loader 引数）の一貫性のために維持しているのみで、
//     本関数の挙動は viewer に依存しない。
//
//   - CSRF 検証は loader / server function の **呼び出し側 wrapper** で実施される
//     （API-020 §認可「CSRF 検証: Origin / Sec-Fetch-Site=same-origin」、
//     API-019 m-06 整理「公開バイパスと CSRF 検証は独立」）。本関数は CSRF を検証しない。
//
//   - 副作用なし。logger / console / DB / fetch を呼ばない（NFR-003 AC、NFR-005）。
//
//   - 戻り値は `set_cookie` 文字列のみ。HTTP レスポンス body（`{ logged_out: true }`）の
//     組み立ては呼び出し側 wrapper の責務（API-020 §レスポンス）。
//
// 参照: docs/20-detail-design/apis/API-020.md（§概要 / §認可 / §レスポンス /
//       §Set-Cookie ヘッダ / §idempotency）、
//       docs/02-requirements/02-functional-requirements.md REQ-015、
//       docs/02-requirements/03-non-functional-requirements.md NFR-005 / NFR-006、
//       src/server/auth/session.ts (TASK-005)、
//       src/server/auth/authorize.ts §PUBLIC_BYPASS_ACTIONS (TASK-006)

import {
  SESSION_COOKIE_NAME,
  type Viewer,
} from '#/server/auth/session'

/**
 * logout 成功時のレスポンス（API-020 §Set-Cookie ヘッダ に対応）。
 *
 * - `set_cookie`: `Set-Cookie:` ヘッダの値そのもの。ヘッダ名は含まない。
 *   wrapper はこれを HTTP レスポンスの `Set-Cookie` ヘッダにそのまま設定する。
 *   形式: `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0[; Secure]`
 */
export interface LogoutResult {
  readonly set_cookie: string
}

/**
 * logout の依存。
 *
 * - `isProduction`: 真なら Set-Cookie に `Secure` を付ける（API-019 / login.ts と対称）。
 *   `undefined` / `false` は開発環境（http 検証可）。本番では明示的に `true` を渡す。
 */
export interface LogoutDeps {
  readonly isProduction?: boolean
}

/**
 * cookie 破棄文字列を組み立てる（API-020 §Set-Cookie ヘッダ）。
 *
 *   session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0[; Secure]
 *
 * - 値は **空文字**（`session=`）。`Max-Age=0` と組み合わせて即時失効を指示する。
 * - 属性順は API-019 / login.ts の生成順を踏まえ、テストの等価性比較を簡潔にするため
 *   「Path → HttpOnly → SameSite → Max-Age → Secure」で固定する。
 *   RFC 6265 §4.1 上、属性順は意味を持たない。
 * - `SESSION_COOKIE_ATTRIBUTES`（session.ts）の `HttpOnly` / `SameSite` / `Path` と
 *   等価な値を出力する。属性のソース・オブ・トゥルースは session.ts 側に集約済。
 */
function buildLogoutCookie(isProduction: boolean): string {
  const parts: string[] = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (isProduction) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/**
 * logout server function 本体。
 *
 * フロー（API-020 §概要 / §idempotency / §レスポンス、TASK-033 設計優先指針）:
 *
 *   1. viewer は参照しない（idempotent / 公開バイパス）。認可ヘルパーも呼ばない。
 *   2. cookie 破棄文字列の組み立て: `buildLogoutCookie(isProduction)`。
 *      `Max-Age=0` を含む `session=` の Set-Cookie 値を返す。
 *   3. 戻り値: `{ set_cookie }`。
 *
 * @param viewer 解決済みの viewer（cookie なし / 許可リスト外なら null）。
 *               呼び出し側 API の一貫性のため受け取るが、本関数では参照しない。
 * @param deps   `isProduction` のみ
 *
 * 401 / 404 は本関数では発生しない（API-020 §4xx / §idempotency）。
 * 403 CSRF_DENIED は呼び出し側 wrapper の責務（API-020 §認可）。
 */
// 引数 `viewer` は idempotent 設計上、本関数では参照しない（公開バイパス）。
// 呼び出し側 API の一貫性のため引数として受け取り、`_` プレフィックスで明示的に
// 未参照（TypeScript `noUnusedParameters` の慣行）とする。
export async function logout(
  _viewer: Viewer | null,
  deps: LogoutDeps,
): Promise<LogoutResult> {
  const setCookie = buildLogoutCookie(deps.isProduction === true)

  return {
    set_cookie: setCookie,
  }
}
