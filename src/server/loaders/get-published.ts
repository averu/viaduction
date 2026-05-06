// API-011 / REQ-005 / REQ-008 / UC-011 / DB-003 — get publishedProposal（公開投稿詳細 loader）
//
// 役割:
//   - `status='published'` の提案 1 件を viewer × visibility のマトリクス（REQ-008 / API-011）
//     に従って返す read-only loader。authorize() を経由して認可判定を一本化する
//     （NFR-003 / BR-AUTHZ-03）。
//   - `withdrawn` および非 published（draft / submitted / in_review / approved / returned /
//     rejected）は loader 側でフィルタして 404 に集約する（REQ-005 AC、API-011 §レスポンス）。
//   - 不在 proposal も 404（API-011 §エラーコード）。
//
// 認可フロー（API-011 §認可マトリクス・§visibility × viewer のマトリクス）:
//
//   visibility \ viewer  | guest | user(他人) | user(本人) | reviewer | admin | auditor
//   --------------------- | ----- | ---------- | ---------- | -------- | ----- | -------
//   private               | 401   | 404        | 200        | 404 (Q)  | 200   | 404 (Q)
//   internal              | 401   | 200        | 200        | 200      | 200   | 200
//   public                | 200   | 200        | 200        | 200      | 200   | 200
//
//   Q-016 暫定: reviewer / auditor が private を要求した場合は `insufficient_role` で 404。
//   admin は private を含む全 visibility で 200（ただし `withdrawn` は 404）。
//
// 不変条件:
//   - 認可判定は authorize() の単一エントリポイントで行う（BR-AUTHZ-03、loader 内で
//     `viewer.roles.includes(...)` を書かない）。
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない。findById は 1 回のみ。
//   - `withdrawn` / 非 published / 不在は authorize より先にフィルタすることで、
//     authorize に「visibility × viewer」だけを評価させる（status 漏洩を防ぐ）。
//   - 戻り値は repository から得た値の射影のみで、内部状態への参照を露出しない。
//
// 参照: docs/20-detail-design/apis/API-011.md（§認可 §レスポンス §マトリクス）、
//       docs/02-requirements/02-functional-requirements.md REQ-005 / REQ-008、
//       src/server/auth/authorize.ts (action='get.publishedProposal')、
//       src/server/repositories/proposals.ts (ProposalRepository.findById)

import type { Visibility } from '#/lib/domain/types'
import type { Viewer } from '#/server/auth/session'
import { AuthorizationError, authorize } from '#/server/auth/authorize'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * 公開投稿詳細 loader の戻り値。
 *
 * API-011 §レスポンス §スキーマに準拠する。一覧 (API-010) と異なり `body` 全文を返す
 * （詳細表示用）。`status` は 'published' リテラルで固定（withdrawn / 非 published は
 * loader が 404 を投げているためここに到達しない）。
 */
export interface PublishedProposalDetail {
  readonly proposal_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly author_id: string
  readonly status: 'published'
  readonly published_at: number
  readonly updated_at: number
  readonly version: number
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時に差し替える。
 */
export interface GetPublishedDeps {
  readonly proposals: ProposalRepository
}

/**
 * 公開投稿詳細 loader。
 *
 * 順序:
 *   1) proposals.findById(proposalId) で 1 件取得
 *   2) 不在 / `withdrawn` / 非 published を 404 (`not_owner_resource`) に集約
 *      （authorize より前。status 列挙に基づく分岐は authorize 範囲外であり
 *       BR-AUTHZ-03 の「ロール / Visibility / 所有者」3 軸から外れる責務のため、
 *       loader 側で集約する）
 *   3) authorize(viewer, 'get.publishedProposal', { kind:'proposal', author_id, visibility })
 *      - guest が `internal` / `private` → 401 `not_authenticated`
 *      - user(他人) が `private` → 404 `not_owner_resource`
 *      - reviewer / auditor が `private` → 404 `insufficient_role`（Q-016 暫定）
 *      - admin は全 visibility で通過
 *   4) PublishedProposalDetail に射影して返す
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param proposalId 対象 proposal の ID（API-011 §パスパラメータ）。
 * @param deps  ProposalRepository 依存。
 * @returns API-011 のレスポンススキーマに整形済みの詳細オブジェクト。
 *
 * @throws {AuthorizationError} 認可拒否時 / withdrawn / 非 published / 不在のいずれか。
 */
export async function getPublished(
  viewer: Viewer | null,
  proposalId: string,
  deps: GetPublishedDeps,
): Promise<PublishedProposalDetail> {
  const existing = await deps.proposals.findById(proposalId)

  // (2) status フィルタ。
  //     不在 / withdrawn / 非 published は 404 に集約する。
  //     - 不在: API-011 §エラーコード「proposal 不存在 → 404」
  //     - withdrawn: REQ-005 AC「公開撤回時は 404 隠蔽」 / API-011 §レスポンス
  //     - 非 published（draft / submitted / in_review / approved / returned / rejected）:
  //       本 API は published のみ対象（API-011 §マトリクス末尾）。
  //
  //     ここで authorize() を呼ばずに直接 AuthorizationError を投げる理由:
  //     authorize の `get.publishedProposal` は visibility × viewer の 3 軸判定に閉じており、
  //     status 列挙はその責務外（BR-AUTHZ-03）。「不在 / 取り下げ / 非公開」を 404 に
  //     正規化する責務は loader 側にある（API-011 §認可拒否時の挙動）。
  //     AuthorizationError(reason='not_owner_resource') は httpStatus=404 / errorCode='NOT_FOUND'
  //     にマップされ、API-011 §エラーコードの 404 NOT_FOUND と整合する。
  if (existing === null || existing.status !== 'published') {
    throw new AuthorizationError('not_owner_resource')
  }

  // (3) 認可: visibility × viewer マトリクス（authorize() の単一エントリポイント）。
  authorize(viewer, 'get.publishedProposal', {
    kind: 'proposal',
    author_id: existing.author_id,
    visibility: existing.visibility,
  })

  // (4) レスポンス射影。
  return toDetail(existing)
}

/**
 * Proposal を API-011 のレスポンス形に射影する。
 *
 * `published_at` は status='published' の不変条件で NOT NULL（DB-003 §不変条件 5）。
 * 防御的に NULL の場合は 0 にフォールバックする（型を緩めずに最小到達経路を確保）。
 * 上の status 検査で `existing.status === 'published'` を保証しているため、本来この
 * フォールバックには到達しない。
 */
function toDetail(p: Proposal): PublishedProposalDetail {
  return {
    proposal_id: p.id,
    title: p.title,
    body: p.body,
    visibility: p.visibility,
    author_id: p.author_id,
    status: 'published',
    published_at: p.published_at ?? 0,
    updated_at: p.updated_at,
    version: p.version,
  }
}
