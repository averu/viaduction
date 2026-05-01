---
description: 取り込み済みの QA-XXX を分類し、Decision (DEC-XXX) / Open Question (OQ-XXX) / Conflict (CONFLICT-XXX) として転記する。既存 RC / REQ / 設計と関連づける。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[QA-XXX | --status not-reviewed]"
---

# /analyze-external-qa

`external-input-analyst` Subagent を `external-qa-analysis` Skill 経由で起動し、`Reflection Status: not-reviewed` の QA を分類します。

## 動作

1. 前提チェック：
   - `02-qa-imports.md` に `not-reviewed` の QA が 1 件以上あるか
   - 無ければ「`/import-external-input` で素材を取り込んでから再実行してください」と案内して終了
2. `$ARGUMENTS` の解釈：
   - `QA-XXX` → 指定 QA のみ分析
   - `--status not-reviewed`（既定）→ 未分析の QA すべて
3. `Agent(subagent_type=external-input-analyst)` を呼ぶ。
4. Subagent が各 QA に対して：
   - `Extracted Meaning` を埋める（解釈には `(解釈)` 注記）
   - `Classification` を 1 つ以上選ぶ
   - 該当する場合 `DEC-XXX` / `OQ-XXX` / `CONFLICT-XXX` を起票
   - 既存 `RC-XXX` `REQ-XXX` との重複候補を `Related IDs` に追記
   - `Reflection Status` を `not-reviewed` → `proposed` に進める
5. 完了後 `Bash(npx tsx scripts/validate-traceability.ts)` を実行。
6. 「`/plan-doc-reflection` で反映計画を作成しますか？ Conflict があるなら `/review-external-conflicts` を先に。」と確認。

## 引数: $ARGUMENTS

`QA-XXX` 形式の ID または `--status not-reviewed`（または空）。

## 完了条件

- 対象 QA すべての `Extracted Meaning` `Classification` が埋まっている
- `Decision` / `Open Question` / `Conflict` 分類は対応するファイルに転記済
- 対象 QA の `Reflection Status` が `proposed`
- `validate-traceability.ts` の error が 0

## 関連コマンド

- 前段: `/import-external-input`
- 次段: `/plan-doc-reflection`、または `/review-external-conflicts`
