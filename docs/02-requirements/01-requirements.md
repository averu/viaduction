---
id: REQ-DOC
title: 要件定義書（インデックス）
status: draft
owners: []
updated: 2026-04-30
---

# 要件定義書

> このフォルダは **正式要件 (REQ-XXX)** の置き場。フロー上の **Phase 2** に相当する。
> Phase 0 (`docs/00-discovery/`)・Phase 1 (`docs/01-requirement-refinement/`) を経て、
> 人間が承認した要件だけがここに集約される。
>
> Claude は要件を **勝手に承認しない**。 `### Status` を `approved` に変えるのは人間の責務。

## 構成

| ファイル | 役割 |
| --- | --- |
| `01-requirements.md` (このファイル) | 全体概要・スコープ・ステークホルダー・他ファイルへの索引 |
| `02-functional-requirements.md` | 機能要件 (`REQ-XXX`) |
| `03-non-functional-requirements.md` | 非機能要件 (`NFR-XXX`) |
| `04-business-rules.md` | 業務ルール・制約・例外条件 |
| `05-glossary.md` | 用語集 |
| `99-traceability-seed.md` | 自動生成の ID 索引 (`/trace-check --emit` で更新) |

## 1. 概要

- プロダクト名:
- ミッション (1 行):
- 解決したい課題: (`docs/00-discovery/02-problem-statement.md` の `PROB-XXX` を参照)
- 想定読者: ステークホルダー、開発チーム

## 2. ステークホルダー

| 役割 | 氏名 / 部署 | 期待 |
| --- | --- | --- |
| プロダクトオーナー |  |  |
| 開発リード |  |  |
| 利用者代表 |  |  |

詳細・関係性は `docs/00-discovery/03-stakeholder-notes.md` を参照。

## 3. スコープ

### スコープ内
- (確定したスコープ内項目を記載)

### スコープ外（明示的に外す）
- (確定したスコープ外項目を記載)

スコープの議論経緯は `docs/01-requirement-refinement/03-scope-definition.md` を参照。

## 4. ユーザストーリー

> "<ロール> として <目的> したい。なぜなら <価値> だから。"

- US-01: ...

## 5. 要件の索引

### 機能要件
全件は `02-functional-requirements.md` を参照。要点のみ：

- REQ-001: 登録済アカウントでログインできる — approved

### 非機能要件
全件は `03-non-functional-requirements.md` を参照。要点のみ：

- NFR-001: パスワードはハッシュで保管する — approved

### 業務ルール
詳細は `04-business-rules.md` を参照。

## 6. 制約条件

- 技術制約:
- 法令・コンプライアンス:
- 予算・期日:

## 7. オープン課題

| ID | 課題 | 起票日 | 期限 | 担当 | ステータス |
| --- | --- | --- | --- | --- | --- |
| Q-001 |  |  |  |  | open |

> 要件レベルで未確定の事項はここに集約する。Phase 0 / Phase 1 由来の課題は
> `docs/00-discovery/07-open-questions.md` および `docs/01-requirement-refinement/02-ambiguity-review.md` を参照。

## 参照

- 上流: `docs/00-discovery/*.md`, `docs/01-requirement-refinement/*.md`
- 下流: `docs/10-basic-design/*.md`
