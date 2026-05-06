// API-008 / REQ-005 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-004 / NFR-005 /
// NFR-006 / NFR-007 / UC-008 / UC-013 / UC-014 / BR-PROPOSAL-01 / BR-PUBLISH-03 /
// BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 / BR-AUTHZ-03 —
// withdraw（取り下げ server function、admin 専権）
//
// 役割:
//   - admin が `published` 状態の提案を `withdrawn` に遷移させる mutation
//     （API-008 §概要、UC-008、`BR-PUBLISH-03` admin 専権）。reason は **必須**
//     （DB-004 §不変条件 2、BR-PUBLISH-03）。
//   - 認可 (authorize) → 入力検証 → status 検査 → proposals CAS UPDATE → AuditLog
//     append の 5 段。publish (API-007) と類似だが
//     (a) action は `'admin.withdraw'` で reviewer / user / auditor は 404
//         （`BR-PUBLISH-03`、authorize の admin.withdraw 分岐は admin のみ通過）
//     (b) `status='published'` のみ通過、それ以外は 422
//         （特に `approved → withdrawn` は不可。REQ-005 / DB-003 §不変条件 1
//         の遷移 #9: published → withdrawn のみ）
//     (c) `withdrawn_at = Date.now()` を同一 UPDATE で記録する
//         （DB-003 §withdrawn_at、API-008 §副作用）
//     (d) `published_at` は **保持**（DB-003 §published_at「withdrawn 後も保持」、
//         REQ-005: AuditLog から `(published_at, withdrawn_at)` ペアが抽出可能）。
//         `published_at` を patch に含めない（updateWithLock の挙動「未指定は現状値維持」を活用）。
//     (e) reason は **必須**（DB-004 §reason 表 withdraw=必須、API-008 §ボディ）。
//         空 / 空白のみ / 4001 文字超 / 非 string / undefined はすべて 400
//         （WithdrawValidationError(field='reason')）。
//     (f) AuditLog の action は `withdraw`、before='published' / after='withdrawn'。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'admin.withdraw')`。authorize の admin.withdraw 分岐は
//     `expectProposalResource` を呼ばないが、publish と形を揃えて proposal リソースを渡す。
//     不在 proposal の隠蔽（API-008 §認可拒否「proposal 不存在 → 404」）は authorize
//     を通らないため、本関数で先に findById → null 時は viewer の認証状態で
//     401/404 を直接 throw する（publish と同型、BR-AUTHZ-02）。
//   - reason は **必須**: trim 後 1〜4,000 文字、trim 前で 4,000 文字以下（DB-004 §reason 最大長）。
//     trim 後 0 文字（空 / 空白のみ）は 400（WithdrawValidationError）。
//     publish と異なり null 正規化は行わない。
//   - status != 'published' は 422 BUSINESS_RULE_VIOLATION（API-008 §422、
//     DB-003 §不変条件 1 の遷移 #9）。AuditLog 記録なし。`approved → withdrawn` は
//     直接遷移できず 422 となる（REQ-005、§概要の明記）。
//   - 楽観ロック失敗（`ProposalLockError`）は伝搬し、呼び出し側 wrapper が 409 にマップ
//     （API-008 §409）。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append（BR-AUDIT-01 /
//     BR-AUDIT-03）。前段で失敗した場合は append しない。policy_agreement_id は常に
//     null（DB-004 §不変条件 6: withdraw では PolicyAgreement と紐付かない）。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（NFR-005）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `proposals.updateWithLock` (write、CAS、`status='withdrawn' / withdrawn_at=Date.now()`、
//     `published_at` は patch に含めず保持)
//   - `audit.append` (write、append-only、成功時のみ)
//
// 参照: docs/20-detail-design/apis/API-008.md,
//       docs/20-detail-design/db/DB-003.md (不変条件 1 §status 遷移 9 / §published_at /
//                                            §withdrawn_at),
//       docs/20-detail-design/db/DB-004.md (不変条件 2 / 3 / 6、§reason 必須),
//       docs/02-requirements/04-business-rules.md
//         (BR-PUBLISH-03 / BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-03)

import type { ProposalStatus } from '#/lib/domain/types'
import { authorize, AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditLogRepository } from '#/server/audit/repository'
import type { Logger } from '#/server/observability/logger'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * withdraw の入力（API-008 §ボディ §スキーマ）。
 *
 * - `reason` は **必須**（BR-PUBLISH-03 / DB-004 §reason 表）。trim 前で 4,000 文字以下、
 *   trim 後 1 文字以上。空 / 空白のみは 400（publish の null 正規化と異なる）。
 * - `expected_version` は CAS のための整数（API-008 §409）。
 */
export interface WithdrawInput {
  readonly reason: string
  readonly expected_version: number
}

/**
 * withdraw 成功時のレスポンス（API-008 §200 OK）。
 *
 * `status` は `'withdrawn'` のリテラル型として固定（published → withdrawn 以外の遷移を
 * 起こさないことを型レベルで保証する）。
 *
 * `withdrawn_at` は完了条件「withdrawn_at を現在時刻で設定」を呼び出し側が観測できる
 * よう返す（API-008 §200 OK 直接の項目）。`published_at` は保持された値を返す
 * （API-008 §200 OK スキーマ「公開時刻（保持される）」）。
 */
export interface WithdrawResult {
  readonly proposal_id: string
  readonly status: 'withdrawn'
  readonly version: number
  readonly withdrawn_at: number
  readonly published_at: number
  readonly audit_log_id: string
}

/**
 * 入力検証で問題があったフィールド（API-008 §400 `VALIDATION_ERROR`）。
 *
 * withdraw では reason は **必須** のため、空 / 空白のみ / 文字数超過 / 非 string /
 * undefined のすべてが `reason` で 400 になる。
 */
export type WithdrawValidationField = 'reason' | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。
 *
 * 発生条件:
 *   - `reason` が undefined / null / 非 string
 *   - `reason` の **trim 前** 文字数が 4,000 文字超
 *   - `reason` の **trim 後** 文字数が 0（空 / 空白のみ）
 *   - `expected_version` が非数値 / 非整数 / 負数 / 非 safe integer
 */
export class WithdrawValidationError extends Error {
  readonly field: WithdrawValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: WithdrawValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'WithdrawValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * `status_not_published`: existing.status が `published` 以外（API-008 §422、
 * DB-003 §不変条件 1 遷移 #9、REQ-005 「approved → withdrawn は不可、必ず published 経由」）。
 * `currentStatus` には findById で取得した実際の status を含める（authorize で admin 通過済の
 * ため、status を返しても権限を超えた情報漏洩にはならない）。
 */
export type WithdrawStateReason = 'status_not_published'

export class WithdrawStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: WithdrawStateReason
  readonly currentStatus: ProposalStatus

  constructor(reason: WithdrawStateReason, currentStatus: ProposalStatus, message?: string) {
    super(
      message
      ?? `proposal is not in published state: current=${currentStatus}`,
    )
    this.name = 'WithdrawStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * withdraw の依存。
 *
 * - `proposals` / `audit` の 2 リポジトリを注入する（PolicyAgreement は不要）。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface WithdrawDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
  readonly logger?: Logger
}

const REASON_MAX_LENGTH = 4_000

/**
 * withdraw server function 本体。
 *
 * 順序（API-008 §バリデーション規約、API-007 と同等で reason 必須を 400 で先に弾く点が異なる）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在: viewer === null → 401 not_authenticated、それ以外 → 404 not_owner_resource
 *        （API-008 §認可拒否「proposal 不存在 → 404」、暫定統一の隠蔽方針）。
 *   3. authorize(viewer, 'admin.withdraw')
 *      - viewer === null → 401 not_authenticated
 *      - role に admin を含まない → 404 insufficient_role
 *        （reviewer / user / auditor / guest は通過しない、`BR-PUBLISH-03`）。
 *   4. 入力検証（reason 必須 / expected_version 必須、API-008 §400）
 *   5. existing.status !== 'published' → WithdrawStateError(reason='status_not_published')
 *   6. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'withdrawn', withdrawn_at: now })
 *      - `published_at` は patch に含めない（保持、REQ-005）。
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   7. audit.append({ action:'withdraw', actor / role / target /
 *        before_status:'published', after_status:'withdrawn',
 *        reason: trimmed (必須), policy_agreement_id: null })
 *   8. WithdrawResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（BR-AUDIT-03）: 7 が呼ばれるのは 1〜6 すべて成功した
 * 場合のみ。1〜6 のいずれかで throw すると 7 に到達しない。
 */
export async function withdraw(
  viewer: Viewer | null,
  proposalId: string,
  input: WithdrawInput,
  deps: WithdrawDeps,
): Promise<WithdrawResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は viewer の認証状態に応じて 401/404 を直接 throw する。
  //     authorize() の admin.withdraw は resource を見ないため sentinel パターンが使えない
  //     （sentinel を渡しても role 判定だけが走り 200 通過してしまう）。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    if (viewer === null) {
      throw new AuthorizationError('not_authenticated')
    }
    throw new AuthorizationError('not_owner_resource')
  }

  // (3) 認可: 認証済 + admin。reviewer / user / auditor は insufficient_role(404)。
  //     resource は authorize の admin.withdraw 分岐で参照されないが、publish と
  //     形を揃えて owner / visibility / status を渡す（将来 authorize が要求する場合に備える）。
  authorize(viewer, 'admin.withdraw', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for admin.withdraw')
  }

  // (4) 入力検証: API-008 §バリデーション規約 step 1（reason 必須 / expected_version）。
  //     publish と異なり trim 後 0 文字は 400 で拒否する（null 正規化なし）。
  const reasonForAudit = validateInput(input)

  // (5) status 検査: API-008 §バリデーション規約 step 3（published 以外は 422）。
  //     REQ-005 の方針通り「approved → withdrawn は不可、必ず published 経由」。
  if (existing.status !== 'published') {
    throw new WithdrawStateError('status_not_published', existing.status)
  }

  // (6) DB-003 CAS UPDATE: status='withdrawn' / withdrawn_at=Date.now() を 1 回の UPDATE で確定。
  //     - withdrawn_at の根拠: DB-003 §withdrawn_at「`published → withdrawn` 時に記録」、
  //       API-008 §副作用「`withdrawn_at=now()`」。
  //     - published_at は **patch に含めない**（DB-003 §published_at「withdrawn 後も保持」、
  //       REQ-005、updateWithLock の仕様: 未指定フィールドは現状値維持）。
  //     - assignee_id は published 時点で既に null（DB-003 §不変条件 4）。withdraw でも
  //       null のままで良いため patch に含めない。
  //     - 楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const withdrawnAt = Date.now()
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'withdrawn',
    withdrawn_at: withdrawnAt,
  })

  // 整合性アサート: status / withdrawn_at は updateWithLock の patch に依存する。
  //     published_at は CAS UPDATE 前後で保持されているはず（不正な repository 実装に対する防御）。
  if (updated.status !== 'withdrawn') {
    throw new Error(
      `assertion failed: updateWithLock returned non-withdrawn status: ${updated.status}`,
    )
  }
  if (updated.withdrawn_at === null) {
    throw new Error('assertion failed: updateWithLock did not set withdrawn_at')
  }
  if (updated.published_at === null) {
    // published → withdrawn 遷移の前提として published_at は必ず設定済（DB-003 §published_at）。
    // 不正な repository 実装に対する防御。
    throw new Error('assertion failed: published_at was unexpectedly cleared during withdraw')
  }

  // (7) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（BR-AUDIT-01 /
  //     BR-AUDIT-03）。reason は withdraw では **必須**（DB-004 §reason 表 / BR-PUBLISH-03）。
  //     trim 済の非空文字列を渡す（validateInput が保証）。
  //     actor_role は viewer.roles のスナップショットをカンマ区切りで保存
  //     （DB-004 §不変条件 4 / API-008 §AuditLog 書き込み）。
  //     policy_agreement_id は withdraw では常に null（DB-004 §不変条件 6）。
  const auditEntry = await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'withdraw',
    target_proposal_id: proposalId,
    before_status: 'published',
    after_status: 'withdrawn',
    before_visibility: null,
    after_visibility: null,
    reason: reasonForAudit,
    policy_agreement_id: null,
  })

  // (8) 戻り値整形: API-008 §200 OK の shape。status='withdrawn' リテラル固定。
  return {
    proposal_id: updated.id,
    status: 'withdrawn',
    version: updated.version,
    withdrawn_at: updated.withdrawn_at,
    published_at: updated.published_at,
    audit_log_id: auditEntry.id,
  }
}

/**
 * 入力検証本体。API-008 §バリデーション規約に従う。
 *
 * 検証順序:
 *   1. `reason`: **必須** string、trim 前で 4,000 文字以下（DB-004 §reason 最大長）、
 *      trim 後 1 文字以上（BR-PUBLISH-03、publish の null 正規化と異なる）。
 *   2. `expected_version`: 必須・非負・safe integer（API-008 §409）
 *
 * 戻り値は AuditLog に保存する canonical な reason: trim 済の非空文字列。
 * 失敗時は `WithdrawValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: WithdrawInput): string {
  // 1. reason（必須）
  //    publish.ts と異なり undefined / null / 空 / whitespace-only すべて 400。
  if (input.reason === undefined || input.reason === null) {
    throw new WithdrawValidationError('reason', 'reason is required')
  }
  if (typeof input.reason !== 'string') {
    throw new WithdrawValidationError('reason', 'reason must be a string')
  }
  // 4,000 文字制限は trim 前の元文字列に対して掛ける（DB-004 §reason の最大長と整合、
  // AuditLogRepository.append の検証と二重防御）。
  if (input.reason.length > REASON_MAX_LENGTH) {
    throw new WithdrawValidationError(
      'reason',
      `reason must be at most ${String(REASON_MAX_LENGTH)} characters`,
    )
  }
  const trimmed = input.reason.trim()
  if (trimmed.length === 0) {
    throw new WithdrawValidationError('reason', 'reason must not be empty after trim')
  }

  // 2. expected_version
  if (typeof input.expected_version !== 'number') {
    throw new WithdrawValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new WithdrawValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new WithdrawValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new WithdrawValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }

  return trimmed
}
