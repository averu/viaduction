# 01-requirement-refinement — 要件精査フェーズ (Phase 1)

`docs/00-discovery/` の素材を入力に、**要件候補 (`RC-XXX`)** を起こし、曖昧さ・矛盾・スコープ・受入条件を整理する。
このフェーズの最終アウトプットは「人間が `approved` を押せる状態の `RC-XXX (refined)`」。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `requirement-candidates.md` | `RC-XXX` の本体。候補要件を書き連ねる |
| `ambiguity-review.md` | 曖昧さ・矛盾・重複の指摘リスト |
| `scope-definition.md` | スコープ内 / スコープ外の議論経緯 |
| `requirement-classification.md` | 機能・非機能・業務ルールへの分類 |
| `acceptance-criteria.md` | 受け入れ条件 (Given/When/Then) の起草 |
| `requirement-review.md` | レビュア Subagent からの指摘の集約 |

## 進め方

1. `/refine-requirements` で `requirement-refinement` Skill が起動し、`requirement-analyst` が `RC-XXX` を採番する。
2. `/review-requirements` で各種レビュア Subagent（`ambiguity-reviewer`, `scope-reviewer`, `business-rule-reviewer`, `non-functional-requirement-reviewer`, `acceptance-criteria-reviewer`）が並列レビューする。
3. 指摘を反映し、`RC-XXX` の `### Status` を `refined` に上げる。
4. `/specify-requirements` で `02-requirements/` の正式テンプレに変換 → 人間が `approved` を押す。

## RC のステータス遷移

```
candidate ─[ambiguity-reviewer 等の指摘]─> needs-clarification
needs-clarification ─[人間が補足]──────> refined
refined ──[/specify-requirements]──────> 02-requirements/ の REQ-XXX (candidate)
candidate / refined ──[却下]──────────> rejected / deferred
```

## 重要ルール

- `RC-XXX` を **直接実装対象にしない**（`scripts/validate-traceability.ts` で error）
- 実装可能なのは `02-requirements/` の `REQ-XXX (approved)` のみ
- `RC-XXX` の `### Status` を `refined` 以上にする前に必ず `/review-requirements` を回す
