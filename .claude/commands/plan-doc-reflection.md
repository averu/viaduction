---
description: proposed 状態の QA / DEC / OQ / CONFLICT を、どのドキュメントへどう反映するかの Reflection Plan を起草する。書き込みはせず、ユーザ承認後に /reflect-external-input を別途呼ぶ。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[QA-XXX | DEC-XXX | --all-proposed]"
---

# /plan-doc-reflection

`document-reflection-planner` Subagent を呼んで、Reflection Plan を起草します。
**書き込みは行わない**。実反映は `/reflect-external-input` の責務。

## 動作

1. 前提チェック：
   - `02-qa-imports.md` に `Reflection Status: proposed` の QA、または `03-decisions.md` に `Status: proposed` の DEC があるか
   - 無ければ「先に `/analyze-external-qa` を実行してください」と案内して終了
2. `$ARGUMENTS` の解釈：
   - `QA-XXX` / `DEC-XXX` → 指定 ID のみ計画
   - `--all-proposed`（既定）→ 全 proposed を対象
3. `Agent(subagent_type=document-reflection-planner)` を呼ぶ。
4. Subagent が `docs/05-external-inputs/README.md` の Reflection Plan テンプレートに従って計画を起草。
5. 計画には **Risk** と **Requires Human Approval** チェックリストを含める。
6. 結果をユーザに提示し「この計画で `/reflect-external-input` を実行しますか？」と確認。

## 引数: $ARGUMENTS

`QA-XXX` / `DEC-XXX` / `--all-proposed` / 空 のいずれか。

## 完了条件

- Reflection Plan が `Source Inputs` / `Proposed Updates` / `Conflicts` / `Open Questions` / `Requires Human Approval` / `Verification` を含む
- 各 Update に Risk が付いている
- `OQ-XXX (open)` でブロックされている範囲は計画に含まれていない
- Subagent が **書き込みを行っていない**（読み取り専用で動作）

## 注意

- 計画提示の段階で **既存 `approved` REQ の上書き** が発生するなら、`Risk: high` 以上にし、`Requires Human Approval` の該当項目を埋める。
- フェーズ順序（要件 → 基本設計 → 詳細設計 → タスク）が守られているかを Subagent が確認する。

## 関連コマンド

- 前段: `/analyze-external-qa`、`/review-external-conflicts`
- 次段: ユーザ承認後 `/reflect-external-input`
