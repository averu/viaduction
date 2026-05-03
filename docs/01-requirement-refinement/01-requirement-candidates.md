---
id: RC-CANDIDATES
title: 要件候補
status: draft
owners: []
updated: 2026-05-03
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
> 本プロジェクト（まちの提案・申請レビューアプリ）の RC は **RC-002 以降** に起票する。RC-001 はドメイン非合致のサンプルとして温存（`02-ambiguity-review.md` に記録）。

---

## RC-002: 投稿の作成と提出（draft / submitted）

### Source
- IDEA-001
- IDEA-002
- IDEA-006
- PROB-001
- PROB-002

### Actor
- 一般ユーザ（`user` ロール）

### Intent
利用者は地域や組織への提案・報告・申請を起票し、レビューを受けるために提出したい。提出前に下書きとして保存・編集できる。

### Candidate Requirement
ログインユーザは提案を `draft` として作成・編集でき、必要事項を埋めたうえで `submitted` として提出できる。
提出時には倫理ガード（個人情報注意喚起・第三者誹謗中傷注意・公開可能性の明示）と公開範囲（`private/internal/public`）の選択、PolicyAgreement の同意を必須とする。
draft 状態の編集は投稿者本人のみ可能。submitted 後は本文編集を禁止し、返却 (`returned`) を経由して再提出する。
**業務ルール（明示）**: 提出操作（draft → submitted）は AuditLog (RC-012) の記録対象である（action=`submit`, before=`draft`, after=`submitted`）。提出時 reason テキストの必須要否は Q-019 (open) に依存し、確定までは「省略可」を暫定方針とする。

### Acceptance Criteria Draft
- Given user ロールの投稿者本人が draft の自身の投稿を保有する
  When 必須項目（タイトル / 本文）を埋め、倫理ガードチェックボックス 3 種すべてを true にし、visibility（`private` / `internal` / `public` のいずれか）を選択し、PolicyAgreement に同意したうえで提出 server function を呼ぶ
  Then status が `submitted` に遷移し、AuditLog に `actor=user_id, role=user, action=submit, target=proposal_id, before=draft, after=submitted, timestamp` が append される（RC-012 と同期）
- Given user ロールの投稿者本人が draft を保有する
  When 倫理ガードチェックボックスのいずれかが未確認のまま提出 server function を呼ぶ
  Then 4xx（不正リクエスト）が返り、status は `draft` のまま遷移しない（UI ボタンの無効化に依存しない server-side 検証）
- Given user ロールの投稿者本人が draft を保有する
  When PolicyAgreement に同意せずに提出 server function を呼ぶ
  Then 4xx が返り、PolicyAgreement レコードは生成されない
- Given 投稿者本人ではない user / reviewer が他人の draft を持つ proposal id を指定して提出 server function を呼ぶ
  When server function が認可ヘルパーを通過する
  Then 403 を返し、status は遷移しない、AuditLog にも記録しない（RC-018 / RC-011 と同期）

### Ambiguities
- 提出時の必須項目（タイトル / 本文 / カテゴリ等）の最終リストは Phase 2 で確定。
- PolicyAgreement のバージョニングは Q-008 (open) に依存。
- 提出時 reason の必須要否は Q-019 (open) に依存。
- 依拠する暫定回答: Q-001（モック認証）, Q-007（internal はログインユーザ全員）。

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

### Priority
Must

### Status
candidate

---

## RC-003: 公開前レビュー・承認フロー（submitted → in_review → approved/returned/rejected）

### Source
- IDEA-002
- PROB-001
- PROB-003

### Actor
- レビュアー（`reviewer` ロール）
- 管理者（`admin` ロール）

### Intent
レビュアー・管理者は提出済みの投稿を確認し、承認・差し戻し・却下の判断を判断理由付きで行いたい。

### Candidate Requirement
`submitted` 状態の投稿はレビュアーまたは管理者が `in_review` に遷移させて担当できる。
担当後、レビュアー / 管理者は次のいずれかに遷移させる：
- `approved`（公開待ち。後段の RC-004 で `published` に進む）
- `returned`（差し戻し。投稿者の再編集を可能にする）
- `rejected`（却下。再提出不可）

すべての遷移操作は **判断理由テキスト必須** とし、AuditLog（RC-012）に append-only で記録する。

### Acceptance Criteria Draft
- Given reviewer / admin が submitted の proposal を保有する
  When 担当開始 server function（→ in_review）を呼び reason を添えて呼ぶ
  Then status が `in_review` に遷移し、AuditLog に `actor / role / action=start_review / before=submitted / after=in_review / reason / timestamp` が append される
- Given reviewer / admin が in_review の proposal を担当中
  When 判定 server function を `approved` / `returned` / `rejected` のいずれかで呼び reason を添える
  Then status が指定値に遷移し、AuditLog に `action=approve|return|reject` で append される（RC-012 の 6 種のうち 3 種をカバー）
- Given reviewer / admin が in_review の proposal を担当中
  When 判定 server function を reason 空文字列で呼ぶ
  Then 4xx を返し status は遷移しない、AuditLog にも記録しない（業務ルール: 判断理由必須）
- Given user ロール（投稿者本人を含む）/ guest / auditor が判定 server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返し、status は遷移しない（RC-018 / RC-011 と同期）
- Given submitted の proposal が 1 件存在
  When 別の reviewer 2 人が同時に in_review 化を試みる
  Then 1 名のみ成功し、もう 1 名は 409 等の競合エラーを受け取る（暫定: 楽観ロックで proposal の status が `submitted` でなければ拒否、最終仕様は Phase 3 で確定）

### Ambiguities
- 「担当者アサイン」の概念を持たせるか（特定 reviewer に紐付けるか）は Phase 2 で確定。
- レビュー所要時間 SLA は Q-004 (open) に依存。
- 1 件を複数レビュアーが同時に in_review にする場合の競合解決方針は Phase 3 で確定（暫定: 楽観ロック）。

### Scope
In:
- submitted → in_review への遷移
- in_review → approved / returned / rejected への遷移
- 各遷移操作での判断理由必須化

Out:
- AI による自動承認（非ゴール）
- レビュー担当者間でのコメント機能（MVP 非対象）

### Priority
Must

### Status
candidate

---

## RC-004: 投稿の公開（approved → published）と公開範囲の適用

### Source
- IDEA-003
- PROB-006

### Actor
- 管理者（`admin` ロール）
- レビュアー（`reviewer` ロール、設計次第）
- 公開対象の閲覧者（`guest` / `user` / `reviewer` / `admin`）

### Intent
承認された投稿を公開状態に遷移させ、設定された公開範囲（`private/internal/public`）に応じて閲覧者を制御したい。

### Candidate Requirement
`approved` の投稿は **管理者（admin ロール）のみ** の操作で `published` に遷移する。reviewer は approve まで実施できるが、publish は admin の専権操作とする（PROB-005 / RC-011 の admin 行と整合、GOAL-04 の説明責任を担保）。`published` 投稿は viewer のロールと visibility の組合せで取得可否を判定する：
- `private`: 投稿者本人と admin のみ閲覧可
- `internal`: ログイン済（`guest` 以外）の全ユーザが閲覧可
- `public`: ログイン不要で全員閲覧可

取得制御は loader / server function 側で強制し、UI の出し分けには依存しない。

### Acceptance Criteria Draft
- Given admin が approved の proposal を保有する
  When publish server function を呼ぶ
  Then status が `published` に遷移し、AuditLog に `actor / role=admin / action=publish / before=approved / after=published / timestamp` が append される（RC-012）
- Given reviewer が approved の proposal を保有する
  When publish server function を呼ぶ
  Then 403 を返し、status は `approved` のまま遷移しない（admin 専権）
- Given user / guest / auditor が publish server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返す
- visibility × viewer ロールの取得可否マトリクスは RC-009 で網羅（本 RC では「published 遷移」と「取得制御は server function 側」の事実のみ AC 化）

### Ambiguities
- approved → published の遷移を「approve と同時」にするか「明示的な公開操作」を別途持たせるかは Phase 2 で確定（AMB-009）。本 RC では別操作を前提に AC を起草。
- 依拠する暫定回答: Q-007（internal はログインユーザ全員）。

### Scope
In:
- approved → published への遷移
- visibility と viewer ロールに基づく取得制御（loader / server function）

Out:
- 公開時の通知（メール等、非ゴール）
- 検索エンジン向けメタデータ最適化（MVP 非対象）

### Priority
Must

### Status
candidate

---

## RC-005: 公開範囲の変更（縮小 / 拡大）

### Source
- IDEA-003
- PROB-006

### Actor
- 管理者（`admin` ロール）

### Intent
管理者は公開済 / レビュー中の投稿について、必要に応じて公開範囲を縮小（例: public → internal）または拡大（例: internal → public）したい。

### Candidate Requirement
管理者は visibility を変更できる。
**縮小方向**（public → internal、internal → private）は管理者単独で可能。**業務ルール（明示）**: 縮小方向も判断理由テキスト必須かつ AuditLog 記録対象とする（GOAL-04 の説明責任と整合）。
**拡大方向**（private → internal、internal → public）は判断理由必須かつ AuditLog に記録する。MVP では投稿者の同意（再確認）は **必須としない暫定方針**を採用するが、投稿者保護の観点から要再確認（Q-010 / AMB-002 / AMB-014）。

### Acceptance Criteria Draft
- **縮小方向（先行起草可能、Q-010 非依存）**:
  - Given admin が public または internal の published proposal を保有する
    When visibility 変更 server function を `internal` または `private` で呼び reason を添える
    Then 新 visibility に切り替わり、AuditLog に `actor / role=admin / action=visibility_shrink / before / after / reason / timestamp` が append される（RC-012）
  - Given admin が縮小方向の visibility 変更 server function を reason 空で呼ぶ
    When server function が検証する
    Then 4xx を返し visibility は変わらない、AuditLog にも記録しない
  - Given reviewer / user / guest / auditor が visibility 変更 server function を呼ぶ
    When 認可ヘルパーが通過する
    Then 403 を返す（admin 専権）
- **拡大方向（Q-010 確定後に追記、現時点では暫定 AC のみ）**:
  - 暫定 AC: 上記 admin 単独 + reason 必須 + AuditLog 記録に加えて、Q-010 確定後に「投稿者同意の取得・記録 AC」を追記する。同意必須となった場合の AC は本 RC が `candidate` に昇格するタイミングで起草する。

### Ambiguities
- 拡大時の投稿者同意の要否は Q-010 (proposed-by-claude / リスクの高い暫定) に依存。Phase 1 内で人間の承認が必要。
- 通知手段（PROB-006 Constraints）は MVP では未定。
- 依拠する暫定回答: Q-010（拡大は管理者単独 + AuditLog）。

### Scope
In:
- 縮小方向の visibility 変更
- 拡大方向の visibility 変更（判断理由必須、AuditLog 記録）

Out:
- 投稿者へのメール通知（非ゴール）
- 投稿者の事前同意取得 UI（暫定では MVP 対象外、Q-010 結果次第）

### Priority
Should

### Status
needs-clarification

---

## RC-006: 公開済み投稿の取り下げ（published → withdrawn）

### Source
- IDEA-002
- PROB-001

### Actor
- 管理者（`admin` ロール）
- （将来）投稿者本人

### Intent
管理者は公開済の投稿を必要に応じて取り下げ、公開停止状態にしたい。ただし「公開していた事実」は監査目的で保持したい。

### Candidate Requirement
`published` の投稿を `withdrawn` に遷移させる。withdrawn 後は本文を一般閲覧者から非表示にするが、AuditLog には「公開していた期間」「取り下げ理由」「actor / role / timestamp」が append-only で残る。
**業務ルール（明示）**: 取り下げ操作は **判断理由（reason）必須** とする（RC-003 のレビュー判定と同水準）。

### Acceptance Criteria Draft
- Given admin が published の proposal を保有する
  When 取り下げ server function を呼び reason を添える
  Then status が `withdrawn` に遷移し、AuditLog に `actor / role=admin / action=withdraw / before=published / after=withdrawn / reason / timestamp` が append される。AuditLog から `(published_at, withdrawn_at)` のペアが抽出可能であること（公開していた期間が観測可能）
- Given admin が published の proposal を保有する
  When 取り下げ server function を reason 空で呼ぶ
  Then 4xx を返し status は遷移しない
- Given guest / user（投稿者本人を含む） / auditor が withdrawn の proposal の本文取得 loader を呼ぶ
  When loader が認可ヘルパーを通過する
  Then 一般閲覧経路では 404 または 403（本文非表示の観測）。AuditLog 経路（auditor / admin）では引き続き「withdrawn の事実 + 公開期間」が見えること
- Given approved（未公開）の proposal が存在
  When 取り下げ server function を呼ぶ
  Then 4xx を返す（withdrawn は published 経由のみ。approved → withdrawn のパスは MVP では認めない）

### Ambiguities
- 投稿者本人による取り下げを許すか / 許す場合の条件は Phase 2 で確定（AMB-010）。
- 「物理削除」は MVP では行わない（データ削除申請は非ゴール）。
- 依拠する暫定回答: Q-003（公開記録を残す / 本文非表示 + AuditLog 保持）。

### Scope
In:
- published → withdrawn への遷移
- withdrawn 後の本文非表示
- AuditLog への「公開していた事実」の残存

Out:
- 物理削除（非ゴール）
- 投稿者によるセルフ取り下げ（MVP 検討、決定次第）

### Priority
Should

### Status
candidate

---

## RC-007: 差し戻し後の再提出（returned → submitted）

### Source
- IDEA-002

### Actor
- 一般ユーザ（投稿者本人）

### Intent
差し戻された投稿を再編集し、同一の投稿として再提出したい。

### Candidate Requirement
`returned` の投稿は投稿者本人が再編集でき、再提出操作で `submitted` に遷移する（同じ proposal id を維持）。
差し戻し回数は AuditLog から追跡可能とする。
**業務ルール（注記）**: 再提出時の倫理ガード再確認 / PolicyAgreement 再取得の要否は Q-018 (open) に依存。確定までは「再取得しない（初回提出時の同意を継続適用）」を暫定方針とし、確定後に AC を補強する。

### Acceptance Criteria Draft
- Given user ロールの投稿者本人が returned の自身の proposal を保有する
  When 本文を編集し再提出 server function を呼ぶ
  Then status が `submitted` に遷移し、proposal id は変化しない（同一 id 維持の観測）。AuditLog に `actor / role=user / action=resubmit / before=returned / after=submitted / timestamp` が append される
- Given returned の proposal に対し AuditLog を `target=proposal_id` で絞り込む
  When 過去の遷移を集計する
  Then `action=return` のエントリ数 = 差し戻し回数として観測可能であること（IDEA-005 / RC-012 と整合）
- Given 投稿者本人ではない user / reviewer / admin / guest / auditor が再提出 server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返す（再提出は投稿者本人の専権）
- 倫理ガード再確認の AC（Q-018 確定後に追記）

### Ambiguities
- 差し戻し回数の上限を設けるかは Phase 2 で確定。
- 倫理ガード再確認の要否は Q-018 (open) に依存。
- 依拠する暫定回答: Q-011（同じ proposal id で再提出）。

### Scope
In:
- returned 状態での投稿者本人による再編集
- returned → submitted への遷移（同一 id）
- AuditLog への再提出記録

Out:
- 新規 id の払い出し（暫定では行わない）

### Priority
Should

### Status
candidate

---

## RC-008: 自分の投稿一覧・ステータス確認

### Source
- IDEA-001

### Actor
- 一般ユーザ（投稿者本人）

### Intent
投稿者は自分の投稿の現在のステータス（draft / submitted / in_review / returned / approved / published / rejected / withdrawn）を一覧で確認したい。

### Candidate Requirement
ログインユーザは「自分が起票した投稿」のみを一覧画面で閲覧でき、各投稿の最新ステータスと最終更新日時を確認できる。
他ユーザの投稿はこの一覧には含めない。

### Acceptance Criteria Draft
- Given user ロールのユーザ A がログイン中で、A が起票した proposal を全 8 ステータス（draft / submitted / in_review / returned / approved / published / rejected / withdrawn）について 1 件以上保有する
  When 自分の投稿一覧 loader を呼ぶ
  Then A が起票した proposal のすべて（rejected / withdrawn を含む）が応答に含まれ、各エントリに最新 status と最終更新日時が付与されている
- Given user A がログイン中で、別ユーザ B が起票した proposal が存在する
  When A が自分の投稿一覧 loader を呼ぶ
  Then 応答に B の proposal は **1 件も含まれない**（負の AC：他ユーザ投稿混入の不在）
- Given guest が自分の投稿一覧 loader を呼ぶ
  When 認可ヘルパーが通過する
  Then 401 を返す（未ログインでは「自分」が定義不能）

### Ambiguities
- ステータス別フィルタの必要性は Phase 3 で再評価。
- 依拠する暫定回答: Q-001（モック認証下でもユーザ識別子は持つ）。

### Scope
In:
- 自分の投稿一覧（全ステータス）
- 自分の投稿の詳細閲覧（ステータスに依らず）

Out:
- 他ユーザの投稿の閲覧（公開済みは RC-009 で別経路）
- 投稿の物理削除導線（非ゴール）

### Priority
Must

### Status
candidate

---

## RC-009: 公開済み投稿の一覧・詳細閲覧

### Source
- IDEA-001
- IDEA-003

### Actor
- ゲスト（`guest` ロール、未ログイン）
- 一般ユーザ（`user` ロール）
- レビュアー（`reviewer` ロール）
- 管理者（`admin` ロール）

### Intent
公開済の投稿を、自分のロールと visibility に応じて一覧および詳細で閲覧したい。

### Candidate Requirement
`published` 投稿のうち、viewer ロールと visibility の組合せで閲覧可能なものを一覧・詳細表示する：
- `public`: guest 含め全員
- `internal`: ログイン済（guest 以外）
- `private`: 投稿者本人と admin のみ

取得は server function / loader 側でフィルタする（UI 出し分けに依存しない）。

### Acceptance Criteria Draft
visibility × viewer ロールの 15 セルマトリクス（visibility ∈ {`private`, `internal`, `public`}, viewer ∈ {`guest`, `user(他人)`, `user(本人)`, `reviewer`, `admin`, `auditor`}; 投稿者本人とそれ以外の user を分けて 18 セル相当だが本表では 15 セルベース + `user(本人)` を別行で扱う）。「見える」= 詳細 loader が 200 を返す、「見えない」= 詳細 loader が 404 または 403 を返す。

| visibility \ viewer | guest | user(他人) | user(本人) | reviewer | admin | auditor |
| --- | --- | --- | --- | --- | --- | --- |
| `private`   | 見えない (401) | 見えない (404) | 見える | Q-016 依存（注記参照） | 見える | Q-016 依存（注記参照） |
| `internal`  | 見えない (401) | 見える | 見える | 見える | 見える | 見える |
| `public`    | 見える | 見える | 見える | 見える | 見える | 見える |

- 上表の各「見えない」セルについて、loader が 401 / 403 / 404 のいずれを返すかは Phase 3 の認可ヘルパー設計時に統一する（暫定: 未ログインは 401、ログイン済の権限不足は 404 で存在自体を隠す）。
- 一覧 loader についても上表に準拠。一覧結果には「呼び出し元 viewer から見える」proposal のみが含まれる（未承認 / draft / submitted / in_review / returned / rejected は published 経路の対象外）。
- private 投稿の reviewer 閲覧可否、auditor の本文到達可否は Q-016 (open) に依存。確定までは「reviewer は見えない (404)」「auditor は AuditLog のメタ情報のみ閲覧、本文は到達不可」を暫定方針とする。

### Ambiguities
- ページネーション・並び順の規約は Phase 3 で確定。
- 検索機能は MVP 対象外とする想定（要確認）。
- private 投稿の reviewer / auditor 閲覧可否は Q-016 (open) に依存。
- 依拠する暫定回答: Q-007（internal はログインユーザ全員）。

### Scope
In:
- 公開済投稿の一覧（visibility と viewer ロールでフィルタ）
- 公開済投稿の詳細閲覧

Out:
- フリーテキスト検索（MVP 非対象想定）
- コメント機能（非ゴール）

### Priority
Must

### Status
candidate

---

## RC-010: レビュー待ち一覧（reviewer / admin 向け）

### Source
- IDEA-002

### Actor
- レビュアー（`reviewer` ロール）
- 管理者（`admin` ロール）

### Intent
レビュアー・管理者はレビューが必要な投稿（`submitted` / `in_review`）を一覧で把握したい。

### Candidate Requirement
`reviewer` または `admin` は `submitted` および `in_review` の投稿を横断的に一覧できる。
取得制御は server function 側でロールを検証する。

### Acceptance Criteria Draft
- Given reviewer / admin がログイン中で、submitted / in_review の proposal が visibility 種別 (`private` / `internal` / `public`) ごとに存在する
  When レビュー待ち一覧 loader を呼ぶ
  Then 結果に submitted と in_review の双方が含まれ、admin に対しては全 visibility が含まれる。reviewer に対しては Q-016 確定までの暫定として `private` のみ除外（見えない）、`internal` / `public` は含まれる
- Given user / guest / auditor がレビュー待ち一覧 loader を呼ぶ
  When 認可ヘルパーが通過する
  Then 403（user / auditor）または 401（guest）を返す
- Given reviewer / admin がレビュー待ち一覧を呼ぶ
  When draft / approved / published / returned / rejected / withdrawn の proposal が存在する
  Then それらは結果に含まれない（submitted と in_review に限定の観測）

### Ambiguities
- フィルタ条件（カテゴリ・経過時間 など）の有無は Phase 3 で確定。
- 並び順（提出順 / 経過時間順）の既定は Phase 2 で確定。
- private 投稿の reviewer 閲覧可否は Q-016 (open) に依存（一覧側にも影響）。

### Scope
In:
- submitted / in_review の横断一覧
- 詳細画面への遷移

Out:
- レビュアー間チャット（非ゴール）
- レビュー担当の自動割当（MVP 非対象）

### Priority
Must

### Status
candidate

---

## RC-011: 役割と権限分離（5 ロール）

### Source
- IDEA-004
- PROB-005

### Actor
- システム全体（全アクター）

### Intent
ロール (`guest` / `user` / `reviewer` / `admin` / `auditor`) ごとに実行可能な操作を非対称に定義し、権限バイパスを構造的に防ぎたい。

### Candidate Requirement
本システムは以下の 5 ロールを持つ：
- `guest`: 未ログイン。`public` 投稿の閲覧のみ
- `user`: 自分の投稿の作成・編集・提出・再提出、自分の投稿閲覧、`public` / `internal` 投稿閲覧
- `reviewer`: `user` の能力 + レビュー操作（in_review 化、approve / return / reject、判断理由必須）
- `admin`: `reviewer` の能力 + 公開操作（published）、visibility 変更、取り下げ
- `auditor`: AuditLog の閲覧のみ（投稿の編集権限なし、レビュー権限なし）。**暫定確定**: AuditLog 全件を閲覧可（フィルタ可、Q-009 `proposed-by-claude`）。投稿本文への到達可否は Q-016 (open) に依存し、確定までは「メタ情報のみ閲覧、本文には到達不可」を暫定方針とする。

ロール判定は server function の入口で必ず行い、UI の表示制御は補助的役割に留める。

### Acceptance Criteria Draft
ロール × 主要操作の禁止セルマトリクス。「許可」のセルは別 RC（参照列）の AC で観測。「禁止」セルは server function が **401（guest 該当）または 403** を返すことを本 RC の AC とする。

| 操作 / ロール                           | guest | user(他人) | user(本人) | reviewer | admin | auditor | 許可 AC の参照 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| draft 作成 / 編集                       | 401   | 403        | 許可        | 許可     | 許可  | 403     | RC-002 |
| 提出 (draft → submitted)                | 401   | 403        | 許可        | 許可     | 許可  | 403     | RC-002 |
| in_review 化 (submitted → in_review)    | 401   | 403        | 403         | 許可     | 許可  | 403     | RC-003 |
| approve (in_review → approved)          | 401   | 403        | 403         | 許可     | 許可  | 403     | RC-003 |
| return (in_review → returned)           | 401   | 403        | 403         | 許可     | 許可  | 403     | RC-003 |
| reject (in_review → rejected)           | 401   | 403        | 403         | 許可     | 許可  | 403     | RC-003 |
| publish (approved → published)          | 401   | 403        | 403         | 403      | 許可  | 403     | RC-004 |
| visibility 変更（縮小・拡大）           | 401   | 403        | 403         | 403      | 許可  | 403     | RC-005 |
| withdraw (published → withdrawn)        | 401   | 403        | 403         | 403      | 許可  | 403     | RC-006 |
| 再提出 (returned → submitted)           | 401   | 403        | 許可        | 403      | 403   | 403     | RC-007 |
| AuditLog 閲覧                           | 401   | 403        | 403         | 403      | 許可  | 許可    | RC-013 |

- 上表のすべての「401」「403」セルについて、対応する server function 呼び出しが当該ステータスコードを返すことを E2E で網羅する（RC-018 と同期）。
- 「user(本人)」と「user(他人)」は同じ user ロールだが、リソース所有者一致判定の有無を区別するための列。所有者一致判定は認可ヘルパー側で実装する（RC-018）。
- 1 ユーザが複数ロールを兼任する場合は、最も強い権限（OR 合成）を適用する暫定方針。最終仕様は Phase 2 で確定。

### Ambiguities
- 1 ユーザが複数ロールを兼任する場合の合成ルールは Phase 2 で確定（暫定: OR 合成）。
- 投稿者本人と admin の能力境界（自分の private 投稿の admin による閲覧可否）は Phase 2 で再確認（AMB-011）。
- auditor の本文到達可否は Q-016 (open) に依存。

### Scope
In:
- 5 ロールの定義と能力範囲
- server function 入口での認可ヘルパー利用ガイドライン

Out:
- 属性ベース権限（組織・地域属性等、MVP 非対象）
- 動的なロール作成（管理画面）

### Priority
Must

### Status
candidate

---

## RC-012: 監査ログの記録（AuditLog 書き込み）

### Source
- IDEA-005
- PROB-003
- PROB-004

### Actor
- システム（記録する側）
- 結果を変える操作を行う全ロール（`user` の提出、`reviewer` の判定、`admin` の公開・取り下げ・visibility 変更）

### Intent
結果を変える操作を後から検証できるよう、監査ログに append-only で記録したい。

### Candidate Requirement
以下の操作は server function 側で AuditLog エントリを必ず生成する：
- 投稿の提出 / 再提出
- レビュー判定（in_review / approved / returned / rejected）
- 公開（published）
- 取り下げ（withdrawn）
- visibility 変更（縮小・拡大）

AuditLog エントリは `actor / role / action / target proposal id / before / after / reason / timestamp` を含む。AuditLog は append-only で書き換え・削除を禁止する（NFR で別途強制）。

### Acceptance Criteria Draft
結果を変える 6 種の操作それぞれについて、独立した AC を起草する。すべて「成功遷移時に 1 件 append される」「reason 必須の操作で reason が空のときは 4xx で遷移拒否、AuditLog にも記録しない」を必須とする。

- **(1) submit (draft → submitted)**: 提出成功時に `action=submit, before=draft, after=submitted, reason=任意（Q-019 確定まで省略可）, timestamp` を含むエントリが append される。RC-002 の AC と整合。
- **(2) review judgment (submitted/in_review → approved/returned/rejected)**: 各遷移成功時に `action=start_review|approve|return|reject, before, after, reason=必須, timestamp` を含むエントリが append される。reason 空での呼び出しは 4xx を返し、AuditLog にも記録しない。RC-003 の AC と整合。
- **(3) publish (approved → published)**: admin の公開成功時に `action=publish, before=approved, after=published, reason=任意, timestamp` を含むエントリが append される。RC-004 の AC と整合。
- **(4) visibility change (縮小・拡大)**: 成功時に `action=visibility_shrink|visibility_expand, before=visibility値, after=visibility値, reason=必須, timestamp` を含むエントリが append される。reason 空は 4xx で遷移拒否。RC-005 の AC と整合。
- **(5) withdraw (published → withdrawn)**: admin の取り下げ成功時に `action=withdraw, before=published, after=withdrawn, reason=必須, timestamp` を含むエントリが append される。reason 空は 4xx で遷移拒否。RC-006 の AC と整合。
- **(6) resubmit (returned → submitted)**: 投稿者本人の再提出成功時に `action=resubmit, before=returned, after=submitted, reason=任意, timestamp` を含むエントリが append される。RC-007 の AC と整合。
- **共通負の AC**: 上記 6 種の操作が認可エラーで失敗（401 / 403）する場合、AuditLog エントリは生成されない（失敗試行のログ要否は Phase 2 で別途検討、本 RC では「成功時のみ append」を AC とする）。
- **共通 append-only AC**: AuditLog エントリの update / delete server function を呼ぶ手段が存在しない（RC-019 で観測手段を AC 化）。

### Ambiguities
- 「reason テキストに PII が混入しないよう抑止する仕組み」は Phase 2 で別 RC 化を検討（PROB-003 Constraints / AMB-012）。
- 提出 (submit) の reason 必須要否は Q-019 (open) に依存。
- 認可失敗試行を AuditLog に記録するかは Phase 2 で確定。
- 依拠する暫定回答: なし（IDEA-005 / PROB-004 の記述に直接対応）。

### Scope
In:
- 列挙した結果変更操作の AuditLog 記録
- before / after / reason の必須項目化

Out:
- 観測のみの操作（一覧表示等）の記録（MVP 非対象）
- 物理ログローテーション（運用テーマ、Phase 2 以降で再評価）

### Priority
Must

### Status
candidate

---

## RC-013: 監査ログの閲覧（auditor / admin 向け）

### Source
- IDEA-005
- PROB-004

### Actor
- 監査担当（`auditor` ロール）
- 管理者（`admin` ロール）

### Intent
監査担当はすべての結果変更操作を事後検証できるよう、AuditLog 全体を一覧・確認したい。

### Candidate Requirement
`auditor` および `admin` は AuditLog を一覧・詳細閲覧できる。**暫定確定**: `auditor` は AuditLog 全件を一覧 / フィルタ可能（Q-009 `proposed-by-claude` を採用）。`auditor` は **読み取り専用**であり、AuditLog の改変・削除はできない（システム側でも append-only を強制、RC-019）。
取得制御は server function 側で行う。
`auditor` が AuditLog の `target proposal id` 経由で投稿本文（特に `private`）に到達できるかは Q-016 (open) に依存し、確定までは「AuditLog のメタ情報のみ閲覧、本文には到達不可」を暫定方針とする。

### Acceptance Criteria Draft
- Given auditor がログイン中で、AuditLog に複数 actor / 複数 action のエントリが存在する
  When AuditLog 一覧 loader を呼ぶ
  Then 全件が応答に含まれる（`actor / role / action / target / before / after / reason / timestamp` の必須フィールドが揃う）
- Given auditor が AuditLog 一覧 loader を `actor` / `action` / `期間` のいずれかの条件で絞り込んで呼ぶ
  When loader が応答する
  Then 条件に合致するエントリのみが返される（フィルタ機能、Q-012 確定まで暫定実装可）
- Given user / guest / reviewer が AuditLog 一覧 loader を呼ぶ
  When 認可ヘルパーが通過する
  Then 401（guest）または 403（user / reviewer）を返す
- Given auditor が AuditLog エントリの update / delete server function を呼ぶ
  When 認可ヘルパーが通過する
  Then 403 を返す（読み取り専用の観測。エントリ自体の不変性は RC-019 で別途強制）
- Given auditor が AuditLog エントリ詳細 loader を呼ぶ
  When 当該エントリが `private` 投稿に紐づく
  Then メタ情報（actor / action / target proposal id / timestamp 等）は閲覧可、投稿本文には到達できない（Q-016 暫定方針、確定後に AC を再評価）

### Ambiguities
- フィルタ条件（actor / action / 期間）の必要性は Q-012 (open) に依存。
- 保持期間と削除ポリシーは Q-006 (open) に依存。
- auditor の投稿本文到達可否は Q-016 (open) に依存。
- AuditLog エクスポートのスコープは Phase 2 で再評価（現状はスコープ外）。
- 依拠する暫定回答: Q-009（AuditLog 全体を一覧可能）。

### Scope
In:
- AuditLog 全体の一覧・詳細閲覧
- auditor の読み取り専用権限

Out:
- AuditLog エントリの編集・削除（システム禁止）
- ログのエクスポート（MVP 検討、Phase 2 で再評価）

### Priority
Must

### Status
candidate

---

## RC-014: 投稿時のプライバシー・倫理ガード

### Source
- IDEA-006
- PROB-002

### Actor
- 一般ユーザ（投稿者）

### Intent
投稿者が悪意なく個人情報・誹謗中傷を投稿しないよう、提出前に注意喚起と公開可能性を明示したい。

### Candidate Requirement
投稿フォーム（提出時）には以下を表示し、いずれも未確認では提出ボタンを有効化しない：
- 個人情報を入力しない注意喚起（チェックボックス）
- 第三者を誹謗中傷しない注意喚起（チェックボックス）
- 公開される可能性があることの明示（チェックボックス）
- 「非公開相談として扱う」選択肢の提示（visibility = `private` の選択肢）
- 公開範囲（`private` / `internal` / `public`）の選択
- プライバシーポリシー同意（PolicyAgreement の生成）

PolicyAgreement レコードはユーザ・投稿・同意時刻を紐付けて保持する。

### Acceptance Criteria Draft
- Given user ロールの投稿者本人が draft の自身の proposal を保有する
  When 倫理ガードチェックボックスのいずれかを未確認のまま提出 server function を呼ぶ
  Then 4xx を返し status は遷移しない（**server-side で検証**、UI ボタンの無効化に依存しない。RC-002 と整合）
- Given user ロールの投稿者本人が draft を保有し、3 種すべてのチェックボックスを true にし PolicyAgreement に同意して提出 server function を呼ぶ
  When 提出が成功する
  Then PolicyAgreement レコードが 1 件生成され `user_id / proposal_id / agreed_at / policy_version=（Q-008 確定後の版番号）` を保持する。version 部分は Q-008 確定までは暫定値（例: `mvp-initial`）で記録
- Given user ロールの投稿者本人が visibility = `private` を選択
  When 提出 server function を呼ぶ
  Then 提出が成功し、proposal の visibility が `private` で記録される（「非公開相談として扱う」選択肢の観測）
- Given returned から再提出する場合の倫理ガード再確認 / PolicyAgreement 再取得の AC は Q-018 確定後に追記（RC-007 と同期）

### Ambiguities
- ポリシー文のバージョン管理は Q-008 (open) に依存。
- 投稿者の入力本文に対する自動マスキングは行わない（PROB-002 Constraints）。
- returned 再提出時の再確認要否は Q-018 (open) に依存。

### Scope
In:
- 提出フォームでの倫理ガード UI
- PolicyAgreement の記録

Out:
- 自動マスキング（非ゴール）
- AI による事前リスク分類（IDEA-008、将来）

### Priority
Must

### Status
candidate

---

## RC-015: 投稿ポリシー・プライバシーポリシーの公開ページ

### Source
- IDEA-006

### Actor
- ゲスト（未ログインを含む全員）

### Intent
利用者は投稿ポリシー・プライバシーポリシーをログイン不要で閲覧したい。

### Candidate Requirement
ポリシー文書は `/policies/posting` `/policies/privacy` 等の公開ページとして提供し、ログイン不要で閲覧できる。
PolicyAgreement（RC-014）が参照する版が分かるよう、ポリシー文書はバージョン識別子を持つ（具体仕様は Q-008 と接続）。

### Acceptance Criteria Draft
- Given guest（未ログイン）が `/policies/posting` または `/policies/privacy` を呼ぶ
  When loader が認可ヘルパー（または公開ページ用バイパス）を通過する
  Then 200 を返しポリシー文書が表示される（認可ヘルパーをバイパスする「公開ページ性質」の観測）
- Given user / reviewer / admin / auditor がポリシーページを呼ぶ
  When loader が応答する
  Then 200 を返す（ロールによらず閲覧可能）
- Given ポリシーページが応答する
  When レスポンスに含まれるバージョン識別子を確認する
  Then `policy_version` が表示され、PolicyAgreement (RC-014) の `policy_version` と整合する形式である（具体形式は Q-008 確定後）

### Ambiguities
- ポリシー文書をリポジトリ内 Markdown / DB / CMS のいずれで管理するかは Phase 2-3 で確定。
- バージョニング規約は Q-008 (open) に依存。

### Scope
In:
- 投稿ポリシー・プライバシーポリシーの公開ページ
- バージョン識別子の表示

Out:
- ポリシー編集 UI（MVP 非対象、運用は手動 commit 想定）
- 多言語版（非ゴール）

### Priority
Should

### Status
candidate

---

## RC-016: 認証（モック）

### Source
- IDEA-001
- IDEA-004

### Actor
- システム全体（認証境界）

### Intent
MVP の段階では実プロバイダ統合を行わず、ロール強制と監査ログ設計の検証に集中したい。

### Candidate Requirement
MVP は **モック認証** とする：cookie + 環境変数の許可リストでユーザ識別子とロールを保持する。
`guest`（未ログイン）と `user` 以上（ログイン済）を区別する仕組みを持ち、ログインユーザは 5 ロールのいずれか 1 つ以上を保持する。
本 RC は機能要件として最小ログイン導線を定義し、合わせて NFR-候補（Workers 互換 / 将来のプロバイダ移行容易性）として RC-017 / RC-018 / RC-022 と整合させる。

### Acceptance Criteria Draft
- Given 環境変数の許可リストにユーザ識別子 `U1` とロール `reviewer` が登録されている
  When 当該識別子を表す cookie 値を持つリクエストが認証ミドルウェアを通過する
  Then `U1` のセッションが確立され、role=`reviewer` として server function に伝播する
- Given 環境変数の許可リストに登録されていない cookie 値を持つリクエスト
  When 認証ミドルウェアが検証する
  Then 401 を返す、または `guest` として扱う（最終仕様は Phase 3 で確定。本 RC では「許可リスト外は許可リスト内ロールに昇格しない」を AC とする）
- Given cookie が付与されていないリクエスト
  When 認証ミドルウェアが検証する
  Then `guest` ロールとして扱われ、`public` 投稿の閲覧と公開ページの閲覧のみ許可される
- Given cookie がモック認証で発行される
  When レスポンスヘッダを観測する
  Then Cookie 属性として `HttpOnly` / `Secure` / `SameSite=Lax 以上` が付与されている（RC-022 と同期。詳細は RC-022 で観測）

### Ambiguities
- ログイン UI の最小構成（フォーム / クエリパラメータ / ヘッダ等）は Phase 3 で確定。
- ユーザ識別子の PII 性は Q-001（モック認証）の最終形に依存（AMB-008 / RC-020 と整合）。
- 多要素認証 / SSO は非ゴール。
- 依拠する暫定回答: Q-001（モック認証）。

### Scope
In:
- cookie + 許可リストでのモックログイン
- ロール保持と server function での参照導線

Out:
- 実プロバイダ統合（OIDC / Cloudflare Access / メール+パスワード等）
- 多要素認証 / SSO（非ゴール）
- パスワードリセット導線

### Priority
Must

### Status
candidate

---

## RC-017: Workers 互換ランタイム制約（NFR 候補）

### Source
- IDEA-007
- PROB-005

### Actor
- システム全体（基盤）

### Intent
学習目的および運用前提として、Cloudflare Workers ランタイム上で動作することを保証したい。

### Candidate Requirement
server function 実装および採用ライブラリは Cloudflare Workers 互換でなければならない（Node 専用 API に依存しない）。
`nodejs_compat` 有効化の最終判断は Phase 3 のアーキテクチャ確定時（Q-014 確定後）に方針化するが、MVP の既定方針は「依存置換を優先し `nodejs_compat` には頼らない」を暫定とする。
データストアの具体選定は **本 RC からは切り離し、RC-024 で扱う**。

### Acceptance Criteria Draft
- Given 開発者が `pnpm dev`（または `wrangler dev`）を実行する
  When ローカル Workers ランタイムが起動する
  Then エラーなくサーバが立ち上がり、最低限のヘルスエンドポイントに 200 が返る
- Given CI 環境で `wrangler deploy --dry-run` を実行する
  When ビルドと互換性検証が走る
  Then 終了コード 0 で完了する（Workers 上での実行可能性が静的に検証される）
- Given CI で静的解析（`grep -R` ベースでも可）を実行する
  When `src/` 以下の import 文を検査する
  Then Node 専用 API（`node:fs` / `node:fs/promises` / `Buffer` の Node 専用形 / `crypto` の Node 版・`require('crypto')` 等）が検出されないこと（許可される `node:` import は Phase 3 で許可リスト化）
- Given Node 専用 API が必要になった
  When 依存置換と `nodejs_compat` 有効化を比較する
  Then ADR を起票し、暫定既定の「依存置換優先」を上書きする場合は理由を明示する（Q-014 確定後）

### Ambiguities
- `nodejs_compat` 有効化方針は Q-014 (open) に依存（暫定: 依存置換優先）。
- 静的解析の許可リスト形式は Phase 3 で確定。

### Scope
In:
- Workers 互換ランタイムでの動作保証
- 採用ライブラリ / 依存の Workers 互換性チェック
- `nodejs_compat` 有効化判断の規約

Out:
- データストアの具体選定（RC-024 へ切り出し）
- Node.js 専用ランタイムでのデプロイ
- Edge 以外のサーバ（VM 等）の前提

### Priority
Must

### Status
candidate

---

## RC-018: 認可は server function 側で強制すること（NFR 候補）

### Source
- IDEA-004
- PROB-005

### Actor
- システム全体（認可境界）

### Intent
UI の出し分けに依存しない認可境界を確立し、権限バイパスを構造的に防ぎたい。

### Candidate Requirement
すべての mutation 系 server function および機微取得系 loader は、入口で認可ヘルパーを通過することを必須とする。
- 認可判定は「ロール」「Visibility」「リソース所有者一致」の組合せで行う
- UI 上の出し分けはあくまで UX 補助であり、認可の本体ではない
- E2E テストで「権限のない呼び出しが 401/403 になる」ケースを必須に持つ
- **暫定確定**: `auditor` の閲覧粒度は AuditLog 全件閲覧 + フィルタ可（Q-009 `proposed-by-claude` を採用）。本 RC の認可ヘルパーは `auditor` を AuditLog 系 loader についてのみ許可する。

**「機微取得系 loader」の暫定線引き（Phase 2 で REQ 化時に再定義）**:
- `private` 投稿の取得を伴う loader 全件
- `internal` 投稿の取得を伴う loader 全件
- AuditLog の取得を伴う loader 全件（一覧 / 詳細 / フィルタ）
- `public` 投稿のみを返す公開ページ loader は対象外（認可ヘルパー or 公開バイパス）

**暫定対象集合（mutation 系 server function）**:
- 提出 (RC-002) / レビュー判定 4 操作 (RC-003: start_review / approve / return / reject) / publish (RC-004) / visibility 変更 縮小・拡大 (RC-005) / withdraw (RC-006) / 再提出 (RC-007) / AuditLog 系（参照のみだが認可境界として扱う、RC-013）

### Acceptance Criteria Draft
- Given 認可ヘルパーが単一エントリポイントとして実装されている（モジュールパスは Phase 3 で確定、暫定: `src/server/auth/authorize.ts` 等の単一モジュール）
  When 上記「暫定対象集合」に列挙された各 mutation server function のソースを静的に検査する
  Then すべてのエントリ関数が認可ヘルパーを 1 回以上呼んでいる（CI 規約：未呼出は CI failure）
- Given 上記「暫定対象集合」に列挙された各 mutation server function
  When 権限を持たない呼び出し元（401: guest / 403: 権限不足ロール）から呼ぶ E2E ケースを実行する
  Then 401 または 403 が返り、副作用（status 変更 / AuditLog 追記 / PolicyAgreement 生成）が発生していない
- Given CI で対応する E2E ケース数を計測する
  When mutation 系 server function の export 数と、認可拒否 E2E ケース数を比較する
  Then `export 数 ≦ 認可拒否 E2E ケース数` の整合 check が通る（mutation 1 件あたり最低 1 件の認可拒否ケースを義務付ける。RC-011 のロール × 操作マトリクスから派生する複数ケースが理想）
- Given 機微取得系 loader（上記暫定線引き）の各エントリ
  When 権限を持たない呼び出し元から呼ぶ E2E ケースを実行する
  Then 401 / 403 / 404 のいずれかを返す（具体方針は Phase 3 で統一）

### Ambiguities
- 認可ヘルパーの API（関数名 / 戻り値型）は Phase 3 で確定。
- 「機微取得系 loader」の最終定義は Phase 2 で REQ 化時に確定（本 RC の暫定線引きを更新）。
- auditor 閲覧粒度の確定承認待ち（Q-009 / Q-016）。

### Scope
In:
- mutation 系 server function 全件の認可ヘルパー通過
- 機微取得系 loader の認可チェック
- 認可テスト（E2E）の存在義務

Out:
- UI のみでの権限制御（禁止）

### Priority
Must

### Status
candidate

---

## RC-019: AuditLog は append-only であること（NFR 候補）

### Source
- IDEA-005
- PROB-004

### Actor
- システム全体（永続層）

### Intent
監査ログの改竄不可性を技術的に強制したい。

### Candidate Requirement
AuditLog ストアは、書き込み（append）以外の操作（更新・削除）を **アプリケーション層およびデータ層の両方で禁止**する。
- アプリ側: AuditLog ストアへの update / delete server function を実装しない
- データ側: 採用するストア（D1 / KV 等）の機能で、当該テーブル / オブジェクトに対する update / delete を制限する設計を取る（具体方法は Phase 3 で設計）

### Acceptance Criteria Draft
- Given CI で `src/` 配下を静的解析する
  When AuditLog ストアに対する update / delete に相当する server function（命名規約: `update*AuditLog` / `delete*AuditLog` / `*audit*.update*` 等の grep パターン）を検索する
  Then 0 件であること（コード規約 + grep ベース観測）
- Given コードレビューチェックリストに「AuditLog の append 以外の操作を追加していないか」が含まれている
  When PR レビュー時に該当チェックを実施する
  Then 違反がないことを確認した記録が PR テンプレートに残る（運用観測。CI に統合できれば望ましいが MVP の最低線はチェックリスト）
- Given AuditLog ストアの公開モジュール（暫定: `src/server/audit/repository.ts` 等）の export を検査する
  When export 関数のシグネチャを列挙する
  Then `append` / 読み取り (`find` / `list` / `get`) のみが存在し、`update` / `delete` は存在しない
- Given データ層強制（D1 の権限制御 / トリガ等）は Phase 3 で確定する旨の注記
  When Phase 3 のアーキテクチャ確定時に再検証する
  Then 採用ストアの機能で update / delete を制限する設計が `02-architecture.md` に記録される

### Ambiguities
- データ層強制の具体手段（D1 のトリガ / 別ストア / 別アカウント分離 等）は Phase 3 で確定。
- 保持期間と物理削除運用は Q-006 (open) に依存。
- 静的解析の grep パターン許可リストは Phase 3 で確定。

### Scope
In:
- AuditLog の append-only 強制（アプリ層）
- AuditLog の改竄不可性（データ層、設計方針）

Out:
- 一般投稿データへの append-only 制約（MVP 非対象）

### Priority
Must

### Status
candidate

---

## RC-020: ログに PII を出さないこと（NFR 候補）

### Source
- IDEA-005
- PROB-002
- PROB-004

### Actor
- システム全体（観測性境界）

### Intent
プライバシー保護のため、運用ログ（logger 出力）に投稿本文・AuditLog reason などの PII / センシティブテキストを出力しない。

### Candidate Requirement
アプリの logger は以下を出力しない：
- 投稿本文（タイトル / 本文 / カテゴリ詳細など）
- AuditLog エントリの `reason` テキスト
- ユーザ識別子のうち PII に該当するもの（メール等、認証実装次第）

代わりに ID（proposal id / audit log id / user id のうち PII でないもの）のみで十分追跡可能な構造化ログ（JSON）を採用する。

### Acceptance Criteria Draft
- Given アプリの logger ラッパが単一エントリポイントとして実装されている（暫定: `src/server/observability/logger.ts`）
  When logger の `info` / `warn` / `error` API のシグネチャ・許可フィールドリストを検査する
  Then 許可フィールド（ホワイトリスト: `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `proposal_id` / `audit_log_id` / `action` / `error_code` 等、最終リストは Phase 3 で確定）以外の任意キーを書き込もうとすると型エラー or ランタイムで除外される
- Given E2E で結果を変える 6 種の操作（RC-012 の (1)〜(6)）を実行する
  When 出力された logger 行をキャプチャする
  Then ログ文字列に投稿本文 / AuditLog reason テキスト / メールアドレスらしき文字列（正規表現で検出）が **1 件も含まれない**
- Given CI で grep ベース観測を実行する
  When `console.log` / `console.info` / `console.error` 等の生 console API の利用を `src/server/` 配下で検索する
  Then 0 件、もしくは ADR で例外が記録されていることのみ許容（生 console は logger ラッパを迂回するため禁止）
- Given 開発環境での詳細ログ出力可否は Q-015 (open) に依存
  When Q-015 確定後、本 RC の AC を「開発環境では reason テキストを `[REDACTED]` プレースホルダに置換して可」等に補強する
  Then Phase 6 入口前に AC が再評価される

### Ambiguities
- 開発環境での詳細ログ出力可否は Q-015 (open) に依存。
- ユーザ識別子の PII 性は Q-001（モック認証）の最終形に依存（AMB-008）。
- 許可フィールドリストの最終確定は Phase 3。

### Scope
In:
- 構造化ログ（JSON）の採用
- PII を出さないロギング規約

Out:
- ログ集約基盤の選定（MVP 非対象）

### Priority
Must

### Status
candidate

---

## RC-021: レビュー所要時間 SLA（NFR 候補、保留）

### Source
- IDEA-002
- PROB-001

### Actor
- レビュアー、管理者、投稿者

### Intent
レビューが滞留しない運用にするため、SLA（例: submitted から N 日以内にレビュー）を NFR として持ちたい。

### Candidate Requirement
（数値未確定）submitted から完了（approved / returned / rejected）までの所要時間に SLA を設ける。
MVP では数値定義を保留し、指標として収集できるよう設計のみ行う（KPI として観測）。

### Acceptance Criteria Draft
**数値非依存で先行起草可能な部分のみ起草。SLA 数値は Q-004 確定後に追記。**

- Given AuditLog が RC-012 に従って append されている
  When AuditLog から `target=proposal_id` で絞り込み `action=submit` の最も古い timestamp と `action ∈ {approve, return, reject}` の最も古い timestamp を抽出する
  Then `(submitted_at, decision_at)` のペアが取得可能で、`decision_at - submitted_at` を所要時間として算出できる（観測ポイントが各遷移時に timestamp として記録されている観測）
- Given 所要時間の集計クエリ（暫定: AuditLog から導出可能）
  When レビュアー / 管理者が KPI 観測を行う
  Then 各 proposal の所要時間が ms 単位で算出できる（数値 SLA との比較は Q-004 確定後）
- **SLA 数値部分の AC（保留）**: Q-004 確定後に「`decision_at - submitted_at < N 日（営業日 / 24x7 の定義含む）` を P95 で満たす」等の形で追記する。

### Status の補足（判断リミット）
本 RC は `needs-clarification`。Q-004 が **Phase 2 入口** までに `answered` にならない場合は、Phase 2 入口で本 RC を **`deferred` に倒す**ことを暫定方針とする（観測ポイント部分のみ MVP IN として残し、SLA 数値要件は将来拡張に切り出す）。`deferred` への昇格は人間の確認のうえ実施する。

### Ambiguities
- SLA 数値（日数 / 営業日 / 24x7）の定義は Q-004 (open) に依存。
- 違反時の通知先・対応手順も未定。

### Scope
In:
- 所要時間の観測ポイント定義（AuditLog からの導出）
- 所要時間の指標化（KPI 観測前提）

Out:
- SLA 違反時の自動エスカレーション（MVP 非対象）
- SLA 数値の正式定義（Q-004 確定まで）

### Priority
Could

### Status
needs-clarification

---

## RC-022: セキュリティ NFR（Cookie 属性 / CSRF / XSS / CSP）

### Source
- PROB-005
- IDEA-004

### Actor
- システム全体（セキュリティ境界）

### Intent
モック認証下でも、Web アプリとして最低限の Cookie / CSRF / XSS / CSP 対策を備え、PROB-005（権限バイパス）と GOAL-01（公開リスクを構造的に下げる）に貢献したい。

### Candidate Requirement
- **Cookie 属性**: 認証 cookie には `HttpOnly` / `Secure`（本番 HTTPS 環境）/ `SameSite=Lax 以上` を必須とする
- **CSRF 対策**: 結果を変える server function 呼び出しに対して、最低限「Origin / Sec-Fetch-Site の検証」または「同一オリジンに紐付く CSRF トークン」のいずれかを採用する（最終手段は Phase 3 で決定）
- **XSS 対策**: `dangerouslySetInnerHTML` の利用を禁止（コード規約 + grep）。React デフォルトのエスケープに依存する。例外的に必要な場合は ADR を起票
- **CSP**: 最低限のセキュリティヘッダとして `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'` 相当を提供する（具体ヘッダ値は Phase 3 で確定）

### Acceptance Criteria Draft
- Given 認証 cookie がモック認証ミドルウェアから発行される
  When レスポンスの `Set-Cookie` ヘッダを観測する
  Then `HttpOnly` `Secure`（本番）`SameSite=Lax` 以上の属性が必ず付与されている
- Given mutation 系 server function が呼び出される
  When 異なるオリジンからの呼び出し（Origin 不一致 / Sec-Fetch-Site=cross-site）を観測する
  Then 403 を返す（CSRF 対策の最低線）
- Given CI で `src/` 配下を静的解析する
  When `dangerouslySetInnerHTML` の利用を検索する
  Then 0 件、もしくは ADR でホワイトリスト化された例外のみ許容
- Given 任意のページに HTTP リクエストを送る
  When レスポンスヘッダを観測する
  Then `Content-Security-Policy` ヘッダが設定されており、`default-src 'self'` および `script-src 'self'` を最低限含む

### Ambiguities
- CSRF の具体実装（Origin 検証 vs CSRF トークン）は Phase 3 で確定。
- CSP の最終ヘッダ値は Phase 3 で確定。
- モック認証の cookie が発行される具体機構は RC-016 と同期。

### Scope
In:
- Cookie 属性 / CSRF / XSS / CSP の MVP 最低線

Out:
- HSTS / Subresource Integrity / Permissions-Policy の細部（Phase 3 で再評価）
- WAF / DDoS 対策（Cloudflare 標準機能に委任）

### Priority
Must

### Status
candidate

---

## RC-023: 可観測性 NFR（必須ログフィールド / 集約先 / 保持期間）

### Source
- GOAL-02
- PROB-004

### Actor
- システム全体（観測性境界）
- 運用担当・auditor

### Intent
障害解析と監査の両立のため、最低限の構造化ログフィールドを定義し、PII を含めない範囲で運用に必要な観測値を統一する。

### Candidate Requirement
- **必須フィールド（ホワイトリスト）**: `timestamp` / `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash`（PII でない hash 値）/ `403_reason`（権限拒否の事由コード）。最終リストは Phase 3 で確定
- **PII の除外**: 投稿本文 / AuditLog reason テキスト / メールアドレス等は出力対象外（RC-020 と整合）
- **集約先**: MVP の最低線として `wrangler tail` を採用。長期保存先（Logpush / R2 / 外部 SaaS）は Phase 3 以降で評価
- **保持期間**: Q-006 (open) に依存。確定までは「`wrangler tail` のリアルタイム閲覧のみ」を暫定とする

### Acceptance Criteria Draft
- Given logger ラッパが単一エントリポイントとして実装されている（RC-020 と共通）
  When 任意の server function 呼び出しが完了する
  Then logger に少なくとも `timestamp / request_id / route / method / status / latency_ms` が含まれる構造化ログ（JSON）が 1 行出力される
- Given 認可ヘルパーが 403 / 401 を返す
  When logger に対応する行が出力される
  Then `403_reason` フィールドに事由コード（例: `not_owner` / `insufficient_role` / `not_authenticated`）が含まれる
- Given E2E でログ出力をキャプチャする
  When ログ行を JSON パースする
  Then 許可フィールド外のキーが含まれない（許可フィールドリストとの差集合が空）
- Given 集約先が `wrangler tail` の場合
  When 任意の操作を実行する
  Then `wrangler tail` で当該ログ行がリアルタイムに観測できる
- **保持期間 AC**: Q-006 確定後に「最終ログ出力から N 日以内は集約先で検索可能」等の形で追記。Q-006 待ちの旨を Status に注記。

### Ambiguities
- 必須フィールドの最終リストは Phase 3 で確定。
- 長期保存先の選定は Phase 3 以降。
- 保持期間は Q-006 (open) に依存（needs-clarification 注記）。

### Scope
In:
- 必須ログフィールドのホワイトリスト
- PII を含めない出力（RC-020 と同期）
- MVP の集約先（`wrangler tail`）

Out:
- 長期保存先・SaaS 連携（Phase 3 以降）
- ログ駆動アラート（MVP 非対象）

### Priority
Must（必須フィールド・PII 除外）/ Should（集約先・保持期間部分）

### Status
candidate

> 注記: 保持期間部分の AC は Q-006 (open) に依存し、確定までは「`wrangler tail` のリアルタイム閲覧のみ」を暫定とする。Q-006 確定後に保持期間 AC を追記する。

---

## RC-024: データストア選定（MVP モック → D1 移行視野）

### Source
- IDEA-007
- GOAL-05

### Actor
- システム全体（永続層）

### Intent
MVP のデータストアを最小コストで立ち上げつつ、Cloudflare Workers 互換を維持し、将来の D1 移行を阻害しないようにしたい。

### Candidate Requirement
- MVP 初期はインメモリ / モック（プロセス内永続なし or JSON ファイル等）で開始する
- 採用するすべてのデータストアは Cloudflare Workers 互換（RC-017 と同期）
- D1 への移行は Phase 末で実施することを視野に入れた抽象化を行う（具体抽象化方針は Phase 3 で確定）
- 移行タイミング・採用 SKU は Q-005 (open) / Q-014 (open) に依存

### Acceptance Criteria Draft

> Q-005 (D1 採用時期) / Q-014 (`nodejs_compat` 方針) 非依存で先行起草できる部分のみ起草。
> 採用ストア固有の AC（D1 マイグレーション、KV TTL 等）は Q-005 / Q-014 確定後に追記する。

**(1) repository インターフェイスの単一エントリポイント観測 [Q-005/Q-014 非依存・MVP 必須]**
- Given: アプリケーションコード（`src/server/**`）から永続層への直接呼び出しが行われない設計とする
- When: CI で `grep -rE "(D1Database|KVNamespace|fetch.*\.r2\.)" src/server/ --exclude-dir=repositories` を実行
- Then: `src/server/repositories/**` 以外で永続層 API への直接呼び出しがマッチしないこと（exit code = 1 → CI fail とする）
- 補足: repository インターフェイス（`ProposalRepository` / `AuditLogRepository` / `PolicyAgreementRepository` 等）は型レベルで `src/server/repositories/index.ts` に集約され、上位レイヤは抽象型のみを import する

**(2) Workers 互換スモーク [Q-005/Q-014 非依存・MVP 必須]**
- Given: MVP 初期のインメモリ実装が選択されている
- When: `wrangler dev` または同等のローカル Workers ランタイムで起動
- Then: 起動後 30 秒以内に `/healthz` (もしくは公開トップ) が 200 を返すこと（RC-017 の `wrangler dev` AC と同期して観測）
- 補足: インメモリ実装は Workers ランタイムの制約（グローバル変数の永続性が保証されない、Module Worker の独立性）を踏まえて、リクエスト境界で状態が初期化されることを許容する MVP 最小実装で良い

**(3) 実装差し替え可能性 [Q-005/Q-014 非依存・MVP 必須]**
- Given: テストコードから repository を差し替える経路が `src/server/repositories/index.ts` の factory 関数または DI コンテナ（実装方針は Phase 3）に集約されている
- When: 単体テストで「インメモリ実装 → スタブ実装」に差し替えて結果変更系 server function を呼び出す
- Then: server function 側のコードを 1 行も変更せずにテストが通ること（observable: テスト緑）
- 補足: D1 への移行時にも同じ factory 経由で D1 実装を差し込めば移行が完結することを保証する観測

**(4) 採用ストア固有の AC [Q-005 / Q-014 確定後に追記]**
- Q-005 が D1 採用 + Phase 3 で確定 → migration スクリプトのスモーク AC、prepared statement 経由の SQL injection 耐性 AC
- Q-014 が「依存置換優先」確定 → `nodejs_compat = false` でビルド成功する AC
- Q-014 が「`nodejs_compat` 有効化許容」確定 → `wrangler.jsonc` の `compatibility_flags` に `nodejs_compat` が含まれること、その理由 ADR の存在

### Ambiguities
- D1 採用時期は Q-005 (open) に依存。
- `nodejs_compat` 方針は Q-014 (open) に依存（RC-017 と同期）。
- AuditLog ストアを D1 / KV のどちらに置くかは Phase 3 で確定（RC-019 と同期）。

### Scope
In:
- MVP 初期のインメモリ / モック実装
- D1 への移行を視野に入れた抽象化
- Workers 互換性の維持

Out:
- 非 Workers 互換のストア（VM 上の RDBMS への直接接続等）
- 物理ログローテーション運用（Phase 2 以降で再評価）

### Priority
Must

### Status
needs-clarification

## 参照

- 上流: `docs/00-discovery/01-idea-notes.md` / `02-problem-statement.md`
- 下流: `docs/02-requirements/02-functional-requirements.md` の `REQ-XXX`
