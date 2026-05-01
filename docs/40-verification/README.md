# 40-verification — 検証フェーズ (Phase 7)

各 `REQ-XXX` の `### Acceptance Criteria` がすべて満たされたことを示す **証跡** を集約する。
実装 (`/implement TASK-XXX`) が完了し、テストが緑になった後にここで「要件としての完了」を宣言する。

## 構成

| ファイル | 内容 |
| --- | --- |
| `01-verification-plan.md` | 検証計画。どの要件をどんな手段（自動テスト・手動テスト・本番監視）で検証するか |
| `02-verification-results.md` | 検証結果。要件単位の合否と、リンクされた `TEST-XXX` の実行ログ |
| `03-acceptance-sign-off.md` | 人間による最終承認の記録 |

## 進め方

1. `/implement TASK-XXX` で実装が完了し、`TEST-XXX` が緑になった TASK を集計。
2. その TASK が紐づく `REQ-XXX` の `Acceptance Criteria` を 1 つずつ照合。
3. すべて満たした `REQ-XXX` の `### Status` を `verified` に上げる候補とする（最終承認は人間）。
4. `03-acceptance-sign-off.md` にサインを記録。

## 重要ルール

- `verified` を Claude が独断で押さない。`approved → implemented → verified` の遷移はすべて人間の承認を経る。
- 検証で不合格になった要件は `### Status` を `approved` に戻し、新たな TASK を起票する。
