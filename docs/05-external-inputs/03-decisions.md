---
id: EXT-DECISIONS
title: 外部 Q&A 由来の決定事項
status: draft
owners: []
updated: 2026-05-01
---

# External Decisions (DEC-XXX)

外部 Q&A の `Classification: Decision` から抽出された決定事項を 1 件 1 ブロックで記録する。
**この時点では正式要件 (REQ) に直接昇格しない**。`/plan-doc-reflection` で反映先を決め、人間が承認した後に各ドキュメントへ転記する。

## DEC 雛形

> 雛形はコードブロック内なので trace 対象外：
>
> ```
> ## DEC-XXX: 決定事項タイトル
>
> ### Source
> - QA-XXX
> - SRC-XXX (Backlog issue / Spreadsheet row / Meeting note の特定)
>
> ### Decision
> 決定された内容を 1〜3 行で。
>
> ### Reason
> その判断理由（背景・代替案・トレードオフ）。
>
> ### Impact
> 影響する要件・設計・実装。
> - 影響領域: 機能 / 非機能 / 業務ルール / API / DB / 画面
> - 影響度: low / medium / high / breaking
>
> ### Related IDs
> - RC-XXX
> - REQ-XXX
> - UC-XXX
> - API-XXX
> - DB-XXX
> - TASK-XXX
> - TEST-XXX
>
> ### Reflection Target
> 反映先ドキュメント（複数可）：
> - docs/02-requirements/04-business-rules.md
> - docs/02-requirements/02-functional-requirements.md
> - docs/10-basic-design/02-architecture.md
>
> ### Status
> proposed / approved / reflected / superseded
> ```

## 一覧

> `## DEC-XXX:` セクションをここに書き連ねる。

<!-- /analyze-external-qa で Classification: Decision に分類された QA から起票される -->

## ステータス凡例

| Status | 意味 |
| --- | --- |
| `proposed` | 反映先候補が提案された段階 |
| `approved` | 人間が承認、反映待ち |
| `reflected` | ドキュメントへ反映済（反映先で `Source: DEC-XXX` を引いている） |
| `superseded` | 後の DEC で覆された。理由を Notes に記載 |

## 重要ルール

- DEC は **反映の根拠** であって、**正式要件そのものではない**。REQ に転記する場合も「Status: candidate」で起こし、人間が `approved` に上げる。
- 同じ問題を別の DEC が覆した場合は、古い方を `superseded` にして残す（履歴の手がかりとして）。

## 参照

- 上流: `02-qa-imports.md` の `QA-XXX`
- 下流: 反映先のドキュメント（`Reflection Target` 参照）
