---
name: task-breakdown
description: 詳細設計を入力に、TASK-XXX へ分解して docs/30-implementation-plan/01-task-breakdown.md を更新する。1〜4 時間で完了する粒度を目安にする。Phase 5 の入口。
argument-hint: "[ID (例: SCR-001)]"
---

# task-breakdown

Phase 5（実装計画）の入口 Skill。詳細設計から `TASK-XXX` を起票する。

## いつ使うか

- 詳細設計（`docs/20-detail-design/`）の `status: approved` が揃ったとき
- 既存タスクの粒度が大きすぎることが判明したとき（追加分解）
- ユーザが「タスクに分解して」「TASK を起こして」と言ったとき

## 動作

1. 前提チェック：
   - `docs/20-detail-design/` 配下に少なくとも 1 ファイルあり、`status: approved` のものが存在するか
   - approved が 0 件なら警告して継続するか確認
2. `$ARGUMENTS` の解釈：
   - 空 → すべての詳細設計を対象に未着手タスクを起票
   - `SCR-001` 等 → その設計に紐づくタスクのみ起票
3. `Agent(subagent_type=task-planner)` を呼ぶ。
4. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
5. 「マイルストーンに振り分けますか？ `design-review tasks` を実行しますか？」と確認。

## 入力

- `docs/20-detail-design/screens/*.md`
- `docs/20-detail-design/apis/*.md`
- `docs/20-detail-design/db/*.md`
- `docs/10-basic-design/02-architecture.md`（技術選定の確認）

## 出力

`docs/30-implementation-plan/01-task-breakdown.md` の表とサブセクションに追記。

## TASK の粒度ガイド

| 種別 | 1 タスクの目安 |
| --- | --- |
| DB マイグレーション | 1 テーブル分のスキーマ + 初期インデックス |
| API 実装 | 1 エンドポイント分のハンドラ + 単体テスト |
| 画面実装 | 1 画面分の主要パス。サブ状態が多ければ画面内でも分割 |
| 横断（認可・ロギングなど） | 共通機構を 1 タスクに集約 |
| 結合テスト | 1 ユースケース分の E2E テスト |

完了に **4 時間以上** かかると見積もるなら分割。「DB + API + 画面」を 1 タスクにまとめない。

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
- 注意: id は uuid v7 を使う
```

## 順序付け

1. **DB スキーマ → API → 画面 → 結合** が原則
2. 横断機構（認証、エラーハンドラ）は最初の API より前に置く
3. 並列に進められる TASK は依存欄を空にする

## 完了条件

- すべての SCR/API/DB が少なくとも 1 つの TASK から参照されている
- 各 TASK が `参照 / 完了条件 / 出力 / 依存 / TEST / 見積 / 状態` を持つ
- `validate-traceability.ts` の `(SCR/API)→TASK` カバレッジが 100%

## 関連

- 前段: `detail-design`
- 次段: `implement TASK-XXX`
- レビュー: `trace-check`

## やってはいけないこと

- 設計に無い項目を TASK に入れる
- 1 TASK に 2 つ以上の `SCR-XXX` を入れる（例外: 共通コンポーネントのみ）
- TEST を持たない TASK を量産する。`untestable: true` の理由は明示する
- `01-task-breakdown.md` の **既存行を勝手に並べ替える**（ID は固定参照されているため）
