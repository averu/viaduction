---
id: REQ-NON-FUNCTIONAL
title: 非機能要件
status: draft
owners: []
updated: 2026-05-04
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
> ### Provisional Decisions
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

### Provisional Decisions
- (なし)

### Status
approved

> 注記: NFR-001 は本ハーネス導入時のサンプル要件。本プロジェクト（まちの提案・申請レビューアプリ）の非機能要件は NFR-002 以降に定義する。

---

## NFR-002: Workers 互換ランタイム制約

### Category
運用 / 基盤

### Target Value
server function 実装および採用ライブラリは Cloudflare Workers 互換でなければならない。Node 専用 API（`node:fs` / `node:fs/promises` / `Buffer` の Node 専用形 / `crypto` の Node 版・`require('crypto')` 等）にはアプリケーションコードから直接依存しない。`compatibility_flags` には `nodejs_compat` を **常時有効** とする（Q-014 確定: 2026-05-05）。理由は `@tanstack/router-core` が `node:stream` / `node:stream/web` を直接 import しており、TanStack Start v1 + `@cloudflare/vite-plugin` の組み合わせでは依存置換が技術的に不可能なため。アプリケーション層では引き続き Node 専用 API を直接使わない方針を保つ。

### Measurement
- ローカル: `pnpm dev` または `wrangler dev` でエラーなくサーバが起動し、ヘルスエンドポイントが 200 を返す
- CI: `wrangler deploy --dry-run` が終了コード 0 で完了する
- CI 静的解析: `src/` 以下の import 文に Node 専用 API が含まれていない（grep ベース、許可リストは Phase 3 で確定）

### Rationale
- GOAL-05（学習目的：TanStack Start + Cloudflare Workers のフルスタック構成を経験する）と整合。
- IDEA-007 のアーキテクチャ採用を運用前提として技術的に強制する。
- 早期に Workers 上で動作させることで、デプロイ前に互換性問題を検知する。

### Acceptance Criteria
- Given 開発者が `pnpm dev`（または `wrangler dev`）を実行する
  When ローカル Workers ランタイムが起動する
  Then エラーなくサーバが立ち上がり、最低限のヘルスエンドポイントに 200 が返る
- Given CI 環境で `wrangler deploy --dry-run` を実行する
  When ビルドと互換性検証が走る
  Then 終了コード 0 で完了する
- Given CI で静的解析（`grep -R` ベースでも可）を実行する
  When `src/` 以下の import 文を検査する
  Then Node 専用 API が検出されないこと（許可される `node:` import は Phase 3 で許可リスト化）
- Given アプリケーションコード（`src/server/**` および `src/**` のうちアプリ層）が Node 専用 API に直接依存している
  When CI 静的解析でその import を検出する
  Then 失敗扱いとし、Workers 互換 API（`crypto.subtle` / Web Streams 等）への置換または ADR 起票による例外承認を要求する
- Given `wrangler.jsonc` の `compatibility_flags` を確認する
  When 設定値を読む
  Then `nodejs_compat` が含まれていること（TanStack Start v1 + `@cloudflare/vite-plugin` 採用継続中の必須条件）

### Related Items
- RC-017
- REQ-015（モック認証も Workers 互換である必要）
- 関連 GOAL: GOAL-05
- IDEA-007
- PROB-005

### Provisional Decisions
- Q-014: `nodejs_compat` 有効化方針 → **確定（2026-05-05）: 常時有効**。`@tanstack/router-core` が `node:stream` を直接 import するため依存置換不可、`@cloudflare/vite-plugin` v1.35 の dev サーバ起動条件としても必須。アプリケーション層は引き続き Workers 互換 API のみを使う方針を維持する。
- 静的解析の許可リスト形式（Phase 3 で確定）

### Status
approved

---

## NFR-003: 認可は server function 側で強制すること

### Category
セキュリティ / 認可境界

### Target Value
すべての mutation 系 server function および機微取得系 loader は、入口で単一の認可ヘルパーを通過する。認可判定は「ロール」「Visibility」「リソース所有者一致」の組合せで行う。UI 出し分けは UX 補助のみで認可の本体ではない。E2E テストで「権限のない呼び出しが 401/403/404 になる」ケースを必須に持つ。

### Measurement
- CI 静的解析（grep）: `src/server/auth/authorize.ts`（Phase 3 で確定する単一モジュール）以外で `(role\s*===\s*['\"]|hasRole|canAccess|isAdmin|isReviewer|isAuditor)` パターンがマッチしない（exit code = 1 → CI fail）
- CI 静的解析: 暫定対象集合の各 mutation server function のソースに認可ヘルパー呼び出しが 1 回以上存在
- E2E: mutation 系 server function の export 数 ≦ 認可拒否 E2E ケース数

### Rationale
- PROB-005（権限バイパス）と GOAL-03（5 ロールを server function 側で強制する設計）に対応する中核 NFR。
- UI 制御だけに依存すると `fetch` 直叩きで権限昇格が起きる。

### Acceptance Criteria
- Given 認可ヘルパーが単一エントリポイントとして実装されている（モジュールパスは Phase 3 で確定、暫定: `src/server/auth/authorize.ts`）
  When 暫定対象集合（提出 / レビュー判定 4 操作 / publish / visibility 変更 / withdraw / 再提出 / AuditLog 系 loader）に列挙された各 mutation server function のソースを静的に検査する
  Then すべてのエントリ関数が認可ヘルパーを 1 回以上呼んでいる（CI 規約：未呼出は CI failure）
- Given 上記「暫定対象集合」に列挙された各 mutation server function
  When 権限を持たない呼び出し元（401: guest / 403: 権限不足ロール）から呼ぶ E2E ケースを実行する
  Then 401 または 403 が返り、副作用（status 変更 / AuditLog 追記 / PolicyAgreement 生成）が発生していない
- Given CI で対応する E2E ケース数を計測する
  When mutation 系 server function の export 数と、認可拒否 E2E ケース数を比較する
  Then `export 数 ≦ 認可拒否 E2E ケース数` の整合 check が通る
- Given 機微取得系 loader（暫定: `private` 投稿 / `internal` 投稿 / AuditLog 取得 loader 全件）の各エントリ
  When 権限を持たない呼び出し元から呼ぶ E2E ケースを実行する
  Then 401 / 403 / 404 のいずれかを返す（暫定統一: 未ログイン 401 / 認可違反 404、Phase 3 で 403 を選ぶ場合は同時更新）
- Given CI で `grep -rE "(role\s*===\s*['\"]|hasRole|canAccess|isAdmin|isReviewer|isAuditor)" src/server/ --exclude-dir=auth` を実行する
  When 検査が走る
  Then マッチが 0 件であること（exit code = 1 → CI fail）

### Related Items
- RC-018
- REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015
- 関連 GOAL: GOAL-03
- IDEA-004
- PROB-005

### Provisional Decisions
- 認可ヘルパーの API（関数名 / 戻り値型）（Phase 3 で確定）
- 「機微取得系 loader」の最終定義（Phase 2 で REQ 化時に確定、本要件は暫定線引き）
- Q-016: auditor 閲覧粒度（Q-009 / Q-016 確定承認待ち）

### Status
approved

---

## NFR-004: AuditLog は append-only であること

### Category
セキュリティ / 監査

### Target Value
AuditLog ストアは、書き込み（append）以外の操作（更新・削除）をアプリケーション層およびデータ層の両方で禁止する。
- アプリ側: AuditLog ストアへの update / delete server function を実装しない
- データ側: 採用ストア（D1 / KV 等）の機能で当該テーブル / オブジェクトに対する update / delete を制限する設計を取る（Phase 3 で確定）

### Measurement
- CI 静的解析（grep）: `update*AuditLog` / `delete*AuditLog` / `*audit*.update*` 等のパターンが 0 件
- コードレビュー: PR テンプレートに「AuditLog の append 以外の操作を追加していないか」のチェック項目を含む
- 公開モジュール検査: AuditLog repository（暫定: `src/server/audit/repository.ts`）の export に `update` / `delete` が存在しない
- 設計記録: 採用ストアの機能で update / delete を制限する設計が `docs/10-basic-design/02-architecture.md` に記録される（Phase 3）

### Rationale
- PROB-004（管理者操作の追跡可能性がない）の本質的解決には、AuditLog 自体の改竄不可性が必要。
- GOAL-02（AuditLog に append-only で記録し、説明責任を果たせる体制）の技術的裏付け。

### Acceptance Criteria
- Given CI で `src/` 配下を静的解析する
  When AuditLog ストアに対する update / delete に相当する server function を検索する
  Then 0 件であること
- Given コードレビューチェックリストに「AuditLog の append 以外の操作を追加していないか」が含まれている
  When PR レビュー時に該当チェックを実施する
  Then 違反がないことを確認した記録が PR テンプレートに残る
- Given AuditLog ストアの公開モジュール（暫定: `src/server/audit/repository.ts` 等）の export を検査する
  When export 関数のシグネチャを列挙する
  Then `append` / 読み取り (`find` / `list` / `get`) のみが存在し、`update` / `delete` は存在しない
- Given データ層強制は Phase 3 で確定する
  When Phase 3 のアーキテクチャ確定時に再検証する
  Then 採用ストアの機能で update / delete を制限する設計が `02-architecture.md` に記録される

> MVP 最低線とデータ層強制のトレードオフ: 採用ストアに依存しないアプリ層強制（grep + コード規約 + repository export 制約）が MVP の最低線。データ層強制（D1 トリガ / 別アカウント分離 等）は Phase 3 のデータストア確定後に追補する。

### Related Items
- RC-019
- REQ-011, REQ-012
- 関連 GOAL: GOAL-02
- IDEA-005
- PROB-004

### Provisional Decisions
- データ層強制の具体手段（D1 のトリガ / 別ストア / 別アカウント分離 等）（Phase 3 で確定）
- Q-006: 保持期間と物理削除運用
- 静的解析の grep パターン許可リスト（Phase 3 で確定）

### Status
approved

---

## NFR-005: ログに PII を出さないこと

### Category
プライバシー / 観測性

### Target Value
アプリの logger は以下を出力しない：
- 投稿本文（タイトル / 本文 / カテゴリ詳細など）
- AuditLog エントリの `reason` テキスト
- ユーザ識別子のうち PII に該当するもの（メール等、認証実装次第）

代わりに ID（proposal id / audit log id / user id のうち PII でないもの）のみで十分追跡可能な構造化ログ（JSON）を採用する。

### Measurement
- 単一 logger ラッパ（暫定: `src/server/observability/logger.ts`）の API シグネチャに許可フィールドのホワイトリストが定義されている
- E2E: 結果を変える 6 種の操作実行時の logger 出力に投稿本文 / AuditLog reason テキスト / メールアドレスらしき文字列（正規表現）が 1 件も含まれない
- CI 静的解析（grep）: `src/server/` 配下に `console.log` / `console.info` / `console.error` 等の生 console API 利用が 0 件（または ADR 例外のみ）

### Rationale
- PROB-002 / PROB-004 / GOAL-01（公開リスクを構造的に下げる）/ GOAL-02（説明責任）に対応するプライバシー保護の基盤。
- ログ漏洩時の二次被害を抑止する。

### Acceptance Criteria
- Given アプリの logger ラッパが単一エントリポイントとして実装されている（暫定: `src/server/observability/logger.ts`）
  When logger の `info` / `warn` / `error` API のシグネチャ・許可フィールドリストを検査する
  Then 許可フィールド（ホワイトリスト: `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `proposal_id` / `audit_log_id` / `action` / `error_code` 等、最終リストは Phase 3 で確定）以外の任意キーを書き込もうとすると型エラー or ランタイムで除外される
- Given E2E で結果を変える 6 種の操作（REQ-011 の (1)〜(6)）を実行する
  When 出力された logger 行をキャプチャする
  Then ログ文字列に投稿本文 / AuditLog reason テキスト / メールアドレスらしき文字列（正規表現で検出）が 1 件も含まれない
- Given CI で grep ベース観測を実行する
  When `console.log` / `console.info` / `console.error` 等の生 console API の利用を `src/server/` 配下で検索する
  Then 0 件、もしくは ADR で例外が記録されていることのみ許容
- Given 開発環境での詳細ログ出力可否は Q-015 (open) に依存
  When Q-015 確定後、本 NFR の AC を「開発環境では reason テキストを `[REDACTED]` プレースホルダに置換して可」等に補強する
  Then Phase 6 入口前に AC が再評価される

### Related Items
- RC-020
- REQ-011, REQ-012, REQ-015
- NFR-007
- 関連 GOAL: GOAL-01, GOAL-02
- IDEA-005
- PROB-002, PROB-004

### Provisional Decisions
- Q-015: 開発環境での詳細ログ出力可否
- AMB-008: ユーザ識別子の PII 性（暫定: 不透明 ID は PII 非該当、`user_id_hash` のみ出力）
- 許可フィールドリストの最終確定（Phase 3）

### Status
approved

---

## NFR-006: セキュリティ NFR（Cookie 属性 / CSRF / XSS / CSP）

### Category
セキュリティ

### Target Value
- **Cookie 属性**: 認証 cookie には `HttpOnly` / `Secure`（本番 HTTPS 環境）/ `SameSite=Lax 以上` を必須
- **CSRF 対策**: 結果を変える server function 呼び出しに対して「Origin / Sec-Fetch-Site の検証」または「同一オリジンに紐付く CSRF トークン」のいずれかを採用（最終手段は Phase 3）。MVP 暫定: `SameSite=Lax` + Origin / Sec-Fetch-Site 検証
- **XSS 対策**: `dangerouslySetInnerHTML` の利用を禁止（grep 0 件、例外は ADR）
- **CSP**: `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'` 相当（具体ヘッダ値は Phase 3）

### Measurement
- 認証ミドルウェアの `Set-Cookie` ヘッダに必須属性が付与されていることをレスポンス検査
- mutation 系 server function に対し cross-origin 呼び出し（Origin 不一致 / Sec-Fetch-Site=cross-site）が 403
- CI grep: `dangerouslySetInnerHTML` の利用が 0 件（または ADR ホワイトリスト）
- 任意ページのレスポンスヘッダに `Content-Security-Policy` が含まれ、`default-src 'self'` および `script-src 'self'` を最低限含む

### Rationale
- モック認証下でも、Web アプリとして最低限の Cookie / CSRF / XSS / CSP 対策を備え、PROB-005（権限バイパス）と GOAL-01（公開リスクを構造的に下げる）に貢献する。

### Acceptance Criteria
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

> 注記（CSRF と Cookie SameSite=Lax のトレードオフ）: `SameSite=Lax` cookie の場合、cross-site mutation はそもそも cookie がブラウザから送られないため、サーバ側の認証検証で先に弾かれる（401 相当）。本 NFR の「CSRF 対策の最低線」は Origin / Sec-Fetch-Site 検証とし、CSRF トークン方式の採用是非は Phase 3 で再評価する。

### Related Items
- RC-022
- REQ-015（モック認証 cookie の発行）
- NFR-003（mutation 系の認可境界）
- 関連 GOAL: GOAL-01
- IDEA-004
- PROB-005

### Provisional Decisions
- CSRF の具体実装（Origin 検証 vs CSRF トークン）（Phase 3 で確定）
- Cookie SameSite と CSRF 対策のいずれを最低線とするか（暫定: `SameSite=Lax` + Origin 検証）
- CSP の最終ヘッダ値（Phase 3 で確定）

### Status
approved

---

## NFR-007: 可観測性 NFR（必須ログフィールド / 集約先 / 保持期間）

### Category
運用 / 観測性

### Target Value
- **必須フィールド（ホワイトリスト）**: `timestamp` / `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash`（PII でない hash 値）/ `403_reason`（権限拒否の事由コード）。最終リストは Phase 3 で確定
- **PII 除外**: NFR-005 と整合（投稿本文 / AuditLog reason テキスト / メールアドレス等は出力対象外）
- **集約先**: MVP の最低線として `wrangler tail`。長期保存先（Logpush / R2 / 外部 SaaS）は Phase 3 以降で評価
- **保持期間**: Q-006 (open) に依存。確定までは「`wrangler tail` のリアルタイム閲覧のみ」を暫定とする（保持期間部分は Phase 2 入口で `deferred` 切り出し可）

### Measurement
- 任意の server function 呼び出し完了時に logger に必須フィールドを含む JSON 1 行が出力される
- 認可ヘルパーの 403 / 401 応答時に `403_reason` フィールドが事由コード（例: `not_owner` / `insufficient_role` / `not_authenticated`）を含む
- E2E でログ行を JSON パースした際、許可フィールドリストとの差集合が空
- `wrangler tail` で当該ログ行がリアルタイムに観測できる

### Rationale
- 障害解析と監査の両立のため、最低限の構造化ログフィールドを定義し、PII を含めない範囲で運用に必要な観測値を統一する。
- GOAL-01（公開リスクを構造的に下げる）/ GOAL-02（説明責任）/ PROB-004（追跡可能性）に対応。

### Acceptance Criteria
- Given logger ラッパが単一エントリポイントとして実装されている（NFR-005 と共通）
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

> 保持期間 AC: Q-006 確定後に「最終ログ出力から N 日以内は集約先で検索可能」等の形で追記する。

### Related Items
- RC-023
- REQ-011, REQ-012, REQ-015
- NFR-003, NFR-005
- 関連 GOAL: GOAL-01, GOAL-02
- PROB-004

### Provisional Decisions
- Q-006: AuditLog および運用ログの保持期間（保持期間部分は `deferred` 切り出し検討）
- 必須フィールドの最終リスト（Phase 3 で確定）
- 長期保存先（Logpush / R2 / 外部 SaaS）の選定（Phase 3 以降）

### Status
approved

## 参照

- 上流: `docs/01-requirement-refinement/04-requirement-classification.md`
- 下流: `docs/10-basic-design/06-non-functional.md`、各設計ドキュメント
