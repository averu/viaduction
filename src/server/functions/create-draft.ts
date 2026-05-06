// API-022 / REQ-002 / NFR-003 / NFR-006 / NFR-007 / UC-002 / UC-013
// BR-PROPOSAL-01 / BR-AUTHZ-03 — createDraft（draft 新規作成 server function）
//
// 役割:
//   - ログイン済 user 以上が新規 proposal を `draft` 状態で作成する mutation 本体。
//   - SCR-004 / SCR-005 経由のフォーム送信から呼び出される。
//   - 認可 (authorize) → 入力検証 (validate) → 永続化 (proposals.insert) の 3 段。
//
// 不変条件:
//   - `author_id` は server-side で `viewer.user_id` に強制設定する。クライアントから
//     上書き不能（`CreateDraftInput` に `author_id` フィールドを置かない）。
//   - 認可違反は AuthorizationError を上位に伝搬（呼び出し側 wrapper が 401 にマップ）。
//     本関数では catch しない。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。本関数では行わない。
//   - AuditLog 書き込みは行わない（API-022 §概要、BR-PROPOSAL-01 の「結果を変える 5 種・
//     8 操作」に含めない）。`AuditLogRepository` を依存に持たない。
//   - logger / console は本関数では呼ばない（成功時 access log は wrapper 責務、
//     失敗時 `403_reason` は authorize / csrf 側で記録される）。
//   - 副作用は `proposals.insert` のみ。
//
// 参照: docs/20-detail-design/apis/API-022.md, docs/20-detail-design/db/DB-003.md,
//       docs/02-requirements/02-functional-requirements.md REQ-002,
//       docs/02-requirements/04-business-rules.md BR-PROPOSAL-02 / BR-PROPOSAL-03

import { VISIBILITIES, type Visibility } from '#/lib/domain/types'
import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { Logger } from '#/server/observability/logger'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * createDraft の入力。`author_id` は意図的に含めない（API-022 §認可、サーバ側で
 * `viewer.user_id` に強制設定）。
 */
export interface CreateDraftInput {
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
}

/**
 * createDraft 成功時のレスポンス shape（API-022 §レスポンス）。
 * `status` / `version` はリテラル型で固定（draft 作成直後は必ず draft / 0）。
 */
export interface CreateDraftResult {
  readonly proposal_id: string
  readonly status: 'draft'
  readonly version: 0
  readonly author_id: string
  readonly created_at: number
  readonly updated_at: number
}

/**
 * 入力検証で問題があったフィールド。API-022 §4xx の `VALIDATION_ERROR` (400) に対応。
 */
export type CreateDraftValidationField = 'title' | 'body' | 'visibility'

/**
 * 入力検証エラー。HTTP マッピング（400）と error.code（VALIDATION_ERROR）は呼び出し側
 * wrapper に任せず、本例外で固定値として表現する。
 */
export class CreateDraftValidationError extends Error {
  readonly field: CreateDraftValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: CreateDraftValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'CreateDraftValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * createDraft の依存。AuditLogRepository を **意図的に持たない**（API-022 §概要、
 * BR-PROPOSAL-01）。type レベルでも audit 注入を不能にする契約。
 */
export interface CreateDraftDeps {
  readonly proposals: ProposalRepository
  /** 任意の logger 注入。本関数からは呼ばないが、将来の wrapper 連携用に入口だけ開けておく。 */
  readonly logger?: Logger
}

const TITLE_MAX_LENGTH = 200
const BODY_MAX_LENGTH = 10_000

const VISIBILITY_VALUES: ReadonlySet<Visibility> = new Set<Visibility>(VISIBILITIES)

/**
 * createDraft server function 本体。
 *
 * 順序（NFR-003 / API-022 §認可）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. authorize(viewer, 'proposal.create')
 *      - viewer === null → AuthorizationError(reason='not_authenticated', httpStatus=401)
 *      - 認証済（user / reviewer / admin / auditor いずれか）であれば通過
 *   3. 入力検証（title / body / visibility）→ CreateDraftValidationError(400)
 *   4. proposals.insert({ author_id: viewer.user_id, title, body, visibility, status: 'draft' })
 *   5. 戻り値を CreateDraftResult として整形して返す（status='draft', version=0 をリテラル化）。
 *
 * AuditLog 書き込みは行わない（UC-014 対象外、API-022 §概要）。
 */
export async function createDraft(
  viewer: Viewer | null,
  input: CreateDraftInput,
  deps: CreateDraftDeps,
): Promise<CreateDraftResult> {
  // (2) 認可: guest は AuthorizationError(401) で弾く。本関数では catch しない。
  authorize(viewer, 'proposal.create')

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    // 型ナローイングのためのガード（noUncheckedIndexedAccess + strict null checks）。
    throw new Error('unreachable: authorize must reject null viewer for proposal.create')
  }

  // (3) 入力検証: API-022 §ボディ §スキーマ + DB-003 カラム制約と整合。
  validateInput(input)

  // (4) 永続化: author_id は viewer.user_id に強制設定（クライアント上書き不能）。
  //     status は repository 側で 'draft' をデフォルト適用するが、明示する。
  //     id / created_at / updated_at / version=0 / *_at=null は repository が採番・初期化する。
  const inserted = await deps.proposals.insert({
    author_id: viewer.user_id,
    title: input.title,
    body: input.body,
    visibility: input.visibility,
    status: 'draft',
  })

  // (5) 戻り値整形: API-022 §レスポンス（201 Created）の shape に合わせる。
  //     status / version はリテラル化して、誤って submitted/approved 等が混入しないことを
  //     型レベルで保証する。version は repository 仕様で 0 が確定（DB-003 §version デフォルト）。
  if (inserted.status !== 'draft') {
    throw new Error(`assertion failed: insert returned non-draft status: ${inserted.status}`)
  }
  if (inserted.version !== 0) {
    throw new Error(
      `assertion failed: insert returned non-zero version: ${String(inserted.version)}`,
    )
  }

  return {
    proposal_id: inserted.id,
    status: 'draft',
    version: 0,
    author_id: inserted.author_id,
    created_at: inserted.created_at,
    updated_at: inserted.updated_at,
  }
}

/**
 * 入力検証本体。API-022 §ボディ §スキーマ + DB-003 §カラム の制約を満たすか検査する。
 *
 * - `title`: trim 後 1〜200 文字（空白のみは無効）
 * - `body`: trim 後 1〜10000 文字（空白のみは無効）
 * - `visibility`: VISIBILITIES enum の値（private / internal / public）
 *
 * 失敗時は `CreateDraftValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: CreateDraftInput): void {
  if (typeof input.title !== 'string') {
    throw new CreateDraftValidationError('title', 'title must be a string')
  }
  const trimmedTitle = input.title.trim()
  if (trimmedTitle.length === 0) {
    throw new CreateDraftValidationError('title', 'title must not be empty or whitespace only')
  }
  if (input.title.length > TITLE_MAX_LENGTH) {
    throw new CreateDraftValidationError(
      'title',
      `title must be at most ${String(TITLE_MAX_LENGTH)} characters`,
    )
  }

  if (typeof input.body !== 'string') {
    throw new CreateDraftValidationError('body', 'body must be a string')
  }
  const trimmedBody = input.body.trim()
  if (trimmedBody.length === 0) {
    throw new CreateDraftValidationError('body', 'body must not be empty or whitespace only')
  }
  if (input.body.length > BODY_MAX_LENGTH) {
    throw new CreateDraftValidationError(
      'body',
      `body must be at most ${String(BODY_MAX_LENGTH)} characters`,
    )
  }

  if (!VISIBILITY_VALUES.has(input.visibility)) {
    throw new CreateDraftValidationError(
      'visibility',
      `visibility must be one of: ${VISIBILITIES.join(', ')}`,
    )
  }
}
