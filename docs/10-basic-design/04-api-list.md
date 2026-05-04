---
id: BD-APIS
title: API 一覧
status: draft
owners: []
refs:
  upstream: [UC-002, UC-003, UC-004, UC-005, UC-006, UC-007, UC-008, UC-009, UC-010, UC-011, UC-012, UC-013, UC-014, UC-015, UC-017, UC-018, REQ-008, REQ-010, REQ-014, NFR-003, NFR-004, NFR-005, NFR-007]
  downstream: []
updated: 2026-05-04
---

# API 一覧

> 注記: 本ドキュメントは TanStack Start における **server function** および **loader** の一覧を「API」として扱う。MVP では REST/JSON エンドポイントを公開するのではなく、TanStack Start の loader / server function 経由で呼び出される（mutation はクライアント側の宣言的呼び出し）。
> 既存サンプル API-001（ログイン）は AMB-001 で人間判断待ちのため温存し、本プロジェクト固有の API は API-002 から採番する。
> リクエスト / レスポンスの JSON スキーマ詳細は Phase 4（`docs/20-detail-design/apis/API-XXX.md`）に委ねる。

## API 一覧 (API-XXX)

### mutation 系 server function

**結果を変える 5 種・8 操作**（visibility 変更は RC-005 needs-clarification のため MVP 対象外）。**すべて UC-013 経由で認可ヘルパーを通過し、UC-014 経由で AuditLog を append する**。

> 内訳: (1) submit (API-002), (2) review judgment 4 操作 (API-003〜006: start_review / approve / return / reject), (3) publish (API-007), (4) withdraw (API-008), (5) resubmit (API-009)。reason 必須は review judgment 4 + withdraw、その他は任意（Q-019 暫定）。

| ID | メソッド | パス（論理名） | 概要 | 認可 | 関連 UC | 想定 DB |
| --- | --- | --- | --- | --- | --- | --- |
| API-001 | POST | /v1/auth/login (既存サンプル) | ログインしてセッショントークンを発行（本ドメインでは非適用） | public | UC-001 | DB-001 (read), DB-002 (write) |
| API-002 | server function | `submit` | draft → submitted。倫理ガード / PolicyAgreement 検証 | 投稿者本人 (`user`) | UC-002, UC-013, UC-014, UC-016 | DB-003 (write), DB-005 (write), DB-004 (append) |
| API-003 | server function | `startReview` | submitted → in_review。reason 必須 | reviewer / admin | UC-003, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-004 | server function | `approve` | in_review → approved。reason 必須 | reviewer / admin | UC-004, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-005 | server function | `returnProposal` | in_review → returned。reason 必須 | reviewer / admin | UC-005, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-006 | server function | `reject` | in_review → rejected。reason 必須 | reviewer / admin | UC-006, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-007 | server function | `publish` | approved → published。admin 専権 | admin | UC-007, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-008 | server function | `withdraw` | published → withdrawn。admin 専権、reason 必須 | admin | UC-008, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-009 | server function | `resubmit` | returned → submitted。投稿者本人のみ | 投稿者本人 (`user`) | UC-009, UC-013, UC-014 | DB-003 (write), DB-004 (append) |
| API-019 | server function | `login` (mock) | cookie + 許可リストでセッション確立 | **公開バイパス**（公開ページ性質、認証ミドルウェアの入口。UC-013 認可境界の対象外） | UC-018 | DB-006 (read) |
| API-020 | server function | `logout` | セッション cookie 破棄 | ログイン済 (`user` 以上) | UC-018 | — |

> 注記:
> - `change_visibility`（visibility 変更）は BR-PROPOSAL-01 では「結果を変える操作」の 1 種に含まれるが、対応する RC-005 が `needs-clarification` のため本 MVP の API 一覧に含めない。RC-005 が `refined` → REQ 化された時点で API 採番し、AuditLog `action` を 6 種・10 操作へ拡張する。

### loader 系 (TanStack Start route loader)

| ID | メソッド | パス（route） | 概要 | 認可 | 関連 UC | 想定 DB |
| --- | --- | --- | --- | --- | --- | --- |
| API-010 | loader | `/` | 公開投稿一覧（visibility × viewer マトリクスでフィルタ） | **同一 API で viewer 判定**（API 分割しない、暫定）。guest → 200（`public` のみ）、user/reviewer/admin/auditor → 200（`public` + `internal`） | UC-011, UC-013 | DB-003 (read) |
| API-011 | loader | `/proposals/$id` | 公開投稿詳細（visibility × viewer マトリクス） | viewer ロール依存（機微取得系）。guest → `public` のみ 200 / `internal` `private` `withdrawn` は **401**、user/reviewer/auditor → 該当外 visibility は **404**、admin → 全 visibility 200（`withdrawn` も 404、本文は loader 側でフィルタ） | UC-011, UC-013 | DB-003 (read) |
| API-012 | loader | `/me/proposals` | 自分の投稿一覧（全 8 ステータス） | ログイン済 (`user` 以上)、自身分のみ。guest → 401、ログイン済は server-side フィルタで自身分のみ返却 | UC-010, UC-013 | DB-003 (read) |
| API-013 | loader | `/me/proposals/$id` | 自分の投稿詳細 | 投稿者本人のみ。guest → 401、本人以外（他 user / reviewer / admin / auditor）→ 404、`withdrawn` の自身投稿も 404（REQ-005 AC との整合） | UC-009, UC-010, UC-013 | DB-003 (read) |
| API-014 | loader | `/review/inbox` | レビュー待ち一覧（submitted / in_review） | reviewer / admin → 200（reviewer は `private` 除外、Q-016 暫定）、guest → 401、user / auditor → 404 | UC-012, UC-013 | DB-003 (read) |
| API-015 | loader | `/review/$id` | レビュー詳細（reviewer 視点） | reviewer / admin → 200、guest → 401、user / auditor → 404 | UC-003, UC-004, UC-005, UC-006, UC-013 | DB-003 (read), DB-004 (read) |
| API-016 | loader | `/audit` | 監査ログ一覧（フィルタ: actor / action / 期間） | auditor / admin → 200、guest → 401、user / reviewer → 404 | UC-015, UC-013 | DB-004 (read) |
| API-017 | loader | `/audit/$id` | 監査ログ詳細（メタのみ、auditor は本文不到達） | auditor / admin → 200（メタのみ）、guest → 401、user / reviewer → 404。target proposal 本文へのリンクは admin のみ可、auditor は 404（Q-016 暫定） | UC-015, UC-013 | DB-004 (read), DB-003 (read, admin only) |
| API-018 | loader | `/policies/{posting,privacy}` | ポリシー文書取得（公開ページ） | **公開バイパス**（公開ページ性質、UC-013 認可境界の対象外）。全ロール 200 | UC-017 | — |

## 共通方針

### 認可

すべての mutation 系 server function および機微取得系 loader は、入口で **単一の認可ヘルパー** (`src/server/auth/authorize.ts`、NFR-003 / BR-AUTHZ-03) を通過することを必須とする。認可は次の 3 軸の組合せで判定する：

1. **ロール**: `guest` / `user` / `reviewer` / `admin` / `auditor`（REQ-010）
2. **Visibility**: `private` / `internal` / `public`（REQ-008）
3. **リソース所有者一致**: `user(本人)` と `user(他人)` の区別

UI 出し分け（ナビゲーション / ボタン非表示）は **UX 補助** にとどまり、認可の本体ではない（`fetch` 直叩きでも同じ拒否が走ることを E2E で確認）。

#### 公開バイパス対象 API（一覧）

以下は認可ヘルパーをバイパスする「公開ページ性質」の API（UC-013 認可境界の対象外）:

| API | 種別 | 公開バイパスの理由 | 備考 |
| --- | --- | --- | --- |
| API-018 | loader | ポリシー文書取得（REQ-014）。全ロール 200 | guest を含む全アクター |
| API-019 | server function | ログイン入口（REQ-015）。認証ミドルウェアがその場で role を確立 | UC-018、UC-013 の対象外（境界そのもの） |
| API-010 (guest 経路) | loader | 公開投稿一覧の guest viewer 判定パス（REQ-008） | **同一 API-010 で viewer 判定**（API 分割しない、暫定）。`if (viewer === 'guest') filter = visibility=public; else filter = visibility in [public, internal]` の単純分岐で対応 |

公開バイパス以外のすべての loader / server function は認可ヘルパー必須。

##### API-010 の viewer 判定方式（暫定確定）

- **方式**: 同一 API-010 で viewer 判定（API 分割しない）
- **理由**: routing をシンプルに保つため。公開バイパスは authenticate ミドルウェアの行為で、loader 内の単純分岐で十分に表現可能
- **挙動**:
  - `viewer === 'guest'` → `filter = visibility = public`（cookie なしでも 200）
  - `viewer in {'user','reviewer','admin','auditor'}` → `filter = visibility in [public, internal]`（admin は加えて自身が author の `private` を含めても可、ただし MVP では一覧では除外し詳細 API-011 で扱う）
- **再評価**: visibility 変更（RC-005）確定時に loader 分岐ロジックを見直し

### エラー方針

#### ステータスコードの暫定統一

| 状況 | HTTP | アプリコード（暫定） | 用途 |
| --- | --- | --- | --- |
| 入力検証エラー | 400 | `VALIDATION_ERROR` | 必須項目欠落、形式不正、倫理ガード未確認、reason 空（reason 必須操作） |
| 未ログイン（認証必須なのに未認証） | 401 | `UNAUTHENTICATED` | guest が認可必須エンドポイントを呼んだ |
| ログイン済の権限不足 | 404 | `NOT_FOUND` | 暫定統一: 認可違反は存在隠蔽のため `404` を返す（REQ-008 / REQ-009 / REQ-012 と同期）。Phase 3 / 4 で `403` に再評価する余地を残す |
| 競合（同時担当化など） | 409 | `CONFLICT` | 楽観ロック失敗側（UC-003、BR-REVIEW-02） |
| ビジネスルール違反 | 422 | `BUSINESS_RULE_VIOLATION` | 状態遷移違反（approved 以外からの publish、published 以外からの withdraw） |
| サーバ内部エラー | 500 | `INTERNAL_ERROR` | 想定外例外 |

> 暫定統一の根拠: REQ-008 / REQ-009 / REQ-012 が「未ログイン 401 / 認可違反 404」で揃っており、Phase 3 で 403 を選ぶ場合は同時更新する旨を明記。本 API 一覧もこれに従う。

#### 例外: 投稿者本人 vs 他人の区別

`user(他人)` が `user(本人)` 専用の操作（再提出 API-009 や 自分の投稿詳細 API-013）を呼ぶ場合も `404`（リソース存在隠蔽）を返す。403 だと「対象が存在することは漏れる」ため、暫定統一に従う。

#### 認可拒否時の挙動

- 副作用（`status` 変更 / AuditLog 追記 / PolicyAgreement 生成）は **発生させない**（NFR-003 AC、BR-AUDIT-03）
- logger には `403_reason` フィールド（`not_owner` / `insufficient_role` / `not_authenticated` / `not_owner_resource` 等の事由コード）を含む 1 行を出力（NFR-007）

##### 認可拒否時の HTTP コードと logger 事由コードの対応関係（B-1）

**HTTP は暫定統一: 未ログイン 401 / 認可違反 404**（リソース存在隠蔽優先）。一方、`logger` 側は NFR-007 AC に従い `403_reason` フィールドに事由コード（`not_owner` / `insufficient_role` / `not_authenticated` / `not_owner_resource`）を **必ず記録する**。HTTP 404 で外部に隠蔽しつつ、内部観測（grep / E2E ログキャプチャ）では事由が判別可能とする **二段構造**。

| 拒否シナリオ | HTTP | logger `403_reason` |
| --- | --- | --- |
| cookie なしで認可必須エンドポイント | 401 | `not_authenticated` |
| ログイン済だがロール不足（例: user が API-014 を呼ぶ） | 404 | `insufficient_role` |
| ログイン済だが他人のリソース（例: user が他人の draft を submit） | 404 | `not_owner` |
| ログイン済だが他人の本人専用リソース（例: 他 user が API-013 で他人の `me/proposals/$id` を呼ぶ） | 404 | `not_owner_resource` |

> 観測手段: NFR-007 の必須ログフィールド `403_reason` を grep / E2E でキャプチャすることで、HTTP 上は 404 に統一しつつ内部では認可拒否の真の事由を判別可能。`403_reason` の取りうる値の最終リストは Phase 3 末で確定。

#### レスポンスボディ

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "human-readable message (PII を含めない)",
    "details": []
  }
}
```

### バリデーション

- mutation 系 server function はリクエスト本文を **server-side で必ず検証**（UI ボタンの無効化に依存しない、BR-PROPOSAL-02 / NFR-003）
- 検証ライブラリ候補は Zod / Valibot 等。最終確定は Phase 4 入口（`02-architecture.md` の「検討中の選択肢」を参照）
- 検証失敗時は `400 VALIDATION_ERROR` を返す

### AuditLog 書き込み（UC-014 と同期）

mutation 系 server function は次のパターンで AuditLog repository (`src/server/audit/repository.ts`) の `append` メソッドを呼ぶ：

1. 認可ヘルパー通過（UC-013）
2. server-side バリデーション（reason 必須操作で reason 空なら `400` で停止、AuditLog 記録なし）
3. リポジトリで status 遷移を実行
4. 成功時のみ `AuditLog.append({ actor, role, action, target, before, after, reason, timestamp })` を呼ぶ
5. 失敗（DB 書き込みエラー / 楽観ロック競合）時は AuditLog エントリを作らない

> AuditLog 書き込みは server function の **末尾** で行う（先頭で書くと、後段の遷移失敗時にログだけ残る）。

### レート制限

- MVP では設定しない（Q-013 暫定: スパム対策・レート制限は MVP 範囲外）
- 将来 Cloudflare Turnstile / Workers Rate Limiting API の導入を検討

### バージョニング

- TanStack Start の loader / server function はパスベースのバージョニングを採用しない（route ファイル構成に従う）
- 将来公開 REST/JSON API を追加する場合は `/v1/...` 等のパスベースを採用

### CSRF 対策

- 認証 cookie は `SameSite=Lax 以上` を必須（NFR-006）
- mutation 系 server function は Origin / Sec-Fetch-Site 検証を入口で実施（cross-origin 呼び出しは認可拒否扱い、HTTP は暫定統一に従い `404`、NFR-006）
- CSRF トークン併用の是非は Phase 3 で確定（`02-architecture.md`「検討中の選択肢」）

## API ごとの詳細（概要のみ、詳細は Phase 4）

> Phase 4 の `docs/20-detail-design/apis/API-XXX.md` で OpenAPI 風スキーマ・エラーコード一覧を完全定義する。本ドキュメントは目的・主な入出力・状態遷移のみを記述する。

### API-002 `submit` (UC-002 / UC-014)
- 入力: `proposal_id`, `title`, `body`, `visibility`, `ethics_check_1..3` (boolean), `policy_agreement: true`, `reason?` (Q-019 暫定: 任意)
- 認可: 投稿者本人。draft の所有者一致を `assertOwner(user, proposal_id)` で確認
- 出力: `200 { proposal_id, status: "submitted" }` / `400` (検証失敗) / `401` (未ログイン) / `404` (他人の draft、暫定統一)
- 副作用: DB-003 status 更新 / DB-005 PolicyAgreement 初回生成 / DB-004 AuditLog append (`action=submit`)

### API-003 `startReview` (UC-003 / UC-014)
- 入力: `proposal_id`, `reason`
- 認可: reviewer / admin
- 出力: `200 / 400 (reason 空) / 401 / 404 / 409 (楽観ロック失敗)`
- 副作用: DB-003 / DB-004 append (`action=start_review`)

### API-004 `approve` (UC-004 / UC-014)
- 入力: `proposal_id`, `reason`
- 認可: reviewer / admin
- 出力: `200 / 400 / 401 / 404 / 422 (in_review 以外からの呼び出し)`
- 副作用: DB-003 / DB-004 append (`action=approve`)

### API-005 `returnProposal` (UC-005 / UC-014)
- 入力: `proposal_id`, `reason`
- 認可: reviewer / admin
- 出力: `200 / 400 / 401 / 404 / 422`
- 副作用: DB-003 / DB-004 append (`action=return`)

### API-006 `reject` (UC-006 / UC-014)
- 入力: `proposal_id`, `reason`
- 認可: reviewer / admin
- 出力: `200 / 400 / 401 / 404 / 422`
- 副作用: DB-003 / DB-004 append (`action=reject`)

### API-007 `publish` (UC-007 / UC-014)
- 入力: `proposal_id`, `reason?` (Q-019 暫定: 任意)
- 認可: admin 専権（reviewer / user / auditor → `404`、BR-PUBLISH-01、暫定統一）
- 出力: `200 / 401 / 404 / 422`（approved 以外からの publish は `422`、認可違反は `404` 暫定統一）
- 副作用: DB-003 status 更新 (`approved → published`、`published_at` を記録) / DB-004 append (`action=publish`)

### API-008 `withdraw` (UC-008 / UC-014)
- 入力: `proposal_id`, `reason`（必須、空なら `400`）
- 認可: admin 専権（reviewer / user / auditor → `404`、暫定統一）
- 出力: `200 / 400 / 401 / 404 / 422`（approved からの withdraw は `422`、認可違反は `404` 暫定統一）
- 副作用: DB-003 status 更新 (`published → withdrawn`、`withdrawn_at` を記録) / DB-004 append (`action=withdraw`)
- 付随挙動: 一般閲覧経路 (API-010 / API-011) および本人経路 (API-013) からも `404` を返すよう loader 側でフィルタ（REQ-005 AC との整合）

### API-009 `resubmit` (UC-009 / UC-014)
- 入力: `proposal_id`, `title`, `body`, `reason?` (Q-019 暫定: 任意)
- 認可: 投稿者本人のみ。`assertOwner(user, proposal_id)` 必須
- 出力: `200 / 400 / 401 / 404 / 422`
- 副作用: DB-003 status 更新 (`returned → submitted`、proposal id 不変) / DB-004 append (`action=resubmit`) / DB-005 は **再生成しない**（Q-018 暫定、初回 PolicyAgreement の継続適用）

### API-010 `list publishedProposals` (UC-011)
- 入力: ページネーション (`cursor` / `limit`、Phase 4 で確定)
- 認可: viewer ロールに依存。`public` のみのパスは公開バイパス、`internal` / `private` を含むなら認可ヘルパー必須
- 出力: `200 [{ proposal_id, title, visibility, published_at, ... }]`
- 副作用: なし（読み取り専用）
- フィルタ: visibility × viewer マトリクスを server-side で適用（REQ-008 と同期）

### API-011 `get publishedProposal` (UC-011)
- 入力: `proposal_id`
- 認可: viewer ロールと visibility のマトリクスで判定（機微取得系）
- 出力: `200 / 401 / 404`
- フィルタ条件:
  - `withdrawn` 状態は **loader 側でフィルタして 404** を返す（一般閲覧経路から本文非表示、REQ-005 AC との整合）
  - 非該当 visibility（例: guest が `internal` を要求）は `401` または `404`（暫定統一）
  - 認可違反（例: user が他人の `private` を要求）は `404`（暫定統一）

### API-012 `list myProposals` (UC-010)
- 認可: ログイン済 (`user` 以上)、自身分のみ（server-side フィルタ）
- 出力: `200 [{ proposal_id, status, updated_at, visibility, ... }]`（全 8 ステータスを含む）

### API-013 `get myProposal` (UC-009 / UC-010)
- 認可: 投稿者本人のみ（他 user / reviewer / admin / auditor → `404`、guest → `401`、暫定統一）
- 出力: `200 / 401 / 404`。`returned` の場合、直近の判定 reason を含み、SCR-006 で表示。再提出ボタンの到達点となる（UC-009 経由で API-009 を mutation 呼び出し）
- フィルタ条件:
  - **`withdrawn` の自身投稿も 404 を返す**（REQ-005 AC との整合：取り下げ後は本文を本人経路からも表示しない）。AuditLog 経路 (UC-015 / SCR-010) でのみ `(published_at, withdrawn_at)` ペアが観測可能

### API-014 `list reviewInbox` (UC-012)
- 認可: reviewer / admin → 200、guest → 401、user / auditor → 404（暫定統一）
- 出力: `submitted` と `in_review` の一覧。reviewer は `private` を server-side フィルタで除外（Q-016 暫定）

### API-015 `get reviewProposal` (UC-003〜006)
- 認可: reviewer / admin
- 出力: 投稿の本文 + 直近の AuditLog エントリ一覧

### API-016 `list auditLogs` (UC-015)
- 入力: `actor?`, `action?`, `from?`, `to?`（フィルタ）
- 認可: auditor / admin → 200、guest → 401、user / reviewer → 404（暫定統一）
- 出力: AuditLog エントリ全件（フィルタ適用後）

### API-017 `get auditLog` (UC-015)
- 認可: auditor / admin
- 出力: エントリのメタ情報（`actor / role / action / target / before / after / reason / timestamp`）。`target=proposal_id` から本文 loader への遷移は admin のみ可、auditor は `404`（Q-016 暫定、本文不到達）

### API-018 `get policyDocument` (UC-017)
- 入力: `kind` (`posting` / `privacy`)
- 認可: 公開バイパス
- 出力: ポリシー文書本文 + `policy_version`（PolicyAgreement と整合する形式、Q-008 確定後に確定、暫定値 `mvp-initial`）

### API-019 `login` (UC-018)
- 入力: `user_identifier`（不透明 ID）
- 認可: **公開バイパス**（認証ミドルウェアの入口、UC-013 認可境界の対象外）
- 処理: 環境変数の許可リストと照合。合致すれば認証 cookie を発行（`HttpOnly` / `Secure` / `SameSite=Lax` 以上、NFR-006）
- 出力: `200 / 401`（許可リスト外の暫定挙動。Phase 3 で `guest` フォールバックを選ぶ可能性あり）

### API-020 `logout` (UC-018)
- 認可: ログイン済
- 処理: 認証 cookie を破棄
- 出力: `200`

## 参照

- 上流: `docs/10-basic-design/01-system-overview.md` の UC-002〜UC-018、`docs/02-requirements/03-non-functional-requirements.md` の NFR-003 / NFR-004 / NFR-006 / NFR-007、`docs/02-requirements/04-business-rules.md` の BR-PROPOSAL-01〜03 / BR-REVIEW-01〜02 / BR-PUBLISH-01〜03 / BR-AUDIT-01〜03 / BR-AUTHZ-01〜03 / BR-GUARD-01〜02
- 下流: `docs/20-detail-design/apis/API-XXX.md`（Phase 4）、`docs/10-basic-design/05-data-model.md`
