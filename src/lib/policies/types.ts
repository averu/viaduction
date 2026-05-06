// REQ-013 / REQ-014 / API-018 — ポリシー文書の共通型
//
// 役割:
//   - 投稿ポリシー / プライバシーポリシー文書の構造的型を一箇所に定義する。
//   - `posting.ts` / `privacy.ts` / loader (`get-policy-document.ts`) が共有する。
//
// 参照: docs/20-detail-design/apis/API-018.md（§レスポンス §スキーマ）

/** API-018 §kind: ポリシー文書の種別。 */
export type PolicyKind = 'posting' | 'privacy'

/**
 * リポジトリ内に格納されるポリシー文書ソース。
 * `kind` は文字列リテラルで固定される（POSTING_POLICY / PRIVACY_POLICY）。
 */
export interface PolicyDocumentSource {
  readonly kind: PolicyKind
  readonly policy_version: string
  readonly title: string
  readonly content_markdown: string
  readonly last_modified_at: number
}
