---
id: API-XXX
title: <短い和名>
status: template
owners: []
refs:
  upstream: []
  downstream: []
updated: 2026-04-30
---

# API-XXX — <短い和名>

> 新規 API を作るときはこのファイルをコピーし、`API-XXX.md` にリネームして使うこと。

## 概要

この API が提供する機能を 1 行で記述する。

## エンドポイント

```
<METHOD> <PATH>
```

例: `POST /v1/auth/login`

## 認可

- レベル: `public` / `authenticated` / `admin`
- スコープ: (例: `users:read`)
- レート制限:

## リクエスト

### パスパラメータ

| 名前 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
|  |  |  |  |

### クエリパラメータ

| 名前 | 型 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### ヘッダ

| 名前 | 必須 | 説明 |
| --- | --- | --- |
| Authorization | (認可レベルに依存) | Bearer トークン |

### ボディ

```json
{
  "email": "user@example.com",
  "password": "********"
}
```

#### スキーマ

| フィールド | 型 | 必須 | 制約 |
| --- | --- | --- | --- |
| email | string | yes | RFC5322 互換、最大 254 文字 |
| password | string | yes | 8 文字以上 |

## レスポンス

### 200 OK

```json
{
  "user": { "id": "...", "email": "user@example.com" },
  "token": "..."
}
```

#### スキーマ

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| user.id | string (uuid) | yes |  |
| user.email | string | yes |  |
| token | string | yes | セッショントークン |

### 4xx / 5xx

| ステータス | アプリコード | 状況 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 入力検証失敗 |
| 401 | UNAUTHENTICATED | 認証情報が不正 |
| 429 | RATE_LIMITED | レート超過 |
| 500 | INTERNAL_ERROR | サーバ内部エラー |

## 副作用 / DB アクセス

| DB | 操作 | 備考 |
| --- | --- | --- |
| DB-001 (users) | read | email でルックアップ |
| DB-002 (sessions) | write | 新規セッション作成 |

## 参照

- 上流: REQ-XXX, UC-XXX, API リスト (`docs/10-basic-design/04-api-list.md`)
- 下流: TASK-XXX, DB-XXX
