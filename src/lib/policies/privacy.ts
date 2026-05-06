// REQ-013 / REQ-014 / API-018 / DB-005 — プライバシーポリシー文書（MVP 暫定 placeholder）
//
// 役割:
//   - プライバシーポリシー（`kind='privacy'`）の文書本体・タイトル・バージョン識別子を定義する。
//   - API-018 (`/v1/policies/{kind}`) の loader からのみ参照される。
//
// 不変条件 / 注記:
//   - `policy_version` は MVP 暫定値 `mvp-initial`（DB-005 §不変条件 3 / API-018 §レスポンス）。
//   - 本文は **MVP 暫定の placeholder**。最終ローンチ前に法務確認が必須（REQ-014 §Provisional Decisions）。
//   - PolicyAgreement（DB-005）の `policy_version` と整合する形式（REQ-013 / DB-005 §不変条件 3）。
//
// 参照: docs/20-detail-design/apis/API-018.md（§レスポンス §kind §policy_version）、
//       docs/02-requirements/02-functional-requirements.md REQ-013 / REQ-014、
//       docs/20-detail-design/db/DB-005.md（§不変条件 3）

import type { PolicyDocumentSource } from './types'

/**
 * プライバシーポリシー（REQ-014 で公開、API-018 §kind = 'privacy'）。
 *
 * 本文は MVP 暫定 placeholder のため、本番リリース前に法務確認 + 文言確定を行うこと。
 */
export const PRIVACY_POLICY = {
  kind: 'privacy',
  policy_version: 'mvp-initial',
  title: 'プライバシーポリシー',
  content_markdown: `# プライバシーポリシー

> 本文書は MVP 暫定の placeholder です。最終リリース前に法務確認を経た版に差し替えてください（REQ-014）。

## 取得する情報

- ログイン時に発行される識別子（cookie 経由）
- 投稿内容（提案・相談本文、タイトル、公開範囲、タイムスタンプ）
- 監査ログ（操作ログ、提出・承認・公開等のライフサイクル記録）

## 利用目的

- サービスの提供、運用、改善
- 投稿の公開範囲制御（REQ-008）
- 不正利用防止、セキュリティ確保
- 運用上の問い合わせ対応

## 第三者提供

- 法令に基づく場合を除き、第三者に提供しません

## 保管期間

- 投稿内容は提案ライフサイクルに従って保管します
- 監査ログは運用上必要な期間保管します（具体期間は別途定めます）

## 利用者の権利

- 自身の投稿の取り下げ（withdrawn）が可能です（REQ-005）
- 削除依頼については運用者に問い合わせてください

## ポリシー同意

- 投稿時にプライバシーポリシーへの同意が必要です（REQ-013 / PolicyAgreement）
- 同意の記録は \`policy_version\` とともに保管されます

## 改定

本ポリシーは改定される場合があります。改定時は \`policy_version\` を更新します。
`,
  last_modified_at: 1_745_000_000_000,
} as const satisfies PolicyDocumentSource
