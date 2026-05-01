---
name: trace-check
description: traceability-auditor Subagent を呼び、validate-traceability.ts を実行して REQ/UC/SCR/API/DB/TASK/TEST と外部系 (SRC/QA/DEC/OQ/CONFLICT) の整合を確認する。--emit で 99-traceability.md / 99-traceability-seed.md を再生成。
argument-hint: "[--emit]"
---

# trace-check

ID 整合の機械検証 Skill。`scripts/validate-traceability.ts` を実行し、結果を要約する。

## いつ使うか

- 任意フェーズの設計ドキュメントを編集した直後
- 基本設計 → 詳細設計 → タスク分解 のフェーズ移行前
- 実装着手前（該当 TASK が参照する設計が approved になっているか確認）
- ユーザが「トレース確認して」「ID チェックして」と言ったとき

## 動作

1. `$ARGUMENTS` の解釈：
   - 空 → 通常モード（検証のみ）
   - `--emit` → `99-traceability.md` / `99-traceability-seed.md` 再生成（人間承認後に書き込み）
2. `Agent(subagent_type=traceability-auditor)` を呼ぶ。
3. Subagent が `Bash(npx tsx scripts/validate-traceability.ts)` を実行し、結果を要約。
4. error / warning ごとの内訳とカバレッジ表を提示。

## チェック項目

| ID 種別 | チェック内容 |
| --- | --- |
| `REQ-XXX` | 少なくとも 1 つの `UC-XXX` から参照されているか |
| `UC-XXX` | 少なくとも 1 つの `SCR-XXX` または `API-XXX` から参照されているか |
| `SCR-XXX` / `API-XXX` | 少なくとも 1 つの `TASK-XXX` から参照されているか |
| `DB-XXX` | 少なくとも 1 つの `API-XXX` から参照されているか |
| `TASK-XXX` | 少なくとも 1 つの `TEST-XXX` を持つ |
| `TASK→RC` 直接参照 | error |
| `REQ approved + AC 空` | error |
| `REQ approved + Open Questions 残` | error |

## 出力フォーマット

```markdown
## トレーサビリティ監査結果

- 終了コード: 0 / 1 / 2
- 定義 ID 数 / 参照箇所数
- ID 種別ごとの内訳

### Errors (重大)
- [REF_UNDEF] ...

### Warnings (要確認)
- [LEAF_NO_TASK] ...

### 推奨アクション
- 未参照の REQ → `basic-design` に再依頼
- 未参照の SCR/API/DB → `task-breakdown` に依頼
```

## 完了条件

- 終了コードが 0 (OK) または 2 (warn のみ)
- error がある場合、影響度の高い順に箇条書きで列挙され、対応する担当エージェントが提案されている

## エラー時の典型対処

| 症状 | 対処 |
| --- | --- |
| 未参照の `REQ-XXX` | `basic-design-architect` に再依頼 |
| 未参照の `SCR/API/DB` | `task-planner` に依頼 |
| 未定義 ID への参照 | 元のファイルを書いた担当に差し戻し |
| 重複定義 | 古い方を `[DELETED]` 化 |
| TASK→TEST カバレッジ不足 | `task-planner` に TEST 起票を依頼 |
| `TASK→RC` 直接参照 | RC ではなく approved 済みの REQ に置き換え |
| `REQ approved + AC 空` | AC を追加するか status を refined に戻す |

## 関連

- 補完: `design-review`（人間視点のレビュー）

## 注意

- 読み取り中心。`--emit` を使うときだけドキュメントを書き換える。
- 人間の承認なしに `--emit` の結果をコミットしない。
- ID の改名はこの Skill では行わない（手動 + git 履歴管理が必要）。
