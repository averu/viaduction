// API-018 / REQ-013 / REQ-014 / UC-017 / DB-005 — get policyDocument（ポリシー文書取得 loader、公開バイパス）
//
// 役割:
//   - 投稿ポリシー (`kind='posting'`) / プライバシーポリシー (`kind='privacy'`) の文書本体・
//     `policy_version`・`title`・`content_markdown`・`last_modified_at` を返す read-only loader。
//   - **公開バイパス対象**（API-018 §認可 / `docs/10-basic-design/04-api-list.md` §公開バイパス一覧）。
//     `viewer` を引数に取らず、authorize() を呼ばない。BR-AUTHZ-03 の対象外。
//   - cookie の有無やロール（guest 含む）によらず 200 を返す（REQ-014 AC）。
//
// 不変条件:
//   - `kind` が `'posting'` / `'privacy'` 以外の場合は `PolicyKindError`（httpStatus=404 /
//     errorCode='NOT_FOUND'）を throw する（API-018 §エラーコード「kind 不正 → 404」）。
//   - `policy_version` は DB-005 §不変条件 3「MVP では `mvp-initial` リテラル」と整合する
//     形式で返す（PolicyAgreement の `policy_version` と整合）。
//   - 副作用なし: console / logger / authorize / fetch / DB アクセスは行わない
//     （API-018 §副作用 / DB アクセス: 「DB アクセスなし」）。
//   - 文書本体はリポジトリ内の静的定数（`#/lib/policies/posting`・`#/lib/policies/privacy`）を
//     参照するのみで、I/O を発生させない（MVP 暫定）。
//
// 参照: docs/20-detail-design/apis/API-018.md（§認可 §レスポンス §kind §policy_version §エラーコード）、
//       docs/02-requirements/02-functional-requirements.md REQ-013 / REQ-014、
//       docs/20-detail-design/db/DB-005.md（§不変条件 3 / `mvp-initial`）、
//       docs/10-basic-design/04-api-list.md（公開バイパス一覧）

import { POSTING_POLICY } from '#/lib/policies/posting'
import { PRIVACY_POLICY } from '#/lib/policies/privacy'
import type { PolicyDocumentSource, PolicyKind } from '#/lib/policies/types'
import type { ErrorCode } from '#/lib/domain/types'

export type { PolicyKind } from '#/lib/policies/types'

/**
 * API-018 §レスポンス §スキーマに準拠する loader の戻り値。
 *
 * `policy_version` はソース定数の値を採用するか、`deps.getCurrentPolicyVersion` が
 * 渡された場合はその戻り値で上書きする（将来のバージョン管理切替を想定）。
 */
export interface PolicyDocument {
  readonly kind: PolicyKind
  readonly policy_version: string
  readonly title: string
  readonly content_markdown: string
  readonly last_modified_at: number
}

/**
 * `kind` が enum 外（`'posting'` / `'privacy'` 以外）の場合に throw される例外。
 *
 * - `httpStatus`: 404（API-018 §エラーコード「kind 不正 → NOT_FOUND」）
 * - `errorCode`: `'NOT_FOUND'`（`ErrorCode` の Extract）
 * - `invalidKind`: 受け取った不正値（デバッグ目的、ログ側で PII 配慮することは
 *   呼び出し側の責務。本値は path パラメータ由来の文字列のため PII 該当なしの想定）
 *
 * `AuthorizationError` を流用しない理由: 本エラーは認可の拒否ではなく
 * 「リソース（kind）の存在検査」であり、`reason` の概念を持たない（BR-AUTHZ-03 の対象外）。
 */
export class PolicyKindError extends Error {
  readonly httpStatus: 404
  readonly errorCode: Extract<ErrorCode, 'NOT_FOUND'>
  readonly invalidKind: string

  constructor(invalidKind: string) {
    super(`unknown policy kind: ${JSON.stringify(invalidKind)}`)
    this.name = 'PolicyKindError'
    this.httpStatus = 404
    this.errorCode = 'NOT_FOUND'
    this.invalidKind = invalidKind
  }
}

/**
 * 依存注入。
 *
 * - `getCurrentPolicyVersion`: 現在の `policy_version` を返す関数。MVP では未指定時に
 *   ソース定数（`POSTING_POLICY.policy_version` / `PRIVACY_POLICY.policy_version`）の値
 *   （= `'mvp-initial'`）を採用する。Q-008 確定後にバージョン番号体系を導入する際は
 *   本 DI 経由で差し替える。
 */
export interface GetPolicyDocumentDeps {
  readonly getCurrentPolicyVersion?: () => string
}

/**
 * 公開バイパス対応のポリシー文書取得 loader。
 *
 * @param kind 文書種別。`'posting'` / `'privacy'` 以外は `PolicyKindError` を throw する。
 * @param deps 依存注入（任意）。
 * @returns API-018 §レスポンスのスキーマに整形済みのポリシー文書。
 *
 * @throws {PolicyKindError} `kind` が enum 外の場合（httpStatus=404 / errorCode='NOT_FOUND'）。
 *
 * @remarks
 * - 公開バイパス: `viewer` を引数に取らず、authorize() も呼ばない（API-018 §認可、
 *   BR-AUTHZ-03 の適用範囲外）。
 * - 副作用なし: console / logger / fetch / DB アクセスは行わない。
 * - 同期的に解決可能だが、API-018 の loader 契約に合わせて Promise を返す。
 */
export async function getPolicyDocument(
  kind: string,
  deps?: GetPolicyDocumentDeps,
): Promise<PolicyDocument> {
  const source = resolveSource(kind)
  if (source === null) {
    throw new PolicyKindError(kind)
  }

  const policy_version = deps?.getCurrentPolicyVersion?.() ?? source.policy_version

  return {
    kind: source.kind,
    policy_version,
    title: source.title,
    content_markdown: source.content_markdown,
    last_modified_at: source.last_modified_at,
  }
}

/**
 * `kind` を enum 検査して対応するソース定数を返す。enum 外なら null。
 *
 * `switch` ではなく辞書引きにしないのは、ソース定数の `kind` フィールドに対する
 * 型レベルでの安全性（リテラル型）を活かして「`kind` が POSTING_POLICY と一致する場合のみ
 * `posting` 文書を返す」という対応を直接表現するため。
 */
function resolveSource(kind: string): PolicyDocumentSource | null {
  if (kind === POSTING_POLICY.kind) {
    return POSTING_POLICY
  }
  if (kind === PRIVACY_POLICY.kind) {
    return PRIVACY_POLICY
  }
  return null
}
