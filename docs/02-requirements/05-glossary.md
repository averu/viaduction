---
id: GLOSSARY
title: 用語集
status: draft
owners: []
updated: 2026-05-04
---

# 用語集

このプロジェクトで使う用語の **唯一の定義先**。設計ドキュメント・コード・テストはこの定義に従う。
新しい概念を導入したら、まずここに追加してから本文で使う。

## 表記規約

- 用語は和名を主、英名を括弧で。例: `ユーザ (user)`。
- 略語は大文字。例: `SLA` (Service Level Agreement)。
- 同義語が複数あれば代表名を 1 つ決め、他は注記する。

## ドメイン用語

### 提案 (proposal)
- 定義: 一般市民（投稿者）が起票する地域や組織への提案・報告・申請の単位。本システムにおける主要エンティティ。
- 補足: ステータス遷移を持ち、ライフサイクル全体で同一 `proposal_id` を維持する（再提出時も同一 id）。
- 関連 REQ: REQ-002, REQ-006

### ステータス (status)
- 定義: 提案 (proposal) のライフサイクル上の状態。
- 取りうる値: `draft` / `submitted` / `in_review` / `approved` / `returned` / `rejected` / `published` / `withdrawn` の 8 種。
  - `draft`: 投稿者が起票・編集中
  - `submitted`: 投稿者が提出済み、レビュー待ち
  - `in_review`: reviewer / admin が担当中
  - `approved`: レビューで承認済み、公開待ち
  - `returned`: レビューで差し戻し、投稿者の再編集を待つ
  - `rejected`: レビューで却下、再提出不可
  - `published`: 公開済み
  - `withdrawn`: 公開済みから取り下げ済み（本文非表示、AuditLog には記録残存）
- 関連 REQ: REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007

### 公開範囲 (visibility)
- 定義: 提案 (proposal) の公開対象範囲。
- 取りうる値: `private` / `internal` / `public` の 3 種。
  - `private`: 投稿者本人と admin のみ閲覧可
  - `internal`: ログイン済（`guest` 以外）の全ユーザが閲覧可
  - `public`: ログイン不要で全員閲覧可
- 補足: 取得制御は server function 側で強制し、UI 出し分けには依存しない（NFR-003）。
- 関連 REQ: REQ-004, REQ-008, REQ-013

### ロール (role)
- 定義: ログインユーザの権限を表す識別子。1 ユーザは複数ロールを兼任可能（暫定: OR 合成）。
- 取りうる値: `guest` / `user` / `reviewer` / `admin` / `auditor` の 5 種。
- 関連 REQ: REQ-010, REQ-015

### ゲスト (guest)
- 定義: 未ログインユーザ。`public` 投稿および公開ページの閲覧のみ可。
- 関連 REQ: REQ-010, REQ-014, REQ-015

### 投稿者 (user / submitter / poster)
- 定義: ログイン済の一般ユーザ。自分の投稿の作成・編集・提出・再提出、自分の投稿閲覧、`public` / `internal` 投稿閲覧が可能。
- 補足: 「user(本人)」と「user(他人)」は同じ user ロールだが、リソース所有者一致判定の有無を区別するための列（REQ-010 のマトリクス）。
- 関連 REQ: REQ-002, REQ-006, REQ-007, REQ-010

### レビュアー (reviewer)
- 定義: `user` の能力 + レビュー操作（`in_review` 化、`approve` / `return` / `reject`、判断理由必須）が可能なロール。
- 関連 REQ: REQ-003, REQ-009, REQ-010

### 管理者 (admin)
- 定義: `reviewer` の能力 + 公開操作（`publish`）、visibility 変更、取り下げ（`withdraw`）が可能なロール。
- 関連 REQ: REQ-004, REQ-005, REQ-010

### 監査担当 (auditor)
- 定義: AuditLog の閲覧のみ可能なロール（読み取り専用）。投稿の編集権限・レビュー権限を持たない。
- 補足: AuditLog 全件を一覧 / フィルタ可（Q-009 暫定）。投稿本文への到達可否は Q-016 暫定方針として「メタ情報のみ閲覧、本文には到達不可」。
- 関連 REQ: REQ-010, REQ-012

### AuditLog
- 定義: 結果を変える操作を append-only で記録する監査ログ。エントリは `actor / role / action / target / before / after / reason / timestamp` のフィールドを持つ。
- 補足: 改竄不可性をアプリ層およびデータ層の両方で強制する（NFR-004）。
- 関連 REQ: REQ-011, REQ-012
- 関連 NFR: NFR-004

### append-only
- 定義: 書き込み（append）以外の操作（更新・削除）を禁止する永続化方針。
- 補足: 本プロジェクトでは AuditLog のストアに対して、アプリ層（update / delete server function を実装しない）とデータ層（採用ストアの機能で update / delete を制限）の両方で強制する。
- 関連 NFR: NFR-004

### reason（判断理由テキスト）
- 定義: 結果を変える操作の判断理由を記録するテキストフィールド。AuditLog エントリの一部。
- 補足: 操作ごとに必須要否が異なる：
  - 必須: レビュー判定 (`start_review` / `approve` / `return` / `reject`) / visibility 変更 / withdraw
  - 任意（暫定）: submit（Q-019 確定まで）/ publish / resubmit
- PII を書かない運用ガイドラインを併設する（システム強制は AMB-012 で別途検討）。
- 関連 REQ: REQ-003, REQ-005, REQ-011

### PolicyAgreement
- 定義: 投稿提出時にユーザがプライバシーポリシーに同意したことを記録するレコード。
- 必須フィールド: `user_id / proposal_id / agreed_at / policy_version`
- 補足: `policy_version` の形式は Q-008 確定後に確定（暫定値: `mvp-initial`）。再提出時は新規生成しない暫定方針（Q-018 確定後に再評価）。
- 関連 REQ: REQ-013, REQ-014

### 結果を変える操作
- 定義: 提案 (proposal) のステータスまたは公開範囲 (visibility) を変更する操作の総称。AuditLog 記録対象。
- 含まれる操作（6 種）: submit / レビュー判定 (`start_review` / `approve` / `return` / `reject`) / publish / visibility 変更 / withdraw / resubmit
- 補足: 観測のみの操作（一覧表示、詳細閲覧、ログイン）は含まない。詳細は `04-business-rules.md` の `BR-PROPOSAL-01` を参照。
- 関連 REQ: REQ-011

### mutation 系 server function
- 定義: 副作用（DB 書き込み / status 遷移 / AuditLog 追記 / PolicyAgreement 生成）を伴う server function。
- 補足: すべての mutation 系 server function は入口で認可ヘルパー（NFR-003）を通過することを必須とする。暫定対象集合は提出 / レビュー判定 4 操作 / publish / visibility 変更 / withdraw / 再提出 / AuditLog 系。
- 関連 NFR: NFR-003

### 機微取得系 loader
- 定義: 認可判定を必要とする取得経路の loader。MVP 暫定線引きは以下：
  - `private` 投稿の取得を伴う loader 全件
  - `internal` 投稿の取得を伴う loader 全件
  - AuditLog の取得を伴う loader 全件（一覧 / 詳細 / フィルタ）
- 補足: `public` 投稿のみを返す公開ページ loader は対象外（認可ヘルパー or 公開バイパス）。最終定義は Phase 2 で REQ 化時に確定。
- 関連 NFR: NFR-003

### 認可ヘルパー
- 定義: 認可判定を行う単一エントリポイント関数。「ロール」「Visibility」「リソース所有者一致」の組合せで判定する。
- 補足: 単一モジュール（暫定: `src/server/auth/authorize.ts`）に集約し、上記以外でロール判定を直接書かない（CI grep で 0 件を強制）。
- 関連 NFR: NFR-003
- 関連 BR: `BR-AUTHZ-03`

### モック認証
- 定義: MVP 段階の認証方式。cookie + 環境変数の許可リストでユーザ識別子とロールを保持する。実プロバイダ統合（OIDC / Cloudflare Access 等）は MVP 範囲外。
- 関連 REQ: REQ-015

### 許可リスト
- 定義: モック認証で「どの cookie 値がどのユーザ識別子・ロールに対応するか」を環境変数で保持するリスト。
- 補足: 許可リスト外の cookie は許可リスト内ロールに昇格しない（401 を返す、または `guest` として扱う）。
- 関連 REQ: REQ-015

### 必須ログフィールド (許可フィールドホワイトリスト)
- 定義: 構造化ログ（JSON）に出力可能なフィールドのホワイトリスト。
- 暫定リスト: `timestamp` / `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `proposal_id` / `audit_log_id` / `action` / `error_code` / `403_reason`（最終リストは Phase 3 で確定）
- 補足: ホワイトリスト外の任意キー書き込みは型エラー or ランタイムで除外される。
- 関連 NFR: NFR-005, NFR-007

### user_id_hash
- 定義: ログ出力用に PII を伏せたユーザ識別子の一方向 hash 値。
- 補足: cookie 内のユーザ識別子は不透明 ID として PII 非該当だが、将来メールアドレス等を採用する場合の保険として hash 値を logger に出力する規約。
- 関連 NFR: NFR-005, NFR-007
- 関連 REQ: REQ-015

### 403_reason
- 定義: 認可ヘルパーが 401 / 403 を返す際にログに記録する事由コード。
- 取りうる値の例: `not_owner` / `insufficient_role` / `not_authenticated`（最終リストは Phase 3 で確定）
- 関連 NFR: NFR-007

## PII（個人情報）リスト

ログ・メッセージ・スクリーンショット等に **乗せてはいけない** フィールドの一覧。

| カテゴリ | フィールド例 |
| --- | --- |
| 識別子 | メールアドレス、電話番号、住所、生年月日 |
| 認証情報 | パスワード、トークン、API キー、リカバリコード |
| 機微情報 | 健康情報、宗教、政治信条 |
| 投稿コンテンツ | 投稿本文（タイトル / 本文 / カテゴリ詳細）、AuditLog エントリの `reason` テキスト |

このリストは要件によって拡張する。`30-coding-style.md` の「ログ」セクションが参照する。
本プロジェクトでは特に投稿本文と AuditLog reason を logger に出さないことを NFR-005 で強制する。

## 参照

このファイルは要件の補助。上流参照は持たない。
AMB-015（用語集未登録の概念が複数 RC で利用）の解消対象として、Phase 2 入口で集中追記した（2026-05-04）。
