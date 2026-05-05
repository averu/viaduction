// BD-ARCH §技術選定 / NFR-002 / NFR-003 / NFR-006 / API-019 / API-020 / DB-006
// REQ-015 — モック認証セッション解決（読み取り専用）
//
// 役割:
//   - Cookie ヘッダ文字列から `session` を抽出し、環境変数由来の許可リストと
//     照合して Viewer ({ user_id, role }) を返す純粋関数を提供する。
//   - 認証 cookie を「発行」する責務は API-019 (login) / API-020 (logout) にあり、
//     本モジュールはあくまで読み取り側。Set-Cookie 文字列は組み立てない（属性の
//     ソース・オブ・トゥルースとなる定数のみ export する）。
//
// 不変条件:
//   - 許可リスト外 / cookie 欠落 / 改竄相当（パース不能）の場合は null を返す。
//     `guest` ロールは Viewer.role として表現しない（DB-006 不変条件 2 と整合）。
//   - cookie 名は API-019 の Set-Cookie ヘッダで定義された `session` と一致させる。
//   - 1 リクエストに `session` cookie が複数回現れた場合は最初の出現を採用する
//     （RFC 6265 は順序の意味論を規定していないが、本実装では決定的挙動とする）。

import { ROLES, type Role } from '#/lib/domain/types'

/**
 * 認証 cookie 名。API-019 (login) の `Set-Cookie: session=...` と一致させる。
 */
export const SESSION_COOKIE_NAME = 'session' as const

/**
 * 認証 cookie の必須属性。NFR-006 / API-019 / API-020 の Set-Cookie と整合。
 *
 * 本モジュールでは Set-Cookie 文字列の組み立ては行わないが、属性の値を
 * 単一箇所に閉じ込めるため定数として export する。発行側 (API-019 / API-020)
 * はこの定数を参照して Set-Cookie ヘッダを構築する想定。
 */
export const SESSION_COOKIE_ATTRIBUTES = {
  HttpOnly: true,
  Secure: true,
  SameSite: 'Lax',
  Path: '/',
} as const

/**
 * 許可リスト 1 行。環境変数からパースされる。
 *
 * - `cookie_value`: Cookie ヘッダの `session=` 値と完全一致で比較する不透明文字列。
 * - `user_id`: DB-006 `id` と一致する不透明 ID（最大 128 文字、許可リストパース時に検証）。
 * - `roles`: DB-006 `roles` の正規化済み配列（重複なし、`Role` のサブセット、`guest` を含まない）。
 */
export interface AllowedSession {
  readonly cookie_value: string
  readonly user_id: string
  readonly roles: ReadonlyArray<AuthenticatedRole>
}

/**
 * 認証済みセッションが取りうるロール。`guest` は「未認証」を表すため
 * Viewer / AllowedSession には現れない（DB-006 不変条件 2、REQ-015）。
 */
export type AuthenticatedRole = Exclude<Role, 'guest'>

/**
 * Cookie から解決された認証主体。許可リスト外 / セッション無し / パース失敗時は null。
 *
 * `roles` は OR 合成（BR-AUTHZ-01）。authorize ヘルパー（TASK-006）が
 * `roles.includes('reviewer')` のような形で参照する。
 */
export interface Viewer {
  readonly user_id: string
  readonly roles: ReadonlyArray<AuthenticatedRole>
}

const AUTHENTICATED_ROLES: ReadonlySet<AuthenticatedRole> = new Set(
  ROLES.filter((r): r is AuthenticatedRole => r !== 'guest'),
)

/**
 * Cookie ヘッダ文字列から `session` の値を抽出する。
 *
 * - 複数の `session` が含まれる場合は最初を採用する（決定的挙動）。
 * - `name` は case-sensitive で比較する（RFC 6265 §4.1.1 に従う）。
 * - 値の URL デコードは行わない（API-019 が opaque 文字列を発行するため）。
 */
function extractSessionCookieValue(cookieHeader: string): string | null {
  // Cookie ヘッダは "; " 区切り（厳密には "; " だが " " 有無を許容）。
  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim()
    if (trimmed.length === 0) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const name = trimmed.slice(0, eq)
    if (name !== SESSION_COOKIE_NAME) continue
    return trimmed.slice(eq + 1)
  }
  return null
}

/**
 * Cookie ヘッダから viewer を解決する純粋関数。
 *
 * @param cookieHeader Request 由来の Cookie ヘッダ文字列。`null` / `undefined` / `''` は未認証。
 * @param allowed 許可リスト（`parseAllowlist` の結果を渡す想定）。
 * @returns 許可リストに合致する場合 Viewer、そうでなければ null。
 */
export function resolveViewer(
  cookieHeader: string | null | undefined,
  allowed: ReadonlyArray<AllowedSession>,
): Viewer | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader === '') {
    return null
  }
  const value = extractSessionCookieValue(cookieHeader)
  if (value === null || value === '') return null

  const matched = allowed.find((entry) => entry.cookie_value === value)
  if (matched === undefined) return null

  return {
    user_id: matched.user_id,
    roles: matched.roles,
  }
}

/**
 * 環境変数フォーマット:
 *
 *   <cookie_value>:<user_id>:<role_csv>[;<cookie_value>:<user_id>:<role_csv>...]
 *
 * 例: `c-abc:U1:reviewer;c-xyz:U2:user,reviewer`
 *
 * - 区切りは `;`。空エントリは無視。
 * - 各エントリは `:` で 3 分割。それ以外の数のフィールドは無視。
 * - `role_csv` は DB-006 `roles` の正規表現に従う。`Role` 以外 / `guest` が
 *   1 つでも混入したエントリは丸ごと捨てる（DB-006 不変条件 2、サイレントに
 *   不正値を昇格させない）。
 * - 重複 role は除去、順序は保証しない（DB-006 m-07 整理に整合する形で
 *   `Set` 化のみ行う。アルファベット昇順ソートは authorize 層の責務とし、
 *   本モジュールでは入力順を尊重しつつ重複だけ除く）。
 *
 * Q-許可リストフォーマット: 上記は本 TASK 内での暫定。最終フォーマットは
 * Phase 5 で API-019 / DB-006 に追記候補として記録する（本 TASK では
 * 設計ドキュメントを書き換えない）。
 */
export function parseAllowlist(raw: string | undefined | null): ReadonlyArray<AllowedSession> {
  if (raw === undefined || raw === null || raw.trim() === '') return []

  const result: AllowedSession[] = []
  for (const entry of raw.split(';')) {
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue

    const parts = trimmed.split(':')
    if (parts.length !== 3) continue
    const [cookieValue, userId, roleCsv] = parts as [string, string, string]
    if (cookieValue === '' || userId === '' || roleCsv === '') continue
    if (userId.length > 128) continue

    const rawRoles = roleCsv.split(',').map((r) => r.trim())
    if (rawRoles.length === 0) continue

    const validated: AuthenticatedRole[] = []
    let invalid = false
    for (const r of rawRoles) {
      if (!AUTHENTICATED_ROLES.has(r as AuthenticatedRole)) {
        invalid = true
        break
      }
      if (!validated.includes(r as AuthenticatedRole)) {
        validated.push(r as AuthenticatedRole)
      }
    }
    if (invalid || validated.length === 0) continue

    result.push({
      cookie_value: cookieValue,
      user_id: userId,
      roles: validated,
    })
  }
  return result
}
