// NFR-005 / NFR-007 / BR-AUTHZ-03 — 構造化ログのホワイトリストラッパ
//
// 役割:
//   - `src/server/**` から呼び出される唯一の logger エントリポイント。
//   - 許可フィールド（closed set）のみを構造化 JSON で出力する。
//   - PII（投稿本文 / reason テキスト / メール 等）は型レベルで排除し、
//     万一 runtime で混入した場合も sanitizer が drop / [REDACTED:pii] に置換する。
//
// ADR 例外（NFR-005 AC「ADR で例外が記録されていることのみ許容」）:
//   本ファイルは `console.*` API を集約的に呼び出す唯一のモジュールである。
//   他のファイルから `console.log` / `console.info` / `console.warn` / `console.error`
//   を呼んではならない（CI grep TASK-054 で 0 件強制予定）。
//
// 不変条件:
//   - `LogFields` の interface に存在しないキーは silent drop（throw しない / warn しない）。
//   - `403_reason` / `error_code` の値が closed set 外なら当該キーを drop。
//   - email / 改行 / 200 文字超 を含む `message` は `[REDACTED:pii]` に置換。
//   - `user_id_hash` は SHA-256 hex 想定で 64 文字 hex のみ許容、それ以外は drop。
//   - 副作用は `consoleSink.emit` 内の `console.*` 呼び出しのみ（NFR-002 Workers 互換）。

import { ERROR_CODES, type ErrorCode } from '#/lib/domain/types'
import type { DenyReason } from '#/server/auth/authorize'

/**
 * 認可拒否 / CSRF 拒否の事由コード。
 *
 * - `not_authenticated` / `insufficient_role` / `not_owner` / `not_owner_resource`:
 *   `AuthorizationError.reason` (TASK-006) と一致。
 * - `cross_site`: CSRF / Origin 検証ミドルウェア (TASK-008) 由来。
 */
export type Reason403 = DenyReason | 'cross_site'

const REASON_403_VALUES: ReadonlySet<Reason403> = new Set<Reason403>([
  'not_authenticated',
  'insufficient_role',
  'not_owner',
  'not_owner_resource',
  'cross_site',
])

const ERROR_CODE_VALUES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(ERROR_CODES)

const HTTP_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])

const USER_ID_HASH_RE = /^[0-9a-f]{64}$/
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
const REDACTED_PII = '[REDACTED:pii]'
const MESSAGE_MAX_LENGTH = 200
const ISO8601_NEEDS_FORMAT = /^\d{4}-\d{2}-\d{2}T/

/**
 * logger に渡せる許可フィールドの closed set。
 *
 * NFR-007 必須フィールド + NFR-005 AC の追加フィールドを統合。本 interface
 * に存在しないキーは型エラーとなり、runtime でも sanitizer が drop する。
 */
export interface LogFields {
  /** ISO8601 文字列。未指定なら logger が `new Date().toISOString()` を付与する（NFR-007）。 */
  readonly timestamp?: string
  /** 1 リクエストを通じて一貫する trace 用識別子。 */
  readonly request_id?: string
  /** ルートパス。例: `'/api/proposals/:id/submit'`。 */
  readonly route?: string
  /** HTTP メソッド。`GET` / `HEAD` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS`。 */
  readonly method?: string
  /** HTTP status code。100-599 の整数。 */
  readonly status?: number
  /** 処理時間 (ms)。負値・非有限値は drop。 */
  readonly latency_ms?: number
  /** PII でないユーザ識別子の SHA-256 hex（64 文字）。それ以外は drop（glossary `user_id_hash`）。 */
  readonly user_id_hash?: string
  /** 401 / 403 / 404 拒否事由コード。closed set 外は drop（glossary `403_reason`）。 */
  readonly '403_reason'?: Reason403
  /** 投稿 ID。PII 非該当の不透明 ID 想定。 */
  readonly proposal_id?: string
  /** 監査ログエントリ ID。PII 非該当の不透明 ID 想定。 */
  readonly audit_log_id?: string
  /** action 識別子。例: `'proposal.submit'`。 */
  readonly action?: string
  /** API レスポンスの error.code。closed set 外は drop。 */
  readonly error_code?: ErrorCode
  /** 開発者向け短い message。PII を含めない契約。違反時は `[REDACTED:pii]` に置換。 */
  readonly message?: string
}

/**
 * 出力先抽象。テストで stub に差し替え可能。
 */
export interface LogSink {
  emit(level: LogLevel, json: string): void
}

export type LogLevel = 'info' | 'warn' | 'error'

/**
 * デフォルト sink。本ファイル外で `console.*` を呼ばないため、ここに集約する。
 */
export const consoleSink: LogSink = {
  emit(level, json) {
    if (level === 'info') {
      console.log(json)
      return
    }
    if (level === 'warn') {
      console.warn(json)
      return
    }
    console.error(json)
  },
}

export interface Logger {
  info(fields: LogFields): void
  warn(fields: LogFields): void
  error(fields: LogFields): void
}

/**
 * sink を差し替えられる factory。テストで stub sink を渡す用途。
 */
export function createLogger(sink: LogSink = consoleSink): Logger {
  return {
    info(fields) {
      sink.emit('info', serialize(fields))
    },
    warn(fields) {
      sink.emit('warn', serialize(fields))
    },
    error(fields) {
      sink.emit('error', serialize(fields))
    },
  }
}

/**
 * モジュール読み込み時に作られる default logger（`consoleSink` 利用）。
 * `src/server/**` からはこの `logger` を import して使う。
 */
export const logger: Logger = createLogger(consoleSink)

/**
 * `LogFields` を sanitize し、JSON 文字列に整形する。
 *
 * - `timestamp` 未指定なら `new Date().toISOString()` を付与（NFR-007 必須フィールド）。
 * - `LogFields` interface に無いキー（例: `body` / `email` / `password`）は silent drop。
 * - `403_reason` / `error_code` が closed set 外なら drop。
 * - `message` が email / 改行含み / 200 文字超のいずれかに該当すれば `[REDACTED:pii]`。
 * - `user_id_hash` が 64 文字 hex でなければ drop。
 */
function serialize(fields: LogFields): string {
  const out: Record<string, unknown> = {}

  const timestamp = pickIso8601(fields.timestamp) ?? new Date().toISOString()
  out.timestamp = timestamp

  if (typeof fields.request_id === 'string' && fields.request_id.length > 0) {
    out.request_id = fields.request_id
  }
  if (typeof fields.route === 'string' && fields.route.length > 0) {
    out.route = fields.route
  }
  if (typeof fields.method === 'string' && HTTP_METHODS.has(fields.method)) {
    out.method = fields.method
  }
  if (
    typeof fields.status === 'number' &&
    Number.isInteger(fields.status) &&
    fields.status >= 100 &&
    fields.status <= 599
  ) {
    out.status = fields.status
  }
  if (
    typeof fields.latency_ms === 'number' &&
    Number.isFinite(fields.latency_ms) &&
    fields.latency_ms >= 0
  ) {
    out.latency_ms = fields.latency_ms
  }
  if (
    typeof fields.user_id_hash === 'string' &&
    USER_ID_HASH_RE.test(fields.user_id_hash)
  ) {
    out.user_id_hash = fields.user_id_hash
  }
  if (
    typeof fields['403_reason'] === 'string' &&
    REASON_403_VALUES.has(fields['403_reason'] as Reason403)
  ) {
    out['403_reason'] = fields['403_reason']
  }
  if (typeof fields.proposal_id === 'string' && fields.proposal_id.length > 0) {
    out.proposal_id = fields.proposal_id
  }
  if (typeof fields.audit_log_id === 'string' && fields.audit_log_id.length > 0) {
    out.audit_log_id = fields.audit_log_id
  }
  if (typeof fields.action === 'string' && fields.action.length > 0) {
    out.action = fields.action
  }
  if (
    typeof fields.error_code === 'string' &&
    ERROR_CODE_VALUES.has(fields.error_code as ErrorCode)
  ) {
    out.error_code = fields.error_code
  }
  const message = sanitizeMessage(fields.message)
  if (message !== undefined) {
    out.message = message
  }

  return JSON.stringify(out)
}

function pickIso8601(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!ISO8601_NEEDS_FORMAT.test(value)) return undefined
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return undefined
  return value
}

function sanitizeMessage(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length === 0) return undefined
  if (
    value.length > MESSAGE_MAX_LENGTH ||
    value.includes('\n') ||
    value.includes('\r') ||
    EMAIL_RE.test(value)
  ) {
    return REDACTED_PII
  }
  return value
}
