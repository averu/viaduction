---
id: RC-CLASSIFICATION
title: 要件分類
status: draft
owners: []
updated: 2026-04-30
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
| RC-001 | (記載例) ログイン機能 | 機能要件 | REQ-001 |  |

## 分類の指針

- **機能要件**: 「システムが何をするか」。アクター視点での振る舞い。
- **非機能要件**: 「どのように振る舞うか」の品質特性。性能・可用性・セキュリティ・保守性・アクセシビリティ等。
- **業務ルール**: 機能要件・非機能要件の両方に横断する制約・例外条件・ポリシー。

複数分類にまたがる場合は **主分類** を 1 つ決め、副の側は業務ルールとして抽出する。

## 参照

- 上流: `01-requirement-candidates.md`
- 下流: `02-requirements/02-functional-requirements.md`, `03-non-functional-requirements.md`, `04-business-rules.md`
