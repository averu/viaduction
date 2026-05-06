// API-006 / REQ-003 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-004 /
// NFR-005 / NFR-006 / NFR-007 / UC-006 / UC-013 / UC-014 / BR-PROPOSAL-01 /
// BR-REVIEW-01 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 /
// BR-AUTHZ-03 — reject（却下 server function）
//
// 役割:
//   - reviewer / admin が `in_review` 状態の提案を `rejected`（**終端**）に遷移させる
//     mutation（API-006 §概要、UC-006）。reason 必須（BR-REVIEW-01 / DB-004 §不変条件 2）。
//   - `rejected` は **終端状態**。再提出 (resubmit) の起点にならない（API-009 は
//     `returned → submitted` のみ受け付け、`rejected` は対象外）。DB-003 §不変条件 1
//     遷移 #6 (`in_review → rejected`) のあと、`rejected` 起点の遷移は存在しない。
//   - 認可 (authorize) → 入力検証 → status 検査 → proposals CAS UPDATE → AuditLog
//     append の 5 段。returnProposal (API-005) と類似だが
//     (a) action は 'review.reject'（authorize で reviewer/admin を要求、resource 不要）
//     (b) `status='in_review'` のみ通過、それ以外は 422
//     (c) `assignee_id` を NULL に戻す（DB-003 §不変条件 4 / §関連 API、API-006 §副作用）
//     (d) `approved_at` は **触らない**（API-006 §副作用、DB-003 §approved_at
//         「`returned` / `rejected` 経路では NULL のまま」と整合）
//     (e) AuditLog の action は `reject`、before='in_review' / after='rejected'。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'review.reject')` を呼ぶ。authorize の `review.reject`
//     分岐は `expectProposalResource` を呼ばないため、引数の resource は本関数では
//     参照されない（B-3 撤回 + API-006 §認可: assignee 一致は要求しない）。
//     不在 proposal の隠蔽（API-006 §認可拒否「proposal 不存在 → 404」）は authorize
//     を通らないため、本関数で先に findById → null 時は viewer の認証状態で 401/404 を
//     直接 throw する（returnProposal / approve と同型、BR-AUTHZ-02）。
//   - reason は trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）。空 / 空白のみ /
//     長さ超過は 400、AuditLog 記録なし。
//     reason 必須の根拠: DB-004 §不変条件 2 / API-006 §AuditLog 書き込み「reason 必須」/
//     §バリデーション規約「API-004 と同等」/ ボディスキーマ「reason: yes」。
//     注: TASK-019 の完了条件には reason 必須の項目が無いが、設計の正典 (DB-004 /
//     API-006) では必須と明記されているため、設計に従い必須として実装する。
//   - status != 'in_review' は 422 BUSINESS_RULE_VIOLATION（API-006 §422、
//     DB-003 §不変条件 1 の遷移 #6）。AuditLog 記録なし。
//   - 楽観ロック失敗（`ProposalLockError`）は伝搬し、呼び出し側 wrapper が 409 にマップ
//     （BR-REVIEW-02 / API-006 §409）。
//   - assignee_id は **NULL に戻す**（DB-003 §不変条件 4: status='rejected' で
//     assignee_id IS NULL、§関連 API、API-006 §副作用 / §遷移条件・副作用サマリ）。
//   - approved_at は **patch に含めない**（API-006 §副作用 / §遷移条件・副作用サマリ
//     ともに `status` / `assignee_id=NULL` / `updated_at` / `version` のみで approved_at
//     は対象外）。元々 `in_review` の proposal は approved_at が NULL のため、明示的
//     null パッチを送らなくても DB-003 §不変条件は維持される。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append（BR-AUDIT-01 /
//     BR-AUDIT-03）。前段で失敗した場合は append しない。policy_agreement_id は常に
//     null（DB-004 §不変条件 6: reject では PolicyAgreement と紐付かない）。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（NFR-005）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `proposals.updateWithLock` (write、CAS、`status='rejected' / assignee_id=null`)
//   - `audit.append` (write、append-only、成功時のみ)
//
// 参照: docs/20-detail-design/apis/API-006.md,
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
 * reject の入力（API-006 §ボディ §スキーマ）。
 *
 * - `reason` は **必須**。trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）。
 *   `rejected` は終端のため再提出されないが、監査追跡（API-017）と通知文面のため
 *   投稿者・admin に対して reason を残す必要がある。空文字や空白のみは不可。
 * - `expected_version` は CAS のための整数（BR-REVIEW-02）。
 */
export interface RejectInput {
  readonly reason: string
  readonly expected_version: number
}

/**
 * reject 成功時のレスポンス（API-006 §200 OK）。
 *
 * `status` は `'rejected'` のリテラル型として固定（in_review → rejected 以外の遷移を
 * 起こさないことを型レベルで保証する）。`rejected` は終端状態のため、本関数の戻り値
 * を起点とする後続遷移は存在しない。
 *
 * `audit_log_id` は API-006 §200 OK スキーマで明示されているため必須。
 */
export interface RejectResult {
  readonly proposal_id: string
  readonly status: 'rejected'
  readonly version: number
  readonly audit_log_id: string
}

/**
 * 入力検証で問題があったフィールド（API-006 §400 `VALIDATION_ERROR`）。
 */
export type RejectValidationField = 'reason' | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。
 *
 * reason 空 / 空白のみ / 4,000 文字超 / `expected_version` が非整数 or 負数の
 * いずれでも throw される。
 */
export class RejectValidationError extends Error {
  readonly field: RejectValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: RejectValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'RejectValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * `status_not_in_review`: existing.status が `in_review` 以外（API-006 §422、
 * DB-003 §不変条件 1 遷移 #6）。`currentStatus` には findById で取得した実際の
 * status を含める（authorize で reviewer/admin 通過済のため、status を返しても
 * 権限を超えた情報漏洩にはならない）。
 */
export type RejectStateReason = 'status_not_in_review'

export class RejectStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: RejectStateReason
  readonly currentStatus: ProposalStatus

  constructor(reason: RejectStateReason, currentStatus: ProposalStatus, message?: string) {
    super(
      message
      ?? `proposal is not in in_review state: current=${currentStatus}`,
    )
    this.name = 'RejectStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * reject の依存。
 *
 * - `proposals` / `audit` の 2 リポジトリを注入する（PolicyAgreement は不要）。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface RejectDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
  readonly logger?: Logger
}

const REASON_MAX_LENGTH = 4_000

/**
 * reject server function 本体。
 *
 * 順序（API-006 §バリデーション規約 / API-005 と同じ流れ）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在: viewer === null → 401 not_authenticated、それ以外 → 404 not_owner_resource
 *        （API-006 §認可拒否「proposal 不存在 → 404」、暫定統一の隠蔽方針）。
 *   3. authorize(viewer, 'review.reject')
 *      - viewer === null → 401 not_authenticated
 *      - role が reviewer / admin 以外 → 404 insufficient_role
 *        （`review.reject` は resource を見ない: B-3 で assignee 一致は撤回、
 *         visibility による Q-016 暫定ブロックも適用しない）。
 *   4. 入力検証（reason / expected_version、API-006 §400）
 *   5. existing.status !== 'in_review' → RejectStateError(reason='status_not_in_review')
 *   6. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'rejected', assignee_id:null })
 *      - approved_at は触らない（in_review → rejected で approved_at は変わらない、
 *        DB-003 §approved_at「rejected 経路では NULL のまま」）。
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   7. audit.append({ action:'reject', actor / role / target /
 *        before_status:'in_review', after_status:'rejected', reason: trimmed })
 *   8. RejectResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（BR-AUDIT-03）: 7 が呼ばれるのは 1〜6 すべて成功した
 * 場合のみ。1〜6 のいずれかで throw すると 7 に到達しない。
 */
export async function reject(
  viewer: Viewer | null,
  proposalId: string,
  input: RejectInput,
  deps: RejectDeps,
): Promise<RejectResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は viewer の認証状態に応じて 401/404 を直接 throw する。
  //     authorize() の review.reject は resource を見ないため sentinel パターンが使えない
  //     （sentinel を渡しても role 判定だけが走り 200 通過してしまう）。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    if (viewer === null) {
      throw new AuthorizationError('not_authenticated')
    }
    throw new AuthorizationError('not_owner_resource')
  }

  // (3) 認可: 認証済 + reviewer/admin。assignee 一致は要求しない（B-3 撤回、API-006 §認可）。
  //     resource は authorize の review.reject 分岐で参照されないが、approve / return と
  //     形を揃えて owner / visibility / status を渡す（将来 authorize が要求する場合に備える）。
  authorize(viewer, 'review.reject', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for review.reject')
  }

  // (4) 入力検証: API-006 §バリデーション規約 step 1（reason / expected_version）。
  const trimmedReason = validateInput(input)

  // (5) status 検査: API-006 §バリデーション規約 step 3（in_review 以外は 422）。
  if (existing.status !== 'in_review') {
    throw new RejectStateError('status_not_in_review', existing.status)
  }

  // (6) DB-003 CAS UPDATE: status='rejected' / assignee_id=null を 1 回の UPDATE で確定する。
  //     - assignee_id を NULL に戻す根拠: DB-003 §不変条件 4「status='in_review' の場合
  //       のみ assignee_id IS NOT NULL。それ以外の status では assignee_id IS NULL」、
  //       §関連 API「API-006 (`reject`) ... `assignee_id` を NULL に戻す」、
  //       API-006 §副作用「`assignee_id=NULL`」、§遷移条件・副作用サマリ
  //       「`status`, `assignee_id=NULL`, `updated_at`, `version`」と整合。
  //     - approved_at は patch に含めない: API-006 §副作用 / §遷移条件・副作用サマリ
  //       ともに対象外。in_review の時点で approved_at は NULL のまま（DB-003
  //       §approved_at「returned / rejected 経路では NULL のまま」）。
  //     - rejected は終端状態（DB-003 §不変条件 1: rejected を起点とする遷移なし）。
  //     - 楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'rejected',
    assignee_id: null,
  })

  // 整合性アサート: status / assignee_id は updateWithLock の patch に依存する。
  //     リテラル型と非 null を narrow するため runtime でも検査（不正な repository
  //     実装に対する防御）。
  if (updated.status !== 'rejected') {
    throw new Error(
      `assertion failed: updateWithLock returned non-rejected status: ${updated.status}`,
    )
  }
  if (updated.assignee_id !== null) {
    throw new Error('assertion failed: updateWithLock did not clear assignee_id')
  }

  // (7) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（BR-AUDIT-01 /
  //     BR-AUDIT-03）。reason は reject では必須（BR-REVIEW-01 / DB-004 §不変条件 2）。
  //     actor_role は viewer.roles のスナップショットをカンマ区切りで保存
  //     （DB-004 §不変条件 4 / API-006 §AuditLog 書き込み）。
  //     policy_agreement_id は reject では常に null（DB-004 §不変条件 6）。
  const auditEntry = await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'reject',
    target_proposal_id: proposalId,
    before_status: 'in_review',
    after_status: 'rejected',
    before_visibility: null,
    after_visibility: null,
    reason: trimmedReason,
    policy_agreement_id: null,
  })

  // (8) 戻り値整形: API-006 §200 OK の shape。status='rejected' リテラル固定。
  return {
    proposal_id: updated.id,
    status: 'rejected',
    version: updated.version,
    audit_log_id: auditEntry.id,
  }
}

/**
 * 入力検証本体。API-006 §バリデーション規約に従う（API-005 と同等）。
 *
 * 検証順序:
 *   1. `reason`: 文字列、trim 後 1〜4,000 文字（BR-REVIEW-01 / DB-004 §reason）
 *   2. `expected_version`: 必須・非負・safe integer（BR-REVIEW-02）
 *
 * 戻り値は trim 済の reason 文字列（AuditLog に保存する canonical 値）。
 * 失敗時は `RejectValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: RejectInput): string {
  // 1. reason
  if (typeof input.reason !== 'string') {
    throw new RejectValidationError('reason', 'reason must be a string')
  }
  // 4,000 文字制限は trim 前の元文字列に対して掛ける（DB-004 §reason の最大長と整合、
  // AuditLogRepository.append の検証と二重防御）。
  if (input.reason.length > REASON_MAX_LENGTH) {
    throw new RejectValidationError(
      'reason',
      `reason must be at most ${String(REASON_MAX_LENGTH)} characters`,
    )
  }
  const trimmed = input.reason.trim()
  if (trimmed.length === 0) {
    throw new RejectValidationError('reason', 'reason must not be empty')
  }

  // 2. expected_version
  if (typeof input.expected_version !== 'number') {
    throw new RejectValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new RejectValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new RejectValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new RejectValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  return trimmed
}
