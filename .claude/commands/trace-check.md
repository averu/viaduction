---
description: traceability-auditor Subagent を呼び、validate-traceability.ts を実行して REQ/UC/SCR/API/DB/TASK/TEST の整合を確認する。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[--emit]"
---

# /trace-check

`traceability-auditor` Subagent を呼んで、`scripts/validate-traceability.ts` を実行し、結果を要約します。

## 動作

1. `$ARGUMENTS` の解釈:
   - 空 → 通常モード（`validate-traceability.ts` を実行）
   - `--emit` → `99-traceability.md` の再生成も実施。ただし **人間の承認後** に書き込む
2. `Agent(subagent_type=traceability-auditor)` を呼ぶ。
3. 結果サマリ（errors / warnings / カバレッジ表）を提示。

## 引数: $ARGUMENTS

`空` または `--emit` のみ受け付ける。

## 出力

- 終了コード (0/1/2)
- error 件数 / warning 件数
- 推奨アクション (どの担当エージェントを呼ぶべきか)
- (`--emit` 時) `docs/{10,20}-{basic,detail}-design/99-traceability.md` の差分要約

## エラー時の典型対処

| 症状 | 対処 |
| --- | --- |
| 未参照の `REQ-XXX` | `basic-design-architect` に再依頼 |
| 未参照の `SCR/API/DB` | `task-planner` に依頼 |
| 未定義 ID への参照 | 元のファイルを書いた担当に差し戻し |
| 重複定義 | 古い方を `[DELETED]` 化 |
| TASK→TEST カバレッジ不足 | `task-planner` に TEST 起票を依頼 |

## 関連コマンド

- 補完: `/design-review`（人間視点のレビュー）
