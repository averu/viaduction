---
id: REQ-FUNCTIONAL
title: 機能要件
status: draft
owners: []
updated: 2026-04-30
---

# 機能要件 (REQ-XXX)

承認済みの機能要件をここに集約する。各 REQ は `## REQ-NNN: タイトル` 見出しで定義し、以下の必須セクションを持つ。

> **承認ルール**:
> - `### Status` を `approved` にできるのは **人間のみ**。
> - `### Acceptance Criteria` が空のまま `approved` にしてはならない（バリデーションで error）。
> - `### Open Questions` が残ったまま `approved` にしてはならない（バリデーションで error）。

## REQ 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## REQ-XXX: 要件タイトル
>
> ### Summary
> 正式な要件の概要。
>
> ### Background
> この要件が必要な背景。
>
> ### Actor
> - 利用者・ロール
>
> ### Scope
> In:
> - スコープ内
>
> Out:
> - スコープ外
>
> ### Business Rules
> - 業務ルール
> - 制約
> - 例外条件
>
> ### Acceptance Criteria
> - Given 前提条件
>   When 操作・イベント
>   Then 期待結果
>
> ### Related Items
> - RC-XXX
> - UC-XXX
> - SCR-XXX
> - API-XXX
> - DB-XXX
> - TEST-XXX
>
> ### Open Questions
> - (未解決があれば。空なら approved 可)
>
> ### Status
> approved
> ```

---

## REQ-001: 登録済アカウントでログインできる

### Summary
利用者がメールアドレスとパスワードを入力してログインし、セッショントークンを取得できる。

### Background
利用者がプロダクトを利用する前提として認証が必要。本要件は「ログイン」というユースケースに対応し、最初のリリースの中核となる。

### Actor
- 一般ユーザ

### Scope
In:
- ログイン画面でメール + パスワードを入力して認証する
- 成功時はセッショントークンを発行し、ダッシュボード等の認証後画面へ遷移可能にする

Out:
- パスワードリセット
- 多要素認証
- ソーシャルログイン

### Business Rules
- パスワードは平文で保管しない（NFR-001 を参照）
- 連続して認証に失敗した場合のロック方針は別途 `business-rules.md` に規定する

### Acceptance Criteria
- Given 登録済のメールアドレスと正しいパスワード
  When ログインを実行する
  Then HTTP 200 でセッショントークンが返り、認証後画面に遷移できる
- Given 登録済のメールアドレスと誤ったパスワード
  When ログインを実行する
  Then HTTP 401 を返し、画面上にエラーメッセージを表示する

### Related Items
- RC-001
- UC-001
- SCR-001
- API-001
- DB-001
- DB-002

### Open Questions
- (なし)

### Status
approved

## 参照

- 上流: `docs/01-requirement-refinement/requirement-candidates.md` の RC-XXX
- 下流: `docs/10-basic-design/01-system-overview.md` の UC-XXX
