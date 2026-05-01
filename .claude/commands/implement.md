---
description: TASK-XXX を 1 つ受け取り、implementer Subagent に実装させる。TASK-ID 必須。指定が無ければ何もせず終了する。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "TASK-XXX"
---

# /implement

`implementer` Subagent を呼んで、指定された 1 つの `TASK-XXX` を実装します。

## 動作

1. `$ARGUMENTS` を解釈:
   - 正規表現 `^TASK-\d{3,}$` に一致する **ちょうど 1 つ** を受け付ける。
   - 一致しない、または複数あれば次のメッセージを返して終了：
     > `/implement TASK-XXX` の形式で **1 つだけ** TASK-ID を指定してください。複数の TASK を一度に実装することはできません。
2. `Bash(grep -n "$ARGUMENTS" docs/30-implementation-plan/01-task-breakdown.md)` で TASK の存在を確認。
3. `Agent(subagent_type=implementer)` に `TASK-XXX` を渡して実装を依頼。
4. Subagent からの「変更ファイル」「完了条件チェック結果」をそのまま提示。
5. コミット案 (`git add` / `git commit`) は **提示するだけ**、実行は人間の確認を得る（`settings.json` で ask）。

## 引数: $ARGUMENTS

必須。`TASK-XXX` 1 件のみ。

## 完了条件

- Subagent が「実装を開始できません」を返さなかった
- 完了条件すべてに `[x]` が付いた
- `npm run typecheck` `npm run test -- TEST-XXX` 等が緑

## 失敗時のふるまい

- 起動条件に失敗 → `/task-breakdown` を回すよう案内
- テストが赤 → 修正案を提示するが、別 TASK が原因の場合はその ID を指摘して停止
- 設計差し戻しが必要 → 該当設計ファイルと差し戻し理由を提示し、コードを書かない

## 関連コマンド

- 前フェーズ: `/task-breakdown`
- 検証: `/trace-check`
- レビュー: `/design-review`（実装前に対象 TASK の参照設計を再点検）
