---
description: 詳細設計を入力に、TASK-XXX へ分解して docs/30-implementation-plan/task-breakdown.md を更新する。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[ID (例: SCR-001 を起点にしたタスクのみ)]"
---

# /task-breakdown

`task-planner` Subagent を呼んで、詳細設計から `TASK-XXX` を起こし、`docs/30-implementation-plan/task-breakdown.md` を更新します。

## 動作

1. 前提チェック:
   - `docs/20-detail-design/` 配下に少なくとも 1 ファイルあり、`status: approved` のものが存在するか
   - approved が 0 件なら警告して継続するか確認（draft / review でも分解は可能だが、変更で再分解になる旨を伝える）
2. `$ARGUMENTS` の解釈:
   - 空 → すべての詳細設計を対象に未着手タスクを起票
   - `SCR-001` 等 → その設計に紐づくタスクのみ起票
3. `Agent(subagent_type=task-planner)` を呼ぶ。
4. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
5. 「マイルストーンに振り分けますか？ `/design-review` を実行しますか？」と確認。

## 引数: $ARGUMENTS

`$ARGUMENTS` が ID 形式に一致するか、または空文字かのみを受け付ける。それ以外は拒否。

## 完了条件

- すべての SCR/API/DB が少なくとも 1 つの TASK から参照されている
- 各 TASK が `参照 / 完了条件 / 出力 / 依存 / TEST / 見積 / 状態` を持つ
- `validate-traceability.ts` で `(SCR/API)→TASK` カバレッジが 100%

## 関連コマンド

- 前フェーズ: `/detail-design`
- 次フェーズ: `/implement TASK-XXX`
- レビュー: `/trace-check`
