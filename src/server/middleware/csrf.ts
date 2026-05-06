// NFR-006 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008
// API-009 / API-019 / API-020 / API-022 / API-023 — CSRF / Origin 検証ミドルウェア
//
// 役割:
//   - 全 mutation 系 server function および認証境界 (login / logout) の入口で
//     Origin / Sec-Fetch-Site を検証し、cross-site / 不一致を 403 CSRF_DENIED で弾く。
//   - 暫定統一の認可違反 404（NFR-003 / BR-AUTHZ-02）とは別概念。CSRF は authorize
//     ヘルパーをスキップする「公開バイパス」対象でも一律に適用する（API-019 m-06 整理）。
//   - 違反時のみ logger.warn に `403_reason: 'cross_site'` を記録する。成功時は無音。
//
// 不変条件:
//   - 副作用は logger.warn のみ。fetch / DB / console / 他レイヤを呼ばない。
//   - viewer に依存しない（Headers のみで判定）。認証ミドルウェア通過後・authorize 前で呼ぶ前提。
//   - 例外メッセージに PII / Origin の生 URL を含めない（NFR-005）。
//   - method の判定はしない。mutation 系のみで呼ぶ責務は呼び出し側（server function wrapper）。
//   - Workers 互換 API のみ使用（`URL` / `Headers` は Web 標準）。

import type { ErrorCode } from '#/lib/domain/types'
import { logger as defaultLogger, type Logger } from '#/server/observability/logger'

/**
 * CSRF 違反時の例外。`AuthorizationError` (TASK-006) とは別系統。
 *
 * - `httpStatus`: 403 固定
 * - `errorCode`: `'CSRF_DENIED'` 固定
 * - `reason`: `'cross_site'` 固定（logger `403_reason` と一致）
 *
 * メッセージは固定文字列。デバッグ用の Origin / Host 値は含めない（NFR-005）。
 */
export class CsrfError extends Error {
  readonly httpStatus: 403
  readonly errorCode: Extract<ErrorCode, 'CSRF_DENIED'>
  readonly reason: 'cross_site'

  constructor(message: string = 'csrf denied: cross-site request blocked') {
    super(message)
    this.name = 'CsrfError'
    this.httpStatus = 403
    this.errorCode = 'CSRF_DENIED'
    this.reason = 'cross_site'
  }
}

/**
 * CSRF 検証の入力。Headers から必要な値を抽出した結果のみを受け取る。
 *
 * - `origin`: `Origin` ヘッダ値。欠落なら `null`。
 * - `secFetchSite`: `Sec-Fetch-Site` ヘッダ値（小文字の `same-origin` 等）。欠落なら `null`。
 * - `host`: `Host` ヘッダ値。Origin host との照合に使う。欠落なら `null`。
 * - `requestId` / `route` / `method`: 観測ログに乗せる任意のメタ情報。
 */
export interface CsrfCheckInput {
  readonly origin: string | null
  readonly secFetchSite: string | null
  readonly host: string | null
  readonly requestId?: string
  readonly route?: string
  readonly method?: string
}

/**
 * `verifyCsrf` のオプション。テスト時に stub logger を差し替えるための窓口。
 */
export interface VerifyCsrfOptions {
  readonly logger?: Logger
}

/**
 * Sec-Fetch-Site の取りうる値。`same-origin` のみが通過、それ以外は拒否扱い。
 *
 * `same-site`（同一登録可能ドメインの別オリジン）も本プロジェクトでは厳密に
 * 同一オリジン要求のため拒否する（NFR-006 / API 各仕様の `same-origin` 一致記述に従う）。
 */
type SecFetchSiteValue =
  | 'same-origin'
  | 'same-site'
  | 'cross-site'
  | 'cross-origin'
  | 'none'

const SEC_FETCH_SITE_VALUES: ReadonlySet<SecFetchSiteValue> = new Set<SecFetchSiteValue>([
  'same-origin',
  'same-site',
  'cross-site',
  'cross-origin',
  'none',
])

/**
 * CSRF 検証本体。
 *
 * 判定順:
 *   1. `Sec-Fetch-Site === 'same-origin'` → 通過（最も信頼できる Fetch Metadata）
 *   2. `Sec-Fetch-Site` が `cross-site` / `cross-origin` / `none` / `same-site` →
 *      拒否（同一オリジン以外と判明したため）
 *   3. `Sec-Fetch-Site` が欠落 / 想定外文字列 → Origin fallback:
 *      - `origin` 欠落 → 拒否
 *      - `host` 欠落 → 拒否
 *      - `URL(origin).host !== host` → 拒否
 *      - 一致 → 通過
 *
 * 違反時は `logger.warn({ '403_reason': 'cross_site', ... })` を 1 行記録してから
 * `CsrfError` を throw する。成功時は副作用なし。
 *
 * @throws {@link CsrfError} 違反時。
 */
export function verifyCsrf(
  input: CsrfCheckInput,
  options: VerifyCsrfOptions = {},
): void {
  const log = options.logger ?? defaultLogger

  const sec = input.secFetchSite
  if (sec === 'same-origin') {
    return
  }

  if (sec !== null && SEC_FETCH_SITE_VALUES.has(sec as SecFetchSiteValue)) {
    // sec は same-origin 以外の既知値（same-site / cross-site / cross-origin / none）。拒否。
    denyAndThrow(log, input)
  }

  if (sec !== null) {
    // 不明な Sec-Fetch-Site 値は信頼できない。Origin fallback も行わず拒否する。
    denyAndThrow(log, input)
  }

  // Sec-Fetch-Site 欠落 → Origin / Host fallback
  const origin = input.origin
  const host = input.host
  if (origin === null || host === null) {
    denyAndThrow(log, input)
  }

  const originHost = parseOriginHost(origin)
  if (originHost === null || originHost !== host) {
    denyAndThrow(log, input)
  }
}

/**
 * `Request` から CSRF 検証に必要な Headers を抽出する薄いアダプタ。
 *
 * 呼び出し側 (server function wrapper) では本関数を使うのが楽。Headers 抽出後の
 * 検証ロジックは {@link verifyCsrf} に委譲する。
 *
 * @throws {@link CsrfError} 違反時。
 */
export function csrfCheckFromRequest(
  req: Request,
  options: VerifyCsrfOptions & { readonly requestId?: string; readonly route?: string } = {},
): void {
  const headers = req.headers
  const origin = headers.get('origin')
  const secFetchSite = headers.get('sec-fetch-site')
  const host = headers.get('host')

  verifyCsrf(
    {
      origin,
      secFetchSite,
      host,
      requestId: options.requestId,
      route: options.route,
      method: req.method,
    },
    { logger: options.logger },
  )
}

/**
 * 拒否時の共通処理: logger.warn に 1 行記録してから CsrfError を投げる。
 *
 * payload は LogFields ホワイトリストの範囲のみ。Origin / Host の生値は載せない
 * （PII 配慮 + ホワイトリスト外キーは logger sanitizer が drop するため）。
 */
function denyAndThrow(log: Logger, input: CsrfCheckInput): never {
  log.warn({
    '403_reason': 'cross_site',
    error_code: 'CSRF_DENIED',
    request_id: input.requestId,
    route: input.route,
    method: input.method,
  })
  throw new CsrfError()
}

/**
 * `Origin` ヘッダ値から host 部分（hostname + 必要なら port）を抽出する。
 *
 * Origin はスキーム + host(:port) の形式。`URL` で安全にパースし、解析失敗時は null を返す。
 * `URL.host` は port 付きを返すため `Host` ヘッダとの直接比較に使える。
 */
function parseOriginHost(origin: string): string | null {
  if (origin.length === 0) return null
  try {
    const url = new URL(origin)
    if (url.host.length === 0) return null
    return url.host
  } catch {
    return null
  }
}
