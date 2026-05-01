---
name: external-conflict-review
description: 外部 Q&A の内容と既存の REQ / 設計 / タスクが食い違う箇所を CONFLICT-XXX として抽出し、両論併記の解消案を提示する。Claude が片方を「正しい」と判定しない。
---

# external-conflict-review

## いつ使うか

- `02-qa-imports.md` の `proposed` QA で、既存ドキュメントとの食い違いが疑われるとき
- `/review-external-conflicts` コマンドが起動したとき
- `external-qa-analysis` Skill が `Classification: Conflict` と判定した QA を深掘りするとき

## 入力

- `docs/05-external-inputs/02-qa-imports.md`
- `docs/02-requirements/02-functional-requirements.md`、`03-non-functional-requirements.md`、`04-business-rules.md`
- `docs/10-basic-design/*.md`、`docs/20-detail-design/**/*.md`
- 既存の `05-conflicts.md`（重複検出のため）

## 何をするか

1. 対象 QA の `Extracted Meaning` と、既存ドキュメントの該当箇所を **両方引用** する。
2. 食い違いの種類を `Conflict Type` から 1 つ以上選ぶ：
   - Requirement / Scope / Business Rule / API / Data Model / Non-Functional / Priority のいずれか
3. `Affected Documents` に影響範囲をリストアップ。
4. `Proposed Resolution` に **複数案を併記** する：
   - 案 A: 既存維持
   - 案 B: 外部採用（既存を deprecated / 上書き）
   - 案 C: 折衷（スコープ分割、フェーズ化など）
5. **Claude が「採用案はこれ」と判定しない**。確認すべき質問があれば `OQ-XXX` を起票する流れを案内。
6. `05-conflicts.md` に `## CONFLICT-XXX:` を追記。`Status: open` で起票。

## 必ず守ること

- **片方を採用と判定しない**。Claude は両論を提示するだけ。
- 影響度が `breaking` になる可能性があるなら、`Affected Documents` に下流タスクも列挙する。
- `status=approved` の REQ や設計と矛盾するときは、特に慎重に扱う（既存承認の取り消しは人間判断）。
- 既存の CONFLICT と重複していないか確認する。

## 出力フォーマット

```markdown
## 矛盾レビュー結果

- 検出した矛盾: <件数>
- 起票した CONFLICT: CONFLICT-NNN, CONFLICT-MMM
- 既存 CONFLICT との重複: <件数>

### CONFLICT-NNN サマリ
- Type: Requirement mismatch
- 関連 QA: QA-007
- 既存: REQ-003 (status=approved)
- 反映候補案: A / B / C を併記

## 推奨される次のアクション
- /plan-doc-reflection で各案の影響を整理
- 案決定のために OQ-XXX を起票して PO に確認
- approved REQ の取り消しが必要な案は人間レビュー必須
```

## やってはいけないこと

- Claude が一方を採用と決める
- `status=approved` の REQ を黙って書き換える提案を出す
- 矛盾の片方だけを引用する（必ず両方引く）
- 既存ドキュメントを直接編集する（このスキルは `05-conflicts.md` への追記のみ）
