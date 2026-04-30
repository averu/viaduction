# 詳細設計 (Phase 2)

基本設計で採番された `SCR-XXX` / `API-XXX` / `DB-XXX` を、**1 ID 1 ファイル** に展開する。

## 構成

| ディレクトリ | 内容 |
| --- | --- |
| `screens/` | 画面の詳細設計 |
| `apis/` | API の詳細設計 |
| `db/` | エンティティ / テーブルの詳細設計 |

各サブディレクトリに `_TEMPLATE.md` がある。新規 ID を作るときはこれをコピーして使う。

## 進め方

1. `/detail-design` で雛形を埋める（または ID を指定して個別作成）。
2. `/design-review` で BLOCKER が無いことを確認。
3. `/trace-check` でトレーサビリティを検証。
4. 人間承認で `status: approved` に上げる。
5. `/task-breakdown` でタスクへ分解する。

## ファイル名

- `SCR-001.md`、`API-001.md`、`DB-001.md` のように **ID と完全一致**。
- `_TEMPLATE.md` はテンプレートとして残し、Front-matter の `status` は `template`。
