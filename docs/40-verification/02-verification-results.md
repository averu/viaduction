---
id: VERIFY-RESULTS
title: 検証結果
status: draft
owners: []
updated: 2026-04-30
---

# 検証結果

`01-verification-plan.md` の計画に対する実績を記録する。
各行は **特定時点のスナップショット** であり、後から書き換えない（不合格を再試験するときは新しい行を追加する）。

## 結果一覧

| REQ | 試験日 | 試験種別 | 担当 TEST | 結果 | エビデンス | コメント |
| --- | --- | --- | --- | --- | --- | --- |
<!-- ここに検証結果を順次追記します。書式参考は下のコードブロック。 -->

## サンプル（書式の参考）

```markdown
| REQ-001 | 2026-05-20 | 自動 (単体) | TEST-001, TEST-002 | pass | tests/auth/login.test.ts | — |
```

### 結果の凡例

| 結果 | 意味 |
| --- | --- |
| `pending` | 未実施 |
| `pass` | 合格 |
| `fail` | 不合格（理由をコメントに） |
| `skipped` | 環境制約等でスキップ（理由必須） |

## 集計

<!-- TRACE:VERIFY:SUMMARY:START -->
| 集計 | 値 |
| --- | --- |
| (未生成) |  |
<!-- TRACE:VERIFY:SUMMARY:END -->

> 集計部分は将来的に `validate-traceability.ts --emit` で自動生成する余地があるが、現時点では手動更新。

## 参照

- 上流: `01-verification-plan.md`
- 下流: `03-acceptance-sign-off.md`
