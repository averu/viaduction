// API-012 / REQ-007 / UC-010 / DB-003 — list myProposals（自分の投稿一覧 loader）
//
// 役割:
//   - ログインユーザが自分が起票した提案を全 8 ステータス横断で一覧する loader（REQ-007）。
//   - `author_id == viewer.user_id` で server-side フィルタを行い、guest は 401。
//   - ProposalRepository.listByAuthor() の薄いラッパ。並び順は repository の
//     `updated_at DESC` を維持する（再ソートしない）。
//
// 不変条件:
//   - viewer === null（guest）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   - viewer !== null → 自身の author_id のみ。他人の投稿は repository フィルタで除外される
//   - 全 8 ステータスを返す（draft / submitted / in_review / approved / returned /
//     rejected / published / withdrawn のフィルタは行わない）
//   - 並び順は `updated_at DESC`（repository 仕様）
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない（authorize() は
//     副作用を起こさない純粋関数として呼び出してよい）
//   - `body` は本一覧 API では返さない（API-012 §レスポンス §スキーマ、プライバシー保護）
//
// 参照: docs/20-detail-design/apis/API-012.md（§認可 §レスポンス §スキーマ）、
//       docs/02-requirements/02-functional-requirements.md REQ-007、
//       src/server/auth/authorize.ts (action='list.myProposals')、
//       src/server/repositories/proposals.ts (ProposalRepository.listByAuthor)

import type { ProposalStatus, Visibility } from '#/lib/domain/types'
import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * 自分の投稿一覧 loader の戻り値 1 件分。
 *
 * API-012 §レスポンス §スキーマに準拠する。`body` は本一覧 API では返さない
 * （プライバシー保護、API-012 §スキーマ表に body 列なし）。本文の取得は
 * API-013（自分の投稿詳細 loader）を経由する設計。
 *
 * `created_at` / `approved_at` も API-012 §スキーマには含まれないため除外する。
 */
export interface MyProposalSummary {
  readonly proposal_id: string
  readonly title: string
  readonly status: ProposalStatus
  readonly visibility: Visibility
  readonly updated_at: number
  readonly submitted_at: number | null
  readonly published_at: number | null
  readonly withdrawn_at: number | null
  readonly version: number
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時には差し替える。
 */
export interface ListMyProposalsDeps {
  readonly proposals: ProposalRepository
}

/**
 * 認証必須の自分の投稿一覧 loader。
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param deps  ProposalRepository 依存。
 * @returns API-012 のレスポンススキーマに整形済みのサマリ配列。`updated_at DESC`。
 * @throws AuthorizationError viewer === null のとき reason='not_authenticated' / httpStatus=401。
 *
 * @remarks
 * - guest は `authorize(viewer, 'list.myProposals')` で 401 として弾く。
 * - 認証済はロールに関わらず自身の `author_id` の投稿のみが返る（server-side 強制）。
 * - 全 8 ステータスを返す（draft も含む）。status フィルタは Phase 5 では未実装
 *   （API-012 §クエリパラメータの `status` は将来オプション）。
 */
export async function listMyProposals(
  viewer: Viewer | null,
  deps: ListMyProposalsDeps,
): Promise<ReadonlyArray<MyProposalSummary>> {
  authorize(viewer, 'list.myProposals')
  // authorize() は viewer === null のとき throw するため、以降は viewer 非 null。
  // 型の絞り込みのため明示的に non-null 化する（unsafe assertion を避ける）。
  if (viewer === null) {
    // unreachable: authorize が AuthorizationError を throw する
    throw new Error('unreachable: authorize did not throw for null viewer')
  }

  const rows = await deps.proposals.listByAuthor(viewer.user_id)
  return rows.map(toSummary)
}

/**
 * Proposal を API-012 のサマリ形に射影する。
 *
 * `body` は除外する（API-012 §スキーマに無い、プライバシー保護）。
 */
function toSummary(p: Proposal): MyProposalSummary {
  return {
    proposal_id: p.id,
    title: p.title,
    status: p.status,
    visibility: p.visibility,
    updated_at: p.updated_at,
    submitted_at: p.submitted_at,
    published_at: p.published_at,
    withdrawn_at: p.withdrawn_at,
    version: p.version,
  }
}
