---
id: RC-CLASSIFICATION
title: 要件分類
status: draft
owners: []
updated: 2026-05-03
---

# 要件分類

各 `RC-XXX` を **機能要件 / 非機能要件 / 業務ルール** のいずれに分類するか整理する。
分類はそのまま Phase 2 (`02-requirements/`) のファイル振り分けに対応する：

| 分類 | 振り分け先 |
| --- | --- |
| 機能要件 | `02-requirements/02-functional-requirements.md` の `REQ-XXX` |
| 非機能要件 | `02-requirements/03-non-functional-requirements.md` の `NFR-XXX` |
| 業務ルール | `02-requirements/04-business-rules.md` |

## 分類表

| RC | 候補タイトル | 分類 | 振り分け先 ID 候補 | 備考 |
| --- | --- | --- | --- | --- |
| RC-001 | (サンプル) 登録済アカウントでログインできる | 機能要件 | （振り分けなし） | サンプル。本プロジェクトのドメイン非合致のため Phase 2 への引き継ぎなし。 |
| RC-002 | 投稿の作成と提出（draft / submitted） | 機能要件 | REQ-候補 | 倫理ガード・PolicyAgreement の責務は RC-014 と相互参照。 |
| RC-003 | 公開前レビュー・承認フロー | 機能要件 | REQ-候補 | 業務ルール（判断理由必須）を副として RC-012 / 04-business-rules.md に分岐。 |
| RC-004 | 投稿の公開と公開範囲の適用 | 機能要件 | REQ-候補 | visibility と viewer ロールの判定マトリクスを業務ルールとして派生。 |
| RC-005 | 公開範囲の変更（縮小 / 拡大） | 機能要件 | REQ-候補 | Q-010 確定まで `needs-clarification`。 |
| RC-006 | 投稿の取り下げ（withdrawn） | 機能要件 | REQ-候補 | AuditLog 連携は RC-012 と接続。 |
| RC-007 | 差し戻し後の再提出 | 機能要件 | REQ-候補 | 同一 id 維持の業務ルールを副に持つ。 |
| RC-008 | 自分の投稿一覧・ステータス確認 | 機能要件 | REQ-候補 |  |
| RC-009 | 公開済み投稿の一覧・詳細閲覧 | 機能要件 | REQ-候補 | visibility × ロールの判定は業務ルールとして抽出予定。 |
| RC-010 | レビュー待ち一覧 | 機能要件 | REQ-候補 |  |
| RC-011 | 役割と権限分離（5 ロール） | 業務ルール（一部機能要件） | 04-business-rules.md / NFR | 各 RC を横断する権限マトリクス。NFR 化（RC-018）と接続。 |
| RC-012 | 監査ログの記録 | 機能要件 | REQ-候補 | append-only 強制は RC-019 で NFR 化。 |
| RC-013 | 監査ログの閲覧 | 機能要件 | REQ-候補 |  |
| RC-014 | 投稿時のプライバシー・倫理ガード | 機能要件（一部業務ルール） | REQ-候補 / 04-business-rules.md | 同意必須の挙動は業務ルール側にも記載。 |
| RC-015 | 投稿ポリシー・プライバシーポリシーの公開ページ | 機能要件 | REQ-候補 |  |
| RC-016 | 認証（モック） | 機能要件（一部 NFR） | REQ-候補 / NFR-候補 | モック前提の制約は NFR 側。 |
| RC-017 | Workers 互換ランタイム制約 | 非機能要件 | NFR-候補 | データストア選定は RC-024 に分離。`nodejs_compat` 方針は Q-014 待ち。 |
| RC-018 | 認可は server function 側で強制すること | 非機能要件 | NFR-候補 | E2E テストの存在義務は副に持つ。「機微取得系 loader」の暫定線引きを保有。 |
| RC-019 | AuditLog は append-only であること | 非機能要件 | NFR-候補 | アプリ層は grep + コードレビュー、データ層は Phase 3 で確定。 |
| RC-020 | ログに PII を出さないこと | 非機能要件 | NFR-候補 | 開発環境ログ運用は Q-015 待ち。 |
| RC-021 | レビュー所要時間 SLA | 非機能要件 | NFR-候補 | Q-004 確定までは数値定義保留。観測ポイント部分は MVP IN。 |
| RC-022 | セキュリティ NFR（Cookie 属性 / CSRF / XSS / CSP） | 非機能要件 | NFR-候補 | RC-016 の cookie 発行と接続。CSRF / CSP の最終仕様は Phase 3。 |
| RC-023 | 可観測性 NFR（必須ログフィールド / 集約先 / 保持期間） | 非機能要件 | NFR-候補 | RC-020 と整合。保持期間は Q-006 待ち。 |
| RC-024 | データストア選定（MVP モック → D1 移行視野） | 非機能要件 | NFR-候補 | RC-017 から切り出し。Q-005 / Q-014 待ちで `needs-clarification`。 |

## 分類の指針

- **機能要件**: 「システムが何をするか」。アクター視点での振る舞い。
- **非機能要件**: 「どのように振る舞うか」の品質特性。性能・可用性・セキュリティ・保守性・アクセシビリティ等。
- **業務ルール**: 機能要件・非機能要件の両方に横断する制約・例外条件・ポリシー。

複数分類にまたがる場合は **主分類** を 1 つ決め、副の側は業務ルールとして抽出する。

## 参照

- 上流: `01-requirement-candidates.md`
- 下流: `02-requirements/02-functional-requirements.md`, `03-non-functional-requirements.md`, `04-business-rules.md`
