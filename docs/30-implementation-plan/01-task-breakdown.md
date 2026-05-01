---
id: PLAN-TASKS
title: 実装タスク一覧
status: draft
owners: []
updated: 2026-04-30
---

# 実装タスク一覧

詳細設計を入力に、実装可能な粒度の `TASK-XXX` を起こす。1 タスク 1〜4 時間が目安。
詳細は `.claude/skills/task-breakdown/SKILL.md` および `.claude/rules/20-design-process.md` を参照。

## 状態の凡例

| 状態 | 意味 |
| --- | --- |
| `ready` | 着手可能 |
| `in-progress` | 着手中 |
| `blocked` | 依存タスクの完了待ち / 設計差し戻し待ち |
| `done` | 完了 + テスト緑 |
| `deprecated` | 廃止（残しておくが着手しない） |

## タスク表

| ID | タイトル | 参照 | 出力 | 依存 | TEST | 見積 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
<!-- ここに `/task-breakdown` で生成した行を追加してください。下のサンプルは書式の参考です。 -->

## サンプル（書式の参考。実プロジェクトでは削除して実タスクと差し替える）

> 下のコードブロック内は `validate-traceability.ts` の対象外。書式の参考としてのみ参照してください。

```markdown
| TASK-001 | users テーブル作成 | DB-001 / REQ-001 | migrations/0001_users.sql | (なし) | TEST-001 | 1h | ready |
| TASK-002 | パスワードハッシュユーティリティ | API-001 / NFR-001 | src/lib/password.ts | TASK-001 | TEST-002 | 1h | ready |
| TASK-003 | ログイン API ハンドラ | API-001 / DB-001 / DB-002 / UC-002 | src/api/auth/login.ts | TASK-001, TASK-002 | TEST-003, TEST-004 | 3h | blocked |

### TASK-001 — users テーブル作成
- 参照: DB-001 / REQ-001
- 完了条件:
  - [ ] migrations/0001_users.sql がリポジトリに追加されている
  - [ ] ローカル DB でマイグレーションが成功する
  - [ ] npm run typecheck が緑
  - [ ] TEST-001 が緑
- 出力ファイル: migrations/0001_users.sql, tests/db/users.test.ts
- 影響範囲: 新規

### TEST-001 — users テーブルマイグレーション
- 対象: TASK-001
- 種別: 単体 (DB スキーマ)
- 観点: id が UUID v7、email が UK で小文字正規化済み
```

## タスク詳細

> このセクションには各 `TASK-XXX` ごとに次のサブセクションを 1 つずつ書く：
>
> - `### TASK-XXX — <タイトル>`
> - 参照 / 完了条件 / 出力ファイル / 影響範囲 / 注意
>
> 加えて、紐づく `### TEST-XXX —` を同じファイル内に定義する（テスト ID の所在をここに集約する）。
> 書式は上の「サンプル」を参照。

## TEST 一覧

> このセクションには各 `TEST-XXX` の定義を置く。各 TEST は `対象: TASK-XXX` を明示すること。
> サンプルは「サンプル」セクションのコードブロックを参照。

## マイルストーン振り分け

`docs/30-implementation-plan/02-milestones.md` を参照。各 TASK は 1 つ以上のマイルストーンに紐づく。
