// NFR-003 / BR-AUTHZ-03 — 認可判定の単一エントリポイント
//
// 役割:
//   - 全 mutation 系 server function および機微取得系 loader（暫定 18 action）が
//     入口で本関数を通過する。NFR-003 のハードルール。
//   - 判定は「ロール」「Visibility」「リソース所有者一致」の 3 軸のみで行う。
//     DB / I/O / logger / console は触らない（副作用なし）。
//   - 拒否時は AuthorizationError を throw する。HTTP 401 / 404 へのマッピングは
//     呼び出し側（server function ラッパ）が担当する。logger 連携は TASK-007 / 呼び出し側。
//
// 不変条件:
//   - 本ファイル外で `(role === ...)` / `hasRole` / `canAccess` / `isAdmin` /
//     `isReviewer` / `isAuditor` を書かない（BR-AUTHZ-03、CI grep は TASK-054）。
//   - 本ファイル内で副作用（fetch / fs / console / logger / DB）を起こさない（NFR-003 AC）。
//   - 認可拒否時の HTTP は暫定統一に従い「未ログイン 401 / 認可違反 404」（BR-AUTHZ-02）。
//     CSRF (`403 CSRF_DENIED`) は別レイヤ（TASK-008）の責務であり本関数では扱わない。
//
// 参照: API-002, API-003, API-004, API-005, API-006, API-007, API-008, API-009,
//       API-011, API-012, API-013, API-014, API-015, API-016, API-017,
//       API-021, API-022, API-023

import type { ErrorCode, ProposalStatus, Visibility } from '#/lib/domain/types'
import type { AuthenticatedRole, Viewer } from '#/server/auth/session'

/**
 * authorize() に渡す action 識別子。各 server function / loader と 1:1 で対応する。
 *
 * 認可ヘルパーを通過しない 4 API は本 union に含めない（API-010 health / API-018 policy /
 * API-019 login / API-020 logout）。これらは「公開バイパス」として呼び出し側で
 * 明示的に authorize() を呼ばない設計とする。
 */
export type Action =
  | 'proposal.create' // API-022 createDraft
  | 'proposal.update' // API-023 updateDraft
  | 'proposal.submit' // API-002 submit
  | 'proposal.resubmit' // API-009 resubmit
  | 'review.start' // API-003 startReview
  | 'review.approve' // API-004 approve
  | 'review.return' // API-005 return
  | 'review.reject' // API-006 reject
  | 'admin.publish' // API-007 publish
  | 'admin.withdraw' // API-008 withdraw
  | 'admin.viewProposal' // API-021 admin proposal viewer
  | 'list.myProposals' // API-012 自分の投稿一覧
  | 'get.myProposal' // API-013 自分の投稿詳細
  | 'list.reviewInbox' // API-014 レビュー待ち一覧
  | 'get.reviewProposal' // API-015 レビュー詳細
  | 'get.publishedProposal' // API-011 公開投稿詳細（guest 可、visibility 依存）
  | 'list.auditLogs' // API-016 監査ログ一覧
  | 'get.auditLog' // API-017 監査ログ詳細

/** 認可ヘルパーを通過しない API の識別子（公開バイパス）。文書化目的で export する。 */
export const PUBLIC_BYPASS_ACTIONS = [
  'health', // API-010
  'policy.get', // API-018
  'auth.login', // API-019
  'auth.logout', // API-020
] as const
export type PublicBypassAction = (typeof PUBLIC_BYPASS_ACTIONS)[number]

/** proposal リソース。所有者一致 / visibility 判定に使用する。 */
export interface ProposalResource {
  readonly kind: 'proposal'
  readonly author_id: string
  readonly visibility?: Visibility
  readonly status?: ProposalStatus
}

/** AuditLog リソース。所有者一致は無く、role 判定のみ。 */
export interface AuditLogResource {
  readonly kind: 'audit_log'
}

export type Resource = ProposalResource | AuditLogResource

/**
 * 認可拒否の事由コード。logger に `403_reason` として記録される（TASK-007 で実装）。
 *
 * - `not_authenticated`: viewer === null（cookie なし / 許可リスト外）
 * - `insufficient_role`: viewer は認証済だが必要 role を持たない / Q-016 暫定の
 *   reviewer + private ブロックも本コードに集約する（API-011 / API-015 と整合）
 * - `not_owner`: 所有者一致 action だが resource が指定されていない（API 入口の不整合）
 * - `not_owner_resource`: 所有者一致 action で resource.author_id != viewer.user_id
 */
export type DenyReason =
  | 'not_authenticated'
  | 'insufficient_role'
  | 'not_owner'
  | 'not_owner_resource'

/**
 * authorize() が拒否時に throw する例外。
 *
 * - `reason`: logger に記録する事由コード（NFR-007）
 * - `httpStatus`: 暫定統一に従う 401 / 404 へのマッピング
 * - `errorCode`: API レスポンスボディの `error.code`（ErrorCode union のサブセット）
 */
export class AuthorizationError extends Error {
  readonly reason: DenyReason
  readonly httpStatus: 401 | 404
  readonly errorCode: Extract<ErrorCode, 'UNAUTHENTICATED' | 'NOT_FOUND'>

  constructor(reason: DenyReason) {
    const httpStatus: 401 | 404 = reason === 'not_authenticated' ? 401 : 404
    const errorCode: Extract<ErrorCode, 'UNAUTHENTICATED' | 'NOT_FOUND'> =
      httpStatus === 401 ? 'UNAUTHENTICATED' : 'NOT_FOUND'
    super(`authorization denied: ${reason}`)
    this.name = 'AuthorizationError'
    this.reason = reason
    this.httpStatus = httpStatus
    this.errorCode = errorCode
  }
}

/** 内部用: viewer が roles のいずれかを持つか。本ファイル内に閉じる（BR-AUTHZ-03）。 */
function viewerHasAnyRole(
  viewer: Viewer,
  required: ReadonlyArray<AuthenticatedRole>,
): boolean {
  for (const r of required) {
    if (viewer.roles.includes(r)) return true
  }
  return false
}

/** 内部用: viewer.user_id と resource.author_id を厳密比較する。 */
function isOwner(viewer: Viewer, resource: ProposalResource): boolean {
  return viewer.user_id === resource.author_id
}

/**
 * `get.publishedProposal` (API-011) の visibility × viewer マトリクスを評価する。
 *
 * REQ-008 と同期。マトリクスは API-011.md を真実のソースとする：
 *   visibility \ viewer  | guest | user(他人) | user(本人) | reviewer | admin | auditor
 *   --------------------- | ----- | ---------- | ---------- | -------- | ----- | -------
 *   private               | 401   | 404        | 200        | 404 (Q)  | 200   | 404 (Q)
 *   internal              | 401   | 200        | 200        | 200      | 200   | 200
 *   public                | 200   | 200        | 200        | 200      | 200   | 200
 *
 * Q-016 暫定: reviewer / auditor が private を要求した場合は `insufficient_role` で 404。
 */
function authorizePublishedProposal(
  viewer: Viewer | null,
  resource: ProposalResource | undefined,
): void {
  // resource が無い場合は呼び出し側の不整合（owner 判定要だが情報なし）。
  // public/internal でも resource 不在は 404 とする（隠蔽方針）。
  if (resource === undefined) {
    throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'not_owner')
  }
  const visibility = resource.visibility
  if (visibility === 'public') {
    return
  }
  if (visibility === 'internal') {
    if (viewer === null) throw new AuthorizationError('not_authenticated')
    return
  }
  if (visibility === 'private') {
    if (viewer === null) throw new AuthorizationError('not_authenticated')
    if (viewer.roles.includes('admin')) return
    if (viewer.roles.includes('user') && isOwner(viewer, resource)) return
    // user(他人) は not_owner_resource、reviewer / auditor は insufficient_role（Q-016 暫定）
    if (viewer.roles.includes('user')) {
      throw new AuthorizationError('not_owner_resource')
    }
    throw new AuthorizationError('insufficient_role')
  }
  // visibility 未指定 / 想定外: API-011 は published のみ対象なので 404 隠蔽。
  // viewer === null でも internal/private と同様に 401 を返す方針で統一する。
  throw new AuthorizationError(viewer === null ? 'not_authenticated' : 'not_owner_resource')
}

/**
 * 認可判定の唯一の入口。
 *
 * @param viewer 解決済みの viewer（cookie なし / 許可リスト外なら null）
 * @param action 対象 action（18 種）
 * @param resource 必要に応じて proposal / audit_log リソースを渡す
 * @throws AuthorizationError 拒否時。副作用は起こさない。
 */
export function authorize(
  viewer: Viewer | null,
  action: Action,
  resource?: Resource,
): void {
  // get.publishedProposal は guest を許容するため、認証チェックを内側で行う。
  if (action === 'get.publishedProposal') {
    const r = resource && resource.kind === 'proposal' ? resource : undefined
    authorizePublishedProposal(viewer, r)
    return
  }

  // それ以外の 17 action は viewer が必須。
  if (viewer === null) {
    throw new AuthorizationError('not_authenticated')
  }

  switch (action) {
    // --- 投稿者本人系（owner 一致が必須） ---
    case 'proposal.create': {
      // API-022: user 以上（reviewer / admin / auditor 含む、guest のみ 401）
      // 認証済であれば誰でも自身の draft を作成できる。owner はサーバ側で強制設定するため resource 不要。
      return
    }
    case 'proposal.update': {
      // API-023: 投稿者本人のみ。status='draft' の検証は呼び出し側の責務（ビジネスルール 422）。
      const r = expectProposalResource(resource)
      if (!viewerHasAnyRole(viewer, ['user', 'reviewer', 'admin', 'auditor'])) {
        throw new AuthorizationError('insufficient_role')
      }
      if (!isOwner(viewer, r)) {
        throw new AuthorizationError('not_owner_resource')
      }
      return
    }
    case 'proposal.submit': {
      // API-002: user 以上 + author 一致
      const r = expectProposalResource(resource)
      if (!viewerHasAnyRole(viewer, ['user', 'reviewer', 'admin', 'auditor'])) {
        throw new AuthorizationError('insufficient_role')
      }
      if (!isOwner(viewer, r)) {
        throw new AuthorizationError('not_owner_resource')
      }
      return
    }
    case 'proposal.resubmit': {
      // API-009: user 以上 + author 一致（reviewer / admin / auditor が他人の returned を再提出するのは不可）
      const r = expectProposalResource(resource)
      if (!viewerHasAnyRole(viewer, ['user', 'reviewer', 'admin', 'auditor'])) {
        throw new AuthorizationError('insufficient_role')
      }
      if (!isOwner(viewer, r)) {
        throw new AuthorizationError('not_owner_resource')
      }
      return
    }

    // --- レビュー系（reviewer / admin） ---
    case 'review.start': {
      // API-003: reviewer または admin。reviewer + private 投稿は Q-016 暫定で 404 insufficient_role
      const r = expectProposalResource(resource)
      if (!viewerHasAnyRole(viewer, ['reviewer', 'admin'])) {
        throw new AuthorizationError('insufficient_role')
      }
      if (
        r.visibility === 'private' &&
        !viewer.roles.includes('admin')
      ) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }
    case 'review.approve':
    case 'review.return':
    case 'review.reject': {
      // API-004 / 005 / 006: reviewer または admin。assignee 一致は B-3 で撤回（不要）。
      // resource は呼び出し側で provided される想定（owner 一致は判定しないが
      // 引数としては受け取って無視する設計でも良い）。本実装では resource を要求しない。
      if (!viewerHasAnyRole(viewer, ['reviewer', 'admin'])) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }

    // --- 管理者系 ---
    case 'admin.publish':
    case 'admin.withdraw': {
      // API-007 / API-008: admin 専権
      if (!viewer.roles.includes('admin')) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }
    case 'admin.viewProposal': {
      // API-021: admin 専権（reviewer / user / auditor は 404）
      if (!viewer.roles.includes('admin')) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }

    // --- 自身の投稿の取得系 ---
    case 'list.myProposals': {
      // API-012: user 以上（認証済なら誰でも、自身分のみフィルタ）。owner は server-side で強制。
      // 認証済チェックは既に通過済（viewer !== null）。
      return
    }
    case 'get.myProposal': {
      // API-013: 認証済 + author 一致
      const r = expectProposalResource(resource)
      if (!isOwner(viewer, r)) {
        throw new AuthorizationError('not_owner_resource')
      }
      return
    }

    // --- レビュー画面用の取得系 ---
    case 'list.reviewInbox': {
      // API-014: reviewer / admin
      if (!viewerHasAnyRole(viewer, ['reviewer', 'admin'])) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }
    case 'get.reviewProposal': {
      // API-015: reviewer / admin。reviewer + private は Q-016 暫定で 404 insufficient_role
      const r = expectProposalResource(resource)
      if (!viewerHasAnyRole(viewer, ['reviewer', 'admin'])) {
        throw new AuthorizationError('insufficient_role')
      }
      if (
        r.visibility === 'private' &&
        !viewer.roles.includes('admin')
      ) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }

    // --- 監査ログ系（auditor / admin） ---
    case 'list.auditLogs':
    case 'get.auditLog': {
      // API-016 / API-017: auditor または admin（user / reviewer は 404）
      if (!viewerHasAnyRole(viewer, ['auditor', 'admin'])) {
        throw new AuthorizationError('insufficient_role')
      }
      return
    }

    default: {
      // exhaustiveness 検査: 全 action を上で扱っているはず。型レベルで `never` になる。
      const exhaustive: never = action
      throw new Error(`unhandled action: ${String(exhaustive)}`)
    }
  }
}

/**
 * 内部用: ProposalResource を期待する action で resource が未指定の場合を 404 で弾く。
 *
 * 暫定統一の認可違反 404 と整合させるため `not_owner` に正規化する（owner 一致を
 * 判定する API で resource が来ない = 呼び出し側の不整合）。
 */
function expectProposalResource(resource: Resource | undefined): ProposalResource {
  if (resource === undefined || resource.kind !== 'proposal') {
    throw new AuthorizationError('not_owner')
  }
  return resource
}
