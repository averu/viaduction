// API-021 / REQ-004 / REQ-005 / REQ-010 / UC-007 / UC-008 / UC-013 / DB-003 / DB-004
// — get proposalForAdmin（admin 用 proposal viewer loader）
//
// 役割:
//   - admin が任意の proposal を 1 件、全 visibility (private / internal / public) ×
//     全 status（withdrawn を含む 8 値）横断で取得する loader（SCR-013 公開操作画面が
//     UC-007 publish / UC-008 withdraw の前確認に使う）。
//   - audit_log_history は API-021 §レスポンス §スキーマ「直近 N=10 件」に従い、
//     反映順 `created_at ASC` の末尾 10 件（=最新 10 件、ASC で並んだもの）を返す。
//     各エントリは `id / action / actor_id / created_at / reason_present` のみで、
//     reason 本文は API-021 §audit_log_history より **API-017 経由で別取得** する設計
//     （NFR-005 PII 配慮、admin でも reason 本文は本 API のレスポンスに乗せない）。
//   - read-only loader: AuditLog 書き込みは行わない（BR-AUDIT-01 は「結果を変える操作」のみ
//     append 対象、本 loader は閲覧経路）。
//
// 認可フロー（API-021 §認可拒否時の挙動）:
//
//   シナリオ                                       | HTTP | reason
//   ---------------------------------------------- | ---- | --------------------
//   cookie なし (guest)                             | 401  | not_authenticated
//   role が user / reviewer / auditor              | 404  | insufficient_role
//   role が admin                                   | 200  | -
//   不在                                            | 401 (guest) / 404 (auth) | （loader 側で集約）
//
// 不変条件:
//   - 認可判定は authorize() の単一エントリポイントで行う（NFR-003 / BR-AUTHZ-03）。
//     loader 内で `viewer.roles.includes(...)` を書かない。
//   - 副作用なし: console / logger / fetch / DB 直叩き / audit.append は行わない。
//     findById / listByTarget は各々最大 1 回。
//   - 戻り値は repository から得た値の射影のみで、内部状態への参照を露出しない。
//   - audit_log_history は slice / map のみで生成し、元配列を mutate しない。
//   - withdrawn を 404 にしない（API-013 とは方針が異なる、admin は経緯確認のため閲覧可）。
//
// 参照: docs/20-detail-design/apis/API-021.md（§認可 §レスポンス §audit_log_history）、
//       docs/02-requirements/02-functional-requirements.md REQ-004 / REQ-005 / REQ-010、
//       src/server/auth/authorize.ts (action='admin.viewProposal')、
//       src/server/repositories/proposals.ts (ProposalRepository.findById)、
//       src/server/audit/repository.ts (AuditLogRepository.listByTarget)

import type { ProposalStatus, Visibility } from '#/lib/domain/types'
import type { AuditAction, AuditLog, AuditLogRepository } from '#/server/audit/repository'
import { AuthorizationError, authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * audit_log_history で返す最大件数（API-021 §レスポンス §スキーマで N=10 と明記）。
 *
 * `listByTarget` は `created_at ASC` で全件返るため、末尾 N 件を slice で取る
 * （= 時刻昇順の最新 10 件）。同 ms 内の tiebreak は AuditLogRepository の id 比較
 * に従って決定的に並ぶ。
 */
const AUDIT_HISTORY_LIMIT = 10

/**
 * audit_log_history 1 件分のスキーマ（API-021 §レスポンス §audit_log_history）。
 *
 * `reason` 本文は本 API では返さない（NFR-005 PII 配慮、API-021 §audit_log_history で
 * 「reason 本体は API-017 経由で取得」と明記）。代わりに `reason_present: boolean` で
 * 本文の有無のみを伝え、admin が API-017 詳細取得に進むかの判定に使う。
 */
export interface AdminAuditLogHistoryItem {
  readonly id: string
  readonly action: AuditAction
  readonly actor_id: string
  readonly created_at: number
  readonly reason_present: boolean
}

/**
 * admin 用 proposal viewer の戻り値（API-021 §レスポンス §スキーマ）。
 *
 * `status` は全 8 値が到達する（withdrawn 含む、admin は経緯確認のため可）。
 * `visibility` は全 3 値が到達する（admin 専権のため visibility 制約なし）。
 * `current_policy_agreement_id` は DB-003 §不変条件 5 で submitted 以降は NOT NULL。
 * draft 段階の proposal では null。
 */
export interface AdminProposalDetail {
  readonly id: string
  readonly author_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly status: ProposalStatus
  readonly assignee_id: string | null
  readonly current_policy_agreement_id: string | null
  readonly version: number
  readonly created_at: number
  readonly updated_at: number
  readonly submitted_at: number | null
  readonly approved_at: number | null
  readonly published_at: number | null
  readonly withdrawn_at: number | null
  readonly audit_log_history: ReadonlyArray<AdminAuditLogHistoryItem>
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時に差し替える。
 *
 * API-015 と異なり PolicyAgreementRepository は不要（API-021 §レスポンス §スキーマで
 * `policy_version` は返さず、`current_policy_agreement_id` のみ返すため、Proposal の
 * カラムから直接射影できる）。
 */
export interface GetProposalForAdminDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

/**
 * admin 用 proposal viewer loader。
 *
 * 順序:
 *   1) proposals.findById(proposalId) で 1 件取得
 *   2) 不在 → guest は 401（NOT_FOUND を guest に見せず認証要求を優先する暫定）、
 *      認証済は 404 (`insufficient_role`) に集約
 *      （API-021 §エラーコード「proposal 不存在 → 404」、admin 以外は §認可拒否時の挙動で
 *      `insufficient_role` だが、authorize() が `admin.viewProposal` で同 reason を投げるため
 *      不在経路も同じ reason に揃える）
 *   3) authorize(viewer, 'admin.viewProposal') で role 判定（admin 専権）
 *      - guest → 401 `not_authenticated`
 *      - user / reviewer / auditor → 404 `insufficient_role`
 *      - admin → 200
 *   4) audit.listByTarget(proposalId) で `created_at ASC` の AuditLog 一覧を取得し、
 *      末尾 N=10 件を slice で抜き、AdminAuditLogHistoryItem に射影
 *   5) AdminProposalDetail に射影して返す（reason 本文は含めない）
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param proposalId 対象 proposal の ID（API-021 §パスパラメータ）。
 * @param deps  ProposalRepository / AuditLogRepository 依存。
 * @returns API-021 のレスポンススキーマに整形済みの詳細オブジェクト。
 *
 * @throws {AuthorizationError} 認可拒否時 / 不在のいずれか。
 */
export async function getProposalForAdmin(
  viewer: Viewer | null,
  proposalId: string,
  deps: GetProposalForAdminDeps,
): Promise<AdminProposalDetail> {
  const existing = await deps.proposals.findById(proposalId)

  // (2) 不在: guest は 401、認証済は 404 (`insufficient_role`) に集約。
  //     API-021 §エラーコード「proposal 不存在 → 404」、§認可拒否時の挙動「cookie なし → 401」。
  //     不在判定は authorize の `admin.viewProposal` の責務外（role 判定に閉じる、BR-AUTHZ-03）
  //     のため、loader 側で AuthorizationError を直接 throw する。
  //     reason は admin 以外と同じ `insufficient_role` に揃え、role / 不在の区別を漏らさない
  //     （API-021 §認可拒否時の挙動の `403_reason: insufficient_role` と整合）。
  if (existing === null) {
    throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'insufficient_role')
  }

  // (3) 認可: admin 専権（authorize() の単一エントリポイント）。
  //     reviewer / user / auditor は authorize 内で `insufficient_role` に正規化される。
  //     resource 引数は不要（authorize の `admin.viewProposal` は role 判定のみ）だが、
  //     文書化のため proposal の identity を渡す（authorize 側では未使用）。
  authorize(viewer, 'admin.viewProposal', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
    status: existing.status,
  })

  // (4) AuditLog 履歴の取得 + 直近 N 件抜粋 + 射影（read-only、append しない）。
  //     listByTarget は `created_at ASC` で返る（DB-004 §インデックス）。
  //     末尾 N=10 件を slice で取り出すと「時刻昇順の最新 10 件」になる。
  //     エントリ数が N 以下なら全件をそのまま返す。slice は元配列を mutate しない。
  const allEntries: ReadonlyArray<AuditLog> = await deps.audit.listByTarget(proposalId)
  const recentEntries: ReadonlyArray<AuditLog> =
    allEntries.length <= AUDIT_HISTORY_LIMIT
      ? allEntries
      : allEntries.slice(allEntries.length - AUDIT_HISTORY_LIMIT)
  const history: ReadonlyArray<AdminAuditLogHistoryItem> = recentEntries.map(toHistoryItem)

  // (5) レスポンス射影。
  return toDetail(existing, history)
}

/**
 * AuditLog を audit_log_history のスキーマに射影する。
 *
 * `reason_present` は reason 本文の有無のみを示す（NFR-005 PII 配慮）。
 * `null` または空文字（whitespace-only を含む）の場合は false。
 * AuditLogRepository.append が reason 必須 action では空・whitespace を弾くため、
 * 通常は `reason !== null` で判定可能だが、防御的に trim 後の長さも見る。
 */
function toHistoryItem(entry: AuditLog): AdminAuditLogHistoryItem {
  const reasonPresent = entry.reason !== null && entry.reason.trim().length > 0
  return {
    id: entry.id,
    action: entry.action,
    actor_id: entry.actor_id,
    created_at: entry.created_at,
    reason_present: reasonPresent,
  }
}

/**
 * Proposal を API-021 のレスポンス形に射影する。
 *
 * `audit_log_history` は呼び出し側で算出済の値をそのまま埋める。
 * `reason` 本文は本 API のレスポンスに含めない（NFR-005 / API-021 §audit_log_history）。
 */
function toDetail(
  p: Proposal,
  history: ReadonlyArray<AdminAuditLogHistoryItem>,
): AdminProposalDetail {
  return {
    id: p.id,
    author_id: p.author_id,
    title: p.title,
    body: p.body,
    visibility: p.visibility,
    status: p.status,
    assignee_id: p.assignee_id,
    current_policy_agreement_id: p.current_policy_agreement_id,
    version: p.version,
    created_at: p.created_at,
    updated_at: p.updated_at,
    submitted_at: p.submitted_at,
    approved_at: p.approved_at,
    published_at: p.published_at,
    withdrawn_at: p.withdrawn_at,
    audit_log_history: history,
  }
}
