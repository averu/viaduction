---
id: REQ-FUNCTIONAL
title: 機能要件
status: draft
owners: []
updated: 2026-05-04
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
- 連続して認証に失敗した場合のロック方針は別途 `04-business-rules.md` に規定する

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

> 注記: REQ-001 は本ハーネス導入時のサンプル要件。本プロジェクト（まちの提案・申請レビューアプリ）の機能要件は REQ-002 以降に定義する。AMB-001 で人間判断待ち（`docs/01-requirement-refinement/02-ambiguity-review.md`）。

---

## REQ-002: 投稿の作成と提出（draft / submitted）

### Summary
ログインユーザは提案を `draft` として作成・編集でき、必須項目と倫理ガード・PolicyAgreement 同意を満たした上で `submitted` として提出できる。

### Background
PROB-001（公開前レビュー無しに投稿が公開されてしまうリスク）および PROB-002（投稿時の個人情報・センシティブ情報の混入）に対応するため、提出前のドラフト保存と倫理ガード必須化、提出時の状態遷移と AuditLog 記録を要件化する。

### Actor
- 一般ユーザ（`user` ロール、投稿者本人）

### Functional Requirements
- ログインユーザは提案を `draft` として作成・編集できる。draft の編集は投稿者本人のみ可能。
- 提出時には必須項目（タイトル / 本文）、倫理ガードチェックボックス 3 種すべての true、公開範囲（`private` / `internal` / `public`）の選択、PolicyAgreement への同意が必要。
- 提出 server function は server-side で上記をすべて検証し、UI ボタンの無効化に依存しない。
- 提出成功時に proposal の `status` は `draft` → `submitted` に遷移し、AuditLog（REQ-011）に `actor / role=user / action=submit / target=proposal_id / before=draft / after=submitted / timestamp` が append される。
- `submitted` 後の本文編集は禁止。修正は `returned`（REQ-006）経由の再提出フローで行う。

### Acceptance Criteria
- Given user ロールの投稿者本人が draft の自身の投稿を保有する
  When 必須項目（タイトル / 本文）を埋め、倫理ガードチェックボックス 3 種すべてを true にし、visibility（`private` / `internal` / `public` のいずれか）を選択し、PolicyAgreement に同意したうえで提出 server function を呼ぶ
  Then status が `submitted` に遷移し、AuditLog に `actor=user_id, role=user, action=submit, target=proposal_id, before=draft, after=submitted, timestamp` が append される
- Given user ロールの投稿者本人が draft を保有する
  When 倫理ガードチェックボックスのいずれかが未確認のまま提出 server function を呼ぶ
  Then 4xx（不正リクエスト）が返り、status は `draft` のまま遷移しない
- Given user ロールの投稿者本人が draft を保有する
  When PolicyAgreement に同意せずに提出 server function を呼ぶ
  Then 4xx が返り、PolicyAgreement レコードは生成されない
- Given 投稿者本人ではない user / reviewer が他人の draft を持つ proposal id を指定して提出 server function を呼ぶ
  When server function が認可ヘルパーを通過する
  Then 403 を返し、status は遷移しない、AuditLog にも記録しない

### Scope
In:
- 投稿の作成・編集（draft）
- 投稿の提出（draft → submitted）
- 提出フォームでの倫理ガード表示と PolicyAgreement 同意の取得
- 公開範囲の選択（投稿時）

Out:
- 添付画像（IDEA-008）
- AI による本文の自動マスキング（PROB-002 Constraints）
- メール通知（非ゴール）

### Related Items
- RC-002
- IDEA-001, IDEA-002, IDEA-006
- PROB-001, PROB-002
- 暫定回答に依拠する Q-XXX: Q-001（モック認証）, Q-007（internal はログインユーザ全員）

### Open Questions
- Q-008: PolicyAgreement のバージョニング規約
- Q-019: 提出 (submit) 時の reason テキスト必須要否（暫定: 任意）

### Status
candidate

---

## REQ-003: 公開前レビュー・承認フロー

### Summary
レビュアーまたは管理者は提出済みの投稿を担当（`in_review`）化し、判断理由必須で `approved` / `returned` / `rejected` のいずれかに遷移させる。

### Background
PROB-001（公開前レビュー無しに投稿が公開されてしまうリスク）および PROB-003（レビュー判断の理由が記録されず説明責任が果たせない）に対応する。GOAL-02（説明責任）の中核要件。

### Actor
- レビュアー（`reviewer` ロール）
- 管理者（`admin` ロール）

### Functional Requirements
- `submitted` 状態の投稿は reviewer または admin が `in_review` に遷移させて担当できる（`start_review` 操作）。
- `in_review` の投稿は担当した reviewer / admin が判断理由テキスト必須で `approved` / `returned` / `rejected` のいずれかに遷移させる。
- すべての遷移操作は AuditLog（REQ-011）に append-only で記録する。
- 判断理由テキスト（reason）が空文字列の場合は 4xx を返し、status は遷移せず、AuditLog にも記録しない。
- user / guest / auditor は判定 server function を呼んでも 403 を返す。
- 同一 proposal に対する複数 reviewer の同時担当化は楽観ロックで 1 名のみ成功（暫定方針、Phase 3 で確定）。

### Acceptance Criteria
- Given reviewer / admin が submitted の proposal を保有する
  When 担当開始 server function（→ in_review）を呼び reason を添えて呼ぶ
  Then status が `in_review` に遷移し、AuditLog に `actor / role / action=start_review / before=submitted / after=in_review / reason / timestamp` が append される
- Given reviewer / admin が in_review の proposal を担当中
  When 判定 server function を `approved` / `returned` / `rejected` のいずれかで呼び reason を添える
  Then status が指定値に遷移し、AuditLog に `action=approve|return|reject` で append される
- Given reviewer / admin が in_review の proposal を担当中
  When 判定 server function を reason 空文字列で呼ぶ
  Then 4xx を返し status は遷移しない、AuditLog にも記録しない
- Given user ロール（投稿者本人を含む）/ guest / auditor が判定 server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返し、status は遷移しない
- Given submitted の proposal が 1 件存在
  When 別の reviewer 2 人が同時に in_review 化を試みる
  Then 1 名のみ成功し、もう 1 名は 409 等の競合エラーを受け取る

### Scope
In:
- submitted → in_review への遷移
- in_review → approved / returned / rejected への遷移
- 各遷移操作での判断理由必須化

Out:
- AI による自動承認（非ゴール）
- レビュー担当者間でのコメント機能（MVP 非対象）

### Related Items
- RC-003
- IDEA-002
- PROB-001, PROB-003

### Open Questions
- Q-004: レビュー所要時間 SLA の数値
- 担当者アサイン概念の有無（Phase 2 末で再確認）
- 同時担当化の競合解決方針の最終仕様（Phase 3 で確定）

### Status
candidate

---

## REQ-004: 投稿の公開と公開範囲の適用

### Summary
管理者は `approved` の投稿を `published` に遷移させる。`published` 投稿は viewer のロールと visibility の組合せで取得可否を server function 側で判定する。

### Background
PROB-006（投稿者が公開範囲をコントロールできない）および GOAL-04（公開範囲の自己決定 + AuditLog 記録）に対応する。publish は admin の専権操作とし、説明責任を担保する。

### Actor
- 管理者（`admin` ロール）
- 公開対象の閲覧者（`guest` / `user` / `reviewer` / `admin`）

### Functional Requirements
- `approved` の投稿は admin のみが publish server function により `published` に遷移させられる。reviewer は publish できない（403）。
- publish 成功時に AuditLog に `actor / role=admin / action=publish / before=approved / after=published / timestamp` が append される。
- `published` 投稿の取得制御は loader / server function 側で強制し、UI 出し分けには依存しない。
  - `private`: 投稿者本人と admin のみ閲覧可
  - `internal`: ログイン済（`guest` 以外）の全ユーザが閲覧可
  - `public`: ログイン不要で全員閲覧可
- visibility × viewer ロールの取得可否マトリクスは REQ-008 で網羅。本要件は publish 遷移と取得制御の所在のみ規定する。

### Acceptance Criteria
- Given admin が approved の proposal を保有する
  When publish server function を呼ぶ
  Then status が `published` に遷移し、AuditLog に `actor / role=admin / action=publish / before=approved / after=published / timestamp` が append される
- Given reviewer が approved の proposal を保有する
  When publish server function を呼ぶ
  Then 403 を返し、status は `approved` のまま遷移しない
- Given user / guest / auditor が publish server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返す
- Given visibility × viewer ロールの取得制御
  When loader / server function を経由する
  Then REQ-008 のマトリクスと整合した応答を返す

### Scope
In:
- approved → published への遷移（admin 専権）
- visibility と viewer ロールに基づく取得制御（loader / server function）

Out:
- 公開時の通知（メール等、非ゴール）
- 検索エンジン向けメタデータ最適化（MVP 非対象）

### Related Items
- RC-004
- IDEA-003
- PROB-006
- 暫定回答に依拠する Q-XXX: Q-007（internal はログインユーザ全員）
- 関連 GOAL: GOAL-04

### Open Questions
- approved → published を「approve と同時」とするか「明示的な公開操作」とするかの最終確定（AMB-009、本要件は別操作前提で起草）

### Status
candidate

---

## REQ-005: 公開済み投稿の取り下げ

### Summary
管理者は `published` の投稿を判断理由必須で `withdrawn` に遷移させる。本文は一般閲覧者から非表示にするが、AuditLog には公開していた事実が append-only で残る。

### Background
PROB-001（公開前レビュー無しに投稿が公開されてしまうリスク）への運用対応として、誤公開・事後問題発覚時の取り下げ導線が必要。Q-003 暫定方針（公開記録を残す）を採用。

### Actor
- 管理者（`admin` ロール）

### Functional Requirements
- admin は published の proposal を判断理由テキスト必須で withdraw server function により `withdrawn` に遷移させられる。
- withdraw 成功時に AuditLog に `actor / role=admin / action=withdraw / before=published / after=withdrawn / reason / timestamp` が append され、`(published_at, withdrawn_at)` のペアが AuditLog から抽出可能。
- reason 空での呼び出しは 4xx を返し status は遷移しない。
- withdrawn 後、本文取得 loader は一般閲覧経路（guest / user / 投稿者本人 / auditor）から 404 または 403 を返す。AuditLog 経路（auditor / admin）からは「withdrawn の事実 + 公開期間」が引き続き観測可能。
- approved（未公開）からの withdraw は MVP では不可（4xx）。

### Acceptance Criteria
- Given admin が published の proposal を保有する
  When 取り下げ server function を呼び reason を添える
  Then status が `withdrawn` に遷移し、AuditLog に `actor / role=admin / action=withdraw / before=published / after=withdrawn / reason / timestamp` が append される。AuditLog から `(published_at, withdrawn_at)` のペアが抽出可能
- Given admin が published の proposal を保有する
  When 取り下げ server function を reason 空で呼ぶ
  Then 4xx を返し status は遷移しない
- Given guest / user（投稿者本人を含む）/ auditor が withdrawn の proposal の本文取得 loader を呼ぶ
  When loader が認可ヘルパーを通過する
  Then 一般閲覧経路では 404 または 403。AuditLog 経路（auditor / admin）では「withdrawn の事実 + 公開期間」が見える
- Given approved（未公開）の proposal が存在
  When 取り下げ server function を呼ぶ
  Then 4xx を返す（withdrawn は published 経由のみ）

### Scope
In:
- published → withdrawn への遷移
- withdrawn 後の本文非表示
- AuditLog への「公開していた事実」の残存

Out:
- 物理削除（非ゴール）
- 投稿者によるセルフ取り下げ（MVP 検討、AMB-010）

### Related Items
- RC-006
- IDEA-002
- PROB-001
- 暫定回答に依拠する Q-XXX: Q-003（公開記録を残す / 本文非表示 + AuditLog 保持）

### Open Questions
- AMB-010: 投稿者本人による取り下げを許すか / 許す場合の条件

### Status
candidate

---

## REQ-006: 差し戻し後の再提出

### Summary
`returned` の投稿は投稿者本人が再編集でき、再提出操作で同一 proposal id を保ったまま `submitted` に遷移する。差し戻し回数は AuditLog から追跡可能。

### Background
PROB-001 のレビューフロー閉ループを完成させる。差し戻された投稿が再提出経路を持たないと、フローが滞留する。

### Actor
- 一般ユーザ（投稿者本人、`user` ロール）

### Functional Requirements
- `returned` の proposal は投稿者本人のみが本文を再編集できる。
- 再提出 server function は status を `submitted` に遷移させ、proposal id は変化しない。
- 再提出成功時に AuditLog に `actor / role=user / action=resubmit / before=returned / after=submitted / timestamp` が append される。
- AuditLog の `target=proposal_id` 絞り込みで `action=return` のエントリ数 = 差し戻し回数として観測可能。
- 投稿者本人ではない呼び出しは 403。
- 倫理ガード再確認 / PolicyAgreement 再取得は MVP 暫定方針として「再取得しない（初回同意の継続適用）」。Q-018 確定後に再評価。

### Acceptance Criteria
- Given user ロールの投稿者本人が returned の自身の proposal を保有する
  When 本文を編集し再提出 server function を呼ぶ
  Then status が `submitted` に遷移し、proposal id は変化しない。AuditLog に `actor / role=user / action=resubmit / before=returned / after=submitted / timestamp` が append される
- Given returned の proposal に対し AuditLog を `target=proposal_id` で絞り込む
  When 過去の遷移を集計する
  Then `action=return` のエントリ数 = 差し戻し回数として観測可能
- Given 投稿者本人ではない user / reviewer / admin / guest / auditor が再提出 server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返す
- Given user ロールの投稿者本人が returned 状態の自身の proposal を保有し、初回提出時に PolicyAgreement を 1 件生成済（同 proposal_id に紐づく）
  When 本文を編集し再提出 server function を呼ぶ（倫理ガードチェックボックスを再操作しない / PolicyAgreement の同意フローを再表示しない）
  Then status が `submitted` に遷移し、`PolicyAgreement` レコードは新規生成されない（既存の `policy_agreement_id` がそのまま継続適用される）

### Scope
In:
- returned 状態での投稿者本人による再編集
- returned → submitted への遷移（同一 id）
- AuditLog への再提出記録

Out:
- 新規 id の払い出し（暫定では行わない）

### Related Items
- RC-007
- IDEA-002
- PROB-001
- 暫定回答に依拠する Q-XXX: Q-011（同じ proposal id で再提出）, Q-018（再取得しない暫定）

### Open Questions
- Q-018: 再提出時の倫理ガード再確認 / PolicyAgreement 再取得の要否
- 差し戻し回数の上限を設けるか（Phase 2 末で確定）

### Status
candidate

---

## REQ-007: 自分の投稿一覧・ステータス確認

### Summary
ログインユーザは自分が起票した投稿を全 8 ステータスを通じて一覧表示でき、各エントリの最新 status と最終更新日時を確認できる。

### Background
PROB-001 の現状（投稿が滞留する / どこにあるか分からない）への対応として、投稿者が自分の投稿の進捗を能動的に確認できる導線を提供する。

### Actor
- 一般ユーザ（投稿者本人、`user` ロール）

### Functional Requirements
- ログインユーザは「自分が起票した投稿」のみを一覧画面で閲覧でき、各投稿の最新 status と最終更新日時を取得できる。
- 一覧は `draft / submitted / in_review / returned / approved / published / rejected / withdrawn` の全 8 ステータスを含む。
- 他ユーザの投稿はこの一覧に含めない（server-side フィルタ）。
- guest が呼ぶと 401（未ログインでは「自分」が定義不能）。

### Acceptance Criteria
- Given user ロールのユーザ A がログイン中で、A が起票した proposal を全 8 ステータスについて 1 件以上保有する
  When 自分の投稿一覧 loader を呼ぶ
  Then A が起票した proposal のすべて（rejected / withdrawn を含む）が応答に含まれ、各エントリに最新 status と最終更新日時が付与されている
- Given user A がログイン中で、別ユーザ B が起票した proposal が存在する
  When A が自分の投稿一覧 loader を呼ぶ
  Then 応答に B の proposal は 1 件も含まれない
- Given guest が自分の投稿一覧 loader を呼ぶ
  When 認可ヘルパーが通過する
  Then 401 を返す

### Scope
In:
- 自分の投稿一覧（全ステータス）
- 自分の投稿の詳細閲覧（ステータスに依らず）

Out:
- 他ユーザの投稿の閲覧（公開済みは REQ-008 で別経路）
- 投稿の物理削除導線（非ゴール）

### Related Items
- RC-008
- IDEA-001
- PROB-001
- 暫定回答に依拠する Q-XXX: Q-001（モック認証下でもユーザ識別子は持つ）

### Open Questions
- ステータス別フィルタの必要性（Phase 3 で再評価）

### Status
candidate

---

## REQ-008: 公開済み投稿の閲覧

### Summary
`published` 投稿について、viewer ロールと visibility の組合せに応じて一覧および詳細を server function / loader 側で取得制御する。

### Background
GOAL-04（公開範囲の自己決定）と PROB-005（権限バイパス防止）に対応する。閲覧の可否は UI 出し分けではなく取得経路で決定する。

### Actor
- ゲスト（`guest` ロール、未ログイン）
- 一般ユーザ（`user` ロール）
- レビュアー（`reviewer` ロール）
- 管理者（`admin` ロール）
- 監査担当（`auditor` ロール）

### Functional Requirements
- `published` 投稿の取得は visibility × viewer ロールで判定し、loader / server function 側で強制する。
- 「見える」= 詳細 loader が 200。「見えない」= 詳細 loader が `401`（未ログイン）または `404`（ログイン済かつ権限不足）を返す。Phase 3 で 403 に再評価する余地を残す。
- 一覧 loader も同マトリクスに準拠し、呼び出し元 viewer から見える proposal のみを含む。
- 未承認 / draft / submitted / in_review / returned / rejected は本要件の対象外（published のみ）。
- private 投稿の reviewer / auditor 閲覧可否は Q-016 暫定方針として「reviewer は見えない (404) / auditor は AuditLog のメタ情報のみ閲覧、本文は到達不可（404）」。

### Acceptance Criteria
- visibility × viewer ロールマトリクス（「見える」= 詳細 loader が 200、「見えない」= 詳細 loader が 401 / 404）：

| visibility \ viewer | guest | user(他人) | user(本人) | reviewer | admin | auditor |
| --- | --- | --- | --- | --- | --- | --- |
| `private`   | 見えない (401) | 見えない (404) | 見える | 見えない (404、Q-016 暫定) | 見える | 見えない (404、Q-016 暫定 / メタ情報は AuditLog 経由で別途) |
| `internal`  | 見えない (401) | 見える | 見える | 見える | 見える | 見える |
| `public`    | 見える | 見える | 見える | 見える | 見える | 見える |

- 一覧 loader についても上表に準拠（呼び出し元 viewer から見える proposal のみが含まれる）。
- ステータスコード暫定統一（**未ログイン 401 / 認可違反 404**）は REQ-009 / REQ-012 と同期。Phase 3 で 403 を選ぶ場合は同時更新する。

### Scope
In:
- 公開済投稿の一覧（visibility と viewer ロールでフィルタ）
- 公開済投稿の詳細閲覧

Out:
- フリーテキスト検索（MVP 非対象想定）
- コメント機能（非ゴール）

### Related Items
- RC-009
- IDEA-001, IDEA-003
- PROB-005, PROB-006
- 暫定回答に依拠する Q-XXX: Q-007（internal はログインユーザ全員）, Q-016（private は reviewer / auditor から非表示）

### Open Questions
- Q-016: auditor / reviewer の private 投稿本文到達可否
- ページネーション・並び順の規約（Phase 3 で確定）
- 検索機能の有無（MVP 非対象想定だが要確認）

### Status
candidate

---

## REQ-009: レビュー待ち一覧

### Summary
reviewer / admin はレビューが必要な投稿（`submitted` / `in_review`）を横断的に一覧でき、取得制御は server function 側でロールを検証する。

### Background
PROB-001 のレビューフローを実運用するうえで、レビュアーが未処理を一覧で把握できる導線が必要。

### Actor
- レビュアー（`reviewer` ロール）
- 管理者（`admin` ロール）

### Functional Requirements
- reviewer または admin はレビュー待ち一覧 loader を呼び、`submitted` および `in_review` の投稿を横断的に取得できる。
- admin は visibility に関わらず全件閲覧可。reviewer は private 投稿を Q-016 暫定方針として除外（`internal` / `public` のみ）。
- user / guest / auditor が呼ぶと、未ログイン（guest）は 401、ログイン済の権限不足（user / auditor）は 404。
- 結果には `submitted` と `in_review` のみが含まれ、`draft` / `approved` / `published` / `returned` / `rejected` / `withdrawn` は含まれない。

### Acceptance Criteria
- Given reviewer / admin がログイン中で、submitted / in_review の proposal が visibility 種別 (`private` / `internal` / `public`) ごとに存在する
  When レビュー待ち一覧 loader を呼ぶ
  Then 結果に submitted と in_review の双方が含まれ、admin に対しては全 visibility が含まれる。reviewer に対しては Q-016 確定までの暫定として `private` のみ除外、`internal` / `public` は含まれる
- Given user / guest / auditor がレビュー待ち一覧 loader を呼ぶ
  When 認可ヘルパーが通過する
  Then 未ログイン（guest）は 401、ログイン済の権限不足（user / auditor）は 404
- Given reviewer / admin がレビュー待ち一覧を呼ぶ
  When draft / approved / published / returned / rejected / withdrawn の proposal が存在する
  Then それらは結果に含まれない

### Scope
In:
- submitted / in_review の横断一覧
- 詳細画面への遷移

Out:
- レビュアー間チャット（非ゴール）
- レビュー担当の自動割当（MVP 非対象）

### Related Items
- RC-010
- IDEA-002
- PROB-001

### Open Questions
- Q-016: reviewer の private 投稿閲覧可否
- フィルタ条件（カテゴリ・経過時間）の有無（Phase 3 で確定）
- 並び順（提出順 / 経過時間順）の既定（Phase 2 で確定）

### Status
candidate

---

## REQ-010: 役割と権限分離（5 ロール）

### Summary
本システムは `guest` / `user` / `reviewer` / `admin` / `auditor` の 5 ロールを持ち、ロールごとに実行可能な操作を非対称に定義する。ロール判定は server function の入口で必ず行う。

### Background
PROB-005（権限バイパス）および GOAL-03（5 ロールを server function 側で強制する設計）に対応する。

### Actor
- システム全体（全アクター）

### Functional Requirements
- システムは以下の 5 ロールを持つ：
  - `guest`: 未ログイン。`public` 投稿の閲覧のみ
  - `user`: 自分の投稿の作成・編集・提出・再提出、自分の投稿閲覧、`public` / `internal` 投稿閲覧
  - `reviewer`: `user` の能力 + レビュー操作（in_review 化、approve / return / reject、判断理由必須）
  - `admin`: `reviewer` の能力 + 公開操作（published）、visibility 変更、取り下げ
  - `auditor`: AuditLog の閲覧のみ（投稿の編集権限なし、レビュー権限なし）。AuditLog 全件を一覧 / フィルタ可（Q-009 暫定）。投稿本文への到達可否は Q-016 暫定方針「メタ情報のみ閲覧、本文には到達不可」。
- ロール判定は server function の入口で必ず行い、UI 表示制御は補助的役割に留める。
- リソース所有者一致判定（user(本人) と user(他人) の区別）は認可ヘルパー側で実装する。
- 1 ユーザが複数ロールを兼任する場合の合成は OR 合成を暫定方針とする。

### Acceptance Criteria
ロール × 主要操作の禁止セルマトリクス。「許可」のセルは別 REQ の AC で観測。「禁止」セルは server function が 401（guest 該当）または 403 を返すことを本要件の AC とする。viewer 列は 6 列（guest / user(他人) / user(本人) / reviewer / admin / auditor）× 操作 11 種。

| 操作 / ロール                           | guest | user(他人) | user(本人) | reviewer | admin | auditor | 許可 AC の参照 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| draft 作成 / 編集                       | 401   | 403        | 許可        | 許可     | 許可  | 403     | REQ-002 |
| 提出 (draft → submitted)                | 401   | 403        | 許可        | 許可     | 許可  | 403     | REQ-002 |
| in_review 化 (submitted → in_review)    | 401   | 403        | 403         | 許可     | 許可  | 403     | REQ-003 |
| approve (in_review → approved)          | 401   | 403        | 403         | 許可     | 許可  | 403     | REQ-003 |
| return (in_review → returned)           | 401   | 403        | 403         | 許可     | 許可  | 403     | REQ-003 |
| reject (in_review → rejected)           | 401   | 403        | 403         | 許可     | 許可  | 403     | REQ-003 |
| publish (approved → published)          | 401   | 403        | 403         | 403      | 許可  | 403     | REQ-004 |
| visibility 変更（縮小・拡大）           | 401   | 403        | 403         | 403      | 許可  | 403     | (RC-005, needs-clarification) |
| withdraw (published → withdrawn)        | 401   | 403        | 403         | 403      | 許可  | 403     | REQ-005 |
| 再提出 (returned → submitted)           | 401   | 403        | 許可        | 403      | 403   | 403     | REQ-006 |
| AuditLog 閲覧                           | 401   | 403        | 403         | 403      | 許可  | 許可    | REQ-012 |

- 上表のすべての「401」「403」セルについて、対応する server function 呼び出しが当該ステータスコードを返すことを E2E で網羅する。
- 「user(本人)」と「user(他人)」は同じ user ロールだが、リソース所有者一致判定の有無を区別するための列。

### Scope
In:
- 5 ロールの定義と能力範囲
- server function 入口での認可ヘルパー利用ガイドライン

Out:
- 属性ベース権限（組織・地域属性等、MVP 非対象）
- 動的なロール作成（管理画面）

### Related Items
- RC-011
- IDEA-004
- PROB-005
- 関連 GOAL: GOAL-03

### Open Questions
- 1 ユーザの複数ロール兼任時の合成ルール（暫定 OR 合成、Phase 2 で確定）
- 投稿者本人と admin の能力境界（自分の private 投稿の admin による閲覧可否）（AMB-011）
- Q-016: auditor の本文到達可否

### Status
candidate

---

## REQ-011: 監査ログの記録（AuditLog 書き込み）

### Summary
結果を変える 6 種の操作（submit / review judgment / publish / visibility change / withdraw / resubmit）は server function 側で AuditLog エントリを必ず生成する。エントリは `actor / role / action / target / before / after / reason / timestamp` を持ち append-only。

### Background
PROB-003（レビュー判断の理由が記録されず説明責任が果たせない）、PROB-004（管理者操作の追跡可能性がない）、GOAL-02（説明責任を果たせる体制）に対応する中核要件。

### Actor
- システム（記録する側）
- 結果を変える操作を行う全ロール（user の提出、reviewer の判定、admin の公開・取り下げ・visibility 変更）

### Functional Requirements
結果を変える 6 種の操作それぞれについて、AuditLog エントリを 1 件 append する：

- **(1) submit (draft → submitted)**: `action=submit, before=draft, after=submitted, reason=任意（Q-019 確定まで省略可）, timestamp`
- **(2) review judgment (submitted/in_review → approved/returned/rejected)**: `action=start_review|approve|return|reject, before, after, reason=必須, timestamp`
- **(3) publish (approved → published)**: `action=publish, before=approved, after=published, reason=任意, timestamp`
- **(4) visibility change (縮小・拡大)**: `action=visibility_shrink|visibility_expand, before=visibility値, after=visibility値, reason=必須, timestamp`
- **(5) withdraw (published → withdrawn)**: `action=withdraw, before=published, after=withdrawn, reason=必須, timestamp`
- **(6) resubmit (returned → submitted)**: `action=resubmit, before=returned, after=submitted, reason=任意, timestamp`

- reason 必須操作（(2) / (4) / (5)、および Q-019 確定後に必須化された場合の (1)）で reason が空の場合は 4xx を返し、AuditLog エントリは生成しない。
- 認可エラー（401 / 403 / 404）で失敗した呼び出しでは AuditLog エントリは生成しない（成功時のみ append）。
- AuditLog エントリの update / delete を行う server function は実装しない（NFR-004 で観測手段を AC 化）。

### Acceptance Criteria
- (1) submit 成功時に上記フィールドを含むエントリが 1 件 append される（REQ-002 と同期）
- (2) review judgment の各遷移成功時にエントリが 1 件 append される。reason 空での呼び出しは 4xx を返し AuditLog にも記録しない（REQ-003 と同期）
- (3) publish 成功時にエントリが 1 件 append される（REQ-004 と同期）
- (4) visibility change 成功時にエントリが 1 件 append される。reason 空は 4xx で遷移拒否（RC-005 / 将来の REQ と同期）
- (5) withdraw 成功時にエントリが 1 件 append される。reason 空は 4xx で遷移拒否（REQ-005 と同期）
- (6) resubmit 成功時にエントリが 1 件 append される（REQ-006 と同期）
- 上記 6 種の操作が認可エラーで失敗する場合、AuditLog エントリは生成されない
- 上記 6 種のうち reason 必須操作で reason 空での 4xx 失敗時、AuditLog エントリは生成されない
- AuditLog エントリの update / delete を行う server function を呼ぶ手段が存在しない（NFR-004 で観測）

### Scope
In:
- 列挙した結果変更操作の AuditLog 記録
- before / after / reason の必須項目化

Out:
- 観測のみの操作（一覧表示等）の記録（MVP 非対象）
- 物理ログローテーション（運用テーマ、Phase 2 以降で再評価）

### Related Items
- RC-012
- IDEA-005
- PROB-003, PROB-004
- 関連 GOAL: GOAL-02

### Open Questions
- Q-019: 提出 (submit) の reason 必須要否（暫定: 任意）
- 認可失敗試行を AuditLog に記録するか（Phase 2 で確定）
- AMB-012: reason テキストへの PII 混入抑止の仕組み（Phase 2 で別 REQ 化を検討）

### Status
candidate

---

## REQ-012: 監査ログの閲覧

### Summary
`auditor` および `admin` は AuditLog を一覧・詳細閲覧できる。auditor は読み取り専用で、AuditLog の改変・削除はできない。

### Background
PROB-004（管理者操作の追跡可能性がない）への対応として、AuditLog の読み取り経路を明示的に提供する。

### Actor
- 監査担当（`auditor` ロール）
- 管理者（`admin` ロール）

### Functional Requirements
- auditor および admin は AuditLog 一覧 loader を呼び、全件を取得できる。
- auditor は AuditLog 全件を一覧 / フィルタ可（Q-009 暫定）。
- フィルタ条件（actor / action / 期間）が指定された場合、合致するエントリのみが返される。
- user / guest / reviewer は AuditLog loader を呼ぶと、未ログイン（guest）は 401、ログイン済の権限不足（user / reviewer）は 404。
- auditor が AuditLog エントリの update / delete server function を呼ぶと 404 を返す（読み取り専用、書き込み系エンドポイントは存在隠蔽。エントリ自体の不変性は NFR-004 で別途強制）。
- auditor が AuditLog エントリ詳細から private 投稿本文 loader を呼ぶと 404（Q-016 暫定方針：本文には到達不可）。

### Acceptance Criteria
- Given auditor がログイン中で、AuditLog に複数 actor / 複数 action のエントリが存在する
  When AuditLog 一覧 loader を呼ぶ
  Then 全件が応答に含まれる（`actor / role / action / target / before / after / reason / timestamp` の必須フィールドが揃う）
- Given auditor が AuditLog 一覧 loader を `actor` / `action` / `期間` のいずれかの条件で絞り込んで呼ぶ
  When loader が応答する
  Then 条件に合致するエントリのみが返される
- Given user / guest / reviewer が AuditLog 一覧 loader を呼ぶ
  When 認可ヘルパーが通過する
  Then 未ログイン（guest）は 401、ログイン済の権限不足（user / reviewer）は 404
- Given auditor が AuditLog エントリの update / delete server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 404 を返す
- Given auditor が AuditLog エントリ詳細 loader を呼ぶ
  When 当該エントリが `private` 投稿に紐づく
  Then メタ情報は閲覧可、投稿本文 loader は 404 を返す

> 脚注: ステータスコードの暫定統一は REQ-008 / REQ-009 と同じ方針（**未ログイン 401 / 認可違反 404 / auditor の書き込み系 404**）。Phase 3 で 403 を選ぶ場合は同時更新する。

### Scope
In:
- AuditLog 全体の一覧・詳細閲覧
- auditor の読み取り専用権限

Out:
- AuditLog エントリの編集・削除（システム禁止）
- ログのエクスポート（MVP 検討、Phase 2 で再評価）

### Related Items
- RC-013
- IDEA-005
- PROB-004
- 暫定回答に依拠する Q-XXX: Q-009（AuditLog 全体を一覧可能）

### Open Questions
- Q-006: AuditLog の保持期間と削除ポリシー
- Q-012: フィルタ条件（actor / action / 期間）の必要性
- Q-016: auditor の投稿本文到達可否
- AuditLog エクスポートのスコープ（Phase 2 で再評価）

### Status
candidate

---

## REQ-013: 投稿時のプライバシー・倫理ガード

### Summary
投稿フォーム（提出時）には個人情報注意喚起 / 第三者誹謗中傷注意 / 公開可能性明示の 3 種チェックボックスと PolicyAgreement 同意を必須化する。server-side で検証し、PolicyAgreement レコードを生成する。

### Background
PROB-002（投稿時の個人情報・センシティブ情報の混入）および GOAL-01（個人情報・誹謗中傷を含む投稿が公開されるリスクを構造的に下げる）に対応する。

### Actor
- 一般ユーザ（投稿者、`user` ロール）

### Functional Requirements
- 投稿フォーム（提出時）には以下を表示し、いずれも未確認では提出 server function が 4xx を返す：
  - 個人情報を入力しない注意喚起（チェックボックス）
  - 第三者を誹謗中傷しない注意喚起（チェックボックス）
  - 公開される可能性があることの明示（チェックボックス）
- 「非公開相談として扱う」選択肢として visibility = `private` を提示する。
- 公開範囲（`private` / `internal` / `public`）を選択する。
- プライバシーポリシー同意（PolicyAgreement レコードの生成）を必須とする。
- PolicyAgreement レコードは `user_id / proposal_id / agreed_at / policy_version` を保持する（policy_version の形式は Q-008 確定後、暫定値 `mvp-initial`）。
- すべての検証は server-side で行い、UI ボタンの無効化に依存しない。
- returned 再提出時の倫理ガード再確認 / PolicyAgreement 再取得は MVP 暫定方針として「再取得しない」（Q-018 確定後に再評価）。

### Acceptance Criteria
- Given user ロールの投稿者本人が draft の自身の proposal を保有する
  When 倫理ガードチェックボックスのいずれかを未確認のまま提出 server function を呼ぶ
  Then 4xx を返し status は遷移しない（server-side 検証、UI ボタンの無効化に依存しない）
- Given user ロールの投稿者本人が draft を保有し、3 種すべてのチェックボックスを true にし PolicyAgreement に同意して提出 server function を呼ぶ
  When 提出が成功する
  Then PolicyAgreement レコードが 1 件生成され `user_id / proposal_id / agreed_at / policy_version` を保持する。policy_version は Q-008 確定までは暫定値（例: `mvp-initial`）で記録
- Given user ロールの投稿者本人が visibility = `private` を選択
  When 提出 server function を呼ぶ
  Then 提出が成功し、proposal の visibility が `private` で記録される
- Given user ロールの投稿者本人が returned 状態の自身の proposal を保有し、初回提出時に倫理ガードチェックボックス 3 種を true にし PolicyAgreement を 1 件生成済
  When 本文を編集し再提出 server function を呼ぶ（チェックボックス未操作 / PolicyAgreement 同意フローを再表示しない）
  Then 提出が成功し、新規 PolicyAgreement レコードは生成されない（既存の `policy_agreement_id` が継続適用される）

### Scope
In:
- 提出フォームでの倫理ガード UI
- PolicyAgreement の記録

Out:
- 自動マスキング（非ゴール）
- AI による事前リスク分類（IDEA-008、将来）

### Related Items
- RC-014
- IDEA-006
- PROB-002
- 関連 GOAL: GOAL-01
- 暫定回答に依拠する Q-XXX: Q-018（再取得しない暫定）

### Open Questions
- Q-008: policy_version の形式とバージョン管理規約
- Q-018: returned 再提出時の再確認要否

### Status
candidate

---

## REQ-014: 投稿ポリシー・プライバシーポリシーの公開ページ

### Summary
投稿ポリシー・プライバシーポリシーを `/policies/posting` `/policies/privacy` 等の公開ページとしてログイン不要で提供し、PolicyAgreement のバージョン識別子と整合させる。

### Background
PROB-002（投稿時の個人情報・センシティブ情報の混入）への補完として、投稿者がポリシー文をいつでも参照できる導線を確立する。REQ-013 の PolicyAgreement と版数で接続する。

### Actor
- ゲスト（未ログインを含む全員）

### Functional Requirements
- ポリシー文書は `/policies/posting` `/policies/privacy` 等の公開ページとして提供し、ログイン不要で閲覧できる（認可ヘルパーをバイパスする「公開ページ性質」）。
- ロール（guest / user / reviewer / admin / auditor）に関わらず 200 を返す。
- ポリシー文書はバージョン識別子 `policy_version` を持ち、PolicyAgreement（REQ-013）の `policy_version` と整合する形式である（具体形式は Q-008 確定後）。

### Acceptance Criteria
- Given guest（未ログイン）が `/policies/posting` または `/policies/privacy` を呼ぶ
  When loader が認可ヘルパー（または公開ページ用バイパス）を通過する
  Then 200 を返しポリシー文書が表示される
- Given user / reviewer / admin / auditor がポリシーページを呼ぶ
  When loader が応答する
  Then 200 を返す（ロールによらず閲覧可能）
- Given ポリシーページが応答する
  When レスポンスに含まれるバージョン識別子を確認する
  Then `policy_version` が表示され、PolicyAgreement (REQ-013) の `policy_version` と整合する形式である

### Scope
In:
- 投稿ポリシー・プライバシーポリシーの公開ページ
- バージョン識別子の表示

Out:
- ポリシー編集 UI（MVP 非対象、運用は手動 commit 想定）
- 多言語版（非ゴール）

### Related Items
- RC-015
- IDEA-006

### Open Questions
- Q-008: policy_version の形式とバージョニング規約
- ポリシー文書の管理方式（リポジトリ内 Markdown / DB / CMS）（Phase 2-3 で確定）

### Status
candidate

---

## REQ-015: 認証（モック）

### Summary
MVP 段階では cookie + 環境変数の許可リストでユーザ識別子とロールを保持する「モック認証」を採用する。`guest`（未ログイン）と `user` 以上（ログイン済）を区別し、ログインユーザは 5 ロールのいずれか 1 つ以上を保持する。

### Background
GOAL-05（学習目的：技術スタック習得）と GOAL-06（loader / server function / 認可チェック・監査ログ設計の経験）に集中するため、実プロバイダ統合（OIDC / Cloudflare Access 等）は MVP 範囲外。Q-001 暫定方針を採用。

### Actor
- システム全体（認証境界）

### Functional Requirements
- 環境変数で許可リスト（ユーザ識別子 → ロール）を保持する。
- 認証ミドルウェアは cookie 値を許可リストに照合し、合致したユーザのセッションを確立し、role を server function に伝播する。
- 許可リスト外の cookie は許可リスト内ロールに昇格しない（401 を返す、または `guest` として扱う。最終仕様は Phase 3 で確定）。
- cookie が付与されていないリクエストは `guest` ロールとして扱われ、`public` 投稿の閲覧と公開ページ（REQ-014）の閲覧のみ許可される。
- 認証 cookie には `HttpOnly` / `Secure`（本番）/ `SameSite=Lax` 以上の属性を付与する（NFR-006 と同期）。
- cookie 内のユーザ識別子は不透明 ID（任意文字列）であり、それ自体は PII でないものとする。将来メールアドレス等を識別子として採用する場合は別途 PII 扱いとし、logger には `user_id_hash` のみを出力する（NFR-005 / NFR-007 と整合）。

### Acceptance Criteria
- Given 環境変数の許可リストにユーザ識別子 `U1` とロール `reviewer` が登録されている
  When 当該識別子を表す cookie 値を持つリクエストが認証ミドルウェアを通過する
  Then `U1` のセッションが確立され、role=`reviewer` として server function に伝播する
- Given 環境変数の許可リストに登録されていない cookie 値を持つリクエスト
  When 認証ミドルウェアが検証する
  Then 401 を返す、または `guest` として扱う（最終仕様は Phase 3 で確定。本要件では「許可リスト外は許可リスト内ロールに昇格しない」を AC とする）
- Given cookie が付与されていないリクエスト
  When 認証ミドルウェアが検証する
  Then `guest` ロールとして扱われ、`public` 投稿の閲覧と公開ページの閲覧のみ許可される
- Given cookie がモック認証で発行される
  When レスポンスヘッダを観測する
  Then Cookie 属性として `HttpOnly` / `Secure` / `SameSite=Lax 以上` が付与されている（NFR-006 で観測）

### Scope
In:
- cookie + 許可リストでのモックログイン
- ロール保持と server function での参照導線

Out:
- 実プロバイダ統合（OIDC / Cloudflare Access / メール+パスワード等）
- 多要素認証 / SSO（非ゴール）
- パスワードリセット導線

### Related Items
- RC-016
- IDEA-001, IDEA-004
- 関連 GOAL: GOAL-05, GOAL-06
- 暫定回答に依拠する Q-XXX: Q-001（モック認証）

### Open Questions
- ログイン UI の最小構成（Phase 3 で確定）
- 許可リスト外 cookie の扱いの最終仕様（401 vs guest フォールバック、Phase 3 で確定）
- AMB-008: ユーザ識別子の PII 性（暫定: 不透明 ID は PII 非該当）

### Status
candidate

## 参照

- 上流: `docs/01-requirement-refinement/01-requirement-candidates.md` の RC-XXX
- 下流: `docs/10-basic-design/01-system-overview.md` の UC-XXX
