// REQ-013 / REQ-014 / API-018 / DB-005 — 投稿ポリシー文書（MVP 暫定 placeholder）
//
// 役割:
//   - 投稿ポリシー（`kind='posting'`）の文書本体・タイトル・バージョン識別子を定義する。
//   - API-018 (`/v1/policies/{kind}`) の loader からのみ参照される。
//
// 不変条件 / 注記:
//   - `policy_version` は MVP 暫定値 `mvp-initial`（DB-005 §不変条件 3 / API-018 §レスポンス）。
//     Q-008（policy_version 形式）確定後に SemVer / 日付ベース等へ移行する。
//   - 本文は **MVP 暫定の placeholder**。最終ローンチ前に法務確認が必須（REQ-014 §Provisional Decisions）。
//   - PolicyAgreement（DB-005）の `policy_version` と整合する形式（REQ-013 / DB-005 §不変条件 3）。
//   - 文書は静的（DB アクセスなし、API-018 §副作用 / DB アクセス）。
//
// 参照: docs/20-detail-design/apis/API-018.md（§レスポンス §kind §policy_version）、
//       docs/02-requirements/02-functional-requirements.md REQ-013 / REQ-014、
//       docs/20-detail-design/db/DB-005.md（§不変条件 3）

import type { PolicyDocumentSource } from './types'

/**
 * 投稿ポリシー（REQ-013 で公開、API-018 §kind = 'posting'）。
 *
 * 本文は MVP 暫定 placeholder のため、本番リリース前に法務確認 + 文言確定を行うこと。
 * `last_modified_at` は文書改訂時に手動更新する（Phase 5 で `mtime` 採用が決まる可能性あり）。
 */
export const POSTING_POLICY = {
  kind: 'posting',
  policy_version: 'mvp-initial',
  title: '投稿ポリシー',
  content_markdown: `# 投稿ポリシー

> 本文書は MVP 暫定の placeholder です。最終リリース前に法務確認を経た版に差し替えてください（REQ-014）。

## 目的

本サービスは橋渡しとなる提案・相談を共有する場を提供します。
投稿者・閲覧者ともに安心して利用できるよう、以下の禁止事項・遵守事項を定めます。

## 禁止事項

- 個人情報（氏名・連絡先・住所・所属など特定可能な情報）の投稿
- 第三者の名誉を毀損する内容、誹謗中傷、ハラスメントに該当する内容
- 公序良俗に反する内容、違法行為を助長する内容
- 著作権・商標権・肖像権など第三者の権利を侵害する内容
- スパム、宣伝、勧誘を主目的とする投稿

## 遵守事項

- 投稿内容に責任を持つこと
- 公開範囲（private / internal / public）の意味を理解した上で選択すること
- プライバシーポリシーに同意した上で投稿すること（REQ-013）

## 違反時の措置

- 運用者は違反投稿を非公開化または削除する場合があります
- 重大な違反は利用停止の対象となる場合があります

## 改定

本ポリシーは改定される場合があります。改定時は \`policy_version\` を更新します。
`,
  last_modified_at: 1_745_000_000_000,
} as const satisfies PolicyDocumentSource
