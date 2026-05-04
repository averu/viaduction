---
id: BD-NFR
title: 非機能要件
status: draft
owners: []
refs:
  upstream: [NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007]
  downstream: []
updated: 2026-05-04
---

# 非機能要件 (NFR)

要件定義の `NFR-XXX` をここに整理し、設計レベルでの達成手段を明記する。本ドキュメントは要件側 (`docs/02-requirements/03-non-functional-requirements.md`) の **要約 + 設計上の責任所在** を示し、数値や AC の正本は要件側を維持する。

## 横断 NFR の MVP 非ゴール（明示）

> 第 1 回 / 第 2 回 `/review-requirements` の結論として、本プロジェクトは学習プロジェクトであり GOAL-05 / GOAL-06 が「設計と実装パターンの習得」を主目的としている。この前提で、以下を MVP の **非ゴール** として明示する（`docs/00-discovery/06-goals.md` 「横断 NFR の MVP 非ゴール」を引用）。

| 観点 | MVP 非ゴールの内容 | 将来扱う場合の起票先 |
| --- | --- | --- |
| 性能 NFR | P95 応答時間 / SSR コールドスタート時間 / loader レイテンシなどの **数値目標** を MVP では設定しない。Workers Edge ランタイムのデフォルト性能で充足とみなす | 運用フェーズで再評価。必要なら新規 `NFR-XXX (deferred → candidate)` として起票 |
| 可用性 NFR | 自前 SLO（uptime % 目標、5xx 率）を MVP では設定しない。Cloudflare Workers のプラットフォーム提供 SLA に依存。`/healthz` の設計は推奨するが NFR の合格基準には含めない | 同上 |
| アクセシビリティ NFR | WCAG 2.1 AA 等への明示的準拠を MVP の合格基準に含めない。ただし shadcn/ui のデフォルト ARIA 属性 / キーボード操作を **積極的に外さない** ことを設計時の慣習として採用 | 同上 |

> 上記 3 観点は本ドキュメントで数値要件を立てない。各「非ゴール」を「ゴールに格上げ」する場合は `docs/00-discovery/06-goals.md` のビジネスゴール表に行を追加し、対応する `RC-XXX` を Phase 1 から再起票する（要件管理プロセスを飛ばさない）。

## NFR-002 - Workers 互換ランタイム制約

| 項目 | 内容 |
| --- | --- |
| カテゴリ | 運用 / 基盤 |
| 設計上の責任所在 | `docs/10-basic-design/02-architecture.md` (BD-ARCH) の「ランタイム前提」「Cloudflare Vite plugin の順序」「`wrangler.jsonc` の設計」「`nodejs_compat` の使用判断」 |
| 達成手段 | server function 実装と採用ライブラリを Workers 互換に限定。Node 専用 API（`node:fs` / `Buffer` の Node 専用形 / `crypto` の Node 版）に依存しない。`nodejs_compat` の使用は ADR を起票 (Q-014 確定後) |
| 影響範囲 | アーキテクチャ全体、依存ライブラリ選定、CI 静的解析 |
| 計測方法 | `pnpm dev` / `wrangler dev` 起動成功、`wrangler deploy --dry-run` 終了コード 0、CI 静的解析 grep |
| MVP 既定方針 | **依存置換を優先し `nodejs_compat` には頼らない**（NFR-002 暫定） |
| 数値要件 | なし（本観点は質的要件） |
| 参照 | NFR-002, REQ-015, GOAL-05 |

## NFR-003 - 認可は server function 側で強制すること

| 項目 | 内容 |
| --- | --- |
| カテゴリ | セキュリティ / 認可境界 |
| 設計上の責任所在 | 単一モジュール `src/server/auth/authorize.ts`。BD-ARCH「ランタイム境界とディレクトリ構成」「単一エントリポイントの強制」を参照 |
| 達成手段 | mutation 系 server function および機微取得系 loader はすべて入口で認可ヘルパーを 1 回だけ通過。CI grep でヘルパー外のロール判定が 0 件であることを強制（BR-AUTHZ-03） |
| 影響範囲 | 全 mutation 系 server function（API-002 〜 API-009、API-019）、機微取得系 loader（API-011, API-012, API-013, API-014, API-015, API-016, API-017、および `private` / `internal` / AuditLog を扱う loader 全件） |
| 計測方法 | E2E テストで「権限のない呼び出しが 401（未ログイン）/ 404（認可違反、暫定統一）」を全件確認。`mutation 系 export 数 ≦ 認可拒否 E2E ケース数` を CI で検査 |
| ステータスコード暫定統一 | 未ログイン `401` / 認可違反 `404`（REQ-008 / REQ-009 / REQ-012 と同期）。Phase 3 / 4 で `403` を選ぶ場合は同時更新 |
| 数値要件 | CI grep が 0 件、E2E カバレッジが mutation 系 export 数以上 |
| 参照 | NFR-003, REQ-002〜015, GOAL-03, BR-AUTHZ-01〜03 |

### UC-013（認可境界）との対応

UC-013 は本 NFR の観測可能な振る舞いとして定義される。すべての mutation 系 server function および機微取得系 loader は UC-013 経由で認可ヘルパーを通過し、拒否時は副作用なし（BR-AUDIT-03）。

## NFR-004 - AuditLog は append-only であること

| 項目 | 内容 |
| --- | --- |
| カテゴリ | セキュリティ / 監査 |
| 設計上の責任所在 | `src/server/audit/repository.ts`（アプリ層強制）+ Phase 3 末でデータ層強制（D1 トリガ / 別アカウント分離 等、Q-005 確定後）|
| 達成手段 | アプリ層: AuditLog repository の export を `append` / `find` / `list` / `get` のみに制限し、`update` / `delete` を export しない。データ層: 採用ストア機能で update / delete を制限する設計を `02-architecture.md` に追記 |
| 影響範囲 | DB-004 (audit_logs)、API-002 〜 API-009 の AuditLog 書き込み呼び出し、Phase 3 のデータストア確定 |
| 計測方法 | CI grep で `update*AuditLog` / `delete*AuditLog` パターンが 0 件、AuditLog repository 公開モジュールの export を列挙して `update` / `delete` が無いことを確認 |
| MVP 最低線 | アプリ層強制（grep + コード規約 + repository export 制約）。データ層強制は Phase 3 のデータストア確定後に追補 |
| 数値要件 | CI grep 0 件、export に update/delete を含まない |
| 参照 | NFR-004, REQ-011, REQ-012, GOAL-02, BR-AUDIT-02 |

## NFR-005 - ログに PII を出さないこと

| 項目 | 内容 |
| --- | --- |
| カテゴリ | プライバシー / 観測性 |
| 設計上の責任所在 | 単一 logger ラッパ `src/server/observability/logger.ts`。BD-ARCH「ランタイム境界とディレクトリ構成」「単一エントリポイントの強制」を参照 |
| 達成手段 | logger ラッパが許可フィールドのホワイトリストを持ち、ホワイトリスト外のキー書き込みを型エラー or ランタイム除外。`src/server/` 配下で `console.log` 等の生 console API を 0 件にする（CI grep） |
| 許可フィールド（ホワイトリスト、暫定） | `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `proposal_id` / `audit_log_id` / `action` / `error_code` / `403_reason`。最終確定は Phase 3 / 4 |
| 出力禁止 | 投稿本文（タイトル / 本文 / カテゴリ詳細）/ AuditLog reason テキスト / メールアドレス等のユーザ識別子（PII 該当のもの）|
| 計測方法 | E2E で結果を変える 6 種の操作実行時に投稿本文 / reason / メールアドレス正規表現が 1 件も含まれないことを確認。CI grep で `console.log` / `console.info` / `console.error` 等が 0 件 |
| 開発環境での詳細ログ | Q-015 に依存。確定後に「開発環境では reason を `[REDACTED]` プレースホルダで可」等を補強 |
| 数値要件 | E2E 検出 0 件、CI grep 0 件 |
| 参照 | NFR-005, REQ-011, REQ-012, REQ-015, NFR-007, GOAL-01, GOAL-02 |

## NFR-006 - セキュリティ NFR (Cookie / CSRF / XSS / CSP)

| 項目 | 内容 |
| --- | --- |
| カテゴリ | セキュリティ |
| 設計上の責任所在 | 認証ミドルウェア (`src/server/auth/session.ts`)、route の応答ヘッダ設定、UI 側の `dangerouslySetInnerHTML` 使用ガード |
| **Cookie 属性** | 認証 cookie には `HttpOnly` / `Secure`（本番）/ `SameSite=Lax 以上`。development 環境は `Secure` 不要 |
| **CSRF 対策（暫定）** | `SameSite=Lax` cookie + Origin / Sec-Fetch-Site 検証。CSRF トークン併用は Phase 3 で確定（BD-ARCH「検討中の選択肢」） |
| **XSS 対策** | `dangerouslySetInnerHTML` の利用を禁止（CI grep 0 件、例外は ADR）。React のデフォルトエスケープに依存し、ユーザ入力はテンプレートリテラル / プロパティとしてのみ流す |
| **CSP** | `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'` 相当。最終ヘッダ値は Phase 3 で確定 |
| 計測方法 | レスポンスヘッダ検査（Cookie / CSP）、cross-origin mutation が `403` を返す E2E、CI grep |
| 数値要件 | CI grep 0 件、E2E ですべての要件を満たす |
| 参照 | NFR-006, REQ-015, NFR-003, GOAL-01 |

> 注記（CSRF と Cookie SameSite=Lax のトレードオフ）: `SameSite=Lax` cookie の場合、cross-site mutation はそもそも cookie がブラウザから送られないため、サーバ側の認証検証で先に弾かれる（401 相当）。本 NFR の「CSRF 対策の最低線」は Origin / Sec-Fetch-Site 検証とし、CSRF トークン方式の採用是非は Phase 3 で再評価する（NFR-006 と整合）。

## NFR-007 - 可観測性 NFR (必須ログフィールド / 集約先 / 保持期間)

| 項目 | 内容 |
| --- | --- |
| カテゴリ | 運用 / 観測性 |
| 設計上の責任所在 | logger ラッパ (`src/server/observability/logger.ts`、NFR-005 と共通)。BD-ARCH「監視」セクション参照 |
| **必須フィールド（暫定ホワイトリスト）** | `timestamp` / `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `403_reason` |
| **PII 除外** | NFR-005 と整合（投稿本文 / reason テキスト / メール等は出力対象外） |
| **集約先（MVP 最低線）** | `wrangler tail`。長期保存先（Logpush / R2 / 外部 SaaS）は Phase 3 以降で評価 |
| **保持期間** | Q-006 (open) に依存。確定までは「`wrangler tail` のリアルタイム閲覧のみ」を暫定（保持期間部分は Phase 2 入口で `deferred` 切り出し可） |
| **403_reason の取りうる値（暫定）** | `not_owner` / `insufficient_role` / `not_authenticated`（最終リストは Phase 3 で確定） |
| 計測方法 | E2E で任意の server function 呼び出し完了時に必須フィールドを含む JSON 1 行が出力されることを確認。`wrangler tail` でリアルタイム観測 |
| 数値要件 | 必須フィールドを含む構造化ログが 100% 出力 |
| 参照 | NFR-007, REQ-011, REQ-012, REQ-015, NFR-003, NFR-005, GOAL-01, GOAL-02 |

## エラーコードの境界（M-12 再掲）

`docs/10-basic-design/04-api-list.md §エラー方針` の暫定統一を再掲。次の境界を **設計レビューと CI で常に確認** する：

| 状況 | HTTP | アプリコード | 境界の判定基準 |
| --- | --- | --- | --- |
| 入力検証エラー（必須項目欠落 / 形式不正 / **reason 必須操作で reason 空** / 倫理ガード未確認） | **400** | `VALIDATION_ERROR` | server function 入口の Zod / Valibot スキーマ検証で reject されるもの |
| 未ログイン | **401** | `UNAUTHENTICATED` | cookie 不在 or 許可リスト外（暫定挙動） |
| ログイン済の権限不足（ロール不足 / 他人の本人専用リソース / 公開バイパス対象外で `withdrawn` を要求 等） | **404** | `NOT_FOUND` | 暫定統一: 認可違反は存在隠蔽のため `404`。logger には `403_reason` を必ず記録 |
| 競合（楽観ロック失敗、同時担当化） | **409** | `CONFLICT` | `lock_version` 不整合 |
| **ビジネスルール違反（状態遷移違反、approved 以外からの publish、in_review 以外からの approve / return / reject 等）** | **422** | `BUSINESS_RULE_VIOLATION` | server-side で「現在の status から要求 action への遷移が許可されていない」と判定されるもの |
| サーバ内部エラー | 500 | `INTERNAL_ERROR` | 想定外例外 |

> 境界の取り違え禁止例:
> - reason 空 → これは **入力検証エラー = 400**（422 ではない）。reason は server function 入口でスキーマ検証する
> - approved 以外からの publish → これは **ビジネスルール違反 = 422**（400 ではない）。リクエスト形式は正しいがドメイン状態が許容しないため
> - 認可違反 → これは **暫定統一 404**（403 ではない）。logger 側で `403_reason` を必ず記録する二段構造（B-1）

## NFR 横断的な観測手段の概要

| 観点 | 観測手段 | Phase 4 で詳細化 |
| --- | --- | --- |
| 認可境界 (NFR-003) | E2E（`mutation 系 export 数 ≦ 認可拒否 E2E ケース数`）、CI grep（ヘルパー外のロール判定 0 件） | E2E ケース一覧 (Phase 5 で TASK 化) |
| AuditLog append-only (NFR-004) | CI grep（`update*AuditLog` / `delete*AuditLog` パターン 0 件）、export 関数列挙 | データ層強制の具体手段（Q-005 確定後） |
| ログ PII 除外 (NFR-005) | logger ホワイトリスト型、CI grep（生 console 0 件）、E2E（PII 正規表現 0 件） | 開発環境のログ運用ルール (Q-015 確定後) |
| Cookie / CSRF / XSS / CSP (NFR-006) | レスポンスヘッダ検査、cross-origin E2E、CI grep | 具体ヘッダ値、CSRF トークン採用是非 |
| 可観測性 (NFR-007) | E2E（必須フィールド検証）、`wrangler tail` リアルタイム観測 | 長期保存先、保持期間 (Q-006 確定後) |

## 参照

- 上流: `docs/02-requirements/03-non-functional-requirements.md` の NFR-002〜NFR-007、`docs/00-discovery/06-goals.md`「横断 NFR の MVP 非ゴール」、`docs/00-discovery/07-open-questions.md` の Q-005 / Q-006 / Q-014 / Q-015
- 下流: 本ドキュメントは BD-ARCH / BD-APIS / BD-DATA に横断的に適用される。詳細設計の API / DB / 画面ドキュメント、および Phase 5 の TASK 分解で個別の検証手段に展開される
