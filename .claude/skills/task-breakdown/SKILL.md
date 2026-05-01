---
name: task-breakdown
description: 詳細設計を入力に、実装可能な粒度の TASK-XXX に分解する手順をまとめたスキル。1〜4 時間で完了する粒度を目安にする。
---

# task-breakdown

## いつ使うか

- 詳細設計（`docs/20-detail-design/`）の `status: approved` が揃ったとき
- 既存タスクの粒度が大きすぎることが判明したとき（追加分解）

## 入力

- `docs/20-detail-design/screens/*.md`
- `docs/20-detail-design/apis/*.md`
- `docs/20-detail-design/db/*.md`
- `docs/10-basic-design/02-architecture.md`（技術選定の確認）

## 出力

`docs/30-implementation-plan/01-task-breakdown.md` の表に行を追加する。

## TASK の粒度ガイド

| 種別 | 1 タスクの目安 |
| --- | --- |
| DB マイグレーション | 1 テーブル分のスキーマ + 初期インデックス |
| API 実装 | 1 エンドポイント分のハンドラ + 単体テスト |
| 画面実装 | 1 画面分の主要パス。サブ状態が多ければ画面内でも分割 |
| 横断（認可・ロギングなど） | 共通機構を 1 タスクに集約 |
| 結合テスト | 1 ユースケース分の E2E テスト |

完了に **4 時間以上** かかると見積もるなら分割する。「DB + API + 画面」を 1 タスクにまとめない。

## 各 TASK に書く項目

```markdown
| ID | タイトル | 参照 | 出力 | 依存 | TEST | 見積 | 状態 |
|----|----------|------|------|------|------|------|------|
| TASK-001 | users テーブル作成 | DB-001 / REQ-001 | migrations/0001_users.sql | (なし) | TEST-001 | 1h | ready |
```

そのうえで、表の下に各 TASK ごとに以下のサブセクションを書く：

```markdown
### TASK-001 — users テーブル作成
- 参照: DB-001 / REQ-001
- 完了条件:
  - `migrations/0001_users.sql` が追加され、ローカルでマイグレーションが成功する
  - `npm run typecheck` と `npm run test -- TEST-001` が緑
- 出力ファイル: `migrations/0001_users.sql`
- 影響範囲: なし（新規）
- 注意: id は uuid v7 を使う（DB-001 の不変条件参照）
```

## 順序付け

1. **DB スキーマ → API → 画面 → 結合** が原則。
2. 横断機構（認証、エラーハンドラ）は最初の API より前に置く。
3. 並列に進められる TASK は依存欄を空にする。

## やってはいけないこと

- 設計に無い項目を TASK に入れる
- 1 TASK に 2 つ以上の `SCR-XXX` を入れる（例外: 共通コンポーネントのみ）
- TEST を持たない TASK を量産する。`untestable: true` の理由は明示する
- `01-task-breakdown.md` の **既存行を勝手に並べ替える** （ID は固定参照されているため）

## 注意

- このスキルは `task-planner` Subagent から呼ばれる。手動編集も可だが、その後 `/trace-check` を必ず回す。
- 大規模な再分解は 1 PR にまとめず、分割理由を README に書いてから人間レビューに出す。
