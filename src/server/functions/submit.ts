// API-002 / REQ-002 / REQ-013 / REQ-014 / NFR-003 / NFR-006 / NFR-007 /
// UC-002 / UC-014 / UC-016 / BR-PROPOSAL-01 / BR-PROPOSAL-02 / BR-AUTHZ-03 /
// BR-GUARD-01 / BR-GUARD-02 / BR-AUDIT-01 / BR-AUDIT-03 — submit（提出 server function）
//
// 役割:
//   - 投稿者本人が自分の `draft` 提案を倫理ガード 3 種 + PolicyAgreement 同意 +
//     必須項目検証を経て `submitted` に遷移させる mutation 本体。
//   - SCR-004 経由のフォーム送信から呼び出される。
//   - 認可 (authorize) → 入力検証 → status / 本文検査 → PolicyAgreement INSERT →
//     proposals CAS UPDATE → AuditLog append の 6 段。
//
// 不変条件:
//   - 認可は `authorize(viewer, 'proposal.submit', { kind:'proposal', author_id })`
//     の単一エントリ経由（BR-AUTHZ-03）。owner 不一致は `not_owner_resource` (404)
//     に正規化される。
//   - 不在 proposal も「リソース存在隠蔽」の暫定統一に従い 404（API-002 §認可拒否、
//     update-draft.ts と同じ sentinel パターン）。
//   - 倫理ガード 3 種 + `policy_agreement_consent` を server-side で検証する
//     （`BR-GUARD-01` / `BR-GUARD-02`、UI 出し分けに依存しない、NFR-003）。
//   - PolicyAgreement は **初回 submit のみ INSERT** する（DB-005 §不変条件 1 / 4、
//     `BR-GUARD-02`、Q-018 暫定）。同一 proposal の再到達時（本来到達しない設計だが
//     防御的）は既存レコードを再利用する。
//   - DB-003 §不変条件 5（status='submitted' 以降は current_policy_agreement_id
//     NOT NULL）を守るため、PolicyAgreement INSERT を先行させて id を取得し、
//     proposals.updateWithLock の patch に含めて 1 回で書き込む（API-002 §書き込み
//     順序の意図に整合: status 遷移と policy_agreement_id seed を同一 UPDATE で原子的
//     に確定）。MVP の in-memory 実装では完全な原子性は保証されないが、AuditLog
//     append を最後に置くことで `BR-AUDIT-03`（失敗時は append しない）は満たす。
//   - `policy_version` はクライアントから受け取らず、`deps.getCurrentPolicyVersion`
//     経由で server-side が決定する（API-002 §M-4 確定、NFR-003）。
//   - 楽観ロック失敗（`ProposalLockError`）は本関数では catch せずに伝搬する
//     （呼び出し側 wrapper が 409 CONFLICT にマップ、`BR-REVIEW-02`）。
//   - PolicyAgreement の UNIQUE 制約違反（フェイルセーフ）は
//     `SubmitStateError(reason='policy_agreement_unique_violation')` (422) に
//     正規化する（API-002 §エラーコード、`PolicyAgreementConflictError` の表面化を防ぐ）。
//   - AuditLog 書き込みは **成功確定の最後** で 1 件のみ append する（`BR-AUDIT-01` /
//     `BR-AUDIT-03`）。前段（authorize / validate / status / lock / PolicyAgreement /
//     proposals UPDATE）のいずれかで失敗した場合は append を実行しない。
//   - CSRF 検証 (NFR-006) は呼び出し側 server function wrapper の責務。
//   - logger / console は本関数では呼ばない（成功時 access log は wrapper 責務、
//     失敗時 `403_reason` は authorize / csrf 側で記録される）。
//
// 副作用:
//   - `proposals.findById` (read)
//   - `policyAgreements.findByProposalId` (read)
//   - `policyAgreements.create` (write、初回のみ)
//   - `proposals.updateWithLock` (write、CAS)
//   - `audit.append` (write、append-only、成功時のみ)
//
// 参照: docs/20-detail-design/apis/API-002.md,
//       docs/20-detail-design/db/DB-003.md (不変条件 1 / 5 / 6),
//       docs/20-detail-design/db/DB-004.md (不変条件 2 / 3 / 6),
//       docs/20-detail-design/db/DB-005.md (不変条件 1 / 4),
//       docs/02-requirements/04-business-rules.md
//         (BR-GUARD-01 / BR-GUARD-02 / BR-AUDIT-01 / BR-AUDIT-03 / BR-PROPOSAL-02)

import { VISIBILITIES, type Visibility } from '#/lib/domain/types'
import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditLogRepository } from '#/server/audit/repository'
import type { Logger } from '#/server/observability/logger'
import {
  PolicyAgreementConflictError,
  type PolicyAgreementRepository,
} from '#/server/repositories/policy-agreements'
import type { ProposalRepository } from '#/server/repositories/proposals'

/**
 * submit の入力（API-002 §ボディ §スキーマ）。
 *
 * - 倫理ガード 3 種 (`ethics_check_*`) はすべて `true` のみ受理（`BR-GUARD-01`）。
 * - `policy_agreement_consent` は `true` のみ受理（`BR-GUARD-02`）。
 * - `policy_version` は **意図的に持たない**（M-4 確定: クライアント信頼を排除し、
 *   server-side が `getCurrentPolicyVersion` から取得して PolicyAgreement に保存）。
 * - `title` / `body` は本 API では受け取らない（draft 段階で保存済み）。
 */
export interface SubmitInput {
  readonly visibility: Visibility
  readonly ethics_check_personal_info: boolean
  readonly ethics_check_no_libel: boolean
  readonly ethics_check_publicity_acknowledged: boolean
  readonly policy_agreement_consent: boolean
  readonly expected_version: number
}

/**
 * submit 成功時のレスポンス（API-002 §200 OK）。
 *
 * `status` は `'submitted'` のリテラル型として固定（draft → submitted 以外の遷移を
 * 起こさないことを型レベルで保証する）。
 */
export interface SubmitResult {
  readonly proposal_id: string
  readonly status: 'submitted'
  readonly version: number
  readonly submitted_at: number
  readonly policy_agreement_id: string
}

/**
 * 入力検証で問題があったフィールド（API-002 §4xx の `VALIDATION_ERROR` 400）。
 */
export type SubmitValidationField =
  | 'visibility'
  | 'ethics_check_personal_info'
  | 'ethics_check_no_libel'
  | 'ethics_check_publicity_acknowledged'
  | 'policy_agreement_consent'
  | 'expected_version'

/**
 * 入力検証エラー（HTTP 400 / `VALIDATION_ERROR`）。本例外で固定値として表現する。
 *
 * 倫理ガード 3 種が false / `policy_agreement_consent` が false / visibility 不正 /
 * `expected_version` が非整数 or 負数 のいずれでも throw される。
 */
export class SubmitValidationError extends Error {
  readonly field: SubmitValidationField
  readonly httpStatus: 400
  readonly errorCode: 'VALIDATION_ERROR'

  constructor(field: SubmitValidationField, message?: string) {
    super(message ?? `validation failed: ${field}`)
    this.name = 'SubmitValidationError'
    this.field = field
    this.httpStatus = 400
    this.errorCode = 'VALIDATION_ERROR'
  }
}

/**
 * 業務ルール違反エラー（HTTP 422 / `BUSINESS_RULE_VIOLATION`）。
 *
 * - `status_not_draft`: existing.status が `draft` 以外（API-002 §4xx）
 * - `title_or_body_empty`: existing の本文 / タイトルが空 or whitespace-only
 *   （DB-003 §不変条件・`BR-PROPOSAL-02`、submit には本文必須）
 * - `policy_agreement_unique_violation`: PolicyAgreement の `proposal_id` UNIQUE 違反
 *   （フェイルセーフ、本来到達しない: API-002 §エラーコード）
 *
 * `currentStatus` は `status_not_draft` の場合のみ設定される。本関数は
 * authorize で本人一致が確定した後に呼び出されるため、currentStatus を返しても
 * 他人の状態は漏れない（暫定統一の隠蔽方針と整合）。
 */
export type SubmitStateReason =
  | 'status_not_draft'
  | 'title_or_body_empty'
  | 'policy_agreement_unique_violation'

export class SubmitStateError extends Error {
  readonly httpStatus: 422
  readonly errorCode: 'BUSINESS_RULE_VIOLATION'
  readonly reason: SubmitStateReason
  readonly currentStatus: string | null

  constructor(reason: SubmitStateReason, currentStatus: string | null = null, message?: string) {
    const defaultMessage =
      reason === 'status_not_draft'
        ? `proposal is not in draft state: current=${currentStatus ?? 'unknown'}`
        : reason === 'title_or_body_empty'
          ? 'proposal title or body is empty'
          : 'policy agreement unique violation'
    super(message ?? defaultMessage)
    this.name = 'SubmitStateError'
    this.httpStatus = 422
    this.errorCode = 'BUSINESS_RULE_VIOLATION'
    this.reason = reason
    this.currentStatus = currentStatus
  }
}

/**
 * submit の依存。
 *
 * - `proposals` / `policyAgreements` / `audit` の 3 リポジトリを注入する。
 * - `getCurrentPolicyVersion` は同期関数。MVP では `() => 'mvp-initial'` を渡す
 *   想定（API-018 と同じソースから取得、`BR-GUARD-02`）。クライアントから受け取らない
 *   方針（M-4 確定）に整合する。
 * - `logger` は受け口のみ用意し、本関数からは呼ばない（NFR-005）。
 */
export interface SubmitDeps {
  readonly proposals: ProposalRepository
  readonly policyAgreements: PolicyAgreementRepository
  readonly audit: AuditLogRepository
  readonly getCurrentPolicyVersion: () => string
  readonly logger?: Logger
}

const VISIBILITY_VALUES: ReadonlySet<Visibility> = new Set<Visibility>(VISIBILITIES)

/**
 * 不在 proposal を 404 に集約するため authorize() に渡す sentinel author_id。
 * UUID v7 の format に合致しない値を選び、衝突可能性を排除する。
 */
const NONEXISTENT_AUTHOR_SENTINEL = '__nonexistent_proposal_author__'

/**
 * submit server function 本体。
 *
 * 順序（API-002 §認可 / §バリデーション規約 / §書き込み順序）:
 *   1. CSRF 検証は呼び出し側 wrapper で実施済み前提（NFR-006）。
 *   2. proposals.findById(proposalId)
 *      - 不在 → authorize() を sentinel author_id で呼び出し 404 not_owner_resource。
 *   3. authorize(viewer, 'proposal.submit', { kind:'proposal', author_id: existing.author_id })
 *      - viewer === null → 401 not_authenticated
 *      - viewer.user_id !== existing.author_id → 404 not_owner_resource
 *   4. 入力検証（倫理ガード 3 種 / consent / visibility / expected_version）
 *   5. existing.status !== 'draft' → SubmitStateError('status_not_draft', currentStatus)
 *   6. existing.title / body が空 or whitespace-only → SubmitStateError('title_or_body_empty')
 *   7. policyAgreements.findByProposalId(proposalId)
 *      - 既存あれば再利用、無ければ create で新規生成。
 *      - PolicyAgreementConflictError → SubmitStateError('policy_agreement_unique_violation')
 *   8. proposals.updateWithLock(proposalId, expected_version, {
 *        status:'submitted', submitted_at, current_policy_agreement_id })
 *      - ProposalLockError は伝搬（呼び出し側 wrapper が 409 にマップ）。
 *   9. audit.append({ action:'submit', actor / role / target / before / after /
 *        reason:null, policy_agreement_id })
 *  10. SubmitResult を整形して返す。
 *
 * 失敗時 AuditLog 書き込み無し（`BR-AUDIT-03`）: 9 が呼ばれるのは 1〜8 すべて成功した
 * 場合のみ。1〜8 のいずれかで throw すると 9 に到達しない。
 */
export async function submit(
  viewer: Viewer | null,
  proposalId: string,
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  // (2) 存在確認: read。アクセス権が無い viewer に「proposal が存在するか」を leak させない
  //     ため、不在時は authorize() を sentinel author_id で呼び 404 に正規化する。
  const existing = await deps.proposals.findById(proposalId)

  if (existing === null) {
    authorize(viewer, 'proposal.submit', {
      kind: 'proposal',
      author_id: NONEXISTENT_AUTHOR_SENTINEL,
    })
    // unreachable: authorize() が必ず throw する。
    throw new Error('unreachable: authorize must reject when proposal is missing')
  }

  // (3) 認可: 認証済 + 本人一致をワンショットで検査。owner 不一致は 404 not_owner_resource。
  authorize(viewer, 'proposal.submit', {
    kind: 'proposal',
    author_id: existing.author_id,
  })

  // ここに到達した時点で viewer は非 null（authorize が throw する）。型を絞り込む。
  if (viewer === null) {
    // unreachable: authorize() が 'not_authenticated' で throw するため。
    throw new Error('unreachable: authorize must reject null viewer for proposal.submit')
  }

  // (4) 入力検証: API-002 §バリデーション規約 (BR-GUARD-01 / BR-GUARD-02)。
  validateInput(input)

  // (5) status 検査: API-002 §バリデーション規約 step 6（draft 以外は 422）。
  if (existing.status !== 'draft') {
    throw new SubmitStateError('status_not_draft', existing.status)
  }

  // (6) 本文必須検査: DB-003 §不変条件 / BR-PROPOSAL-02。submit 時点で title / body が
  //     空 or whitespace-only なら 422 に正規化（draft 段階での保存内容を server-side で再検査）。
  if (existing.title.trim().length === 0 || existing.body.trim().length === 0) {
    throw new SubmitStateError('title_or_body_empty')
  }

  // (7) PolicyAgreement: 既存があれば再利用、無ければ create（DB-005 §不変条件 1 / 4、
  //     BR-GUARD-02）。本来「再 submit」には到達しない設計だが、防御的に既存検査を
  //     先行させて UNIQUE 違反を未然に避ける。
  const existingAgreement = await deps.policyAgreements.findByProposalId(proposalId)
  let policyAgreementId: string
  if (existingAgreement !== null) {
    policyAgreementId = existingAgreement.id
  } else {
    try {
      const created = await deps.policyAgreements.create({
        user_id: viewer.user_id,
        proposal_id: proposalId,
        policy_version: deps.getCurrentPolicyVersion(),
      })
      policyAgreementId = created.id
    } catch (e) {
      if (e instanceof PolicyAgreementConflictError) {
        // フェイルセーフ: findByProposalId と create の間に他経路で INSERT された
        // 場合（本来到達しない）、422 に正規化する（API-002 §エラーコード）。
        throw new SubmitStateError('policy_agreement_unique_violation')
      }
      throw e
    }
  }

  // (8) DB-003 CAS UPDATE: status / submitted_at / current_policy_agreement_id を
  //     1 回の UPDATE で確定する。DB-003 §不変条件 5（status=submitted では
  //     current_policy_agreement_id NOT NULL）と整合させるため、policy_agreement_id を
  //     patch に含める（PolicyAgreement INSERT を先行させた理由）。
  //     楽観ロック失敗 (ProposalLockError) は伝搬（呼び出し側 wrapper が 409 にマップ）。
  const submittedAt = Date.now()
  const updated = await deps.proposals.updateWithLock(proposalId, input.expected_version, {
    status: 'submitted',
    submitted_at: submittedAt,
    current_policy_agreement_id: policyAgreementId,
  })

  // 整合性アサート: status 遷移は updateWithLock の patch に依存する。リテラル型を
  //     固定するためここで narrow する（不正な repository 実装に対する防御）。
  if (updated.status !== 'submitted') {
    throw new Error(
      `assertion failed: updateWithLock returned non-submitted status: ${updated.status}`,
    )
  }
  if (updated.submitted_at === null) {
    throw new Error('assertion failed: updateWithLock returned null submitted_at')
  }

  // (9) DB-004 AuditLog append: 成功確定の最後で 1 件のみ append（BR-AUDIT-01 /
  //     BR-AUDIT-03）。reason は submit では任意 (Q-019 暫定) で常に null
  //     （API-002 §AuditLog 書き込み）。actor_role は viewer.roles のスナップショット
  //     をカンマ区切りで保存（DB-004 §不変条件 4、API-002 §AuditLog 書き込み m-02）。
  await deps.audit.append({
    actor_id: viewer.user_id,
    actor_role: viewer.roles.join(','),
    action: 'submit',
    target_proposal_id: proposalId,
    before_status: 'draft',
    after_status: 'submitted',
    before_visibility: null,
    after_visibility: null,
    reason: null,
    policy_agreement_id: policyAgreementId,
  })

  // (10) 戻り値整形: API-002 §200 OK の shape。status='submitted' リテラル固定。
  return {
    proposal_id: updated.id,
    status: 'submitted',
    version: updated.version,
    submitted_at: updated.submitted_at,
    policy_agreement_id: policyAgreementId,
  }
}

/**
 * 入力検証本体。API-002 §バリデーション規約に従う。
 *
 * 検証順序（仕様 §バリデーション規約 step 1〜4）:
 *   1. 倫理ガード 3 種すべて `true`（false なら field ごとに throw、`BR-GUARD-01`）
 *   2. `policy_agreement_consent === true`（false なら throw、`BR-GUARD-02`）
 *   3. `visibility` enum 検証（DB-003 CHECK と二重防御）
 *   4. `expected_version` 必須・非負・safe integer
 *
 * 失敗時は `SubmitValidationError(field)` を throw する（HTTP 400）。
 */
function validateInput(input: SubmitInput): void {
  // 1. 倫理ガード 3 種（BR-GUARD-01）。型 boolean で受けるが runtime 防御も入れる。
  if (input.ethics_check_personal_info !== true) {
    throw new SubmitValidationError(
      'ethics_check_personal_info',
      'ethics_check_personal_info must be true',
    )
  }
  if (input.ethics_check_no_libel !== true) {
    throw new SubmitValidationError(
      'ethics_check_no_libel',
      'ethics_check_no_libel must be true',
    )
  }
  if (input.ethics_check_publicity_acknowledged !== true) {
    throw new SubmitValidationError(
      'ethics_check_publicity_acknowledged',
      'ethics_check_publicity_acknowledged must be true',
    )
  }

  // 2. PolicyAgreement 同意（BR-GUARD-02）。
  if (input.policy_agreement_consent !== true) {
    throw new SubmitValidationError(
      'policy_agreement_consent',
      'policy_agreement_consent must be true',
    )
  }

  // 3. visibility enum。
  if (!VISIBILITY_VALUES.has(input.visibility)) {
    throw new SubmitValidationError(
      'visibility',
      `visibility must be one of: ${VISIBILITIES.join(', ')}`,
    )
  }

  // 4. expected_version。
  if (typeof input.expected_version !== 'number') {
    throw new SubmitValidationError(
      'expected_version',
      'expected_version must be a number',
    )
  }
  if (!Number.isInteger(input.expected_version)) {
    throw new SubmitValidationError(
      'expected_version',
      'expected_version must be an integer',
    )
  }
  if (input.expected_version < 0) {
    throw new SubmitValidationError(
      'expected_version',
      'expected_version must be non-negative',
    )
  }
  if (!Number.isSafeInteger(input.expected_version)) {
    throw new SubmitValidationError(
      'expected_version',
      'expected_version must be a safe integer',
    )
  }
}
