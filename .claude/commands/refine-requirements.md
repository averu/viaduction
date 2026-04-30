---
description: 00-discovery の IDEA / PROB から RC-XXX を起こし、曖昧さ・矛盾・重複・スコープを整理する。requirement-analyst Subagent が動く。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[IDEA-XXX | PROB-XXX | 範囲指定なし]"
---

# /refine-requirements

`requirement-analyst` Subagent を呼んで、`docs/01-requirement-refinement/` 配下の RC を起票・整理します。

## 動作

1. 前提チェック:
   - `docs/00-discovery/idea-notes.md` または `problem-statement.md` に `IDEA-XXX` / `PROB-XXX` が 1 件以上存在するか
   - 無ければ `/discover-requirements` を案内して終了
   - `docs/00-discovery/open-questions.md` に `open` の質問が大量に残っていれば、「先に `/interview-requirements` の回答を済ませることを推奨」と警告（継続は可）
2. `$ARGUMENTS` の解釈：
   - 空 → 未着手の IDEA / PROB すべてを対象
   - `IDEA-XXX` / `PROB-XXX` → その ID から派生する RC のみ起票
3. `Agent(subagent_type=requirement-analyst)` を呼ぶ（`requirement-refinement` Skill が起動）。
4. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
5. 「`/review-requirements` で BLOCKER を確認しますか？」と促す。

## 引数: $ARGUMENTS

`空` / `IDEA-XXX` / `PROB-XXX` のいずれか。

## 完了条件

- `requirement-candidates.md` に新規 `RC-XXX` が 1 件以上追加されている
- すべての新規 RC の `### Status` が `candidate`
- `validate-traceability.ts` の error が 0

## 関連コマンド

- 前段: `/discover-requirements` `/interview-requirements`
- 次段: `/review-requirements`（並列レビュア）→ `/specify-requirements`（REQ 化）
