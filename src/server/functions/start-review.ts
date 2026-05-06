// API-003 / REQ-003 / REQ-010 / REQ-011 / NFR-003 / NFR-004 / NFR-005 / NFR-006 /
// NFR-007 / UC-003 / UC-013 / UC-014 / BR-PROPOSAL-01 / BR-REVIEW-01 / BR-REVIEW-02 /
// BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 / BR-AUTHZ-03 —
// startReview（担当開始 server function）
//
// 役割:
//   - reviewer / admin が `submitted` 状態の提案を `in_review` に遷移させ、自身を
//     assignee として登録する mutation。同時担当化は楽観ロックで 1 名のみ成功する
//     （BR-REVIEW-02 / API-003 §409）。reason 必須（BR-REVIEW-01）。
//   - 認可 (authorize) → 入力検証 → status 検査 → proposals CAS UPDATE → AuditLog
//     append の 5 段。submit (API-002) と類似だが PolicyAgreement の生成は伴わない。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'review.start', { kind:'proposal', author_id, visibility })`
//     の単一エントリ経由（BR-AUTHZ-03）。authorize は ProposalResource を要求するため
//     resource を必ず渡す（reviewer + private は Q-016 暫定で 404 insufficient_role）。
//   - 不在 proposal は 404 に正規化する（API-003 §認可拒否「proposal 不在 → 404」）。
//     viewer === null（cookie なし）は 401 not_authenticated を優先する（暫定統一の
//     「未認証 401 / 認可違反 404」、BR-AUTHZ-02）。authorize 経由ではなく直接
//     AuthorizationError を throw する（authorize の `review.start` は author_id を
//     見ないため、sentinel 経由では 404 に到達しない / かつ 200 通過してしまうため）。
//   - reason は trim 後 1〜4,000 文字。空 / 空白のみ / 長すぎは 400 で停止し
//     AuditLog 記録なし（BR-REVIEW-01 / DB-004 §reason / API-003 §400）。
//   - status != 'submitted' は 422 BUSINESS_RULE_VIOLATION（API-003 §422、
//     DB-003 §不変条件 1 の遷移 #3）。AuditLog 記録なし。
//   - 楽観ロック失敗（`ProposalLockError`）は本関数では catch せずに伝搬する
//     （呼び出し側 wrapper が 409 CONFLICT にマップ、BR-REVIEW-02 / API-003 §409）。
//   - assignee_id は viewer.user_id を `in_review` への遷移と同一 UPDATE で確定する
//     （DB-003 §不変条件 4: status='in_review' で assignee_id NOT NULL）。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append する（BR-AUDIT-01 /
//     BR-AUDIT-03）。前段（authorize / validate / status / lock）のいずれかで失敗
//     した場合は append を実行しない。policy_agreement_id は常に null（DB-004
//     §不変条件 6: start_review では PolicyAgreement と紐付かない）。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（NFR-005 / 失敗時 `403_reason` は
//     authorize / csrf 側で記録される）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `proposals.updateWithLock` (write、CAS)
//   - `audit.append` (write、append-only、成功時のみ)
//
// 参照: docs/20-detail-design/apis/API-003.md,
//       docs/20-detail-design/db/DB-003.md (不変条件 1 / 2 / 4),
//       docs/20-detail-design/db/DB-004.md (不変条件 2 / 3 / 6),
//       docs/02-requirements/04-business-rules.md
//         (BR-REVIEW-01 / BR-REVIEW-02 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-03)

import type { ProposalStatus } from '#/lib/domain/types'
import { authorize, AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditLogRepository } from '#/server/audit/repository'
import type { Logger } from '#/server/observability/logger'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * startReview の入力（API-003 §ボディ §スキーマ）。
 *
 * - `reason` は **必須**。trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）。
 * - `expected_version` は CAS のための整数（BR-REVIEW-02）。
 */
export interface StartReviewInput {
  readonly reason: string
  readonly expected_version: number
}

/**
 * startReview 成功時のレスポンス（API-003 §200 OK）。
 *
 * `status` は `'in_review'` のリテラル型として固定（submitted → in_review 以外の
 * 遷移を起こさないことを型レベルで保証する）。
 */
export interface StartReviewResult {
  readonly proposal_id: string
  readonly status: 'in_review'
  readonly version: number
  readonly assignee_id: string
}

/**
 * 入力検証で問題があったフィールド（API-003 §400 `VALIDATION_ERROR`）。
 */
export type StartReviewValidationField = 'reason' | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。
 *
 * reason 空 / 空白のみ / 4,000 文字超 / `expected_version` が非整数 or 負数の
 * いずれでも throw される。
 */
export class StartReviewValidationError extends Error {
  readonly field: StartReviewValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: StartReviewValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'StartReviewValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * `status_not_submitted`: existing.status が `submitted` 以外（API-003 §422）。
 * `currentStatus` には findById で取得した実際の status を含める（authorize で
 * reviewer/admin 通過済のため、status を返しても権限を超えた情報漏洩にはならない）。
 */
export type StartReviewStateReason = 'status_not_submitted'

export class StartReviewStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: StartReviewStateReason
  readonly currentStatus: ProposalStatus

  constructor(reason: StartReviewStateReason, currentStatus: ProposalStatus, message?: string) {
    super(
      message
      ?? `proposal is not in submitted state: current=${currentStatus}`,
    )
    this.name = 'StartReviewStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * startReview の依存。
 *
 * - `proposals` / `audit` の 2 リポジトリを注入する（PolicyAgreement は不要）。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface StartReviewDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
  readonly logger?: Logger
}

const REASON_MAX_LENGTH = 4_000

/**
 * startReview server function 本体。
 *
 * 順序（API-003 §認可 / §バリデーション規約 / §書き込み順序）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在: viewer === null → 401 not_authenticated、それ以外 → 404 not_owner_resource
 *        （API-003 §認可拒否「proposal 不在 → 404」、暫定統一の隠蔽方針）。
 *   3. authorize(viewer, 'review.start', { kind:'proposal', author_id, visibility })
 *      - viewer === null → 401 not_authenticated
 *      - role が reviewer / admin 以外 → 404 insufficient_role
 *      - reviewer + private → 404 insufficient_role（Q-016 暫定）
 *   4. 入力検証（reason / expected_version、API-003 §400）
 *   5. existing.status !== 'submitted' → StartReviewStateError(reason='status_not_submitted')
 *   6. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'in_review', assignee_id: viewer.user_id })
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   7. audit.append({ action:'start_review', actor / role / target /
 *        before_status:'submitted', after_status:'in_review', reason: trimmed })
 *   8. StartReviewResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（BR-AUDIT-03）: 7 が呼ばれるのは 1〜6 すべて成功した
 * 場合のみ。1〜6 のいずれかで throw すると 7 に到達しない。
 */
export async function startReview(
  viewer: Viewer | null,
  proposalId: string,
  input: StartReviewInput,
  deps: StartReviewDeps,
): Promise<StartReviewResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は viewer の認証状態に応じて 401/404 を直接 throw する。
  //     authorize() の review.start は author_id を見ないため sentinel パターンが使えない
  //     （sentinel を渡すと role 判定だけが走り 200 通過してしまう）。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    if (viewer === null) {
      throw new AuthorizationError('not_authenticated')
    }
    throw new AuthorizationError('not_owner_resource')
  }

  // (3) 認可: 認証済 + reviewer/admin。reviewer + private は 404 insufficient_role。
  authorize(viewer, 'review.start', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for review.start')
  }

  // (4) 入力検証: API-003 §バリデーション規約 step 1（reason / expected_version）。
  const trimmedReason = validateInput(input)

  // (5) status 検査: API-003 §バリデーション規約 step 3（submitted 以外は 422）。
  if (existing.status !== 'submitted') {
    throw new StartReviewStateError('status_not_submitted', existing.status)
  }

  // (6) DB-003 CAS UPDATE: status='in_review' / assignee_id=viewer.user_id を 1 回の
  //     UPDATE で確定する（DB-003 §不変条件 4 と整合）。
  //     楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'in_review',
    assignee_id: viewer.user_id,
  })

  // 整合性アサート: status / assignee_id は updateWithLock の patch に依存する。
  //     リテラル型と非 null を narrow するため runtime でも検査（不正な repository
  //     実装に対する防御）。
  if (updated.status !== 'in_review') {
    throw new Error(
      `assertion failed: updateWithLock returned non-in_review status: ${updated.status}`,
    )
  }
  if (updated.assignee_id === null) {
    throw new Error('assertion failed: updateWithLock returned null assignee_id')
  }

  // (7) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（BR-AUDIT-01 /
  //     BR-AUDIT-03）。reason は start_review では必須（BR-REVIEW-01 / DB-004 §不変条件 2）。
  //     actor_role は viewer.roles のスナップショットをカンマ区切りで保存
  //     （DB-004 §不変条件 4 / API-003 §AuditLog 書き込み）。
  //     policy_agreement_id は start_review では常に null（DB-004 §不変条件 6）。
  await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'start_review',
    target_proposal_id: proposalId,
    before_status: 'submitted',
    after_status: 'in_review',
    before_visibility: null,
    after_visibility: null,
    reason: trimmedReason,
    policy_agreement_id: null,
  })

  // (8) 戻り値整形: API-003 §200 OK の shape。status='in_review' リテラル固定。
  return {
    proposal_id: updated.id,
    status: 'in_review',
    version: updated.version,
    assignee_id: updated.assignee_id,
  }
}

/**
 * 入力検証本体。API-003 §バリデーション規約に従う。
 *
 * 検証順序:
 *   1. `reason`: 文字列、trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）
 *   2. `expected_version`: 必須・非負・safe integer（BR-REVIEW-02）
 *
 * 戻り値は trim 済の reason 文字列（AuditLog に保存する canonical 値）。
 * 失敗時は `StartReviewValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: StartReviewInput): string {
  // 1. reason
  if (typeof input.reason !== 'string') {
    throw new StartReviewValidationError('reason', 'reason must be a string')
  }
  // 4,000 文字制限は trim 前の元文字列に対して掛ける（DB-004 §reason の最大長と整合、
  // AuditLogRepository.append の検証と二重防御）。
  if (input.reason.length > REASON_MAX_LENGTH) {
    throw new StartReviewValidationError(
      'reason',
      `reason must be at most ${String(REASON_MAX_LENGTH)} characters`,
    )
  }
  const trimmed = input.reason.trim()
  if (trimmed.length === 0) {
    throw new StartReviewValidationError('reason', 'reason must not be empty')
  }

  // 2. expected_version
  if (typeof input.expected_version !== 'number') {
    throw new StartReviewValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new StartReviewValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new StartReviewValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new StartReviewValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  return trimmed
}
