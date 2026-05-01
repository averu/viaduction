---
description: 要件素材から不足情報・曖昧さを抽出し、関係者への質問として open-questions / ambiguity-review に追記する。requirement-interviewer Subagent が動く。
allowed-tools: Read, Glob, Grep, Agent
argument-hint: "[discovery | refinement]"
---

# /interview-requirements

`requirement-interviewer` Subagent を呼んで、要件素材の **抜け** や **曖昧** を質問形式で記録します。

## 動作

1. `$ARGUMENTS` の解釈：
   - 空または `discovery` → `docs/00-discovery/*.md` を対象に `07-open-questions.md` へ追記
   - `refinement` → `docs/01-requirement-refinement/*.md` を対象に `02-ambiguity-review.md` へ追記
2. `Agent(subagent_type=requirement-interviewer)` を呼ぶ。
3. Subagent が抽出した質問の件数・重要度別の内訳を提示。
4. 「これらの質問に回答してから `/refine-requirements` を実行してください」と促す。

## 引数: $ARGUMENTS

`空` / `discovery` / `refinement` のいずれか。

## 完了条件

- 対象ファイルに新しい `Q-XXX` 行が 1 件以上追加されている
- 既存の `Q-XXX` を書き換えていない

## 関連コマンド

- 前段: `/discover-requirements`
- 次段: `/refine-requirements`
- 補完: `/review-requirements` (より厳密なレビュー)
