// API-010 / REQ-008 / UC-011 / DB-003 — list publishedProposals（公開投稿一覧 loader）
//
// 役割:
//   - `status='published'` の提案一覧を、viewer × visibility のマトリクスで
//     フィルタして返す read-only loader。ProposalRepository.listPublic() の薄いラッパ。
//   - 公開バイパス: cookie / viewer が無くても 200 を返し、authorize() を呼ばない
//     （API-010 §認可 / docs/10-basic-design/04-api-list.md §公開バイパス）。
//
// 不変条件:
//   - viewer === null（guest）→ visibility='public' のみ
//   - viewer !== null（user / reviewer / admin / auditor）→ visibility IN ('public','internal')
//   - private は本 loader からは常に除外（admin であっても、API-010 §M-7 / m-08 確定）
//   - `withdrawn` は status='published' フィルタにより自動的に除外される
//     （ProposalRepository.listPublic は status='published' のみを返す）
//   - 並び順は repository 側の `published_at DESC` を維持する（再ソートしない）
//   - 副作用なし: console / logger / authorize / fetch / DB 直叩きは行わない
//
// 参照: docs/20-detail-design/apis/API-010.md（§認可 §レスポンス §フィルタ）、
//       docs/02-requirements/02-functional-requirements.md REQ-008、
//       src/server/repositories/proposals.ts (ProposalRepository.listPublic)

import type { Visibility } from '#/lib/domain/types'
import type { Viewer } from '#/server/auth/session'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * 公開投稿一覧 loader の戻り値 1 件分。
 *
 * API-010 §レスポンス §スキーマに準拠する。`body` は本一覧 API では返さない
 * （一覧表示の負荷低減、API-010 L106）。本文の取得は API-011（詳細 loader）
 * を経由する設計。
 */
export interface PublishedProposalSummary {
  readonly proposal_id: string
  readonly title: string
  readonly visibility: Visibility
  readonly author_id: string
  readonly published_at: number
  readonly updated_at: number
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時には差し替える。
 */
export interface ListPublishedDeps {
  readonly proposals: ProposalRepository
}

/**
 * 公開バイパス対応の公開投稿一覧 loader。
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param deps  ProposalRepository 依存。
 * @returns API-010 のレスポンススキーマに整形済みのサマリ配列。`published_at DESC`。
 *
 * @remarks
 * - authorize() は呼ばない（公開バイパス、BR-AUTHZ-03 の対象外、API-010 §認可）。
 * - cookie 不在で例外を起こさない（NFR-006 の CSRF 検証は GET のため不要）。
 * - guest（viewer === null）は `visibility = 'public'` のみが返る。
 * - 認証済（viewer !== null）はロールに関わらず `visibility IN ('public', 'internal')`。
 * - `withdrawn` は repository 側の `status='published'` フィルタで除外される。
 */
export async function listPublished(
  viewer: Viewer | null,
  deps: ListPublishedDeps,
): Promise<ReadonlyArray<PublishedProposalSummary>> {
  const visibilities: ReadonlyArray<Visibility> =
    viewer === null ? PUBLIC_ONLY : PUBLIC_AND_INTERNAL

  const rows = await deps.proposals.listPublic(visibilities)
  return rows.map(toSummary)
}

const PUBLIC_ONLY = ['public'] as const satisfies ReadonlyArray<Visibility>
const PUBLIC_AND_INTERNAL = ['public', 'internal'] as const satisfies ReadonlyArray<Visibility>

/**
 * Proposal を API-010 のサマリ形に射影する。
 *
 * `published_at` は status='published' の不変条件で NOT NULL（DB-003 §不変条件 5）。
 * MVP のインメモリ factory も同条件を満たすが、防御的に NULL の場合は 0 にフォールバック
 * する（型を緩めずに最小到達経路を確保）。
 */
function toSummary(p: Proposal): PublishedProposalSummary {
  return {
    proposal_id: p.id,
    title: p.title,
    visibility: p.visibility,
    author_id: p.author_id,
    published_at: p.published_at ?? 0,
    updated_at: p.updated_at,
  }
}
