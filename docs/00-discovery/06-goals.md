---
id: DISC-GOALS
title: ゴール・KPI
status: draft
owners: []
updated: 2026-05-03
---

# ゴール・KPI

このプロジェクトで達成したいビジネス上のゴールと、それを測る KPI を整理する。
要件 (`REQ-XXX` `NFR-XXX`) はこれらのゴールに紐づくべきで、ゴール不明なまま要件化された項目は Phase 1 で **`needs-clarification`** に戻される。

## ビジネスゴール

| ID | ゴール | 達成期限 | 主担当 | 関連 PROB |
| --- | --- | --- | --- | --- |
| GOAL-01 | 公開前レビューを必須化し、個人情報・誹謗中傷を含む投稿が公開されるリスクを構造的に下げる | MVP | プロダクトオーナー | PROB-001, PROB-002 |
| GOAL-02 | 結果を変える管理者操作（承認・却下・公開範囲変更・削除など）を AuditLog に append-only で記録し、説明責任を果たせる体制を作る | MVP | プロダクトオーナー | PROB-003, PROB-004 |
| GOAL-03 | guest / user / reviewer / admin / auditor の 5 ロールを、UI ではなく server function 側で強制する設計を確立する | MVP | プロダクトオーナー | PROB-005 |
| GOAL-04 | 投稿者が `private / internal / public` の公開範囲を自己決定でき、公開範囲変更が必ず判断理由付きで AuditLog に残る | MVP | プロダクトオーナー | PROB-006 |
| GOAL-05 | 学習目的：TanStack Start + Cloudflare Workers + shadcn/ui + Tailwind v4 のフルスタック構成を、設定ファイル設計から実装まで一通り経験する（Vite plugin 順序、`server-entry`、`nodejs_compat` 判断などを含む） | MVP | プロダクトオーナー | (技術学習ゴール) |
| GOAL-06 | 学習目的：loader / server function / mutation の責務分離、認可チェックの集中化、監査ログ記録パターンを再利用可能なコード規約として残す | MVP | プロダクトオーナー | (技術学習ゴール) |

> `GOAL-NN` は管理用 ID。`validate-traceability.ts` の対象外（接頭辞が違うため）。

## KPI

> 学習プロジェクトであり実運用の KPI はないが、設計・実装の達成度を測るプロキシ指標を置く。

| KPI | 指標 | 現状値 | 目標値 | 計測方法 | 関連 GOAL |
| --- | --- | --- | --- | --- | --- |
| トレーサビリティ健全性 | `validate-traceability.ts` の error 数 | (未計測) | 0 | `npx tsx scripts/validate-traceability.ts` | GOAL-05, GOAL-06 |
| 認可テストカバレッジ | 「権限のない呼び出しが 403/404」を確認する E2E ケース数 | 0 | 主要 mutation 全件（後続フェーズで定義） | tests/e2e | GOAL-03 |
| 監査ログ記録率 | 「結果を変える server function」のうち AuditLog 書き込みがある割合 | 0% | 100% | コードレビュー＋テスト | GOAL-02 |
| Workers 互換性 | Wrangler dev / `wrangler deploy --dry-run` が成功する | 未計測 | pass | CI / 手動 | GOAL-05 |
| プライバシーガード | 投稿フォームに必須の倫理確認チェックボックスがある | 未実装 | 実装 | UI スナップショット / E2E | GOAL-01 |

## 非ゴール（明示的に追わないこと）

- メール通知 / プッシュ通知の MVP 内実装（将来拡張）
- AI による自動承認（人間レビュー必須を崩さない）
- 添付画像のサポート（R2 連携は将来）
- 通報機能の MVP 内実装（将来）
- 大規模 SNS 化（投稿者間のコメント・いいね機能は対象外）
- 既存自治体システムとのデータ連携（greenfield のため）
- 多言語対応（MVP は日本語のみ）
- 多要素認証 / SSO（MVP は単純なログインで充足）
- データ削除申請（GDPR 的）の自動化（MVP では手動 + AuditLog のみ）

「やらないこと」を書くと Phase 1 でのスコープ判定が迷わない。

## 参照

- 上流: ビジネス会議の議事録、経営方針 → 本プロジェクトでは
  プロダクトオーナーのプロンプト (2026-05-03) が一次情報
- 下流: `docs/01-requirement-refinement/03-scope-definition.md`
