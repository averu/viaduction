---
id: EXT-OPEN-QUESTIONS
title: 外部由来の未決事項
status: draft
owners: []
updated: 2026-05-01
---

# External Open Questions (OQ-XXX)

外部 Q&A から抽出された **未確定事項** を集約する。
回答が揃うまで、関連する `RC-XXX` / `REQ-XXX` / `TASK-XXX` を `approved` に上げてはならない。

> Phase 0 の `docs/00-discovery/07-open-questions.md` (Q-XXX) は **内部観点** での未確定事項。
> こちら `OQ-XXX` は **外部 Q&A 由来** の未確定事項。区別して使う。

## OQ 雛形

> 雛形はコードブロック内なので trace 対象外：
>
> ```
> ## OQ-XXX: 未決事項タイトル
>
> ### Source
> - QA-XXX
> - SRC-XXX
>
> ### Question
> 確認が必要な内容。回答すべき形式（YES/NO / 数値 / 列挙）まで明示する。
>
> ### Why It Matters
> なぜ確認が必要か。下流のどの判断・実装が止まるか。
>
> ### Affected Documents
> - docs/01-requirement-refinement/01-requirement-candidates.md
> - docs/02-requirements/02-functional-requirements.md
> - docs/10-basic-design/...
>
> ### Blocked Items
> - RC-XXX
> - REQ-XXX
> - TASK-XXX
>
> ### Owner
> 回答すべき相手の役割（PO / 開発リード / 法務 / 顧客 等）
>
> ### Status
> open / answered / closed
>
> ### Answer
> 回答後にここに記載。回答日と回答者の役割も明記。
> ```

## 一覧

> `## OQ-XXX:` セクションをここに書き連ねる。

<!-- /analyze-external-qa で Classification: Open Question に分類された QA から起票される -->

## ステータス凡例

| Status | 意味 |
| --- | --- |
| `open` | 未回答 |
| `answered` | 回答取得済。Affected Documents への反映待ち |
| `closed` | 反映済 / 不要と判断 |

## 重要ルール

- `Blocked Items` に並ぶ ID は、OQ が `closed` になるまで `approved` に上げてはならない。
- 回答が原文で長い場合、要約と Source URL を分けて記載する。

## 参照

- 上流: `02-qa-imports.md` の `QA-XXX`
- 下流: `Affected Documents` および `Blocked Items` で示された各 ID
