// API-009 / REQ-006 / REQ-010 / REQ-011 / REQ-013 / NFR-002 / NFR-003 / NFR-004 /
// NFR-005 / NFR-006 / NFR-007 / UC-009 / UC-013 / UC-014 / BR-PROPOSAL-01 /
// BR-RESUBMIT-01 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 /
// BR-AUTHZ-03 / BR-GUARD-02 — resubmit（再提出 server function、投稿者本人のみ）
//
// 役割:
//   - 投稿者本人が `returned` 状態の自身の提案を再編集（`title` / `body`）したうえで
//     `submitted` に戻す mutation 本体（API-009 §概要、UC-009、`BR-RESUBMIT-01`）。
//   - 同一 `proposal_id` を維持（`BR-RESUBMIT-01`）、PolicyAgreement は **再生成しない**
//     （Q-018 暫定、`BR-GUARD-02` / DB-005 §不変条件 1 / 4、REQ-013 AC4）。reason は
//     任意（Q-019 暫定、DB-004 §reason 表 resubmit=任意）。倫理ガード再確認も行わない
//     （API-009 §リクエスト「倫理ガード / PolicyAgreement: 再提示しない」）。
//   - 認可 (authorize) → 入力検証 → status 検査 → PolicyAgreement 既存取得 →
//     proposals CAS UPDATE → AuditLog append の 6 段。submit (API-002) と類似だが:
//     (a) action は `'proposal.resubmit'`（authorize で owner 一致チェック、API-002 と同型）。
//     (b) 倫理ガード 3 種 / `policy_agreement_consent` を **求めない**（再提示なし、Q-018 暫定）。
//     (c) `status='returned'` のみ通過、それ以外は 422 `status_not_returned`
//         （DB-003 §不変条件 1 の遷移 #7: returned → submitted）。
//     (d) PolicyAgreement は `findByProposalId` のみ呼び、`create` は呼ばない
//         （DB-005 §不変条件 4 / Q-018 暫定）。既存が無い場合（draft 直接遷移など、
//         本来到達しない設計だが）は防御的に `missing_policy_agreement` 422。
//     (e) `submitted_at = Date.now()` で **上書き更新**（DB-003 §submitted_at「上書き更新」、
//         不変条件 1 の遷移 #7）。`current_policy_agreement_id` は **据え置き**
//         （DB-003 §不変条件 5、Q-018 暫定）。
//     (f) `title` / `body` は更新する（DB-003 §不変条件 3 例外: `returned → submitted`
//         の再提出フローでのみ変更可）。`visibility` は変更不可（DB-003 §不変条件 7、
//         API-009 §「visibility 変更不可」）。
//     (g) AuditLog の action は `resubmit`、before='returned' / after='submitted'。
//         `policy_agreement_id` は既存の `current_policy_agreement_id` をコピー
//         （DB-004 §不変条件 6、API-009 §AuditLog 書き込み）。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'proposal.resubmit', { kind:'proposal', author_id })`
//     の単一エントリ経由（BR-AUTHZ-03）。owner 不一致は `not_owner_resource` (404)
//     に正規化される（reviewer / admin / auditor が他人の returned proposal を再提出
//     することは不可、API-009 §認可拒否）。
//   - 不在 proposal も「リソース存在隠蔽」の暫定統一に従い 404（API-009 §認可拒否、
//     submit / update-draft と同じ sentinel パターン）。
//   - PolicyAgreement は **既存を再利用**（Q-018 暫定）。`policyAgreements.create` を
//     呼ばない（DB-005 §不変条件 4、`BR-GUARD-02`）。これは「PolicyAgreement 再生成
//     パターン」の対極に位置する「再利用パターン」。
//   - status != 'returned' は 422 BUSINESS_RULE_VIOLATION（API-009 §422、
//     DB-003 §不変条件 1 の遷移 #7）。AuditLog 記録なし。
//   - 楽観ロック失敗（`ProposalLockError`）は本関数では catch せずに伝搬する
//     （呼び出し側 wrapper が 409 CONFLICT にマップ、`BR-REVIEW-02`）。
//   - reason は publish.ts と同じ正規化方針: trim 後 0 文字なら null へ（m-03 確定、
//     API-007 と統一、API-009 §ボディ「空文字や空白のみは null として扱う」）。
//     trim 前で 4,000 文字超のみ 400（DB-004 §reason 最大長）。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append する（`BR-AUDIT-01` /
//     `BR-AUDIT-03`）。前段（authorize / validate / status / policy_agreement /
//     proposals UPDATE）のいずれかで失敗した場合は append を実行しない。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（NFR-005、成功時 access log は wrapper 責務）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `policyAgreements.findByProposalId` (read、**create は呼ばない**)
//   - `proposals.updateWithLock` (write、CAS、`status='submitted' / submitted_at=Date.now() /
//     title / body`、`current_policy_agreement_id` は patch に含めず据え置き)
//   - `audit.append` (write、append-only、成功時のみ、`policy_agreement_id` は既存を copy)
//
// 参照: docs/20-detail-design/apis/API-009.md,
//       docs/20-detail-design/db/DB-003.md (不変条件 1 §status 遷移 7 / §不変条件 3 / 5 /
//                                            §submitted_at 上書き),
//       docs/20-detail-design/db/DB-004.md (不変条件 2 / 3 / 6、§reason 任意),
//       docs/20-detail-design/db/DB-005.md (不変条件 1 / 4、Q-018 暫定),
//       docs/02-requirements/04-business-rules.md
//         (BR-RESUBMIT-01 / BR-GUARD-02 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-03)

import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditLogRepository } from '#/server/audit/repository'
import type { Logger } from '#/server/observability/logger'
import type { PolicyAgreementRepository } from '#/server/repositories/policy-agreements'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * resubmit の入力（API-009 §ボディ §スキーマ）。
 *
 * - `title` / `body` は **必須**（DB-003 §不変条件 3 例外: 再提出時のみ変更可、
 *   API-009 §バリデーション規約 step 1）。trim 前で 200 / 10,000 文字以下、
 *   trim 後 1 文字以上（DB-003 §title / §body）。
 * - `reason` は任意（Q-019 暫定 / DB-004 §reason 表 resubmit=任意、API-009 §ボディ）。
 *   指定時は trim 前で 4,000 文字以下、trim 後 0 文字（空 / 空白のみ）は null に正規化
 *   （API-009 §ボディ「空文字や空白のみは null として扱う」、API-007 publish と統一）。
 * - `visibility` は **意図的に持たない**（API-009 §「visibility 変更不可」、
 *   DB-003 §不変条件 7、RC-005 needs-clarification）。
 * - 倫理ガード 3 種 / `policy_agreement_consent` も **持たない**（API-009 §「倫理ガード /
 *   PolicyAgreement: 再提示しない」、Q-018 暫定）。
 * - `expected_version` は CAS のための整数（API-009 §409）。
 */
export interface ResubmitInput {
  readonly title: string
  readonly body: string
  readonly reason?: string
  readonly expected_version: number
}

/**
 * resubmit 成功時のレスポンス（API-009 §200 OK）。
 *
 * `status` は `'submitted'` のリテラル型として固定（returned → submitted 以外の遷移を
 * 起こさないことを型レベルで保証する）。
 *
 * `policy_agreement_id` は **既存の継続適用**（Q-018 暫定）。`audit_log_id` は
 * append された AuditLog ID（API-009 §200 OK スキーマ）。
 */
export interface ResubmitResult {
  readonly proposal_id: string
  readonly status: 'submitted'
  readonly version: number
  readonly submitted_at: number
  readonly policy_agreement_id: string
  readonly audit_log_id: string
}

/**
 * 入力検証で問題があったフィールド（API-009 §400 `VALIDATION_ERROR`）。
 */
export type ResubmitValidationField = 'title' | 'body' | 'reason' | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。
 *
 * 発生条件:
 *   - `title` / `body` が undefined / null / 非 string / trim 後 0 文字 / 文字数超過
 *   - `reason` が非 string（undefined は許容、null は許容しない）/ trim 前で 4,000 文字超
 *   - `expected_version` が非数値 / 非整数 / 負数 / 非 safe integer
 */
export class ResubmitValidationError extends Error {
  readonly field: ResubmitValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: ResubmitValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'ResubmitValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * - `status_not_returned`: existing.status が `returned` 以外（API-009 §422、
 *   DB-003 §不変条件 1 遷移 #7）。`currentStatus` は findById で取得した実際の status を
 *   含める（authorize で本人一致が確定した後に呼び出されるため、status を返しても
 *   他人の状態は漏れない、暫定統一の隠蔽方針と整合）。
 * - `missing_policy_agreement`: 既存 PolicyAgreement が見つからない（防御的）。
 *   DB-005 §不変条件 4 / DB-003 §不変条件 5 により、`status='returned'` の proposal は
 *   かつて `submitted` を経験しているはずで `current_policy_agreement_id` も
 *   `findByProposalId` の戻り値も非 null になるはず。本ケースは不正な repository 実装 /
 *   データ不整合を検出するためのフェイルセーフ。`currentStatus` は `'returned'` 固定。
 */
export type ResubmitStateReason = 'status_not_returned' | 'missing_policy_agreement'

export class ResubmitStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: ResubmitStateReason
  readonly currentStatus: string | null

  constructor(reason: ResubmitStateReason, currentStatus: string | null = null, message?: string) {
    const defaultMessage =
      reason === 'status_not_returned'
        ? `proposal is not in returned state: current=${currentStatus ?? 'unknown'}`
        : 'policy agreement is missing for returned proposal'
    super(message ?? defaultMessage)
    this.name = 'ResubmitStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * resubmit の依存。
 *
 * - `proposals` / `policyAgreements` / `audit` の 3 リポジトリを注入する。
 * - `policyAgreements` は **`findByProposalId` のみ呼ばれる**（`create` は呼ばない、
 *   Q-018 暫定 / DB-005 §不変条件 4）。submit と同じ型を要求するが create が呼ばれない
 *   ことが本関数の重要な不変条件。
 * - `getCurrentPolicyVersion` は **持たない**（resubmit では PolicyAgreement を再生成
 *   しないため、policy_version を新たに参照しない、Q-018 暫定）。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface ResubmitDeps {
  readonly proposals: ProposalRepository
  readonly policyAgreements: PolicyAgreementRepository
  readonly audit: AuditLogRepository
  readonly logger?: Logger
}

const TITLE_MAX_LENGTH = 200
const BODY_MAX_LENGTH = 10_000
const REASON_MAX_LENGTH = 4_000

/**
 * 不在 proposal を 404 に集約するため authorize() に渡す sentinel author_id。
 * UUID v7 の format に合致しない値を選び、衝突可能性を排除する（submit.ts と同型）。
 */
const NONEXISTENT_AUTHOR_SENTINEL = '__nonexistent_proposal_author__'

/**
 * resubmit server function 本体。
 *
 * 順序（API-009 §バリデーション規約）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在 → authorize() を sentinel author_id で呼び出し 404 not_owner_resource。
 *   3. authorize(viewer, 'proposal.resubmit', { kind:'proposal', author_id: existing.author_id })
 *      - viewer === null → 401 not_authenticated
 *      - viewer.user_id !== existing.author_id → 404 not_owner_resource
 *   4. 入力検証（title / body 必須・長さ、reason 任意・長さ、expected_version、API-009 §400）
 *   5. existing.status !== 'returned' → ResubmitStateError('status_not_returned', currentStatus)
 *   6. policyAgreements.findByProposalId(proposalId)
 *      - 既存無し → ResubmitStateError('missing_policy_agreement')（防御的、本来到達しない）
 *      - **create は呼ばない**（Q-018 暫定 / DB-005 §不変条件 4）
 *   7. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'submitted', submitted_at, title, body })
 *      - `current_policy_agreement_id` は patch に含めない（据え置き、Q-018 暫定 /
 *        DB-003 §不変条件 5）。
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   8. audit.append({ action:'resubmit', actor / role / target /
 *        before_status:'returned', after_status:'submitted',
 *        reason: trimmed.length>0 ? trimmed : null,
 *        policy_agreement_id: 既存の id })
 *   9. ResubmitResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（`BR-AUDIT-03`）: 8 が呼ばれるのは 1〜7 すべて成功した
 * 場合のみ。1〜7 のいずれかで throw すると 8 に到達しない。
 */
export async function resubmit(
  viewer: Viewer | null,
  proposalId: string,
  input: ResubmitInput,
  deps: ResubmitDeps,
): Promise<ResubmitResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は authorize() を sentinel author_id で呼び 404 に正規化する
  //     （submit.ts と同型）。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    authorize(viewer, 'proposal.resubmit', {
      kind: 'proposal',
      author_id: NONEXISTENT_AUTHOR_SENTINEL,
    })
    // unreachable: authorize() が必ず throw する。
    throw new Error('unreachable: authorize must reject when proposal is missing')
  }

  // (3) 認可: 認証済 + 本人一致をワンショットで検査。owner 不一致は 404 not_owner_resource
  //     （reviewer / admin / auditor が他人の returned proposal を再提出するのも 404、
  //     API-009 §認可拒否）。
  authorize(viewer, 'proposal.resubmit', {
    kind: 'proposal',
    author_id: existing.author_id,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for proposal.resubmit')
  }

  // (4) 入力検証: API-009 §バリデーション規約 step 1（title / body / reason / expected_version）。
  //     reason は trim 後 0 文字なら null へ正規化（m-03 確定、API-007 と統一）。
  const { title, body, reasonForAudit } = validateInput(input)

  // (5) status 検査: API-009 §バリデーション規約 step 3（returned 以外は 422）。
  //     DB-003 §不変条件 1 の遷移 #7「returned → submitted」のみが許可される。
  if (existing.status !== 'returned') {
    throw new ResubmitStateError('status_not_returned', existing.status)
  }

  // (6) PolicyAgreement: 既存を取得して **再利用**（Q-018 暫定 / DB-005 §不変条件 4 /
  //     `BR-GUARD-02`）。**create は呼ばない**（initial 同意の継続適用、REQ-013 AC4）。
  //     防御的に「既存無し」を 422 で扱う: status='returned' の proposal は必ず一度
  //     `submitted` を経験しているため `current_policy_agreement_id` は非 null のはずで
  //     `findByProposalId` も hit するはず。本ケースは不正な repository 実装 / データ不整合
  //     を検出するためのフェイルセーフ。
  const existingAgreement = await deps.policyAgreements.findByProposalId(proposalId)
  if (existingAgreement === null) {
    throw new ResubmitStateError('missing_policy_agreement', existing.status)
  }
  const policyAgreementId = existingAgreement.id

  // (7) DB-003 CAS UPDATE: status / submitted_at / title / body を 1 回の UPDATE で確定。
  //     - status 遷移: returned → submitted（DB-003 §不変条件 1 の遷移 #7）。
  //     - submitted_at: **上書き更新**（DB-003 §submitted_at「`returned → submitted`
  //       で上書き更新」、API-009 §副作用「`submitted_at=now`（上書き）」）。
  //     - title / body: 再提出時のみ変更可（DB-003 §不変条件 3 例外、API-009 §副作用）。
  //     - current_policy_agreement_id は **patch に含めない**（据え置き、Q-018 暫定 /
  //       DB-003 §不変条件 5、updateWithLock 仕様: undefined のフィールドは現状値維持）。
  //     - assignee_id は returned 時点で既に null（DB-003 §不変条件 4）。patch に
  //       含めず据え置く（returned → submitted では reviewer のアサインを保持しない）。
  //     - visibility は変更不可（DB-003 §不変条件 7、API-009 §「visibility 変更不可」）。
  //     - 楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const submittedAt = Date.now()
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'submitted',
    submitted_at: submittedAt,
    title,
    body,
  })

  // 整合性アサート: status / submitted_at は updateWithLock の patch に依存する。
  //     リテラル型と非 null を narrow するため runtime でも検査（不正な repository
  //     実装に対する防御）。
  if (updated.status !== 'submitted') {
    throw new Error(
      `assertion failed: updateWithLock returned non-submitted status: ${updated.status}`,
    )
  }
  if (updated.submitted_at === null) {
    throw new Error('assertion failed: updateWithLock returned null submitted_at')
  }
  if (updated.current_policy_agreement_id !== policyAgreementId) {
    // current_policy_agreement_id が patch されなかったため、現状値（既存 id）と
    // 一致するはず。不一致は不正な repository 実装の徴候。
    throw new Error(
      'assertion failed: current_policy_agreement_id was unexpectedly changed during resubmit',
    )
  }

  // (8) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（`BR-AUDIT-01` /
  //     `BR-AUDIT-03`）。reason は resubmit では任意（DB-004 §reason 表 / Q-019 暫定）。
  //     trim 後 0 文字なら null として記録（m-03、空文字の API 入力は null 正規化）。
  //     actor_role は viewer.roles のスナップショットをカンマ区切りで保存
  //     （DB-004 §不変条件 4 / API-009 §AuditLog 書き込み）。
  //     policy_agreement_id は **既存の id をコピー**（DB-004 §不変条件 6、
  //     API-009 §AuditLog 書き込み「既存の `proposals.current_policy_agreement_id`
  //     をコピー」）。
  const auditEntry = await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'resubmit',
    target_proposal_id: proposalId,
    before_status: 'returned',
    after_status: 'submitted',
    before_visibility: null,
    after_visibility: null,
    reason: reasonForAudit,
    policy_agreement_id: policyAgreementId,
  })

  // (9) 戻り値整形: API-009 §200 OK の shape。status='submitted' リテラル固定。
  //     `proposal_id` は更新後 `updated.id` を返す（`BR-RESUBMIT-01`「同一 id を維持」を
  //     repository 戻り値で再確認、本来 proposalId === updated.id）。
  return {
    proposal_id: updated.id,
    status: 'submitted',
    version: updated.version,
    submitted_at: updated.submitted_at,
    policy_agreement_id: policyAgreementId,
    audit_log_id: auditEntry.id,
  }
}

/**
 * 入力検証本体。API-009 §バリデーション規約に従う。
 *
 * 検証順序:
 *   1. `title`: **必須** string、trim 前で 200 文字以下（DB-003 §title）、trim 後 1 文字以上。
 *   2. `body`: **必須** string、trim 前で 10,000 文字以下（DB-003 §body）、trim 後 1 文字以上。
 *   3. `reason`: 任意。undefined 許容。指定時は string、trim 前で 4,000 文字以下
 *      （DB-004 §reason 最大長）。trim 後 0 文字（空 / 空白のみ）は **null として正規化**
 *      し AuditLog に `reason: null` で記録（m-03、API-007 と統一）。
 *   4. `expected_version`: 必須・非負・safe integer（API-009 §409）。
 *
 * 戻り値:
 *   - `title` / `body`: trim 前の元文字列（DB に保存する canonical な値、空白の preserve は
 *     呼び出し側責務）。
 *   - `reasonForAudit`: AuditLog に保存する canonical な reason（trim 済の非空文字列、
 *     または null）。
 *
 * 失敗時は `ResubmitValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: ResubmitInput): {
  title: string
  body: string
  reasonForAudit: string | null
} {
  // 1. title（必須）
  if (input.title === undefined || input.title === null) {
    throw new ResubmitValidationError('title', 'title is required')
  }
  if (typeof input.title !== 'string') {
    throw new ResubmitValidationError('title', 'title must be a string')
  }
  if (input.title.length > TITLE_MAX_LENGTH) {
    throw new ResubmitValidationError(
      'title',
      `title must be at most ${String(TITLE_MAX_LENGTH)} characters`,
    )
  }
  if (input.title.trim().length === 0) {
    throw new ResubmitValidationError(
      'title',
      'title must not be empty or whitespace only',
    )
  }

  // 2. body（必須）
  if (input.body === undefined || input.body === null) {
    throw new ResubmitValidationError('body', 'body is required')
  }
  if (typeof input.body !== 'string') {
    throw new ResubmitValidationError('body', 'body must be a string')
  }
  if (input.body.length > BODY_MAX_LENGTH) {
    throw new ResubmitValidationError(
      'body',
      `body must be at most ${String(BODY_MAX_LENGTH)} characters`,
    )
  }
  if (input.body.trim().length === 0) {
    throw new ResubmitValidationError(
      'body',
      'body must not be empty or whitespace only',
    )
  }

  // 3. reason（任意）
  //    publish.ts と同じ正規化: undefined 許容、null 不許可（型不一致として 400）、
  //    string なら trim 前で 4,000 文字以下、trim 後 0 文字は null 正規化（m-03）。
  let reasonForAudit: string | null = null
  if (input.reason !== undefined) {
    if (typeof input.reason !== 'string') {
      throw new ResubmitValidationError('reason', 'reason must be a string or undefined')
    }
    if (input.reason.length > REASON_MAX_LENGTH) {
      throw new ResubmitValidationError(
        'reason',
        `reason must be at most ${String(REASON_MAX_LENGTH)} characters`,
      )
    }
    const trimmed = input.reason.trim()
    reasonForAudit = trimmed.length > 0 ? trimmed : null
  }

  // 4. expected_version
  if (typeof input.expected_version !== 'number') {
    throw new ResubmitValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new ResubmitValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new ResubmitValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new ResubmitValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  return { title: input.title, body: input.body, reasonForAudit }
}
