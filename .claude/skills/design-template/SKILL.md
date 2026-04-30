---
name: design-template
description: 基本設計・詳細設計ドキュメントの雛形を生成・整形するスキル。Front-matter、参照セクション、テーブル形式を強制する。
---

# design-template

## いつ使うか

- 新しい `SCR-XXX`, `API-XXX`, `DB-XXX` の詳細設計ファイルを作るとき
- 既存設計のフォーマットが崩れているのを直すとき
- 基本設計の章ごとの雛形を作るとき

## 提供する雛形

### Front-matter（全設計ファイル共通）

```yaml
---
id: <PREFIX>-<NNN>
title: <短い和名>
status: draft
owners: []
refs:
  upstream: []
  downstream: []
updated: <YYYY-MM-DD>
---
```

### 詳細設計：画面 (`docs/20-detail-design/screens/SCR-XXX.md`)

`docs/20-detail-design/screens/_TEMPLATE.md` をコピーして使う。

埋めるべきセクション：
- `## 目的` (1〜3 行で何のための画面か)
- `## アクター`
- `## 画面項目` (項目名 / 型 / 必須 / 初期値 / バリデーション / 参照)
- `## 操作フロー` (UC-XXX ごと)
- `## エラー・空状態`
- `## 参照` (REQ/UC/API)

### 詳細設計：API (`docs/20-detail-design/apis/API-XXX.md`)

`docs/20-detail-design/apis/_TEMPLATE.md` をコピーして使う。

埋めるべきセクション：
- `## 概要` (1 行)
- `## エンドポイント` (METHOD + path)
- `## 認可`
- `## リクエスト` (パラメータ表 + JSON 例)
- `## レスポンス` (ステータス別)
- `## エラーコード`
- `## 副作用` (どの DB-XXX を読み書きするか)
- `## 参照` (REQ/UC/SCR/DB)

### 詳細設計：DB (`docs/20-detail-design/db/DB-XXX.md`)

`docs/20-detail-design/db/_TEMPLATE.md` をコピーして使う。

埋めるべきセクション：
- `## 概要`
- `## カラム` (名前 / 型 / null / デフォルト / 説明)
- `## インデックス`
- `## 不変条件`
- `## 関連 API` (どの API-XXX が読み書きするか)
- `## 参照` (REQ/UC)

## ルール

- Front-matter の `id` とファイル名（拡張子除く）は一致させる。
- `status` は `draft` で開始。レビュー通過で `review`、人間承認で `approved`。
- `refs.upstream` が空のままドキュメントを保存しない（root の overview を除く）。
- 表中で `??` を使ってよいのは `draft` のときのみ。`review` 以降では未確定事項を残さない。

## 注意

- このスキルは **書き込みを伴う**。雛形のコピーは設計担当 Subagent (`basic-design-architect` または `detail-design-architect`) を経由する。
- 既存ファイルを上書きしない。新規 ID にのみ適用する。
- 雛形を変更したくなったら `docs/20-detail-design/{screens,apis,db}/_TEMPLATE.md` 自体を更新し、PR を出す。
