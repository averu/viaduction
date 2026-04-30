---
description: design-reviewer Subagent を呼び、設計ドキュメントの読み取り専用レビューを得る。指摘リストを返すだけで書き換えは行わない。
allowed-tools: Read, Glob, Grep, Agent
argument-hint: "[basic | detail | tasks | パス]"
---

# /design-review

`design-reviewer` Subagent を呼んで、設計ドキュメントのレビューを実施します。**書き換えは行わず、指摘のみを返します。**

## 動作

1. `$ARGUMENTS` の解釈:
   - `basic` → `docs/10-basic-design/*.md` を対象
   - `detail` → `docs/20-detail-design/**/*.md` を対象
   - `tasks` → `docs/30-implementation-plan/task-breakdown.md` を対象
   - パス（例: `docs/20-detail-design/screens/SCR-001.md`） → 該当ファイルのみ
   - 空 → 直近で更新された設計ファイル（`Glob` で最新数個）を対象
2. `Agent(subagent_type=design-reviewer)` を呼ぶ。
3. 結果は `.claude/rules/40-review-policy.md` の指摘フォーマットで返ってくる。総括行を強調して提示。

## 引数: $ARGUMENTS

`basic` / `detail` / `tasks` / 既存ファイルパス / 空文字 のいずれか。

## 出力

- BLOCKER 件数
- MAJOR 件数
- MINOR 件数
- 「次フェーズに進める / 進めない」の判定

`BLOCKER` が 1 件でもあれば、後続コマンド (`/detail-design`, `/task-breakdown`, `/implement`) を実行しないように促す。

## 関連コマンド

- 補完: `/trace-check`（機械的な ID 検証）
- 前段: `/basic-design` `/detail-design` `/task-breakdown`
