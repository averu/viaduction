# 20 — 設計プロセスのルール

## 共通ルール

- すべての設計ドキュメントは **Front-matter + 本文 + 参照** の三段構成。
- 1 ファイルに **複数 ID を混ぜない**。`SCR-001.md` には `SCR-001` のみ書く。
- 図は Mermaid を使う。レンダラ非依存のテキストフォーマットを優先する。
- 用語は `docs/02-requirements/05-glossary.md` にあるものだけを使う。新出語は同ファイルに追記してから使う。

## 要件発見 (Phase 0) で書くこと

| ファイル | 内容 |
| --- | --- |
| `docs/00-discovery/01-idea-notes.md` | アイデアの一次情報 (`IDEA-XXX` 採番) |
| `docs/00-discovery/02-problem-statement.md` | 解決したい課題 (`PROB-XXX` 採番) |
| `docs/00-discovery/03-stakeholder-notes.md` | 関係者の関心・期待 |
| `docs/00-discovery/04-current-workflow.md` | 現状フロー (Mermaid 推奨) |
| `docs/00-discovery/05-pain-points.md` | 痛みの一覧 |
| `docs/00-discovery/06-goals.md` | ビジネスゴール (`GOAL-NN` 任意) |
| `docs/00-discovery/07-open-questions.md` | 未確認事項 (`Q-XXX`) |

書かないこと：
- 解決方針 → Phase 1 で考える
- 仕様レベルの詳細 → Phase 2 で書く

## 要件精査 (Phase 1) で書くこと

| ファイル | 内容 |
| --- | --- |
| `docs/01-requirement-refinement/01-requirement-candidates.md` | `RC-XXX` 本体 |
| `docs/01-requirement-refinement/02-ambiguity-review.md` | 曖昧さ・矛盾・重複・抜けの指摘 |
| `docs/01-requirement-refinement/03-scope-definition.md` | プロジェクト全体スコープと RC ごとのスコープの整合 |
| `docs/01-requirement-refinement/04-requirement-classification.md` | 機能 / 非機能 / 業務ルールへの分類 |
| `docs/01-requirement-refinement/05-acceptance-criteria.md` | 受入条件の起草 (Given/When/Then) |
| `docs/01-requirement-refinement/06-requirement-review.md` | 5 種レビュアの集約 |

書かないこと：
- 正式要件 → Phase 2 で書く
- ステータスを `approved` にする → 人間が押す

## 仕様化 (Phase 2) で書くこと

| ファイル | 内容 |
| --- | --- |
| `docs/02-requirements/01-requirements.md` | インデックス・スコープ・ステークホルダー |
| `docs/02-requirements/02-functional-requirements.md` | `REQ-XXX` 本体 |
| `docs/02-requirements/03-non-functional-requirements.md` | `NFR-XXX` 本体 |
| `docs/02-requirements/04-business-rules.md` | 業務ルール（ID なし） |
| `docs/02-requirements/05-glossary.md` | 用語集 |
| `docs/02-requirements/99-traceability-seed.md` | (自動生成) IDEA→REQ 索引 |

書かないこと：
- 設計レベルの詳細 → Phase 3 以降
- 自分で `### Status: approved` を押す → 人間のみ可能

## 基本設計(Phase 3)で書くこと

| ファイル | 内容 |
| --- | --- |
| `01-system-overview.md` | 目的、スコープ、登場アクター、主要ユースケース (`UC-XXX`) |
| `02-architecture.md` | 構成図、技術選定、外部システム連携、ランタイム前提 |
| `03-screen-list.md` | 画面一覧 (`SCR-XXX`)、画面遷移図 |
| `04-api-list.md` | API 一覧 (`API-XXX`)、認可方針、エラー方針 |
| `05-data-model.md` | エンティティ一覧 (`DB-XXX`)、ER 図 |
| `06-non-functional.md` | 非機能要件 (`NFR-XXX`)、SLO/SLA |
| `99-traceability.md` | (自動生成) 上流→下流の対応表 |

書かないこと：
- 個々の画面の項目レベル定義 → 詳細設計で書く
- API のリクエスト/レスポンス JSON スキーマ → 詳細設計で書く
- DB のカラム型・インデックス → 詳細設計で書く

## 詳細設計(Phase 4)で書くこと

### `screens/SCR-XXX.md`
- 画面の目的、利用者、状態遷移
- 画面項目表（項目名、型、必須、初期値、バリデーション、参照 API）
- ユースケース別の操作フロー

### `apis/API-XXX.md`
- メソッド、パス、認可、レート制限
- リクエスト/レスポンスのスキーマ（OpenAPI 風）
- エラーコード一覧
- 参照する `DB-XXX` と読み書きの種別

### `db/DB-XXX.md`
- エンティティ定義（カラム、型、null 制約、デフォルト、外部キー）
- インデックス
- 不変条件（ビジネスルール）
- 参照 API の一覧

### 書かないこと：
- 具体的な実装コード → タスク分解後の `implementer` が書く
- ライブラリ選定の細部 → `02-architecture.md` の決定事項を引用するに留める

## タスク分解(Phase 5)で書くこと

`docs/30-implementation-plan/01-task-breakdown.md` の各 `TASK-XXX` は以下を満たすこと：

- **粒度**: 1 タスク 1〜4 時間で完了する見積。超える場合は分割。
- **入力**: そのタスクが参照する `REQ/UC/SCR/API/DB` の ID を列挙。
- **出力**: 何のファイル・関数・テストが追加・変更されるかを列挙。
- **完了条件**: 観測可能な条件（テストが緑、画面が表示される、など）。
- **依存**: 先行する `TASK-XXX` を列挙。並列実行できるものは依存欄を空に。
- **テスト**: 紐づく `TEST-XXX` を列挙。テスト不可能なものは `untestable: true` と理由を書く。

## 状態の進行

各設計ドキュメントの `status:` は次のように遷移する：

```
draft  ─[人間レビュー or design-reviewer 通過]─>  review
review ─[人間承認]─>                              approved
approved ─[要件変更]─>                            deprecated
```

`approved` のドキュメントを Claude が独断で変更してはならない。要件変更があれば、まず `docs/02-requirements/01-requirements.md`（および関連する `02-functional-requirements.md` / `03-non-functional-requirements.md`）の更新を促し、人間の承認を得てから下流を更新する。
