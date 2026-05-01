---
id: EXT-CONFLICTS
title: 外部インプットと既存ドキュメントの矛盾
status: draft
owners: []
updated: 2026-05-01
---

# External Input Conflicts (CONFLICT-XXX)

外部 Q&A の内容と、既存ドキュメント（要件・設計・タスク）の記述が **食い違う場合** に記録する。
**Claude は勝手にどちらを採用するか決めない**。両方を提示し、解消は人間レビューに委ねる。

## CONFLICT 雛形

> 雛形はコードブロック内なので trace 対象外：
>
> ```
> ## CONFLICT-XXX: 矛盾タイトル
>
> ### Source Information
> 外部 Q&A 側の内容：
> - QA-XXX
> - 該当箇所の引用または要約
>
> ### Existing Document Information
> 既存ドキュメント側の内容：
> - 該当ファイル: docs/02-requirements/02-functional-requirements.md
> - 該当 ID: REQ-XXX (status=approved)
> - 該当箇所の引用
>
> ### Conflict Type
> 次のいずれか（複数可）：
> - Requirement mismatch (機能要件の食い違い)
> - Scope mismatch (スコープ判定の食い違い)
> - Business rule mismatch (業務ルールの食い違い)
> - API mismatch (エンドポイント・スキーマ・認可の食い違い)
> - Data model mismatch (DB / カラムの食い違い)
> - Non-functional mismatch (性能・SLO・セキュリティの食い違い)
> - Priority mismatch (優先度の食い違い)
>
> ### Affected Documents
> - docs/02-requirements/02-functional-requirements.md
> - docs/10-basic-design/...
>
> ### Proposed Resolution
> 反映案・保留案・確認すべき質問を **両論併記** する：
> - 案 A: 既存を維持し、外部 Q&A を `rejected` とする
> - 案 B: 外部 Q&A を採用し、REQ-XXX を deprecated → 新 REQ で置換
> - 案 C: スコープを分割して両立させる
> - 必要な確認: OQ-XXX を起票して PO に確認
>
> ### Status
> open / resolved / rejected
>
> ### Resolution Notes
> 解消した場合、どの案を採ったか、なぜか、誰の判断かを記録。
> ```

## 一覧

> `## CONFLICT-XXX:` セクションをここに書き連ねる。

<!-- /analyze-external-qa または /review-external-conflicts で起票される -->

## ステータス凡例

| Status | 意味 |
| --- | --- |
| `open` | 未解消。人間レビュー待ち |
| `resolved` | 採用案が決定し、関連ドキュメントを更新済 |
| `rejected` | 外部 Q&A を採用しない判断（理由は Resolution Notes） |

## 重要ルール

- **Claude が片方を「正しい」と勝手に判定しない**。両方を引用し、`Proposed Resolution` で複数の案を併記する。
- `status=approved` の REQ や設計と矛盾するときは、影響度を `breaking` として扱う。安易な書き換えは禁止。
- 矛盾が破壊的変更につながる可能性がある場合は `Affected Documents` に下流タスクも列挙する。

## 参照

- 上流: `02-qa-imports.md` の `QA-XXX`
- 下流: `Affected Documents` の各ファイル
