// API-019 / REQ-015 / NFR-005 / NFR-006 / UC-018 / DB-006
// — login（モック認証ログイン server function、公開バイパス）
//
// 役割:
//   - `user_identifier` を受け、環境変数由来の許可リスト（cookie_value で索引）と
//     UserRepository を照合して、認証 cookie 文字列と PII フィルタ済の SafeUser を返す
//     純粋関数を提供する。
//   - 「Set-Cookie ヘッダの送出」「CSRF 検証」「access log」は呼び出し側 wrapper の責務。
//     本関数はテスト容易性と単一責任のため cookie 文字列の **生成** までで止める。
//
// 不変条件:
//   - 公開バイパス対象（API-019 §認可、UC-013 認可境界の対象外）。本関数では `authorize`
//     を呼ばない。BR-AUTHZ-03 の適用範囲外（同 BR は authorize 通過 server function に
//     対するルール）。
//   - CSRF 検証は loader / server function の **呼び出し側 wrapper** で実施される
//     （API-019 §"公開バイパスと CSRF 検証は独立"、m-06 整理）。本関数は CSRF を検証しない。
//   - 許可リスト外 / 入力不正 は `LoginAuthError` (HTTP 401, code=UNAUTHENTICATED) で throw。
//     エラーメッセージは「許可リストにあるかどうか」を漏らさない統一文言で返す
//     （API-019 §4xx 末尾、タイミング攻撃対策の最低線）。
//   - 戻り値の `user` は **必ず `toSafeUser()` を経由** し、`display_name` を含めない
//     （NFR-005、DB-006 §不変条件 3）。User をそのまま外に出さない。
//   - 副作用は読み取りのみ（UserRepository.findByIdentifier 1 回）。logger / console は
//     呼ばない（成功時 access log は wrapper、失敗時の `403_reason` は CSRF / 上位の責務）。
//
// 参照: docs/20-detail-design/apis/API-019.md（§リクエスト / §レスポンス / §Set-Cookie /
//       §認可拒否時の挙動）、docs/20-detail-design/db/DB-006.md、
//       docs/02-requirements/02-functional-requirements.md REQ-015、
//       docs/02-requirements/03-non-functional-requirements.md NFR-005 / NFR-006

import {
  parseAllowlist,
  SESSION_COOKIE_NAME,
  type AllowedSession,
} from '#/server/auth/session'
import {
  toSafeUser,
  type SafeUser,
  type UserRepository,
} from '#/server/repositories/users'

/**
 * login の入力。`user_identifier` は API-019 §リクエストで定義された不透明 ID。
 *
 * 本実装では「許可リストの `cookie_value` に完全一致する識別子」として解釈する。
 * これは API-019 §リクエスト「許可リストの key と照合」の最も単純な解釈であり、
 * かつ session.ts (TASK-005) の `resolveViewer` が cookie 値を `cookie_value` で
 * 突合する構造と整合する（成功時に発行する session 値をそのまま `user_identifier`
 * として再利用できる）。
 */
export interface LoginInput {
  readonly user_identifier: string
}

/**
 * login 成功時のレスポンス（API-019 §レスポンス + §Set-Cookie に対応）。
 *
 * - `user`: 公開用安全表現。`display_name` を含まない（NFR-005）。HTTP レスポンス body
 *   の組み立ては呼び出し側 wrapper の責務（API-019 §レスポンス §200 OK は `display_name`
 *   を「表示専用」として返してよい一方、loader 出力としては PII を持たせない方針）。
 * - `set_cookie`: `Set-Cookie:` ヘッダの値そのもの。ヘッダ名は含まない。
 *   wrapper はこれを HTTP レスポンスの `Set-Cookie` ヘッダにそのまま設定する。
 */
export interface LoginResult {
  readonly user: SafeUser
  readonly set_cookie: string
}

/**
 * login の認証エラー。HTTP 401 / `UNAUTHENTICATED` に固定でマップされる
 * （API-019 §4xx）。`reason` は内部用（logger 用）であり、ユーザに見せる
 * メッセージとして使ってはならない（タイミング攻撃対策の統一文言）。
 */
export class LoginAuthError extends Error {
  readonly httpStatus: 401 = 401
  readonly errorCode: 'UNAUTHENTICATED' = 'UNAUTHENTICATED'
  readonly reason: 'unknown_identifier' | 'invalid_input'

  constructor(reason: 'unknown_identifier' | 'invalid_input', message?: string) {
    super(message ?? `login failed: ${reason}`)
    this.name = 'LoginAuthError'
    this.reason = reason
  }
}

/**
 * login の依存。
 *
 * - `users`: UserRepository（TASK-012）。`findByIdentifier(allowedSession.user_id)` で
 *   許可リストと整合した User を引き当てる。
 * - `allowlistRaw`: 環境変数 `AUTH_ALLOWLIST` の生文字列。`session.ts.parseAllowlist` で
 *   `cookie_value -> user_id` の対応を取り出す。`users` 構築時のものと同一の文字列を
 *   渡すこと（呼び出し側で同期させる責務）。
 * - `isProduction`: 真なら Set-Cookie に `Secure` を付ける。`undefined` / `false` は
 *   開発環境（http 検証可）。デフォルト `false`（本番では明示的に `true` を渡す）。
 */
export interface LoginDeps {
  readonly users: UserRepository
  readonly allowlistRaw: string | undefined | null
  readonly isProduction?: boolean
}

/**
 * 認証 cookie 文字列を組み立てる（API-019 §Set-Cookie）。
 *
 *   session=<value>; Path=/; HttpOnly; SameSite=Lax[; Secure]
 *
 * - `Path` / `HttpOnly` / `SameSite` は `SESSION_COOKIE_ATTRIBUTES`（session.ts）と
 *   等価な値を出力する。属性順は RFC 6265 §4.1 上は意味を持たないが、テストの
 *   等価性比較を簡潔にするため「Path → HttpOnly → SameSite → Secure」で固定する。
 * - `Max-Age` は API-019 で「3600 秒（暫定）」とされているが、TASK-032 の完了条件には
 *   含まれず、Phase 5 の確定事項（API-019 §Set-Cookie の Max-Age 行）に従って後続
 *   TASK で追加するものとする（本 TASK では設計差し戻しの根拠が無いため見送り）。
 */
function buildSessionCookie(value: string, isProduction: boolean): string {
  const parts: string[] = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (isProduction) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/**
 * login server function 本体。
 *
 * フロー（API-019 §認可拒否時の挙動 / §副作用）:
 *
 *   1. 入力検証: `user_identifier` が空 / whitespace-only なら invalid_input で 401。
 *      （API-019 §4xx 上は 400 VALIDATION_ERROR だが、本関数は wrapper でのマッピング
 *      に備え reason を持つ 401 で統一し、メッセージ漏洩を避ける。HTTP コードの
 *      上書きは呼び出し側 wrapper の判断とする。本実装は現状 401 で固定。）
 *   2. 許可リスト照合: `parseAllowlist` で `AllowedSession[]` を取得し、
 *      `cookie_value === user_identifier` のエントリを探す。
 *      不在なら unknown_identifier で 401。
 *   3. UserRepository ルックアップ: `findByIdentifier(allowedSession.user_id)`。
 *      不在（許可リストと users の整合性が崩れている）なら unknown_identifier で 401。
 *      ※ session.ts と users.ts は別のパーサ（前者 3 フィールド、後者 4 フィールド）で
 *         動くため、display_name 付きの行で role 値域違反等があると不整合が発生し得る。
 *         この経路は表に出さず 401 に倒す。
 *   4. cookie 文字列組み立て: `buildSessionCookie(user_identifier, isProduction)`。
 *      `user_identifier` は許可リストの `cookie_value` と等しいため、そのまま session
 *      値として再利用できる（次回リクエストで `resolveViewer` が同じエントリにヒット）。
 *   5. 戻り値: `{ user: toSafeUser(user), set_cookie }`。`user` は PII 除外済。
 *
 * 入力 trim はしない（API-019 §バリデーション規約「1〜128 文字」の範囲判定にのみ
 * 用いる）。前後空白を含む `cookie_value` は許可リスト側で意図して使われている可能性
 * があるため、許可リストとの完全一致比較に任せる。
 */
export async function login(
  input: LoginInput,
  deps: LoginDeps,
): Promise<LoginResult> {
  const identifier = input.user_identifier
  if (typeof identifier !== 'string' || identifier.trim().length === 0) {
    throw new LoginAuthError('invalid_input')
  }

  const allowed = parseAllowlist(deps.allowlistRaw)
  const matched: AllowedSession | undefined = allowed.find(
    (entry) => entry.cookie_value === identifier,
  )
  if (matched === undefined) {
    throw new LoginAuthError('unknown_identifier')
  }

  const user = await deps.users.findByIdentifier(matched.user_id)
  if (user === null) {
    throw new LoginAuthError('unknown_identifier')
  }

  const setCookie = buildSessionCookie(identifier, deps.isProduction === true)

  return {
    user: toSafeUser(user),
    set_cookie: setCookie,
  }
}
