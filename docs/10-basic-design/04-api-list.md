---
id: BD-APIS
title: API 一覧
status: draft
owners: []
refs:
  upstream: []
  downstream: []
updated: 2026-04-30
---

# API 一覧

## API 一覧 (API-XXX)

| ID | メソッド | パス | 概要 | 認可 | 関連 UC | 想定 DB |
| --- | --- | --- | --- | --- | --- | --- |
| API-001 | POST | /v1/auth/login | ログインしてセッショントークンを発行 | public | UC-001 | DB-001 (read), DB-002 (write) |

## 共通方針

### 認可

- 全 API は次のいずれかの認可レベルを持つ:
  - `public`: 認証不要
  - `authenticated`: ログイン必須
  - `admin`: 管理者権限必須
- 認証は Bearer トークン（または Cookie セッション。基本設計で確定）。

### バリデーション

- リクエストボディは JSON Schema で検証。
- 検証失敗時は `400 Bad Request` + アプリケーションコード `VALIDATION_ERROR`。

### エラー方針

| HTTP | アプリコード | 用途 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 入力検証エラー |
| 401 | `UNAUTHENTICATED` | 認証必須なのに未認証 |
| 403 | `FORBIDDEN` | 認証済だが権限不足 |
| 404 | `NOT_FOUND` | リソースが存在しない |
| 409 | `CONFLICT` | 競合（重複登録など） |
| 422 | `BUSINESS_RULE_VIOLATION` | ビジネスルール違反 |
| 500 | `INTERNAL_ERROR` | サーバ内部エラー |

レスポンスボディ：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "human-readable message",
    "details": []
  }
}
```

### レート制限

- 既定:
- 例外:

### バージョニング

- パスベース: `/v1/...`
- 破壊的変更時は新バージョン `/v2/...` を併存させる

## 参照

- 上流: UC-XXX
- 下流: `docs/20-detail-design/apis/API-XXX.md`
