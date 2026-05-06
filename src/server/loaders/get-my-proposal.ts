// API-013 / REQ-005 / REQ-006 / REQ-007 / UC-009 / UC-010 / DB-003 / DB-004
// — get myProposal（自分の投稿詳細 loader）
//
// 役割:
//   - 投稿者本人が自身の提案 1 件を全 8 ステータス横断のうち `withdrawn` を除く 7 値で
//     取得する loader（REQ-007 / UC-009 / UC-010）。
//   - `status='returned'` の場合は直近の `action='return'` の AuditLog エントリから
//     reason / created_at / id を併記して返す（再提出 SCR-006 の表示用、API-013 §レスポンス）。
//   - `withdrawn` の自身投稿は 404 で隠蔽する（REQ-005 AC との整合）。
//
// 認可フロー（API-013 §認可拒否時の挙動）:
//
//   シナリオ                                                | HTTP | reason
//   --------------------------------------------------------- | ---- | ----------
//   cookie なし                                                | 401  | not_authenticated
//   author_id != viewer.user_id（reviewer / admin / auditor / 他 user） | 404  | not_owner_resource
//   status='withdrawn' の自身投稿                              | 404  | not_owner_resource
//   不在                                                      | 401 (guest) / 404 (auth) | （loader 側で集約）
//
// 不変条件:
//   - 認可判定は authorize() の単一エントリポイントで行う（NFR-003 / BR-AUTHZ-03）。
//     ロール / 所有者一致以外の分岐（status='withdrawn' フィルタ、不在 404）は
//     authorize の責務外（ロール × Visibility × 所有者の 3 軸から外れる）ため
//     loader 側で集約し、AuthorizationError を直接 throw する。これは API-011 と
//     同じ方針（status 漏洩防止）。
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない。findById は 1 回。
//     listByTarget は status='returned' のときのみ呼び出す（最適化）。
//   - 戻り値は repository から得た値の射影のみで、内部状態への参照を露出しない。
//
// 参照: docs/20-detail-design/apis/API-013.md（§認可 §レスポンス §last_return_reason）、
//       docs/02-requirements/02-functional-requirements.md REQ-005 / REQ-006 / REQ-007、
//       src/server/auth/authorize.ts (action='get.myProposal')、
//       src/server/repositories/proposals.ts (ProposalRepository.findById)、
//       src/server/audit/repository.ts (AuditLogRepository.listByTarget)

import type { ProposalStatus, Visibility } from '#/lib/domain/types'
import type { AuditLog, AuditLogRepository } from '#/server/audit/repository'
import { AuthorizationError, authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * `last_return_reason` の中身。`status='returned'` のときのみ非 null。
 *
 * API-013 §レスポンス §スキーマ:
 *   - `reason`: 直近の `action='return'` の reason（DB-004 §不変条件 2 で NOT NULL 保証）
 *   - `returned_at`: 当該 AuditLog エントリの `created_at`
 *   - `audit_log_id`: AuditLog エントリ ID
 */
export interface LastReturnReason {
  readonly reason: string
  readonly returned_at: number
  readonly audit_log_id: string
}

/**
 * 自分の投稿詳細 loader の戻り値。
 *
 * API-013 §レスポンス §スキーマに準拠する。`status` は全 8 値のうち `withdrawn` を
 * 除く 7 値が到達する（withdrawn は loader が 404 を投げる、REQ-005 AC）。
 * `body` は本詳細 API では返す（API-012 一覧と異なる）。
 */
export interface MyProposalDetail {
  readonly proposal_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly status: ProposalStatus
  readonly author_id: string
  readonly created_at: number
  readonly updated_at: number
  readonly submitted_at: number | null
  readonly approved_at: number | null
  readonly published_at: number | null
  readonly withdrawn_at: number | null
  readonly version: number
  readonly current_policy_agreement_id: string | null
  /** `status='returned'` のときのみ非 null。直近の `action='return'` AuditLog のスナップショット。 */
  readonly last_return_reason: LastReturnReason | null
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時に差し替える。
 */
export interface GetMyProposalDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

/**
 * 自分の投稿詳細 loader。
 *
 * 順序:
 *   1) proposals.findById(proposalId) で 1 件取得
 *   2) 不在 → guest は 401（NOT_FOUND を guest に見せず認証要求を優先する暫定）、
 *      認証済は 404 (`not_owner_resource`) に集約（API-013 §エラーコード）
 *   3) `status='withdrawn'` ガード: 自身投稿でも 404 (`not_owner_resource`)
 *      （REQ-005 AC、API-013 §認可拒否時の挙動の `withdrawn_filtered` を統一）
 *   4) authorize(viewer, 'get.myProposal', { kind:'proposal', author_id })
 *      - guest → 401 `not_authenticated`
 *      - viewer.user_id !== author_id（reviewer / admin / auditor 含む）→ 404
 *   5) `status='returned'` のときだけ audit.listByTarget(proposalId) を呼び、
 *      `action='return'` の最新エントリ（created_at が最大）の reason / created_at / id を
 *      `last_return_reason` に詰める。それ以外の status では null を返す。
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param proposalId 対象 proposal の ID（API-013 §パスパラメータ）。
 * @param deps  ProposalRepository / AuditLogRepository 依存。
 * @returns API-013 のレスポンススキーマに整形済みの詳細オブジェクト。
 *
 * @throws {AuthorizationError} 認可拒否時 / withdrawn / 不在のいずれか。
 */
export async function getMyProposal(
  viewer: Viewer | null,
  proposalId: string,
  deps: GetMyProposalDeps,
): Promise<MyProposalDetail> {
  const existing = await deps.proposals.findById(proposalId)

  // (2) 不在: guest は 401、認証済は 404 に集約。
  //     API-013 §エラーコード「proposal 不存在 → 404」、§認可拒否時の挙動「cookie なし → 401」。
  //     ここで authorize() を呼ばずに直接 AuthorizationError を投げる理由:
  //     authorize の `get.myProposal` は author_id 一致判定に閉じており、不在判定はその責務外。
  if (existing === null) {
    throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'not_owner_resource')
  }

  // (3) withdrawn ガード: 自身投稿でも 404 に集約（REQ-005 AC、API-013 §レスポンス）。
  //     ここで先に弾く理由は status 漏洩防止。authorize 通過後に分岐すると
  //     「他人の withdrawn」と「自身の withdrawn」で挙動が変わり得る（どちらも 404 だが
  //     reason 経由でログに status が漏れる）ため、ロール / 所有者判定より前で正規化する。
  //     guest の場合も 404 で隠蔽するため、authorize 前にこのガードを置く。
  //     ただし guest は (4) で 401 が優先される設計のため、ここでは guest を素通しさせる。
  if (existing.status === 'withdrawn') {
    throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'not_owner_resource')
  }

  // (4) 認可: 認証済 + author 一致（authorize() の単一エントリポイント）。
  authorize(viewer, 'get.myProposal', {
    kind: 'proposal',
    author_id: existing.author_id,
  })

  // (5) status='returned' のときだけ AuditLog を読み、直近の return エントリを抜き出す。
  //     listByTarget は created_at ASC で返る（DB-004 §インデックス、API-015 用途）ため、
  //     filter('return') 後の末尾要素が「最新の return」となる。
  //     status='returned' なのに return エントリが 1 件も無い状況は本来発生しないが、
  //     防御的に null を返す（appendの整合は AuditLogRepository が担保）。
  const last_return_reason: LastReturnReason | null =
    existing.status === 'returned' ? await pickLatestReturn(deps.audit, proposalId) : null

  return toDetail(existing, last_return_reason)
}

/**
 * `target_proposal_id` の AuditLog から `action='return'` の最新エントリを返す。
 *
 * `listByTarget` は `created_at ASC` のため、filter 後の末尾が最新となる。
 * 同一 ms 内の tiebreak は AuditLogRepository 側の id 比較に従う（決定的）。
 */
async function pickLatestReturn(
  audit: AuditLogRepository,
  proposalId: string,
): Promise<LastReturnReason | null> {
  const entries: ReadonlyArray<AuditLog> = await audit.listByTarget(proposalId)
  let latest: AuditLog | null = null
  for (const entry of entries) {
    if (entry.action !== 'return') continue
    // listByTarget は ASC のため、後勝ちで上書きすると最終的に末尾の return が残る。
    latest = entry
  }
  if (latest === null) return null
  // 必須項目（reason / created_at / id）の整合は AuditLogRepository.append が担保しているが、
  // 型レベルで reason は string | null のため、null の場合は併記しない（防御）。
  if (latest.reason === null) return null
  return {
    reason: latest.reason,
    returned_at: latest.created_at,
    audit_log_id: latest.id,
  }
}

/**
 * Proposal を API-013 のレスポンス形に射影する。
 *
 * `last_return_reason` は呼び出し側で算出済の値をそのまま埋める。
 */
function toDetail(p: Proposal, last_return_reason: LastReturnReason | null): MyProposalDetail {
  return {
    proposal_id: p.id,
    title: p.title,
    body: p.body,
    visibility: p.visibility,
    status: p.status,
    author_id: p.author_id,
    created_at: p.created_at,
    updated_at: p.updated_at,
    submitted_at: p.submitted_at,
    approved_at: p.approved_at,
    published_at: p.published_at,
    withdrawn_at: p.withdrawn_at,
    version: p.version,
    current_policy_agreement_id: p.current_policy_agreement_id,
    last_return_reason,
  }
}
