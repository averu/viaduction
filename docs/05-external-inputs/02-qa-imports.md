---
id: EXT-QA-IMPORTS
title: 外部 Q&A 取り込みログ
status: draft
owners: []
updated: 2026-05-01
---

# External Q&A Imports (QA-XXX)

外部サービスから取り込んだ Q&A を 1 件 1 ブロックで整理する。
分類（Decision / Open Question / Conflict / 単なるノート）はここでメタデータとして付け、
具体的な決定事項は `03-decisions.md`、未解決は `04-open-questions.md`、矛盾は `05-conflicts.md` にも転記する。

## QA 雛形

> 雛形はコードブロック内なので trace 対象外：
>
> ```
> ## QA-XXX: 質問タイトル
>
> ### Source
> - SRC-XXX
> - Service: Backlog / Spreadsheet / Meeting / Chat / GitHub / Other
> - Source ID: 外部課題 ID、行番号、URL、ファイル名など（秘匿は要約）
> - Imported At: YYYY-MM-DD
> - Imported By: human / Claude Code
>
> ### Related IDs
> - RC-XXX
> - REQ-XXX
> - UC-XXX
> - SCR-XXX
> - API-XXX
> - DB-XXX
> - TASK-XXX
>
> ### Question
> 質問内容を原文に近い形で。ただし PII / 秘匿情報は除去。
>
> ### Answer
> 回答内容。回答者名は役割に正規化（個人名は記載しない）。
>
> ### Extracted Meaning
> このQ&Aから読み取れる仕様・要件・制約を Claude が要約する。
> Claude が解釈を加えた箇所は明記する（「(解釈)」など）。
>
> ### Classification
> 次のいずれか（複数可）：
> - Requirement Candidate (RC への反映候補)
> - Business Rule (業務ルール反映候補)
> - Design Constraint (設計制約)
> - Non-Functional Requirement (非機能要件候補)
> - Decision (決定事項 → DEC-XXX に転記)
> - Open Question (未確定 → OQ-XXX に転記)
> - Conflict (既存と矛盾 → CONFLICT-XXX に転記)
> - Note (メモ。直接の反映なし)
>
> ### Proposed Document Updates
> 反映候補のファイル一覧。Reflection Plan の素案として使う。
> - docs/01-requirement-refinement/01-requirement-candidates.md
> - docs/02-requirements/02-functional-requirements.md
> - docs/02-requirements/04-business-rules.md
> - docs/10-basic-design/...
> - docs/20-detail-design/...
>
> ### Reflection Status
> not-reviewed / proposed / approved / reflected / rejected / conflict
>
> ### Notes
> 補足・解釈の根拠・関連する別の QA など。
> ```

## 一覧

> 取り込まれた `## QA-XXX:` セクションをここに書き連ねる。

<!-- /import-external-input → /analyze-external-qa を回すと追記される -->

## ステータス凡例

| Reflection Status | 意味 |
| --- | --- |
| `not-reviewed` | 取り込んだだけ。Claude による分析（/analyze-external-qa）未実施 |
| `proposed` | 反映先と更新内容が提案された（Reflection Plan の対象） |
| `approved` | 人間が反映を承認。実反映待ち |
| `reflected` | 既存または新規ドキュメントに反映済 |
| `rejected` | 反映しない判断（理由は Notes） |
| `conflict` | 既存ドキュメントと矛盾。`05-conflicts.md` に CONFLICT-XXX として記録 |

## 重要ルール

- 個人名・連絡先・認証情報を本文に書かない。役割名（PO、開発リード等）に正規化する。
- 原文を持たないことが望ましい場合は要約のみ記載し、`Source` に外部 URL を残す。
- `Reflection Status` を `approved` `reflected` に変えるのは人間の判断。Claude は `proposed` までで止める。

## 参照

- 上流: `01-intake-log.md` の `SRC-XXX`
- 下流: `03-decisions.md` `04-open-questions.md` `05-conflicts.md` および `01-requirement-refinement/01-requirement-candidates.md`
