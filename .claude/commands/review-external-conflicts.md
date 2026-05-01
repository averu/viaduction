---
description: 外部 Q&A と既存 REQ / 設計の矛盾を検出し、CONFLICT-XXX として記録する。読み取り専用で書き換えは行わない。
allowed-tools: Read, Glob, Grep, Agent
argument-hint: "[QA-XXX | --all-proposed | --status open]"
---

# /review-external-conflicts

`external-conflict-reviewer` Subagent を呼んで、外部 Q&A と既存ドキュメントの **矛盾を検出** します。
**書き換えは行わず、CONFLICT-XXX 起票案を提示**するだけです。実起票は `external-input-analyst` の責務。

## 動作

1. `$ARGUMENTS` の解釈：
   - `QA-XXX` → 指定 QA を対象に矛盾レビュー
   - `--all-proposed`（既定）→ `Reflection Status: proposed` の全 QA を対象
   - `--status open` → 既存 `05-conflicts.md` の `Status: open` を再評価
2. `Agent(subagent_type=external-conflict-reviewer)` を呼ぶ。
3. Subagent が両論を引用して `CONFLICT-XXX` 起票案を提示。
4. 必要に応じて `OQ-XXX` 起票も提案（採用判断のため）。
5. 結果は `BLOCKER` / `MAJOR` / `MINOR` の指摘と、起票案テーブルで返ってくる。

## 引数: $ARGUMENTS

`QA-XXX` / `--all-proposed` / `--status open` / 空。

## 完了条件

- 対象 QA すべてに対して矛盾の有無が判定されている
- 矛盾検出箇所は **両方の引用** が示されている
- 起票案には **複数案 (A/B/C)** が併記されている
- 既存 CONFLICT との重複が指摘されている
- Subagent が **書き込みを行っていない**

## 関連コマンド

- 前段: `/analyze-external-qa`
- 次段: 起票が必要なら `/import-external-input` 同等の流れで `external-input-analyst` が `05-conflicts.md` に追記。その後 `/plan-doc-reflection`
