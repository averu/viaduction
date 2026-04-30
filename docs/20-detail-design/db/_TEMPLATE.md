---
id: DB-XXX
title: <短い和名>
status: template
owners: []
refs:
  upstream: []
  downstream: []
updated: 2026-04-30
---

# DB-XXX — <短い和名>

> 新規エンティティを作るときはこのファイルをコピーし、`DB-XXX.md` にリネームして使うこと。

## 概要

このエンティティが表すビジネス概念を 1〜2 行で記述する。

## カラム

| カラム名 | 型 | null | デフォルト | PK/FK/UK | 説明 |
| --- | --- | --- | --- | --- | --- |
| id | uuid | no |  | PK | UUID v7 |
| email | text | no |  | UK |  |
| password_hash | text | no |  |  | argon2id ハッシュ |
| created_at | timestamptz | no | now() |  |  |
| updated_at | timestamptz | no | now() |  |  |
| deleted_at | timestamptz | yes |  |  | 論理削除 |

## インデックス

| 名前 | カラム | 種別 | 用途 |
| --- | --- | --- | --- |
| pk_<table> | (id) | primary |  |
| ux_<table>_email | (email) WHERE deleted_at IS NULL | unique |  |

## 不変条件

ビジネスルールとしてコードまたは DB で強制する条件。

- email は小文字に正規化された後に比較する。
- 削除済 (`deleted_at IS NOT NULL`) のレコードに対する更新は禁止する。

## 関連 API

| API | 操作 | 備考 |
| --- | --- | --- |
| API-XXX | read |  |
| API-XXX | write |  |

## マイグレーション

- 追加: 後方互換のため null 許容で追加 → バックフィル → not null 化、の手順を取る。
- 削除: まず参照解除 → カラム削除。トランザクションログの保持期間内に完了させる。

## 参照

- 上流: REQ-XXX, UC-XXX, データモデル (`docs/10-basic-design/05-data-model.md`)
- 下流: TASK-XXX (マイグレーション、Repository 層)
