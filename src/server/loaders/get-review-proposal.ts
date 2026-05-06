// API-015 / REQ-003 / REQ-009 / REQ-010 / REQ-011 / UC-003 / UC-004 / UC-005 / UC-006 / DB-003 / DB-004 / DB-005
// — get reviewProposal（レビュー詳細 loader）
//
// 役割:
//   - reviewer / admin が `status='submitted'` または `status='in_review'` の提案 1 件を
//     詳細 + AuditLog 履歴抜粋つきで取得する loader（UC-003〜006 の前段）。
//   - audit_log_history は API-015 §audit_log_history (m-10 整理) に従い
//     `submit` / `return` / `resubmit` の 3 action のみを `created_at ASC` で返す
//     （`start_review` は assignee_id / status バッジで表現済、`approve` / `reject` は
//     終端のため本 API の status 範囲外で到達しない、`publish` / `withdraw` も同様）。
//   - reviewer は `private` 投稿に到達不可（Q-016 暫定 → 404 `insufficient_role`）。
//   - `status` が `submitted` / `in_review` 以外の proposal は 404 `status_not_reviewable`
//     に集約（API-015 §認可拒否時の挙動 / §エラーコード）。
//
// 認可フロー（API-015 §認可拒否時の挙動）:
//
//   シナリオ                                                  | HTTP | reason
//   --------------------------------------------------------- | ---- | --------------------
//   cookie なし                                                | 401  | not_authenticated
//   role が `user` のみ / `auditor`                            | 404  | insufficient_role
//   reviewer が `private` を要求（Q-016 暫定）                 | 404  | insufficient_role
//   `status` が `submitted` / `in_review` 以外                 | 404  | status_not_reviewable（loader 集約）
//   不在                                                       | 401 (guest) / 404 (auth) | （loader 側で集約）
//
// 不変条件:
//   - 認可判定は authorize() の単一エントリポイントで行う（NFR-003 / BR-AUTHZ-03、
//     loader 内で `viewer.roles.includes(...)` を書かない）。
//   - status フィルタ（`submitted` / `in_review` 以外を 404）は authorize の責務外
//     （BR-AUTHZ-03 の「ロール / Visibility / 所有者」3 軸から外れる）ため、
//     loader 側で AuthorizationError を直接 throw する（API-011 / API-013 と同じ方針）。
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない。
//     findById / findByProposalId / listByTarget は各々最大 1 回。
//   - 戻り値は repository から得た値の射影のみで、内部状態への参照を露出しない。
//   - audit_log_history は filter / map のみで生成し、元配列を mutate しない。
//
// 参照: docs/20-detail-design/apis/API-015.md（§レスポンス §認可拒否時の挙動 §audit_log_history）、
//       docs/02-requirements/02-functional-requirements.md REQ-003 / REQ-009 / REQ-010 / REQ-011、
//       src/server/auth/authorize.ts (action='get.reviewProposal')、
//       src/server/repositories/proposals.ts (ProposalRepository.findById)、
//       src/server/repositories/policy-agreements.ts (PolicyAgreementRepository.findByProposalId)、
//       src/server/audit/repository.ts (AuditLogRepository.listByTarget)

import type { ProposalStatus, Visibility } from '#/lib/domain/types'
import {
  type AuditAction,
  type AuditLog,
  type AuditLogRepository,
} from '#/server/audit/repository'
import { AuthorizationError, authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { PolicyAgreementRepository } from '#/server/repositories/policy-agreements'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * audit_log_history で表示する action（API-015 §audit_log_history m-10 整理）。
 *
 * `start_review` を含めない理由は assignee_id / status バッジで表現済のため冗長。
 * `approve` / `reject` / `publish` / `withdraw` は終端状態を示し、本 API の status 範囲
 * (`submitted` / `in_review`) では到達しないため除外。完全な AuditLog 閲覧は API-016 を経由。
 */
const REVIEW_HISTORY_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'submit',
  'return',
  'resubmit',
])

/**
 * 本 API が許可する proposal status の集合（API-015 §レスポンス §エラーコード）。
 * これ以外の status は 404 `status_not_reviewable` で隠蔽する。
 */
const REVIEWABLE_STATUSES: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>([
  'submitted',
  'in_review',
])

/**
 * audit_log_history 1 件分のスキーマ（API-015 §audit_log_history §スキーマ）。
 *
 * `reason` は API-015 §レスポンス §スキーマで `string | null`。reviewer は判断補助
 * として「過去の差し戻し履歴」を読む必要があるため reason 本文を公開する
 * （vs API-016 / API-017 では reason 本文を露出しない設計）。
 */
export interface ReviewProposalAuditEntry {
  readonly audit_log_id: string
  readonly action: AuditAction
  readonly actor_id: string
  readonly actor_role: string
  readonly before_status: ProposalStatus | null
  readonly after_status: ProposalStatus | null
  readonly reason: string | null
  readonly created_at: number
}

/**
 * レビュー詳細 loader の戻り値（API-015 §レスポンス §スキーマ）。
 *
 * `status` は本 loader が `submitted` / `in_review` のみ通過させるため両者のみが入りうる。
 * `assignee_id` は `in_review` のとき担当者 ID、`submitted` のとき null。
 * `current_policy_agreement_id` / `policy_version` は DB-003 §不変条件 5 で
 * `submitted` 以降は NOT NULL。本 API は両 status のみ返すため policy_agreement は
 * 必ず存在する想定だが、防御的に `current_policy_agreement_id=null` の場合は
 * `policy_version=''`（空文字）にフォールバックする（型を緩めずに最小到達経路を確保）。
 * 上の status 検査により本来このフォールバックには到達しない。
 */
export interface ReviewProposalDetail {
  readonly proposal_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly status: ProposalStatus
  readonly author_id: string
  readonly assignee_id: string | null
  readonly submitted_at: number
  readonly updated_at: number
  readonly version: number
  readonly current_policy_agreement_id: string | null
  readonly policy_version: string
  readonly audit_log_history: ReadonlyArray<ReviewProposalAuditEntry>
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時に差し替える。
 *
 * `policyAgreements` は API-015 §レスポンス §スキーマの `policy_version` を解決するため
 * に必要（DB-003 には `current_policy_agreement_id` のみ持ち、`policy_version` は
 * DB-005 を read して取得する）。API-015 §副作用 / DB アクセス表に DB-005 read が
 * 明記されていない点は m-MAJOR の解消で追補される想定だが、本 loader は §レスポンス §スキーマ
 * で `policy_version: yes` と明記されているため依存に含める。
 */
export interface GetReviewProposalDeps {
  readonly proposals: ProposalRepository
  readonly policyAgreements: PolicyAgreementRepository
  readonly audit: AuditLogRepository
}

/**
 * レビュー詳細 loader。
 *
 * 順序:
 *   1) proposals.findById(proposalId) で 1 件取得
 *   2) 不在 → guest は 401（NOT_FOUND を guest に見せず認証要求を優先する暫定）、
 *      認証済は 404 (`not_owner_resource`) に集約（API-015 §エラーコード）
 *   3) status が `submitted` / `in_review` 以外 → 404 `not_owner_resource` に集約
 *      （API-015 §認可拒否時の挙動 `status_not_reviewable` を 404 NOT_FOUND に正規化）。
 *      status 漏洩防止のため authorize より前で弾く。guest の場合も 404 で隠蔽するが、
 *      guest は (4) で 401 が優先される設計のため、ここでは guest を素通しさせる。
 *   4) authorize(viewer, 'get.reviewProposal', { kind:'proposal', author_id, visibility, status })
 *      - guest → 401 `not_authenticated`
 *      - user / auditor → 404 `insufficient_role`
 *      - reviewer + private → 404 `insufficient_role`（Q-016 暫定）
 *      - reviewer + (public / internal) → 200
 *      - admin → 全 visibility で 200
 *   5) policyAgreements.findByProposalId(proposalId) で `policy_version` を解決
 *      （DB-005 read、API-015 §レスポンス §スキーマ `policy_version: yes` のため）
 *   6) audit.listByTarget(proposalId) で `created_at ASC` の AuditLog 一覧を取得し、
 *      action ∈ {submit, return, resubmit} のみに filter（m-10 整理）
 *   7) ReviewProposalDetail に射影して返す
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param proposalId 対象 proposal の ID（API-015 §パスパラメータ）。
 * @param deps  ProposalRepository / PolicyAgreementRepository / AuditLogRepository 依存。
 * @returns API-015 のレスポンススキーマに整形済みの詳細オブジェクト。
 *
 * @throws {AuthorizationError} 認可拒否時 / status 範囲外 / 不在のいずれか。
 */
export async function getReviewProposal(
  viewer: Viewer | null,
  proposalId: string,
  deps: GetReviewProposalDeps,
): Promise<ReviewProposalDetail> {
  const existing = await deps.proposals.findById(proposalId)

  // (2) 不在: guest は 401、認証済は 404 に集約。
  //     API-015 §エラーコード「proposal 不存在 → 404」、§認可拒否時の挙動「cookie なし → 401」。
  //     authorize の `get.reviewProposal` は role + visibility 判定に閉じており、
  //     不在判定はその責務外（BR-AUTHZ-03）。
  if (existing === null) {
    throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'not_owner_resource')
  }

  // (3) status フィルタ: submitted / in_review 以外は 404 に集約（API-015 §認可拒否時の挙動）。
  //     authorize より前に弾くことで「visibility × role」だけを authorize に評価させる
  //     （status 漏洩防止）。guest は (4) で 401 が優先されるため、ここでは素通し。
  if (!REVIEWABLE_STATUSES.has(existing.status)) {
    throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'not_owner_resource')
  }

  // (4) 認可: role + visibility（authorize() の単一エントリポイント）。
  //     reviewer + private は authorize 内で `insufficient_role` に正規化される（Q-016 暫定）。
  authorize(viewer, 'get.reviewProposal', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // (5) policy_version 解決（DB-005 read）。
  //     DB-003 §不変条件 5 で `submitted` 以降は `current_policy_agreement_id` NOT NULL のため
  //     本 loader（status='submitted'/'in_review' のみ通過）では必ず非 null と仮定可能。
  //     防御的に未解決時は空文字にフォールバックする（型を緩めずに到達経路を確保）。
  let policyVersion = ''
  if (existing.current_policy_agreement_id !== null) {
    const agreement = await deps.policyAgreements.findByProposalId(existing.id)
    if (agreement !== null) {
      policyVersion = agreement.policy_version
    }
  }

  // (6) AuditLog 履歴の取得 + action filter + 射影。
  //     listByTarget は `created_at ASC` で返る（DB-004 §インデックス、API-015 用途）。
  //     filter のみで配列を変形し、元配列を mutate しない。
  const allEntries: ReadonlyArray<AuditLog> = await deps.audit.listByTarget(proposalId)
  const history: ReadonlyArray<ReviewProposalAuditEntry> = allEntries
    .filter((entry) => REVIEW_HISTORY_ACTIONS.has(entry.action))
    .map(toAuditEntry)

  // (7) レスポンス射影。
  return toDetail(existing, policyVersion, history)
}

/**
 * AuditLog を audit_log_history のスキーマに射影する。
 *
 * `before_status` / `after_status` は status 遷移系 action（DB-004 §不変条件 3 では MVP の
 * 全 action が status 遷移を伴う）で必ず非 null だが、API-015 §audit_log_history §スキーマで
 * `before_status` / `after_status: yes` と必須化されている。型は `ProposalStatus | null`
 * を維持し（DB-004 ドメイン型と整合）、null の場合もそのまま透過する（防御）。
 */
function toAuditEntry(entry: AuditLog): ReviewProposalAuditEntry {
  return {
    audit_log_id: entry.id,
    action: entry.action,
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    before_status: entry.before_status,
    after_status: entry.after_status,
    reason: entry.reason,
    created_at: entry.created_at,
  }
}

/**
 * Proposal を API-015 のレスポンス形に射影する。
 *
 * `submitted_at` は本 API の status 範囲（submitted / in_review）で必ず非 null（DB-003
 * §不変条件 4）。防御的に null の場合は 0 にフォールバックする。上の status 検査と
 * DB-003 §不変条件 4 により本来このフォールバックには到達しない。
 */
function toDetail(
  p: Proposal,
  policyVersion: string,
  history: ReadonlyArray<ReviewProposalAuditEntry>,
): ReviewProposalDetail {
  return {
    proposal_id: p.id,
    title: p.title,
    body: p.body,
    visibility: p.visibility,
    status: p.status,
    author_id: p.author_id,
    assignee_id: p.assignee_id,
    submitted_at: p.submitted_at ?? 0,
    updated_at: p.updated_at,
    version: p.version,
    current_policy_agreement_id: p.current_policy_agreement_id,
    policy_version: policyVersion,
    audit_log_history: history,
  }
}
