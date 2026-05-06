// API-023 / REQ-002 / REQ-010 / REQ-015 / NFR-003 / NFR-006 / NFR-007 / UC-002 / UC-013
// BR-PROPOSAL-01 / BR-AUTHZ-03 / BR-REVIEW-02 — updateDraft（draft 本文編集 server function）
//
// 役割:
//   - 投稿者本人が `status='draft'` の proposal を部分編集する mutation 本体。
//   - SCR-004 / SCR-006 経由の編集導線から呼び出される。
//   - 認可 (authorize) → status 検査 → 入力検証 → 楽観ロック UPDATE の 4 段。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'proposal.update', { kind: 'proposal', author_id })` の単一エントリ
//     経由（BR-AUTHZ-03）。owner 不一致は `not_owner_resource` (404) に正規化される。
//   - 対象 proposal が存在しない場合も「リソース存在隠蔽」の暫定統一に従い 404 を返す。
//     具体的には `author_id` に到達不能な特殊値を渡し、authorize 側で `not_owner_resource`
//     (404) として扱わせる（API-023 §認可、§4xx）。
//   - `existing.status !== 'draft'` の場合は `UpdateDraftStateError` (422 BUSINESS_RULE_VIOLATION)。
//     DB-003 §不変条件 3（submitted 以降の本文編集禁止）を server function 層で強制する。
//   - 楽観ロック失敗（`ProposalLockError`）は本関数では catch せずに伝搬する（呼び出し側
//     wrapper が 409 CONFLICT にマップ、BR-REVIEW-02）。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - AuditLog 書き込みは行わない（API-023 §概要、BR-PROPOSAL-01 の「結果を変える 5 種・
//     8 操作」に含めない）。`AuditLogRepository` を依存に持たない。
//   - logger / console は本関数では呼ばない（成功時 access log は wrapper 責務、
//     失敗時 `403_reason` は authorize / csrf 側で記録される）。
//   - 副作用は `proposals.findById` (read) と `proposals.updateWithLock` (write) のみ。
//
// 参照: docs/20-detail-design/apis/API-023.md, docs/20-detail-design/db/DB-003.md,
//       docs/02-requirements/04-business-rules.md BR-REVIEW-02 / BR-PROPOSAL-01

import { VISIBILITIES, type ProposalStatus, type Visibility } from '#/lib/domain/types'
import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { Logger } from '#/server/observability/logger'
import type { ProposalRepository, ProposalUpdate } from '#/server/repositories/proposals'

/**
 * updateDraft の入力（部分更新）。
 *
 * - `title` / `body` / `visibility` は **指定されたフィールドのみ** 更新対象（API-023 §ボディ）。
 * - `expected_version` は楽観ロックのため **必須**（省略時は 400 VALIDATION_ERROR）。
 *
 * `proposal_id` / `author_id` は本入力に含めない。`proposalId` は引数で渡し、`author_id`
 * は server-side で `viewer.user_id` と既存 row の `author_id` を比較するため、クライアント
 * からの上書きを受け付けない。
 */
export interface UpdateDraftInput {
  readonly title?: string
  readonly body?: string
  readonly visibility?: Visibility
  readonly expected_version: number
}

/**
 * updateDraft 成功時のレスポンス（API-023 §200 OK）。
 *
 * `status` は draft のリテラル型として固定。draft 編集後は必ず draft のまま（status 遷移は
 * 行わない、submit は別 API）。
 */
export interface UpdateDraftResult {
  readonly proposal_id: string
  readonly status: 'draft'
  readonly version: number
  readonly updated_at: number
}

/**
 * 入力検証で問題があったフィールド。API-023 §4xx の `VALIDATION_ERROR` (400) に対応。
 */
export type UpdateDraftValidationField = 'title' | 'body' | 'visibility' | 'expected_version'

/**
 * 入力検証エラー。HTTP マッピング（400）と error.code（VALIDATION_ERROR）は本例外で
 * 固定値として表現する（呼び出し側 wrapper はこれを見て 400 にマップする）。
 */
export class UpdateDraftValidationError extends Error {
  readonly field: UpdateDraftValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: UpdateDraftValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'UpdateDraftValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * status != 'draft' で更新を試みた場合のエラー。
 *
 * DB-003 §不変条件 3（submitted 以降の本文編集禁止）に違反する操作を受け付けない。
 * HTTP 422 / `error.code = BUSINESS_RULE_VIOLATION` にマップする（API-023 §4xx 補足、
 * 暫定統一の業務ルール違反コード）。
 *
 * 本エラーは「本人 + 対象が存在」のときに限り発生する。所有者不一致 / 不在は
 * `AuthorizationError(404)` 側で隠蔽されるため、本エラーが leak しても `currentStatus` は
 * 自分の draft 以外の状態を晒さない。
 */
export class UpdateDraftStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly currentStatus: ProposalStatus

  constructor(currentStatus: ProposalStatus, message?: string) {
    super(message ?? `proposal is not in draft state: current=${currentStatus}`)
    this.name = 'UpdateDraftStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.currentStatus = currentStatus
  }
}

/**
 * updateDraft の依存。AuditLogRepository を **意図的に持たない**（API-023 §概要、
 * BR-PROPOSAL-01）。type レベルでも audit 注入を不能にする契約。
 */
export interface UpdateDraftDeps {
  readonly proposals: ProposalRepository
  /** 任意の logger 注入。本関数からは呼ばないが、将来の wrapper 連携用に入口だけ開けておく。 */
  readonly logger?: Logger
}

const TITLE_MAX_LENGTH = 200
const BODY_MAX_LENGTH = 10_000

const VISIBILITY_VALUES: ReadonlySet<Visibility> = new Set<Visibility>(VISIBILITIES)

/**
 * 不在 proposal を 404 に集約するため authorize() に渡す sentinel author_id。
 * UUID v7 の format に合致しない値を選び、衝突可能性を排除する。
 *
 * `viewer.user_id` がたまたまこの値になることは無い（許可リストの user_id は
 * DB-006 形式に従う opaque ID）。
 */
const NONEXISTENT_AUTHOR_SENTINEL = '__nonexistent_proposal_author__'

/**
 * updateDraft server function 本体。
 *
 * 順序（NFR-003 / API-023 §認可）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在 → authorize() を sentinel author_id で呼び出し 404 not_owner_resource に集約
 *   3. authorize(viewer, 'proposal.update', { kind: 'proposal', author_id: existing.author_id })
 *      - viewer === null → 401 not_authenticated
 *      - viewer.user_id !== existing.author_id → 404 not_owner_resource
 *   4. existing.status !== 'draft' → UpdateDraftStateError(422, currentStatus)
 *   5. 入力検証（title? / body? / visibility? / expected_version 必須）
 *   6. proposals.updateWithLock(proposalId, expected_version, patch)
 *      - 楽観ロック失敗 → ProposalLockError を伝搬（呼び出し側 wrapper が 409 にマップ）
 *   7. 戻り値を UpdateDraftResult として整形（status='draft' をリテラル固定）。
 *
 * AuditLog 書き込みは行わない（UC-014 対象外、API-023 §概要）。
 */
export async function updateDraft(
  viewer: Viewer | null,
  proposalId: string,
  input: UpdateDraftInput,
  deps: UpdateDraftDeps,
): Promise<UpdateDraftResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は authorize() を sentinel author_id で呼び 404 に正規化する。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    // viewer === null（未認証）→ 401, 認証済 → 404 not_owner_resource。
    // これは authorize の通常パスで自然に発生する（sentinel author_id は誰の user_id とも
    // 一致しないため）。本関数で直接 throw せず、認可レイヤに集約する（BR-AUTHZ-03）。
    authorize(viewer, 'proposal.update', {
      kind: 'proposal',
      author_id: NONEXISTENT_AUTHOR_SENTINEL,
    })
    // unreachable: authorize() が必ず throw する。型安全のためのガード。
    throw new Error('unreachable: authorize must reject when proposal is missing')
  }

  // (3) 認可: 認証済 + 本人一致をワンショットで検査。owner 不一致は 404 not_owner_resource。
  authorize(viewer, 'proposal.update', {
    kind: 'proposal',
    author_id: existing.author_id,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for proposal.update')
  }

  // (4) status 検査: DB-003 §不変条件 3（submitted 以降の本文編集禁止）。
  //     authorize で本人一致が確定しているため、currentStatus を返しても他人の状態は漏れない。
  if (existing.status !== 'draft') {
    throw new UpdateDraftStateError(existing.status)
  }

  // (5) 入力検証: API-023 §ボディ §スキーマ + DB-003 カラム制約と整合（部分更新）。
  validateInput(input)

  // (6) 楽観ロック UPDATE（BR-REVIEW-02）。
  //     patch には input で **指定されたフィールドのみ** を載せる。undefined を載せると
  //     ProposalUpdate の `?:` 仕様上は問題ないが、repository の applyPatch が `undefined`
  //     をスキップする契約に揃えるためフィールドが存在する場合のみ assign する。
  const patch: ProposalUpdate = {}
  if (input.title !== undefined) (patch as { title?: string }).title = input.title
  if (input.body !== undefined) (patch as { body?: string }).body = input.body
  if (input.visibility !== undefined) {
    ;(patch as { visibility?: Visibility }).visibility = input.visibility
  }

  const updated = await deps.proposals.updateWithLock(
    proposalId,
    input.expected_version,
    patch,
  )

  // (7) 戻り値整形: API-023 §200 OK の shape。status='draft' リテラル固定。
  //     updateWithLock は status 遷移を伴わない（patch.status を載せていない）ため、
  //     更新後 status は必ず 'draft' のまま。型を絞り込むためアサーションを行う。
  if (updated.status !== 'draft') {
    throw new Error(
      `assertion failed: updateWithLock returned non-draft status: ${updated.status}`,
    )
  }

  return {
    proposal_id: updated.id,
    status: 'draft',
    version: updated.version,
    updated_at: updated.updated_at,
  }
}

/**
 * 入力検証本体。API-023 §ボディ §スキーマ + DB-003 §カラム の制約を満たすか検査する。
 *
 * - `title`: 指定された場合のみ。trim 後 1〜200 文字（空白のみは無効）。
 * - `body`: 指定された場合のみ。trim 後 1〜10000 文字（空白のみは無効）。
 * - `visibility`: 指定された場合のみ。VISIBILITIES enum の値。
 * - `expected_version`: 必須。非負整数（safe integer）。
 *
 * 失敗時は `UpdateDraftValidationError(field)` を throw する（HTTP 400）。
 *
 * 全フィールド未指定でも `expected_version` のみで no-op UPDATE は許容（API-023 §バリデー
 * ション規約）。その場合 `version` は +1 / `updated_at` のみ更新される。
 */
function validateInput(input: UpdateDraftInput): void {
  // expected_version: 必須・非負整数・safe integer。
  if (typeof input.expected_version !== 'number') {
    throw new UpdateDraftValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new UpdateDraftValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new UpdateDraftValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new UpdateDraftValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  // title: 指定時のみ検証。
  if (input.title !== undefined) {
    if (typeof input.title !== 'string') {
      throw new UpdateDraftValidationError('title', 'title must be a string')
    }
    const trimmed = input.title.trim()
    if (trimmed.length === 0) {
      throw new UpdateDraftValidationError(
        'title',
        'title must not be empty or whitespace only',
      )
    }
    if (input.title.length > TITLE_MAX_LENGTH) {
      throw new UpdateDraftValidationError(
        'title',
        `title must be at most ${String(TITLE_MAX_LENGTH)} characters`,
      )
    }
  }

  // body: 指定時のみ検証。
  if (input.body !== undefined) {
    if (typeof input.body !== 'string') {
      throw new UpdateDraftValidationError('body', 'body must be a string')
    }
    const trimmed = input.body.trim()
    if (trimmed.length === 0) {
      throw new UpdateDraftValidationError(
        'body',
        'body must not be empty or whitespace only',
      )
    }
    if (input.body.length > BODY_MAX_LENGTH) {
      throw new UpdateDraftValidationError(
        'body',
        `body must be at most ${String(BODY_MAX_LENGTH)} characters`,
      )
    }
  }

  // visibility: 指定時のみ検証。
  if (input.visibility !== undefined) {
    if (!VISIBILITY_VALUES.has(input.visibility)) {
      throw new UpdateDraftValidationError(
        'visibility',
        `visibility must be one of: ${VISIBILITIES.join(', ')}`,
      )
    }
  }
}
