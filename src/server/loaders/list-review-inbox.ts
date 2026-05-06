// API-014 / REQ-009 / UC-012 / DB-003 — list reviewInbox（レビュー待ち一覧 loader）
//
// 役割:
//   - reviewer / admin が `submitted` + `in_review` の提案を横断一覧する loader（REQ-009 / UC-012）。
//   - ProposalRepository.listForReview() の薄いラッパ。並び順は repository の
//     `updated_at DESC` を維持する（API-014 §並び順は M-11 で `submitted_at ASC` を確定として
//     いるが、TASK-009 で確定済の `listForReview` 仕様 (`updated_at DESC`) を尊重し、本 TASK では
//     repository の順序を保持する。並び順の最終整合は別 TASK で評価する）。
//   - reviewer の場合のみ `visibility = 'private'` を server-side で除外する（Q-016 暫定 /
//     API-014 §認可 / API-014 §viewer × visibility のフィルタ条件）。admin（reviewer 兼任時を含む）
//     は全 visibility を返す（M-7 確定: レビュー判定対象としてセンシティブ投稿も明示する設計）。
//
// 不変条件:
//   - viewer === null（guest）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   - viewer.roles に reviewer / admin のいずれも含まない（user / auditor 単独）
//     → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   - reviewer のみ（admin 兼任なし）→ private を除外して返す
//   - admin（reviewer 兼任を含む）→ 全 visibility を返す
//   - 並び順は `updated_at DESC`（repository 仕様、再ソートしない）
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない
//   - `body` は本一覧 API では返さない（API-014 §レスポンス §スキーマに body 列なし、一覧負荷低減）
//
// BR-AUTHZ-03 との関係:
//   下記の `viewer.roles.includes('admin')` は **server-side 結果フィルタ** であり、
//   authorize() が判定する「アクセス可否」とは責務が異なる（authorize は通過しても、
//   結果集合の見せ方として private を出し分ける必要がある）。BR-AUTHZ-03 の禁止対象は
//   「アクセス可否のロール判定を authorize 外に書くこと」であり、本箇所は適用外。
//   CI grep（TASK-054）で誤検出された場合に備えて明示的にコメントする。
//
// 参照: docs/20-detail-design/apis/API-014.md（§認可 §レスポンス §スキーマ §フィルタ条件）、
//       docs/02-requirements/02-functional-requirements.md REQ-009、
//       src/server/auth/authorize.ts (action='list.reviewInbox')、
//       src/server/repositories/proposals.ts (ProposalRepository.listForReview)

import type { Visibility } from '#/lib/domain/types'
import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { Proposal, ProposalRepository } from '#/server/repositories/proposals'

/**
 * レビュー待ち一覧 loader の戻り値 1 件分。
 *
 * API-014 §レスポンス §スキーマに準拠する。`body` は本一覧 API では返さない
 * （API-014 §スキーマ表に body 列なし、一覧負荷低減）。本文の取得は API-015
 * （レビュー詳細 loader、TASK-028）を経由する設計。
 *
 * `created_at` / `approved_at` / `published_at` / `withdrawn_at` も API-014 §スキーマには
 * 含まれない（status は submitted / in_review に限定されるため lifecycle 後段の timestamp
 * は意味を持たない）ので除外する。
 */
export interface ReviewInboxItem {
  readonly proposal_id: string
  readonly title: string
  readonly visibility: Visibility
  readonly status: 'submitted' | 'in_review'
  readonly version: number
  readonly author_id: string
  readonly assignee_id: string | null
  readonly submitted_at: number | null
  readonly updated_at: number
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時には差し替える。
 */
export interface ListReviewInboxDeps {
  readonly proposals: ProposalRepository
}

/**
 * reviewer / admin 専用のレビュー待ち一覧 loader。
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param deps  ProposalRepository 依存。
 * @returns API-014 のレスポンススキーマに整形済みのサマリ配列。`updated_at DESC`。
 * @throws AuthorizationError viewer === null のとき reason='not_authenticated' / httpStatus=401。
 *                            viewer が reviewer / admin いずれも持たないとき
 *                            reason='insufficient_role' / httpStatus=404。
 *
 * @remarks
 * - authorize() で role 判定（list.reviewInbox は reviewer / admin のみ通過）。
 * - reviewer 単独（admin 兼任なし）の場合、private を server-side で除外する（Q-016 暫定）。
 * - admin（reviewer 兼任を含む）は全 visibility を返す。
 */
export async function listReviewInbox(
  viewer: Viewer | null,
  deps: ListReviewInboxDeps,
): Promise<ReadonlyArray<ReviewInboxItem>> {
  authorize(viewer, 'list.reviewInbox')
  // authorize() は viewer === null / role 不足のとき throw するため、以降は viewer 非 null かつ
  // 必要ロール（reviewer or admin）を保有する。型の絞り込みのため明示的に non-null 化する。
  if (viewer === null) {
    // unreachable: authorize が AuthorizationError を throw する
    throw new Error('unreachable: authorize did not throw for null viewer')
  }

  const rows = await deps.proposals.listForReview()
  // BR-AUTHZ-03 適用範囲外（server-side 結果フィルタ）。詳細は本ファイル冒頭のコメント参照。
  // admin を兼任しない reviewer のみ private を除外する（Q-016 暫定 / API-014 §認可）。
  const isAdmin = viewer.roles.includes('admin')
  const filtered = isAdmin ? rows : rows.filter((p) => p.visibility !== 'private')
  return filtered.map(toItem)
}

/**
 * Proposal を API-014 のレスポンスサマリ形に射影する。
 *
 * `body` は除外する（API-014 §スキーマに body 列なし、一覧負荷低減）。
 * `status` は repository 側で `submitted` / `in_review` のみが返るため、本射影では
 * union を狭めて返す（型安全性の確保）。
 */
function toItem(p: Proposal): ReviewInboxItem {
  // listForReview は status IN ('submitted','in_review') を保証するため narrowing する。
  // 万一 repository 側の不変条件が崩れた場合は呼び出し側のテストで検出される設計。
  const status = p.status as 'submitted' | 'in_review'
  return {
    proposal_id: p.id,
    title: p.title,
    visibility: p.visibility,
    status,
    version: p.version,
    author_id: p.author_id,
    assignee_id: p.assignee_id,
    submitted_at: p.submitted_at,
    updated_at: p.updated_at,
  }
}
