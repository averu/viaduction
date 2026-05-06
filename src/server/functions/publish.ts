// API-007 / REQ-004 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-004 / NFR-005 /
// NFR-006 / NFR-007 / UC-007 / UC-013 / UC-014 / BR-PROPOSAL-01 / BR-PUBLISH-01 /
// BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 / BR-AUTHZ-03 —
// publish（公開 server function）
//
// 役割:
//   - admin が `approved` 状態の提案を `published` に遷移させる mutation
//     （API-007 §概要、UC-007、`BR-PUBLISH-01` admin 専権）。reason は任意
//     （API-007 §リクエスト、DB-004 §reason、Q-019 暫定）。
//   - 認可 (authorize) → 入力検証 → status 検査 → proposals CAS UPDATE → AuditLog
//     append の 5 段。approve (API-004) と類似だが
//     (a) action は 'admin.publish' で reviewer / user / auditor は 404
//         （`BR-PUBLISH-01`、authorize の admin.publish 分岐は admin のみ通過）
//     (b) `status='approved'` のみ通過、それ以外は 422
//     (c) `published_at = Date.now()` を同一 UPDATE で記録する
//         （DB-003 §published_at、API-007 §副作用）
//     (d) reason は **任意**（DB-004 §reason 表 publish=任意、API-007 §ボディ）。
//         空 / 空白のみは AuditLog に `reason: null` で記録（m-03 確定: 明示的拒否 400 はしない）。
//         長さ超過 4,000 のみ 400 で弾く（DB-004 §reason 最大長と整合）。
//     (e) AuditLog の action は `publish`、before='approved' / after='published'。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'admin.publish')` を resource 無しで呼ぶ。
//     authorize の `admin.publish` 分岐は `expectProposalResource` を呼ばないため、
//     引数は省略可。不在 proposal の隠蔽（API-007 §認可拒否「proposal 不存在 → 404」）は
//     authorize を通らないため、本関数で先に findById → null 時は viewer の認証状態で
//     401/404 を直接 throw する（approve / startReview と同型、BR-AUTHZ-02）。
//   - reason は **trim 後 0 文字なら null**、trim 後 1〜4,000 文字なら trim 済を保存。
//     trim 前の元文字列が 4,000 文字を超える場合のみ 400（PublishValidationError）。
//   - status != 'approved' は 422 BUSINESS_RULE_VIOLATION（API-007 §422、
//     DB-003 §不変条件 1 の遷移 #8）。AuditLog 記録なし。
//   - 楽観ロック失敗（`ProposalLockError`）は伝搬し、呼び出し側 wrapper が 409 にマップ
//     （API-007 §409）。
//   - `assignee_id` は approved 時点で既に NULL（DB-003 §不変条件 4）だが、
//     不正な repository 実装に対する防御として明示的に `null` を patch に乗せる。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append（BR-AUDIT-01 /
//     BR-AUDIT-03）。前段で失敗した場合は append しない。policy_agreement_id は常に
//     null（DB-004 §不変条件 6: publish では PolicyAgreement と紐付かない）。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（NFR-005）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `proposals.updateWithLock` (write、CAS、`status='published' / assignee_id=null /
//     published_at=Date.now()`)
//   - `audit.append` (write、append-only、成功時のみ)
//
// 参照: docs/20-detail-design/apis/API-007.md,
//       docs/20-detail-design/db/DB-003.md (不変条件 1 / 4 / §関連 API §published_at),
//       docs/20-detail-design/db/DB-004.md (不変条件 2 / 3 / 6、§reason 任意),
//       docs/02-requirements/04-business-rules.md
//         (BR-PUBLISH-01 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-03)

import type { ProposalStatus } from '#/lib/domain/types'
import { authorize, AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditLogRepository } from '#/server/audit/repository'
import type { Logger } from '#/server/observability/logger'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * publish の入力（API-007 §ボディ §スキーマ）。
 *
 * - `reason` は **任意**（Q-019 暫定 / DB-004 §reason 表）。指定する場合は trim 前で
 *   4,000 文字以下。trim 後 0 文字（空 / 空白のみ）の場合は AuditLog に `reason: null`
 *   として記録（m-03: server-side で null へ正規化、明示拒否はしない）。
 * - `expected_version` は CAS のための整数（API-007 §409）。
 */
export interface PublishInput {
  readonly reason?: string
  readonly expected_version: number
}

/**
 * publish 成功時のレスポンス（API-007 §200 OK）。
 *
 * `status` は `'published'` のリテラル型として固定（approved → published 以外の遷移を
 * 起こさないことを型レベルで保証する）。
 *
 * `audit_log_id` は API-007 §200 OK スキーマで明示されているため必須。
 * `published_at` は完了条件「published_at を現在時刻で設定」を呼び出し側が観測できる
 * よう返す（API-007 §200 OK 直接の項目）。
 */
export interface PublishResult {
  readonly proposal_id: string
  readonly status: 'published'
  readonly version: number
  readonly published_at: number
  readonly audit_log_id: string
}

/**
 * 入力検証で問題があったフィールド（API-007 §400 `VALIDATION_ERROR`）。
 *
 * publish では reason は任意のため、文字数超過のみ `reason` で 400 になる。
 * 通常の null / 空 / 空白は 400 にならず null へ正規化される。
 */
export type PublishValidationField = 'reason' | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。
 *
 * 発生条件:
 *   - `reason` が string でも undefined でもない型
 *   - `reason` の **trim 前** 文字数が 4,000 文字超
 *   - `expected_version` が非数値 / 非整数 / 負数 / 非 safe integer
 */
export class PublishValidationError extends Error {
  readonly field: PublishValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: PublishValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'PublishValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * `status_not_approved`: existing.status が `approved` 以外（API-007 §422、
 * DB-003 §不変条件 1 遷移 #8）。`currentStatus` には findById で取得した実際の
 * status を含める（authorize で admin 通過済のため、status を返しても
 * 権限を超えた情報漏洩にはならない）。
 */
export type PublishStateReason = 'status_not_approved'

export class PublishStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: PublishStateReason
  readonly currentStatus: ProposalStatus

  constructor(reason: PublishStateReason, currentStatus: ProposalStatus, message?: string) {
    super(
      message
      ?? `proposal is not in approved state: current=${currentStatus}`,
    )
    this.name = 'PublishStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * publish の依存。
 *
 * - `proposals` / `audit` の 2 リポジトリを注入する（PolicyAgreement は不要）。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface PublishDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
  readonly logger?: Logger
}

const REASON_MAX_LENGTH = 4_000

/**
 * publish server function 本体。
 *
 * 順序（API-007 §バリデーション規約）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在: viewer === null → 401 not_authenticated、それ以外 → 404 not_owner_resource
 *        （API-007 §認可拒否「proposal 不存在 → 404」、暫定統一の隠蔽方針）。
 *   3. authorize(viewer, 'admin.publish')
 *      - viewer === null → 401 not_authenticated
 *      - role に admin を含まない → 404 insufficient_role
 *        （reviewer / user / auditor / guest は通過しない、`BR-PUBLISH-01`）。
 *   4. 入力検証（reason 任意 / expected_version 必須、API-007 §400）
 *   5. existing.status !== 'approved' → PublishStateError(reason='status_not_approved')
 *   6. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'published', assignee_id:null, published_at: now })
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   7. audit.append({ action:'publish', actor / role / target /
 *        before_status:'approved', after_status:'published',
 *        reason: trimmed.length>0 ? trimmed : null, policy_agreement_id: null })
 *   8. PublishResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（BR-AUDIT-03）: 7 が呼ばれるのは 1〜6 すべて成功した
 * 場合のみ。1〜6 のいずれかで throw すると 7 に到達しない。
 */
export async function publish(
  viewer: Viewer | null,
  proposalId: string,
  input: PublishInput,
  deps: PublishDeps,
): Promise<PublishResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は viewer の認証状態に応じて 401/404 を直接 throw する。
  //     authorize() の admin.publish は resource を見ないため sentinel パターンが使えない
  //     （sentinel を渡しても role 判定だけが走り 200 通過してしまう）。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    if (viewer === null) {
      throw new AuthorizationError('not_authenticated')
    }
    throw new AuthorizationError('not_owner_resource')
  }

  // (3) 認可: 認証済 + admin。reviewer / user / auditor は insufficient_role(404)。
  //     resource は authorize の admin.publish 分岐で参照されないが、approve と
  //     形を揃えて owner / visibility / status を渡す（将来 authorize が要求する場合に備える）。
  authorize(viewer, 'admin.publish', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for admin.publish')
  }

  // (4) 入力検証: API-007 §バリデーション規約 step 1（reason 任意 / expected_version）。
  //     reason が trim 後 0 文字なら null へ正規化（m-03、AuditLog に記録するための値）。
  const reasonForAudit = validateInput(input)

  // (5) status 検査: API-007 §バリデーション規約 step 3（approved 以外は 422）。
  if (existing.status !== 'approved') {
    throw new PublishStateError('status_not_approved', existing.status)
  }

  // (6) DB-003 CAS UPDATE: status='published' / published_at=Date.now() / assignee_id=null
  //     を 1 回の UPDATE で確定する。
  //     - assignee_id の根拠: DB-003 §不変条件 4「status='approved' 以降は assignee_id IS NULL」。
  //       approved 段階で既に null のはずだが、不正な repository 実装に対する防御として
  //       明示的に null を patch に乗せる。
  //     - published_at の根拠: DB-003 §published_at「`approved → published` 時に記録」、
  //       API-007 §副作用「`published_at=now()`」。
  //     - 楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const publishedAt = Date.now()
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'published',
    assignee_id: null,
    published_at: publishedAt,
  })

  // 整合性アサート: status / published_at は updateWithLock の patch に依存する。
  //     リテラル型と非 null を narrow するため runtime でも検査（不正な repository
  //     実装に対する防御）。
  if (updated.status !== 'published') {
    throw new Error(
      `assertion failed: updateWithLock returned non-published status: ${updated.status}`,
    )
  }
  if (updated.published_at === null) {
    throw new Error('assertion failed: updateWithLock did not set published_at')
  }
  if (updated.assignee_id !== null) {
    throw new Error('assertion failed: updateWithLock did not clear assignee_id')
  }

  // (7) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（BR-AUDIT-01 /
  //     BR-AUDIT-03）。reason は publish では任意（DB-004 §reason 表）。
  //     trim 後 0 文字なら null として記録（m-03、空文字の API 入力は null 正規化）。
  //     actor_role は viewer.roles のスナップショットをカンマ区切りで保存
  //     （DB-004 §不変条件 4 / API-007 §AuditLog 書き込み）。
  //     policy_agreement_id は publish では常に null（DB-004 §不変条件 6）。
  const auditEntry = await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'publish',
    target_proposal_id: proposalId,
    before_status: 'approved',
    after_status: 'published',
    before_visibility: null,
    after_visibility: null,
    reason: reasonForAudit,
    policy_agreement_id: null,
  })

  // (8) 戻り値整形: API-007 §200 OK の shape。status='published' リテラル固定。
  return {
    proposal_id: updated.id,
    status: 'published',
    version: updated.version,
    published_at: updated.published_at,
    audit_log_id: auditEntry.id,
  }
}

/**
 * 入力検証本体。API-007 §バリデーション規約に従う。
 *
 * 検証順序:
 *   1. `reason`: undefined または string、string なら trim 前で 4,000 文字以下
 *      （DB-004 §reason 最大長）。trim 後 0 文字（空 / 空白のみ）は **null として正規化**
 *      し AuditLog に `reason: null` で記録（m-03、明示拒否はしない）。
 *   2. `expected_version`: 必須・非負・safe integer（API-007 §409）
 *
 * 戻り値は AuditLog に保存する canonical な reason: trim 済の非空文字列、または null。
 * 失敗時は `PublishValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: PublishInput): string | null {
  // 1. reason（任意）
  let reasonForAudit: string | null = null
  if (input.reason !== undefined) {
    if (typeof input.reason !== 'string') {
      throw new PublishValidationError('reason', 'reason must be a string or undefined')
    }
    // 4,000 文字制限は trim 前の元文字列に対して掛ける（DB-004 §reason の最大長と整合、
    // AuditLogRepository.append の検証と二重防御）。
    if (input.reason.length > REASON_MAX_LENGTH) {
      throw new PublishValidationError(
        'reason',
        `reason must be at most ${String(REASON_MAX_LENGTH)} characters`,
      )
    }
    const trimmed = input.reason.trim()
    // m-03: 空文字 / 空白のみは null へ正規化（明示拒否はしない）。
    reasonForAudit = trimmed.length > 0 ? trimmed : null
  }

  // 2. expected_version
  if (typeof input.expected_version !== 'number') {
    throw new PublishValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new PublishValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new PublishValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new PublishValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  return reasonForAudit
}
