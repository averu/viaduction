---
id: RC-CANDIDATES
title: 要件候補
status: draft
owners: []
updated: 2026-04-30
---

# 要件候補 (RC-XXX)

`docs/00-discovery/` の素材から起票された **要件候補**。
ここはあくまで **候補** であり、実装対象になるためには `docs/02-requirements/02-functional-requirements.md` 等の `REQ-XXX (approved)` まで昇格する必要がある。

> **検証ルール（`validate-traceability.ts`）**:
> - `TASK` が `RC-XXX` を直接参照すると **error**
> - `RC-XXX` のステータスは `candidate / needs-clarification / refined / rejected / deferred` のいずれか
> - 上記以外の値は警告

## RC 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## RC-XXX: 要件候補タイトル
>
> ### Source
> - IDEA-XXX
> - PROB-XXX
>
> ### Actor
> - 利用者・関係者
>
> ### Intent
> 利用者が達成したいこと（モチベーション）。
>
> ### Candidate Requirement
> 候補段階の要件。技術詳細には踏み込まない。
>
> ### Acceptance Criteria Draft
> - 受け入れ条件の下書き（Given/When/Then か箇条書き）
>
> ### Ambiguities
> - 曖昧な点
> - 未確認事項（質問は `docs/00-discovery/07-open-questions.md` に転記する）
>
> ### Scope
> In:
> - スコープ内（含めるべき）
>
> Out:
> - スコープ外（あえて外す）
>
> ### Priority
> Must / Should / Could / Won't
>
> ### Status
> candidate
> ```

---

## RC-001: 登録済アカウントでログインできる

### Source
- IDEA-001
- PROB-001

### Actor
- 一般ユーザ

### Intent
利用者が自分のアカウントを使ってサービスにアクセスし、認証後の機能を利用できるようになりたい。

### Candidate Requirement
メールアドレスとパスワードによる認証を提供し、認証成功時にセッショントークンを発行する。

### Acceptance Criteria Draft
- 正しい資格情報で 200 とトークンが返る
- 誤った資格情報で 401 が返る
- 連続失敗時のロック方針は別途確認 (`Ambiguities` 参照)

### Ambiguities
- 連続失敗時のロック回数・ロック期間が未定義 → `docs/00-discovery/07-open-questions.md` Q-001 で確認中
- 多要素認証は今回入れるか未確認 → 同 Q-002

### Scope
In:
- メール + パスワードでのログイン

Out:
- パスワードリセット
- 多要素認証
- ソーシャルログイン

### Priority
Must

### Status
refined

---

> 上記は **書式の参考としてのサンプル**。Source の IDEA / PROB は `docs/00-discovery/{idea-notes,problem-statement}.md` に対応する `IDEA-XXX` / `PROB-XXX` を置いてある。実プロジェクト開始時はサンプル一式を削除して、実際の要件に置き換えてください。

## 参照

- 上流: `docs/00-discovery/01-idea-notes.md` / `02-problem-statement.md`
- 下流: `docs/02-requirements/02-functional-requirements.md` の `REQ-XXX`
