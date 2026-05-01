---
description: ambiguity / scope / business-rule / non-functional / acceptance-criteria の 5 種類のレビュア Subagent を並列に呼び、要件レビューを集約する。読み取り専用。
allowed-tools: Read, Glob, Grep, Agent
argument-hint: "[ambiguity | scope | business-rule | nfr | ac | all]"
---

# /review-requirements

要件 (`RC-XXX` または `REQ-XXX`) のレビューを実施します。
**書き換えは行わず、指摘のみを返します。**

## 動作

1. `$ARGUMENTS` の解釈：
   - `all` または空 → 5 種類のレビュアを **並列** に呼ぶ
   - `ambiguity` → `ambiguity-reviewer`
   - `scope` → `scope-reviewer`
   - `business-rule` → `business-rule-reviewer`
   - `nfr` → `non-functional-requirement-reviewer`
   - `ac` → `acceptance-criteria-reviewer`
2. 各レビュアの指摘を `BLOCKER` / `MAJOR` / `MINOR` で集約。
3. 集約結果は `docs/01-requirement-refinement/06-requirement-review.md` に追記する候補として提示（書き込みは人間の指示が来てから）。
4. 総括行で「BLOCKER N 件 — refined / approved に進んでよい / 進まない」を明示。

## 引数: $ARGUMENTS

`all` / `空` / `ambiguity` / `scope` / `business-rule` / `nfr` / `ac` のいずれか。

## 並列実行のヒント

`all` のときは **1 つのアシスタントメッセージで 5 つの Agent ツールを同時** に呼ぶ。各レビュアの結果を順に集約して 1 つの指摘リストにまとめる。

## 完了条件

- 各レビュアから指摘リストが返却されている（指摘 0 件でもよい）
- 総括行が「進める / 進めない」を明示している
- ファイルは書き換わっていない（このコマンドは読み取り専用）

## 関連コマンド

- 前段: `/refine-requirements` `/specify-requirements`
- 補完: `/trace-check` (機械的な ID 整合検証)
