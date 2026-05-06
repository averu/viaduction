// API-004 / REQ-003 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-004 / NFR-005 /
// NFR-006 / NFR-007 / UC-004 / UC-013 / UC-014 / BR-PROPOSAL-01 / BR-REVIEW-01 /
// BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 / BR-AUTHZ-03 —
// approve（承認 server function）
//
// 役割:
//   - reviewer / admin が `in_review` 状態の提案を `approved` に遷移させる mutation
//     （API-004 §概要、UC-004）。reason 必須（BR-REVIEW-01 / DB-004 §不変条件 2）。
//   - 認可 (authorize) → 入力検証 → status 検査 → proposals CAS UPDATE → AuditLog
//     append の 5 段。startReview (API-003) と類似だが
//     (a) action は 'review.approve' で resource を要求しない（authorize の B-3 撤回）
//     (b) `status='in_review'` のみ通過、それ以外は 422
//     (c) `assignee_id` を NULL に戻す（DB-003 §不変条件 4 / §関連 API、API-004 §副作用）
//     (d) `approved_at = Date.now()` を同一 UPDATE で記録する（DB-003 §approved_at、
//         MAJOR-3、API-004 §副作用）
//     (e) AuditLog の action は `approve`、before='in_review' / after='approved'。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'review.approve')` を resource 無しで呼ぶ。authorize
//     の `review.approve` 分岐は `expectProposalResource` を呼ばないため、引数は省略可。
//     不在 proposal の隠蔽（API-004 §認可拒否「proposal 不存在 → 404」）は authorize
//     を通らないため、本関数で先に findById → null 時は viewer の認証状態で 401/404 を
//     直接 throw する（startReview と同型、BR-AUTHZ-02）。
//   - reason は trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）。空 / 空白のみ /
//     長さ超過は 400、AuditLog 記録なし。
//   - status != 'in_review' は 422 BUSINESS_RULE_VIOLATION（API-004 §422、
//     DB-003 §不変条件 1 の遷移 #4）。AuditLog 記録なし。
//   - 楽観ロック失敗（`ProposalLockError`）は伝搬し、呼び出し側 wrapper が 409 にマップ
//     （BR-REVIEW-02 / API-004 §409）。
//   - assignee_id は **NULL に戻す**（DB-003 §不変条件 4: status='approved' で
//     assignee_id IS NULL、§関連 API、API-004 §副作用、§遷移条件・副作用サマリ）。
//   - approved_at は **本関数の入口で固定した `Date.now()` を AuditLog の created_at と
//     共有しない**（AuditLog の created_at は repository が独自に記録する）。本関数は
//     proposals テーブルの `approved_at` のみを設定する。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append（BR-AUDIT-01 /
//     BR-AUDIT-03）。前段で失敗した場合は append しない。policy_agreement_id は常に
//     null（DB-004 §不変条件 6: approve では PolicyAgreement と紐付かない）。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（NFR-005）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `proposals.updateWithLock` (write、CAS、`status='approved' / assignee_id=null /
//     approved_at=Date.now()`)
//   - `audit.append` (write、append-only、成功時のみ)
//
// 参照: docs/20-detail-design/apis/API-004.md,
//       docs/20-detail-design/db/DB-003.md (不変条件 1 / 2 / 4 / 6 / §関連 API),
//       docs/20-detail-design/db/DB-004.md (不変条件 2 / 3 / 6),
//       docs/02-requirements/04-business-rules.md
//         (BR-REVIEW-01 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-03)

import type { ProposalStatus } from '#/lib/domain/types'
import { authorize, AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditLogRepository } from '#/server/audit/repository'
import type { Logger } from '#/server/observability/logger'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * approve の入力（API-004 §ボディ §スキーマ）。
 *
 * - `reason` は **必須**。trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）。
 * - `expected_version` は CAS のための整数（BR-REVIEW-02）。
 */
export interface ApproveInput {
  readonly reason: string
  readonly expected_version: number
}

/**
 * approve 成功時のレスポンス（API-004 §200 OK）。
 *
 * `status` は `'approved'` のリテラル型として固定（in_review → approved 以外の遷移を
 * 起こさないことを型レベルで保証する）。
 *
 * `audit_log_id` は API-004 §200 OK スキーマで明示されているため必須。
 * `approved_at` は完了条件「approved_at を現在時刻で設定」を呼び出し側が観測できる
 * よう返す（API-004 §200 OK 直接の項目では無いが、SCR-013 / API-021 で参照される
 * DB-003 のカラム値を返す形）。
 */
export interface ApproveResult {
  readonly proposal_id: string
  readonly status: 'approved'
  readonly version: number
  readonly approved_at: number
  readonly audit_log_id: string
}

/**
 * 入力検証で問題があったフィールド（API-004 §400 `VALIDATION_ERROR`）。
 */
export type ApproveValidationField = 'reason' | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。
 *
 * reason 空 / 空白のみ / 4,000 文字超 / `expected_version` が非整数 or 負数の
 * いずれでも throw される。
 */
export class ApproveValidationError extends Error {
  readonly field: ApproveValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: ApproveValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'ApproveValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * `status_not_in_review`: existing.status が `in_review` 以外（API-004 §422、
 * DB-003 §不変条件 1 遷移 #4）。`currentStatus` には findById で取得した実際の
 * status を含める（authorize で reviewer/admin 通過済のため、status を返しても
 * 権限を超えた情報漏洩にはならない）。
 */
export type ApproveStateReason = 'status_not_in_review'

export class ApproveStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: ApproveStateReason
  readonly currentStatus: ProposalStatus

  constructor(reason: ApproveStateReason, currentStatus: ProposalStatus, message?: string) {
    super(
      message
      ?? `proposal is not in in_review state: current=${currentStatus}`,
    )
    this.name = 'ApproveStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * approve の依存。
 *
 * - `proposals` / `audit` の 2 リポジトリを注入する（PolicyAgreement は不要）。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface ApproveDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
  readonly logger?: Logger
}

const REASON_MAX_LENGTH = 4_000

/**
 * approve server function 本体。
 *
 * 順序（API-004 §バリデーション規約 / §書き込み順序）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在: viewer === null → 401 not_authenticated、それ以外 → 404 not_owner_resource
 *        （API-004 §認可拒否「proposal 不存在 → 404」、暫定統一の隠蔽方針）。
 *   3. authorize(viewer, 'review.approve')
 *      - viewer === null → 401 not_authenticated
 *      - role が reviewer / admin 以外 → 404 insufficient_role
 *        （`review.approve` は resource を見ない: B-3 で assignee 一致は撤回、
 *         visibility による Q-016 暫定ブロックも適用しない）。
 *   4. 入力検証（reason / expected_version、API-004 §400）
 *   5. existing.status !== 'in_review' → ApproveStateError(reason='status_not_in_review')
 *   6. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'approved', assignee_id:null, approved_at: now })
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   7. audit.append({ action:'approve', actor / role / target /
 *        before_status:'in_review', after_status:'approved', reason: trimmed })
 *   8. ApproveResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（BR-AUDIT-03）: 7 が呼ばれるのは 1〜6 すべて成功した
 * 場合のみ。1〜6 のいずれかで throw すると 7 に到達しない。
 */
export async function approve(
  viewer: Viewer | null,
  proposalId: string,
  input: ApproveInput,
  deps: ApproveDeps,
): Promise<ApproveResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は viewer の認証状態に応じて 401/404 を直接 throw する。
  //     authorize() の review.approve は resource を見ないため sentinel パターンが使えない
  //     （sentinel を渡しても role 判定だけが走り 200 通過してしまう）。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    if (viewer === null) {
      throw new AuthorizationError('not_authenticated')
    }
    throw new AuthorizationError('not_owner_resource')
  }

  // (3) 認可: 認証済 + reviewer/admin。assignee 一致は要求しない（B-3 撤回、API-004 §認可）。
  //     resource は authorize の review.approve 分岐で参照されないが、startReview と
  //     形を揃えて owner / visibility / status を渡す（将来 authorize が要求する場合に備える）。
  authorize(viewer, 'review.approve', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for review.approve')
  }

  // (4) 入力検証: API-004 §バリデーション規約 step 1（reason / expected_version）。
  const trimmedReason = validateInput(input)

  // (5) status 検査: API-004 §バリデーション規約 step 3（in_review 以外は 422）。
  if (existing.status !== 'in_review') {
    throw new ApproveStateError('status_not_in_review', existing.status)
  }

  // (6) DB-003 CAS UPDATE: status='approved' / assignee_id=null / approved_at=Date.now()
  //     を 1 回の UPDATE で確定する。
  //     - assignee_id を NULL に戻す根拠: DB-003 §不変条件 4「status='in_review' の場合
  //       のみ assignee_id IS NOT NULL。それ以外の status では assignee_id IS NULL」、
  //       §関連 API「API-004 (`approve`) ... `assignee_id` を NULL に戻す」、
  //       API-004 §副作用「`assignee_id=NULL`」、§遷移条件・副作用サマリ
  //       「`status`, `assignee_id=NULL`, `updated_at`, `version`」と整合。
  //     - approved_at の根拠: DB-003 §approved_at「`in_review → approved` 遷移時 (API-004)
  //       に `Date.now()` で設定」、API-004 §副作用「`approved_at=now()`（B-2 / MAJOR-3）」。
  //     - 楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const approvedAt = Date.now()
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'approved',
    assignee_id: null,
    approved_at: approvedAt,
  })

  // 整合性アサート: status / assignee_id / approved_at は updateWithLock の patch に依存する。
  //     リテラル型と非 null を narrow するため runtime でも検査（不正な repository
  //     実装に対する防御）。
  if (updated.status !== 'approved') {
    throw new Error(
      `assertion failed: updateWithLock returned non-approved status: ${updated.status}`,
    )
  }
  if (updated.assignee_id !== null) {
    throw new Error('assertion failed: updateWithLock did not clear assignee_id')
  }
  if (updated.approved_at === null) {
    throw new Error('assertion failed: updateWithLock did not set approved_at')
  }

  // (7) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（BR-AUDIT-01 /
  //     BR-AUDIT-03）。reason は approve では必須（BR-REVIEW-01 / DB-004 §不変条件 2）。
  //     actor_role は viewer.roles のスナップショットをカンマ区切りで保存
  //     （DB-004 §不変条件 4 / API-004 §AuditLog 書き込み）。
  //     policy_agreement_id は approve では常に null（DB-004 §不変条件 6）。
  const auditEntry = await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'approve',
    target_proposal_id: proposalId,
    before_status: 'in_review',
    after_status: 'approved',
    before_visibility: null,
    after_visibility: null,
    reason: trimmedReason,
    policy_agreement_id: null,
  })

  // (8) 戻り値整形: API-004 §200 OK の shape。status='approved' リテラル固定。
  return {
    proposal_id: updated.id,
    status: 'approved',
    version: updated.version,
    approved_at: updated.approved_at,
    audit_log_id: auditEntry.id,
  }
}

/**
 * 入力検証本体。API-004 §バリデーション規約に従う。
 *
 * 検証順序:
 *   1. `reason`: 文字列、trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）
 *   2. `expected_version`: 必須・非負・safe integer（BR-REVIEW-02）
 *
 * 戻り値は trim 済の reason 文字列（AuditLog に保存する canonical 値）。
 * 失敗時は `ApproveValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: ApproveInput): string {
  // 1. reason
  if (typeof input.reason !== 'string') {
    throw new ApproveValidationError('reason', 'reason must be a string')
  }
  // 4,000 文字制限は trim 前の元文字列に対して掛ける（DB-004 §reason の最大長と整合、
  // AuditLogRepository.append の検証と二重防御）。
  if (input.reason.length > REASON_MAX_LENGTH) {
    throw new ApproveValidationError(
      'reason',
      `reason must be at most ${String(REASON_MAX_LENGTH)} characters`,
    )
  }
  const trimmed = input.reason.trim()
  if (trimmed.length === 0) {
    throw new ApproveValidationError('reason', 'reason must not be empty')
  }

  // 2. expected_version
  if (typeof input.expected_version !== 'number') {
    throw new ApproveValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new ApproveValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new ApproveValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new ApproveValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  return trimmed
}
