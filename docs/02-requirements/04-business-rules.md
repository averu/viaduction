---
id: REQ-BUSINESS-RULES
title: 業務ルール
status: draft
owners: []
updated: 2026-05-04
---

# 業務ルール

要件 (`REQ-XXX`) に紐づく業務ルール・制約・例外条件をここに集約する。
業務ルールは ID を持たず、関連する `REQ-XXX` の `### Business Rules` セクションから参照される横断知識。

> 業務ルールが多岐にわたる場合は、機能カテゴリごとにサブセクションを切る。
> 例: 認証、課金、配送、コンテンツ管理 など。

## 認証関連

### BR-AUTH-01: パスワード強度
- 最小 8 文字
- 英数字混在
- 既知の漏洩パスワード（haveibeenpwned 等）に含まれない
- 関連 REQ: REQ-001

### BR-AUTH-02: 連続失敗時のロック
- 連続して 5 回認証に失敗したアカウントは 15 分間ログイン不能とする
- 関連 REQ: REQ-001
- 例外: 管理者による解除

> 業務ルールの ID 接頭辞は `BR-<カテゴリ>-NN` を推奨（自動検証の対象外、管理しやすさのため）。

## 横断ルール

### BR-COMMON-01: 個人情報の取り扱い
- 個人情報（PII）はログ・メッセージ・スクリーンショットに乗せない
- 詳細な PII リストは `05-glossary.md` を参照

## 投稿フロー関連

### BR-PROPOSAL-01: 「結果を変える操作」の定義
本プロジェクトにおける「結果を変える操作」は以下の 6 種に固定する。これらすべてが AuditLog 記録対象（REQ-011）：
1. 提出 (`submit` / draft → submitted) — REQ-002
2. レビュー判定 (`start_review` / `approve` / `return` / `reject`) — REQ-003
3. 公開 (`publish` / approved → published) — REQ-004
4. 公開範囲変更 (`visibility_shrink` / `visibility_expand`) — RC-005（needs-clarification 中）
5. 取り下げ (`withdraw` / published → withdrawn) — REQ-005
6. 再提出 (`resubmit` / returned → submitted) — REQ-006

「観測のみの操作」（一覧表示、詳細閲覧、ログイン）は本リストに含めない（MVP 非対象）。

### BR-PROPOSAL-02: 提出時のガード必須化
- 提出操作（draft → submitted）は server-side 検証で以下をすべて満たすことを必須とする：
  - 必須項目（タイトル / 本文）
  - 倫理ガードチェックボックス 3 種すべて true（個人情報注意 / 第三者誹謗中傷注意 / 公開可能性明示）
  - 公開範囲（`private` / `internal` / `public`）の選択
  - PolicyAgreement への同意
- UI ボタンの無効化のみに依存しない（NFR-003 と整合）
- 関連 REQ: REQ-002, REQ-013

### BR-PROPOSAL-03: 提出操作の AuditLog 記録
- 提出操作（draft → submitted）は AuditLog (REQ-011) の記録対象である（`action=submit, before=draft, after=submitted`）
- reason テキストの必須要否は Q-019 (open) に依存し、確定までは「省略可（任意）」を暫定方針とする
- 関連 REQ: REQ-002, REQ-011

### BR-REVIEW-01: レビュー判定の判断理由必須
- レビュー判定 4 操作（`start_review` / `approve` / `return` / `reject`）は判断理由（reason）テキスト必須
- reason 空での呼び出しは 4xx を返し、status は遷移せず、AuditLog にも記録しない
- 関連 REQ: REQ-003, REQ-011

### BR-REVIEW-02: 同時担当化の競合解決
- 同一 proposal に対し複数 reviewer が同時に in_review 化を試みた場合、楽観ロックで 1 名のみ成功（暫定方針）
- 失敗側は 409 等の競合エラーを受け取る
- 最終仕様は Phase 3 で確定
- 関連 REQ: REQ-003

### BR-PUBLISH-01: 公開操作は admin 専権
- approved → published の遷移は admin のみが publish server function により実行可能
- reviewer は approve まで実施できるが publish は不可（403）
- GOAL-04 の説明責任を担保するため
- 関連 REQ: REQ-004, REQ-010

### BR-PUBLISH-02: 公開範囲縮小の判断理由必須
- 公開範囲縮小（public → internal、internal → private）は admin 専権かつ判断理由必須
- AuditLog 記録対象（`action=visibility_shrink`）
- GOAL-04 の説明責任と整合
- 関連 REQ: RC-005（needs-clarification）, REQ-011

### BR-PUBLISH-03: 取り下げの判断理由必須
- published → withdrawn の遷移は admin 専権かつ判断理由必須
- reason 空での呼び出しは 4xx を返し status は遷移しない
- AuditLog から「公開していた期間」が観測可能であること（`(published_at, withdrawn_at)` のペア）
- 関連 REQ: REQ-005, REQ-011

### BR-RESUBMIT-01: 再提出は同一 proposal id を維持
- returned → submitted の再提出は同じ proposal id で行う
- 差し戻し回数は AuditLog（`action=return` のエントリ数）から追跡可能
- 倫理ガード再確認 / PolicyAgreement 再取得は MVP 暫定方針として「再取得しない（初回同意の継続適用）」
- Q-018 確定後に再評価する
- 関連 REQ: REQ-006, REQ-013

## 監査関連

### BR-AUDIT-01: AuditLog エントリの必須フィールド
- AuditLog エントリは以下を必ず含む：
  - `actor`（操作実行ユーザの識別子）
  - `role`（操作時のロール）
  - `action`（操作種別: `submit` / `start_review` / `approve` / `return` / `reject` / `publish` / `visibility_shrink` / `visibility_expand` / `withdraw` / `resubmit`）
  - `target`（対象 proposal id 等）
  - `before` / `after`（status または visibility の遷移前後の値）
  - `reason`（判断理由テキスト、必須要否は操作ごとに異なる）
  - `timestamp`
- 関連 REQ: REQ-011, REQ-012

### BR-AUDIT-02: AuditLog は append-only
- AuditLog は書き込み（append）以外の操作（更新・削除）をアプリケーション層およびデータ層の両方で禁止する
- アプリ側: AuditLog ストアへの update / delete server function を実装しない
- データ側: 採用ストアの機能で update / delete を制限する設計を取る（Phase 3 で確定）
- 関連 NFR: NFR-004
- 関連 REQ: REQ-011, REQ-012

### BR-AUDIT-03: 認可失敗時の記録方針
- 認可エラー（401 / 403 / 404）で失敗した呼び出しでは、AuditLog エントリは生成しない（成功時のみ append）
- 失敗試行のログ要否は Phase 2 で別途検討
- 関連 REQ: REQ-011

## 認可・ロール関連

### BR-AUTHZ-01: 5 ロールの能力差
- ロールごとの能力は以下のとおり（詳細は REQ-010 のマトリクスを参照）：
  - `guest`: `public` 投稿の閲覧のみ
  - `user`: 自分の投稿の作成・編集・提出・再提出、自分の投稿閲覧、`public` / `internal` 投稿閲覧
  - `reviewer`: `user` の能力 + レビュー操作（in_review 化、approve / return / reject）
  - `admin`: `reviewer` の能力 + 公開操作、visibility 変更、取り下げ
  - `auditor`: AuditLog の閲覧のみ（読み取り専用）
- 1 ユーザが複数ロールを兼任する場合は OR 合成（暫定方針、Phase 2 で確定）
- 関連 REQ: REQ-010

### BR-AUTHZ-02: 取得制御は server function 側で強制
- 公開済投稿の取得制御は visibility × viewer ロールのマトリクスに従い、loader / server function 側で強制する
- UI 出し分けには依存しない
- 暫定統一: 未ログイン 401 / 認可違反 404（Phase 3 で 403 を選ぶ場合は同時更新）
- 詳細は REQ-008 のマトリクスを参照
- 関連 REQ: REQ-008, REQ-009, REQ-012
- 関連 NFR: NFR-003

### BR-AUTHZ-03: 認可ヘルパーの単一実装
- 認可判定を行う関数は単一モジュール（暫定: `src/server/auth/authorize.ts`）に集約する
- 上記モジュール以外で `(role === ...)` / `hasRole` / `canAccess` / `isAdmin` 等のロール判定を直接書かない（CI grep で 0 件を強制）
- 例外は ADR を起票
- 関連 NFR: NFR-003

## ガード・ポリシー関連

### BR-GUARD-01: 倫理ガードチェックボックス
- 投稿提出時には以下の 3 種のチェックボックスを必須表示し、いずれも true でなければ提出 server function は 4xx を返す：
  - 個人情報を入力しない注意喚起
  - 第三者を誹謗中傷しない注意喚起
  - 公開される可能性があることの明示
- server-side 検証で行う（UI ボタンの無効化に依存しない）
- 関連 REQ: REQ-013, REQ-002

### BR-GUARD-02: PolicyAgreement の生成
- 提出成功時に PolicyAgreement レコードを 1 件生成し、`user_id / proposal_id / agreed_at / policy_version` を保持する
- `policy_version` の形式は Q-008 確定後に確定（暫定値: `mvp-initial`）
- 再提出時は新規生成しない（暫定方針、Q-018 確定後に再評価）
- 関連 REQ: REQ-013, REQ-014

## ステータス遷移サマリ

```
draft ──[submit]──> submitted ──[start_review]──> in_review
                                                        │
                                              ┌─────────┼─────────┐
                                              ▼         ▼         ▼
                                          approved   returned   rejected
                                              │         │
                                              │         └──[resubmit]──> submitted
                                              ▼
                                          published ──[withdraw]──> withdrawn
```

- 各遷移は対応する server function が単一の入口となる（NFR-003）
- 遷移ごとに AuditLog エントリが 1 件 append される（REQ-011）
- visibility 変更は status とは独立した遷移（published / approved / 任意の status で発生し得る）

## 参照

- 上流: `docs/02-requirements/02-functional-requirements.md`、`docs/02-requirements/03-non-functional-requirements.md`
- 下流: 各 API / 画面の詳細設計
