---
name: review-external-conflicts
description: 外部 Q&A と既存 REQ / 設計の矛盾を検出し、CONFLICT-XXX として記録する。読み取り専用で書き換えは行わない。
argument-hint: "[QA-XXX | --all-proposed | --status open]"
---

# review-external-conflicts

外部 Q&A と既存ドキュメントの **矛盾レビュー** Skill。`external-conflict-reviewer` Subagent を呼んで両論併記の起票案を提示する。**書き換えは行わない**。

## いつ使うか

- `02-qa-imports.md` に `proposed` の QA がある段階で、既存仕様との食い違いが疑われるとき
- 既存 `05-conflicts.md` の `Status: open` を再評価したいとき

## 動作

1. `$ARGUMENTS` の解釈：
   - `QA-XXX` → 指定 QA を対象に矛盾レビュー
   - `--all-proposed` / 空 → `Reflection Status: proposed` の全 QA
   - `--status open` → 既存 `05-conflicts.md` の `Status: open` を再評価
2. `Agent(subagent_type=external-conflict-reviewer)` を呼ぶ。
3. Subagent が両論を引用して `CONFLICT-XXX` 起票案を提示。
4. 必要に応じて `OQ-XXX` 起票も提案（採用判断のため）。
5. 結果は `BLOCKER` / `MAJOR` / `MINOR` の指摘と、起票案テーブルで返ってくる。

## レビュー観点

1. **意味的な矛盾**: Acceptance Criteria が両立しない、API のエンドポイントや認可が異なる、DB のカラム制約が異なる
2. **スコープ矛盾**: 一方が「対象」、もう一方が「対象外」と宣言
3. **優先度矛盾**: Priority が食い違う
4. **非機能矛盾**: 性能・SLO・セキュリティ目標値が異なる

## 必ず守ること

- **片方を採用と判定しない**。常に両論を引用する
- 既存の `Status: approved` の REQ / 設計と矛盾するときは **影響度を最低 high** とする
- CONFLICT 起票案は提示するだけ。実起票は `external-input-analyst` の責務
- 重複 CONFLICT を作らない（既存 `05-conflicts.md` を Grep で確認）

## 出力フォーマット

```markdown
## 矛盾レビュー結果

- 検出した矛盾: <件数>
- 起票推奨の CONFLICT: CONFLICT-NNN, CONFLICT-MMM
- 既存 CONFLICT との重複: <件数>

### CONFLICT-NNN サマリ
- Type: Requirement mismatch
- 関連 QA: QA-007
- 既存: REQ-003 (status=approved)
- 反映候補案: A / B / C を併記

## 推奨される次のアクション
- /plan-doc-reflection で各案の影響を整理
- 案決定のために OQ-XXX を起票して PO に確認
```

## 完了条件

- 対象 QA すべてに対して矛盾の有無が判定されている
- 矛盾検出箇所は **両方の引用** が示されている
- 起票案には **複数案 (A/B/C)** が併記されている
- Subagent が **書き込みを行っていない**

## 関連

- 前段: `analyze-external-qa`
- 次段: 起票が必要なら `external-input-analyst` 経由で `05-conflicts.md` 追記。その後 `plan-doc-reflection`

## やってはいけないこと

- 既存ドキュメントの書き換え提案
- 「外部 Q&A の方が新しいので採用」のような断定
- 既存 `approved` REQ の取り消し提案を独断で出す
- 該当箇所を引用せずに「矛盾あり」とだけ言う
