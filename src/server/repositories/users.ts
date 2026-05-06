// DB-006 / REQ-015 / NFR-005 / BR-AUTHZ-01 — users リポジトリ（モック認証用 / インメモリ実装）
//
// 役割:
//   - 環境変数の許可リスト（cookie_value → user_id / roles / display_name?）を起動時にパースし、
//     `findById` / `findByIdentifier` で参照できるインメモリ Repository を提供する。
//   - 書き込み（create / update / delete / patch / remove / clear / reset）は持たない。
//     DB-006 §不変条件 4: 書き込みは環境変数管理であり、API 経由の登録 UI は MVP 非対象。
//
// 不変条件:
//   - `roles` は DB-006 §不変条件 1 に従って正規化（小文字化 / ROLES 値域 / 重複除去 /
//     アルファベット昇順 / `guest` 除外）した結果のみを保持する。正規化後の roles が空の
//     エントリは丸ごと drop する（`guest` 単独 / 値域外のみ等）。
//   - `display_name` は **PII 配慮対象**（DB-006 §不変条件 3 / NFR-005）。本モジュールは
//     `User` 型に `display_name` を保持するが、**外部に出す経路では `toSafeUser()` を必ず通す**。
//     logger / API レスポンスに `User` を直接渡してはならない（呼び出し側の規約）。
//   - 重複 `user_id` は後勝ちで上書き（許可リスト管理側の責務、warn は出さない）。
//
// 環境変数フォーマット:
//
//   <cookie_value>:<user_id>:<role_csv>[:<display_name>][;<cookie_value>:<user_id>:<role_csv>[:<display_name>]...]
//
//   - 区切りは `;`。空エントリは無視。
//   - 各エントリは `:` で 3 〜 4 分割。それ以外は drop（フォーマット不正）。
//   - `role_csv` が空 / 値域外のみ / 正規化後に空になるエントリは drop。
//   - `display_name` は省略可能（4 番目のフィールドが無い場合は `null`）。`:` を `display_name`
//     に含めることはできない（フィールド分割の都合）。
//   - 本実装は `src/server/auth/session.ts` の `parseAllowlist` とは独立。session.ts は
//     3 フィールド前提で動作するため、display_name は users.ts 側で独自パースする。
//
// 参照:
//   - docs/20-detail-design/db/DB-006.md（カラム / 不変条件 / Repository export 制約）
//   - docs/02-requirements/02-functional-requirements.md REQ-015（モック認証）
//   - docs/02-requirements/03-non-functional-requirements.md NFR-005（PII 配慮）
//   - docs/02-requirements/04-business-rules.md BR-AUTHZ-01（ロール OR 合成）
//   - docs/20-detail-design/apis/API-019.md（login）

import { ROLES, type Role } from '#/lib/domain/types'

// ---------------------------------------------------------------------------
// ドメインモデル
// ---------------------------------------------------------------------------

/**
 * DB-006 users 1 行に対応するドメインモデル。
 *
 * `display_name` は PII 配慮対象（DB-006 §不変条件 3）。logger / API レスポンスに
 * 出すときは必ず `toSafeUser()` を通すこと。`User` を直接 `JSON.stringify` して
 * 外に出してはならない（型では強制できないため呼び出し側の規約）。
 *
 * `roles` は正規化済み: 小文字 / アルファベット昇順 / 重複なし / `guest` を含まない
 * （DB-006 §不変条件 1 / §不変条件 2）。
 */
export interface User {
  readonly id: string
  readonly display_name: string | null
  readonly roles: ReadonlyArray<Role>
  readonly created_at: number
  readonly updated_at: number
}

/**
 * `User` から PII（`display_name`）を除いた公開用安全表現。
 * logger / API レスポンスに渡す手前で必ず `toSafeUser()` を経由して生成する。
 */
export interface SafeUser {
  readonly id: string
  readonly roles: ReadonlyArray<Role>
}

export interface UserRepository {
  /**
   * `id` で 1 件取得。存在しなければ `null`。
   * DB-006 §不変条件 4: Repository が export する書き込み API は無く、`findById` のみが正典。
   */
  findById(id: string): Promise<User | null>

  /**
   * 識別子（cookie 値 / id / display_name のいずれか）で 1 件取得する補助メソッド。
   *
   * 優先順: id 完全一致 → cookie_value 完全一致 → display_name 完全一致。
   * 全て不在の場合は `null`。
   *
   * 主に auth flow の軽量ルックアップ用途（環境変数で渡された任意の識別子から
   * ユーザを引き当てる）を想定。本格的な認可判定は `findById` 経由で行う。
   */
  findByIdentifier(identifier: string): Promise<User | null>
}

// ---------------------------------------------------------------------------
// 許可リストパース
// ---------------------------------------------------------------------------

/**
 * 許可リスト 1 エントリ（環境変数 1 行）の正規化済み中間表現。
 * `parseUserAllowlist` の結果として返され、`createInMemoryUserRepository` が
 * `User` に変換する。
 */
export interface AllowlistEntry {
  readonly cookie_value: string
  readonly user_id: string
  readonly roles: ReadonlyArray<Role>
  readonly display_name: string | null
}

const ROLE_SET: ReadonlySet<Role> = new Set(ROLES)
const USER_ID_MAX_LENGTH = 128
const DISPLAY_NAME_MAX_LENGTH = 128

/**
 * 環境変数文字列をパースして `AllowlistEntry[]` を返す。
 *
 * フォーマット不正な行・正規化後に roles が空になる行は drop する（throw しない）。
 * 呼び出し側で `validate-and-fail-fast` したい場合は本関数の戻り値を呼び出し側で検査する。
 */
export function parseUserAllowlist(
  raw: string | undefined | null,
): ReadonlyArray<AllowlistEntry> {
  if (raw === undefined || raw === null || raw.trim() === '') return []

  const result: AllowlistEntry[] = []
  for (const segment of raw.split(';')) {
    const trimmed = segment.trim()
    if (trimmed.length === 0) continue

    const parts = trimmed.split(':')
    if (parts.length < 3 || parts.length > 4) continue

    const [cookieValue, userId, roleCsv, displayNameRaw] = parts as [
      string,
      string,
      string,
      string | undefined,
    ]
    if (cookieValue === '' || userId === '' || roleCsv === '') continue
    if (userId.length > USER_ID_MAX_LENGTH) continue

    const normalizedRoles = normalizeRoles(roleCsv)
    if (normalizedRoles.length === 0) continue

    const displayName = normalizeDisplayName(displayNameRaw)

    result.push({
      cookie_value: cookieValue,
      user_id: userId,
      roles: normalizedRoles,
      display_name: displayName,
    })
  }
  return result
}

/**
 * roles CSV を DB-006 §不変条件 1 に従って正規化する。
 *
 *   1. 小文字化
 *   2. 各要素を trim
 *   3. ROLES 値域に含まれない要素を drop
 *   4. `guest` を drop（DB-006 §不変条件 2: guest はレコードを持たない）
 *   5. Set で重複除去
 *   6. アルファベット昇順ソート（`admin < auditor < reviewer < user`）
 *
 * 結果が空配列なら呼び出し側がエントリ全体を drop する。
 */
function normalizeRoles(roleCsv: string): ReadonlyArray<Role> {
  const seen = new Set<Role>()
  for (const raw of roleCsv.split(',')) {
    const lowered = raw.trim().toLowerCase()
    if (lowered.length === 0) continue
    if (!ROLE_SET.has(lowered as Role)) continue
    if (lowered === 'guest') continue
    seen.add(lowered as Role)
  }
  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * `display_name` フィールドを正規化する。空文字列 / undefined / 過長は `null` に倒す。
 * 過長は drop（warn なし）でフォールバックさせる方が許可リストの誤りに気付きやすいため。
 */
function normalizeDisplayName(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return null
  return trimmed
}

// ---------------------------------------------------------------------------
// インメモリ実装
// ---------------------------------------------------------------------------

const FIXED_TIMESTAMP_BASE = 1_700_000_000_000

/**
 * 環境変数の生文字列から `UserRepository` を組み立てる。
 *
 *   - 内部に 3 つの Map: byId / byCookie / byDisplayName。
 *   - `display_name` が `null` のエントリは byDisplayName に登録しない。
 *   - 重複 `user_id` は後勝ちで上書き（DB-006 §m-07 整理: 許可リスト管理側の責務）。
 *   - 戻り値は `freeze` + spread copy で防御コピーする（呼び出し側の mutate を遮断）。
 *   - `created_at` / `updated_at` は構築時の `Date.now()` を採用する。テスト用途では
 *     `vi.setSystemTime` で固定可能。
 */
export function createInMemoryUserRepository(
  allowlistRaw: string | undefined | null,
): UserRepository {
  const entries = parseUserAllowlist(allowlistRaw)

  const byId = new Map<string, User>()
  const byCookie = new Map<string, User>()
  const byDisplayName = new Map<string, User>()

  const now = Date.now()

  for (const entry of entries) {
    const user: User = freeze({
      id: entry.user_id,
      display_name: entry.display_name,
      roles: Object.freeze([...entry.roles]),
      created_at: now,
      updated_at: now,
    })
    byId.set(user.id, user)
    byCookie.set(entry.cookie_value, user)
    if (user.display_name !== null) {
      byDisplayName.set(user.display_name, user)
    }
  }

  return {
    async findById(id) {
      const found = byId.get(id)
      return found === undefined ? null : clone(found)
    },

    async findByIdentifier(identifier) {
      const direct = byId.get(identifier)
      if (direct !== undefined) return clone(direct)
      const viaCookie = byCookie.get(identifier)
      if (viaCookie !== undefined) return clone(viaCookie)
      const viaName = byDisplayName.get(identifier)
      if (viaName !== undefined) return clone(viaName)
      return null
    },
  }
}

// ---------------------------------------------------------------------------
// PII フィルタ
// ---------------------------------------------------------------------------

/**
 * `User` から `display_name` を取り除いた `SafeUser` を返す。
 * logger / API レスポンスに渡す手前で必ずこの関数を呼ぶこと（NFR-005）。
 *
 * 戻り値の `Object.keys` は `['id', 'roles']` のみ。テストで強制する。
 */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    roles: user.roles,
  }
}

// ---------------------------------------------------------------------------
// Factory（テスト fixture 用）
// ---------------------------------------------------------------------------

/**
 * テスト用の `User` を 1 件生成する。
 * - デフォルトの `display_name` は `null`、`created_at` / `updated_at` は固定 epoch millis。
 * - `roles` は呼び出し側が指定する配列をそのまま採用する（呼び出し側で正規化済みの想定）。
 */
export function makeUser(
  base: { id: string; roles: ReadonlyArray<Role> },
  overrides: Partial<User> = {},
): User {
  const defaults: User = {
    id: base.id,
    display_name: null,
    roles: base.roles,
    created_at: FIXED_TIMESTAMP_BASE,
    updated_at: FIXED_TIMESTAMP_BASE,
  }
  return { ...defaults, ...overrides }
}

// ---------------------------------------------------------------------------
// 内部ヘルパ
// ---------------------------------------------------------------------------

/** 内部 state を呼び出し側の mutate から守る浅い freeze。 */
function freeze(user: User): User {
  return Object.freeze({ ...user })
}

/**
 * 戻り値を防御コピー。`as` で readonly を剥がして mutate しても内部 Map に
 * 反映されないようにする（`roles` 配列も新しい配列で返す）。
 */
function clone(user: User): User {
  return {
    id: user.id,
    display_name: user.display_name,
    roles: [...user.roles],
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}
