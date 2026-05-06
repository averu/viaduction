// API-016 / REQ-011 / REQ-012 / NFR-005 / UC-015 / DB-004 — list auditLogs（監査ログ一覧 loader）
//
// 役割:
//   - auditor / admin が AuditLog を `actor_id` / `action` / `target_proposal_id` /
//     `from` / `to` フィルタで一覧する loader（REQ-012 / UC-015）。
//   - AuditLogRepository.list(filter) の薄いラッパ。並び順は repository が
//     `created_at DESC` で返す順序を維持する（API-016 §レスポンス）。
//   - **reason 本文は API レスポンスに含めない**。`reason_present: boolean` のみを
//     射影する（NFR-005 PII 配慮 / API-016 §レスポンス §スキーマ M-12 確定）。
//     reason 本文の取得は API-017 詳細を経由する設計（TASK-030 で実装）。
//
// 不変条件:
//   - viewer === null（guest）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   - viewer.roles に auditor / admin のいずれも含まない（user / reviewer 単独）
//     → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   - auditor / admin → 通過、フィルタを repository に委譲
//   - 戻り値の各エントリは `reason` プロパティを **持たない**（Object.keys に現れない）
//     これは NFR-005 を構造的に保証するための設計判断であり、TEST-029 で検査される
//   - 副作用なし: console / logger / fetch / DB 直叩きは行わない
//
// API-016 §フィルタとの差分:
//   API-016 §概要 (M-1) では `target_proposal_id` フィルタを撤回しているが、
//   本 loader はリポジトリ層の `AuditLogListFilter` をそのまま受け取る薄いラッパとして
//   `target_proposal_id` も受け付ける。HTTP クエリパース層（別 TASK）で M-1 を遵守
//   して `target_proposal_id` を入力させない構成とする。同フィルタは API-015
//   のレビュー詳細（`listByTarget`）と用途が重複しないよう、本 loader 経由でも
//   呼び出し側のクエリ整形で抑止する想定。
//
// BR-AUTHZ-03 との関係:
//   ロール判定はすべて `authorize(viewer, 'list.auditLogs')` に委譲する。本ファイル内では
//   `roles.includes(...)` 等のロール判定を一切書かない（CI grep / TASK-054 と整合）。
//
// 参照: docs/20-detail-design/apis/API-016.md（§認可 §フィルタ §レスポンス §reason_present）、
//       docs/02-requirements/02-functional-requirements.md REQ-011 / REQ-012、
//       docs/02-requirements/03-non-functional-requirements.md NFR-005、
//       src/server/auth/authorize.ts (action='list.auditLogs')、
//       src/server/audit/repository.ts (AuditLogRepository.list)

import type { ProposalStatus } from '#/lib/domain/types'
import { authorize } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import type { AuditAction, AuditLogRepository } from '#/server/audit/repository'

/**
 * 監査ログ一覧 loader のフィルタ。
 *
 * すべて optional、未指定なら全件。`from` / `to` は Unix epoch millis。
 * リポジトリ層 `AuditLogListFilter` に対応する。
 */
export interface ListAuditLogsFilter {
  readonly actor_id?: string
  readonly action?: AuditAction
  readonly target_proposal_id?: string
  /** `created_at >= from`（Unix epoch millis）。 */
  readonly from?: number
  /** `created_at < to`（Unix epoch millis、API-016 §フィルタと同じ排他境界）。 */
  readonly to?: number
}

/**
 * 監査ログ一覧 loader の戻り値 1 件分。
 *
 * API-016 §レスポンス §スキーマに準拠する。**reason 本文は含めない**：
 * `reason_present: boolean` のみを返却する（NFR-005 PII 配慮 / M-12 確定）。
 * 本体取得は API-017 詳細 loader（TASK-030）を経由する。
 *
 * 構造的に `reason` プロパティを持たないため、`Object.keys(item)` には現れない。
 * 仮に呼び出し側で `JSON.stringify(item)` してもログに reason は載らない。
 */
export interface AuditLogSummary {
  readonly audit_log_id: string
  readonly actor_id: string
  readonly actor_role: string
  readonly action: AuditAction
  readonly target_proposal_id: string
  readonly before_status: ProposalStatus | null
  readonly after_status: ProposalStatus | null
  readonly before_visibility: null
  readonly after_visibility: null
  /**
   * `reason` 本文の有無のみを示すフラグ。
   * 判定: `reason !== null && reason.trim().length > 0`。
   * whitespace-only な reason（空白文字のみ）は `false` 扱い。
   */
  readonly reason_present: boolean
  readonly policy_agreement_id: string | null
  readonly created_at: number
}

/**
 * 依存注入。MVP ではインメモリ実装を渡し、Workers / D1 移行時には差し替える。
 */
export interface ListAuditLogsDeps {
  readonly audit: AuditLogRepository
}

/**
 * auditor / admin 専用の監査ログ一覧 loader。
 *
 * @param viewer cookie 解決済の認証主体。`null` は guest（cookie なし or 許可リスト外）。
 * @param filter フィルタ条件。未指定なら全件。
 * @param deps  AuditLogRepository 依存。
 * @returns API-016 のレスポンススキーマに整形済みのサマリ配列。`created_at DESC`。
 *           各エントリは `reason` プロパティを持たない（NFR-005 PII 構造的保証）。
 * @throws AuthorizationError viewer === null のとき reason='not_authenticated' / httpStatus=401。
 *                            viewer が auditor / admin いずれも持たないとき
 *                            reason='insufficient_role' / httpStatus=404。
 *
 * @remarks
 * - authorize() で role 判定（list.auditLogs は auditor / admin のみ通過）。
 * - reason 本文は射影段階で除外する（`AuditLogSummary` に `reason` フィールドが無い）。
 * - 並び順は repository.list の `created_at DESC` を維持する。
 */
export async function listAuditLogs(
  viewer: Viewer | null,
  filter: ListAuditLogsFilter,
  deps: ListAuditLogsDeps,
): Promise<ReadonlyArray<AuditLogSummary>> {
  authorize(viewer, 'list.auditLogs')
  // authorize() は viewer === null / role 不足のとき throw するため、以降は viewer 非 null かつ
  // 必要ロール（auditor or admin）を保有する。

  const rows = await deps.audit.list(filter)
  return rows.map(toSummary)
}

/**
 * AuditLog を API-016 のレスポンスサマリ形に射影する。
 *
 * **reason 本文は意図的に除外する**（NFR-005 / API-016 §レスポンス M-12 確定）。
 * 代わりに `reason_present: boolean` を計算して付与する。
 *
 * `reason_present` の判定:
 *   - reason === null         → false
 *   - reason.trim() === ''    → false（whitespace-only）
 *   - それ以外                → true
 *
 * MVP では before/after_visibility は常に null（DB-004 §不変条件 3、
 * AuditLogRepository が append 時に検証）。型でも `null` リテラルに固定する。
 */
function toSummary(entry: {
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
}): AuditLogSummary {
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
    reason_present: isReasonPresent(entry.reason),
    policy_agreement_id: entry.policy_agreement_id,
    created_at: entry.created_at,
  }
}

/**
 * `reason` 本文の存在判定。null / 空 / whitespace-only は false。
 * 本関数は本ファイル内でのみ使用する pure helper（副作用なし）。
 */
function isReasonPresent(reason: string | null): boolean {
  if (reason === null) return false
  if (reason.trim().length === 0) return false
  return true
}
