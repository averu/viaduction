---
id: REQ-NON-FUNCTIONAL
title: 非機能要件
status: draft
owners: []
updated: 2026-04-30
---

# 非機能要件 (NFR-XXX)

性能・可用性・セキュリティ・運用性などの非機能要件を集約する。
機能要件と異なり、これらは横断的にすべての設計層に影響する。

## NFR 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## NFR-XXX: 非機能要件タイトル
>
> ### Category
> 性能 / 可用性 / セキュリティ / プライバシー / 運用 / アクセシビリティ / その他
>
> ### Target Value
> 数値目標（例: P95 < 300ms、SLO 99.9%）。曖昧な表現は禁止。
>
> ### Measurement
> 計測方法 / 計測ダッシュボード / SLI 定義
>
> ### Rationale
> なぜこの値が必要か（ビジネス要請、法令、ユーザ体験）
>
> ### Related Items
> - REQ-XXX
> - 関連する設計上のキーワード（認証、ログ、暗号化など）
>
> ### Open Questions
> - (未解決があれば)
>
> ### Status
> approved
> ```

---

## NFR-001: パスワードはハッシュで保管する

### Category
セキュリティ

### Target Value
平文パスワードを保管しない。argon2id（memory >= 64MB、parallelism >= 2）を使用する。

### Measurement
- 静的解析: `password` 系フィールドが暗号化されずに DB へ書かれる箇所が無いことを CI で検査
- DB 監査: 本番 DB のスキーマで `password_hash` 等のハッシュ化済みカラムのみが存在する

### Rationale
- 仮にデータベースが漏洩しても、利用者のパスワードを直接利用されないようにするため。
- 業界標準（OWASP）に準拠する。

### Acceptance Criteria
- Given 利用者がパスワードを設定する API を呼ぶ
  When DB を確認する
  Then `password_hash` カラムに argon2id 形式のハッシュ値が保管され、平文パスワードはどのカラムにも存在しない
- Given CI で静的解析を実行する
  When ソースコード全体を走査する
  Then 平文パスワードを直接 DB に書き込む箇所が 0 件である

### Related Items
- REQ-001
- DB-001

### Open Questions
- (なし)

### Status
approved

## 参照

- 上流: `docs/01-requirement-refinement/04-requirement-classification.md`
- 下流: `docs/10-basic-design/06-non-functional.md`、各設計ドキュメント
