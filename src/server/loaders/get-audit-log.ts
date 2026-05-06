// API-017 / REQ-012 / NFR-005 / UC-015 / DB-004 — get auditLog（監査ログ詳細 loader）
//
// 役割:
//   - auditor / admin が AuditLog エントリ 1 件のメタ情報（**reason 本体含む**）を
//     取得する loader（REQ-012 / UC-015）。
//   - AuditLogRepository.findById(id) の薄いラッパ。エントリ不在は authorize 層と
//     同じ「認可違反 404」隠蔽方針に従い AuthorizationError(reason='not_owner_resource',
//     httpStatus=404) で throw する（API-017 §エラーコード `NOT_FOUND`）。
//
// 一覧 API-016 (list-audit-logs.ts) との差分:
//   - 本 loader は **reason 本体を返す**（API-017 §レスポンス §スキーマ
//     `reason` フィールド注記: 「本詳細 API では返す。一覧 API-016 では
//     `reason_present` のみ」）。
//   - PII 配慮の責務分担: API レスポンスへの reason 包含は許容するが、**logger /
//     console には出力しない**（API-017 §"ログへの reason 出力禁止" §NFR-005）。
//     本 loader は logger / console を呼ばない設計。
//
// 不変条件:
//   - viewer === null（guest）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   - viewer.roles に auditor / admin のいずれも含まない（user / reviewer 単独）
//     → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   - auditor / admin で `findById(auditLogId)` が null → AuthorizationError(
//     reason='not_owner_resource', httpStatus=404, errorCode='NOT_FOUND')
//   - auditor / admin で findById ヒット → AuditLogDetail を射影して返す
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない（NFR-005 ログ出力禁止）
//
// BR-AUTHZ-03 との関係:
//   ロール判定はすべて `authorize(viewer, 'get.auditLog')` に委譲する。本ファイル内では
//   `roles.includes(...)` 等のロール判定を一切書かない（CI grep / TASK-054 と整合）。
//
// 設計差異の解釈:
//   API-017 §レスポンス §スキーマは reason 本体を返す設計を明記している（本 loader は
//   reason 本体を返す）。target proposal 本文取得は本 loader の責務外であり、
//   API-011 / API-021 の挙動として別途実装される。
//
// 参照: docs/20-detail-design/apis/API-017.md
//         （§概要 §認可 §レスポンス §スキーマ §エラーコード §"ログへの reason 出力禁止"）、
//       docs/02-requirements/02-functional-requirements.md REQ-012、
//       docs/02-requirements/03-non-functional-requirements.md NFR-005、
//       src/server/auth/authorize.ts (action='get.auditLog')、
//       src/server/audit/repository.ts (AuditLogRepository.findById)

import type { ProposalStatus } from '#/lib/domain/types'
import { AuthorizationError, authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditAction, AuditLogRepository } from '#/server/audit/repository'

/**
 * 監査ログ詳細 loader の戻り値。
 *
 * API-017 §レスポンス §スキーマに完全準拠する。`reason` は本体を含む（一覧 API-016 の
 * `AuditLogSummary` は `reason_present: boolean` のみで本体を持たない、これとの差分が
 * 本 loader の存在意義）。
 *
 * before_visibility / after_visibility は MVP で常に null（DB-004 §不変条件 3、
 * AuditLogRepository が append 時に検証）。型でも `null` リテラルに固定する。
 */
export interface AuditLogDetail {
  readonly audit_log_id: string
  readonly actor_id: string
  readonly actor_role: string
  readonly action: AuditAction
  readonly target_proposal_id: string
  readonly before_status: ProposalStatus | null
  readonly after_status: ProposalStatus | null
  /** MVP では常に null（DB-004 §不変条件 3）。 */
  readonly before_visibility: null
  /** MVP では常に null（DB-004 §不変条件 3）。 */
  readonly after_visibility: null
  /**
   * reason 本体。詳細 API では返却する（API-017 §レスポンス §スキーマ）。
   * null は「reason 不要 action」または「未指定」を表す。
   */
  readonly reason: string | null
  readonly policy_agreement_id: string | null
  readonly created_at: number
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時には差し替える。
 */
export interface GetAuditLogDeps {
  readonly audit: AuditLogRepository
}

/**
 * auditor / admin 専用の監査ログ詳細 loader。
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param auditLogId AuditLog の主キー。形式検証は呼び出し側（HTTP 入口）の責務。
 * @param deps  AuditLogRepository 依存。
 * @returns API-017 のレスポンススキーマに整形済みの 1 件分（reason 本体含む）。
 * @throws AuthorizationError
 *   - viewer === null → reason='not_authenticated' / httpStatus=401 / errorCode='UNAUTHENTICATED'
 *   - viewer が auditor / admin いずれも持たない → reason='insufficient_role' /
 *     httpStatus=404 / errorCode='NOT_FOUND'
 *   - findById が null（不存在） → reason='not_owner_resource' / httpStatus=404 /
 *     errorCode='NOT_FOUND'（API-017 §エラーコード `NOT_FOUND` 不存在）
 *
 * @remarks
 * - authorize() で role 判定（get.auditLog は auditor / admin のみ通過）。
 * - reason 本体を含めて返却する（API-017 §レスポンス §スキーマ）。
 * - logger / console / fetch は呼ばない（API-017 §"ログへの reason 出力禁止"
 *   に従い、reason の漏洩経路を構造的に閉じる）。
 */
export async function getAuditLog(
  viewer: Viewer | null,
  auditLogId: string,
  deps: GetAuditLogDeps,
): Promise<AuditLogDetail> {
  authorize(viewer, 'get.auditLog')
  // authorize() は viewer === null / role 不足のとき throw するため、以降は viewer 非 null かつ
  // 必要ロール（auditor or admin）を保有する。

  const entry = await deps.audit.findById(auditLogId)
  if (entry === null) {
    // 存在しない id は「認可違反 404」と統一して隠蔽（API-017 §エラーコード NOT_FOUND）。
    // BR-AUTHZ-02 の暫定統一に従い、authorize 層と同じ AuthorizationError を使う。
    throw new AuthorizationError('not_owner_resource')
  }

  return toDetail(entry)
}

/**
 * AuditLog を API-017 のレスポンス詳細形に射影する。
 *
 * - reason 本体を含めて返す（API-017 §レスポンス §スキーマ）。
 * - before/after_visibility は MVP で常に null（DB-004 §不変条件 3）。
 *   仮に repository に非 null が入っていても、append 時の validation で
 *   排除されているため到達しない（防御として型で `null` に固定）。
 */
function toDetail(entry: {
  readonly id: string
  readonly actor_id: string
  readonly actor_role: string
  readonly action: AuditAction
  readonly target_proposal_id: string
  readonly before_status: ProposalStatus | null
  readonly after_status: ProposalStatus | null
  readonly before_visibility: null | string
  readonly after_visibility: null | string
  readonly reason: string | null
  readonly policy_agreement_id: string | null
  readonly created_at: number
}): AuditLogDetail {
  return {
    audit_log_id: entry.id,
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    action: entry.action,
    target_proposal_id: entry.target_proposal_id,
    before_status: entry.before_status,
    after_status: entry.after_status,
    before_visibility: null,
    after_visibility: null,
    reason: entry.reason,
    policy_agreement_id: entry.policy_agreement_id,
    created_at: entry.created_at,
  }
}
