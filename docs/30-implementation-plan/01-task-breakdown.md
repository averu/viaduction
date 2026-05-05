---
id: PLAN-TASKS
title: 実装タスク一覧
status: draft
owners: []
updated: 2026-05-05
---

# 実装タスク一覧

詳細設計を入力に、実装可能な粒度の `TASK-XXX` を起こす。1 タスク 1〜4 時間が目安。
詳細は `.claude/skills/task-breakdown/SKILL.md` および `.claude/rules/20-design-process.md` を参照。

## 状態の凡例

| 状態 | 意味 |
| --- | --- |
| `ready` | 着手可能 |
| `in-progress` | 着手中 |
| `blocked` | 依存タスクの完了待ち / 設計差し戻し待ち |
| `done` | 完了 + テスト緑 |
| `deprecated` | 廃止（残しておくが着手しない） |

## グループ構成（採番マップ）

| グループ | 範囲 | 概要 |
| --- | --- | --- |
| A | TASK-002 〜 TASK-008 | 基盤セットアップ（プロジェクト初期化 / 横断機構） |
| B | TASK-009 〜 TASK-012 | Repository 層（インターフェイス + インメモリ実装） |
| C | TASK-013 〜 TASK-034 | API（server function / loader）。22 件、API-002〜023 と 1:1 |
| D | TASK-035 〜 TASK-046 | 画面実装。12 件、SCR-002〜013 と 1:1 |
| E | TASK-047 〜 TASK-052 | 結合テスト / E2E（NFR 観測手段の検証） |
| F | TASK-053 〜 TASK-056 | デプロイ / CI / 観測性 / 開発ドキュメント |

## タスク表

| ID | タイトル | 参照 | 出力 | 依存 | TEST | 見積 | 状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-002 | プロジェクト初期化（pnpm / TS / Vite / TanStack Start / Cloudflare plugin / Tailwind v4 / shadcn/ui） | BD-ARCH / NFR-002 | package.json / tsconfig.json / vite.config.ts / wrangler.jsonc / tailwind.config.ts / app/styles.css | (なし) | TEST-002 | 3h | ready |
| TASK-003 | ディレクトリ構成スケルトン作成 | BD-ARCH | src/{routes,components,lib,server/{auth,observability,audit,repositories,functions}} 各ディレクトリと index 雛形 | TASK-002 | TEST-003 | 1h | ready |
| TASK-004 | 共通ドメイン型定義（Visibility / Status / Role / ErrorCode） | BD-ARCH / REQ-008 / REQ-010 / NFR-003 | src/lib/domain/types.ts | TASK-003 | TEST-004 | 2h | ready |
| TASK-005 | モック認証セッション解決（cookie + 環境変数許可リスト） | API-019 / API-020 / DB-006 / REQ-015 / NFR-006 | src/server/auth/session.ts | TASK-004 | TEST-005 | 3h | ready |
| TASK-006 | 認可ヘルパー単一エントリポイント | NFR-003 / BR-AUTHZ-03 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-011 / API-012 / API-013 / API-014 / API-015 / API-016 / API-017 / API-021 / API-022 / API-023 | src/server/auth/authorize.ts | TASK-004, TASK-005 | TEST-006 | 4h | ready |
| TASK-007 | ログホワイトリストラッパ（PII 除外 + 必須フィールド） | NFR-005 / NFR-007 | src/server/observability/logger.ts | TASK-004 | TEST-007 | 3h | ready |
| TASK-008 | CSRF / Origin 検証ミドルウェア | NFR-006 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-019 / API-020 / API-022 / API-023 | src/server/middleware/csrf.ts | TASK-007 | TEST-008 | 3h | ready |
| TASK-009 | ProposalRepository（インターフェイス + インメモリ実装、楽観ロック） | DB-003 / BR-REVIEW-02 | src/server/repositories/proposals.ts | TASK-004 | TEST-009 | 4h | ready |
| TASK-010 | AuditLogRepository（append-only export） | DB-004 / NFR-004 / BR-AUDIT-02 | src/server/audit/repository.ts | TASK-004 | TEST-010 | 3h | ready |
| TASK-011 | PolicyAgreementRepository | DB-005 / BR-GUARD-02 | src/server/repositories/policy-agreements.ts | TASK-004 | TEST-011 | 2h | ready |
| TASK-012 | UserRepository（モック認証用） | DB-006 / REQ-015 | src/server/repositories/users.ts | TASK-004 | TEST-012 | 2h | ready |
| TASK-013 | API-022 createDraft 実装 | API-022 / DB-003 / UC-002 | src/server/functions/create-draft.ts | TASK-006, TASK-008, TASK-009 | TEST-013 | 3h | ready |
| TASK-014 | API-023 updateDraft 実装（楽観ロック） | API-023 / DB-003 / UC-002 / BR-REVIEW-02 | src/server/functions/update-draft.ts | TASK-006, TASK-008, TASK-009 | TEST-014 | 3h | ready |
| TASK-015 | API-002 submit 実装（倫理ガード + PolicyAgreement + AuditLog） | API-002 / DB-003 / DB-004 / DB-005 / UC-002 / UC-014 / UC-016 / BR-GUARD-01 / BR-GUARD-02 | src/server/functions/submit.ts | TASK-006, TASK-008, TASK-009, TASK-010, TASK-011 | TEST-015 | 4h | ready |
| TASK-016 | API-003 startReview 実装 | API-003 / DB-003 / DB-004 / UC-003 / UC-014 / BR-REVIEW-01 / BR-REVIEW-02 | src/server/functions/start-review.ts | TASK-006, TASK-008, TASK-009, TASK-010 | TEST-016 | 3h | ready |
| TASK-017 | API-004 approve 実装（approved_at 設定） | API-004 / DB-003 / DB-004 / UC-004 / UC-014 / BR-REVIEW-01 | src/server/functions/approve.ts | TASK-006, TASK-008, TASK-009, TASK-010 | TEST-017 | 3h | ready |
| TASK-018 | API-005 returnProposal 実装 | API-005 / DB-003 / DB-004 / UC-005 / UC-014 / BR-REVIEW-01 | src/server/functions/return.ts | TASK-006, TASK-008, TASK-009, TASK-010 | TEST-018 | 2h | ready |
| TASK-019 | API-006 reject 実装 | API-006 / DB-003 / DB-004 / UC-006 / UC-014 / BR-REVIEW-01 | src/server/functions/reject.ts | TASK-006, TASK-008, TASK-009, TASK-010 | TEST-019 | 2h | ready |
| TASK-020 | API-007 publish 実装（admin 専権 / published_at） | API-007 / DB-003 / DB-004 / UC-007 / UC-014 / BR-PUBLISH-01 | src/server/functions/publish.ts | TASK-006, TASK-008, TASK-009, TASK-010 | TEST-020 | 3h | ready |
| TASK-021 | API-008 withdraw 実装（admin 専権 / reason 必須） | API-008 / DB-003 / DB-004 / UC-008 / UC-014 / BR-PUBLISH-03 | src/server/functions/withdraw.ts | TASK-006, TASK-008, TASK-009, TASK-010 | TEST-021 | 3h | ready |
| TASK-022 | API-009 resubmit 実装（投稿者本人 / PolicyAgreement 継続） | API-009 / DB-003 / DB-004 / DB-005 / UC-009 / UC-014 / BR-RESUBMIT-01 | src/server/functions/resubmit.ts | TASK-006, TASK-008, TASK-009, TASK-010, TASK-011 | TEST-022 | 3h | ready |
| TASK-023 | API-010 公開投稿一覧 loader（viewer 判定 / 公開バイパス） | API-010 / DB-003 / UC-011 / REQ-008 | src/routes/index.tsx の loader 部分 + src/server/loaders/list-published.ts | TASK-006, TASK-009 | TEST-023 | 3h | ready |
| TASK-024 | API-011 公開投稿詳細 loader（visibility × viewer マトリクス） | API-011 / DB-003 / UC-011 / REQ-005 / REQ-008 | src/server/loaders/get-published.ts | TASK-006, TASK-009 | TEST-024 | 3h | ready |
| TASK-025 | API-012 自分の投稿一覧 loader | API-012 / DB-003 / UC-010 / REQ-007 | src/server/loaders/list-my-proposals.ts | TASK-006, TASK-009 | TEST-025 | 2h | ready |
| TASK-026 | API-013 自分の投稿詳細 loader（last_return_reason 併記） | API-013 / DB-003 / UC-009 / UC-010 / REQ-005 / REQ-006 | src/server/loaders/get-my-proposal.ts | TASK-006, TASK-009 | TEST-026 | 3h | ready |
| TASK-027 | API-014 レビュー待ち一覧 loader | API-014 / DB-003 / UC-012 / REQ-009 | src/server/loaders/list-review-inbox.ts | TASK-006, TASK-009 | TEST-027 | 2h | ready |
| TASK-028 | API-015 レビュー詳細 loader（audit_log_history 併記） | API-015 / DB-003 / DB-004 / UC-003 / UC-004 / UC-005 / UC-006 | src/server/loaders/get-review-proposal.ts | TASK-006, TASK-009, TASK-010 | TEST-028 | 3h | ready |
| TASK-029 | API-016 監査ログ一覧 loader（reason 本文非露出） | API-016 / DB-004 / UC-015 / REQ-011 / REQ-012 / NFR-005 | src/server/loaders/list-audit-logs.ts | TASK-006, TASK-010 | TEST-029 | 3h | ready |
| TASK-030 | API-017 監査ログ詳細 loader（auditor 本文不到達） | API-017 / DB-004 / UC-015 / REQ-012 | src/server/loaders/get-audit-log.ts | TASK-006, TASK-010 | TEST-030 | 3h | ready |
| TASK-031 | API-018 ポリシー文書 loader（公開バイパス） | API-018 / DB-005 / UC-017 / REQ-013 / REQ-014 | src/server/loaders/get-policy-document.ts + src/lib/policies/{posting,privacy}.ts | TASK-004 | TEST-031 | 2h | ready |
| TASK-032 | API-019 login 実装（モック認証 / 公開バイパス） | API-019 / DB-006 / UC-018 / REQ-015 / NFR-006 | src/server/functions/login.ts | TASK-005, TASK-008, TASK-012 | TEST-032 | 3h | ready |
| TASK-033 | API-020 logout 実装 | API-020 / UC-018 | src/server/functions/logout.ts | TASK-005, TASK-008 | TEST-033 | 1h | ready |
| TASK-034 | API-021 admin 用 proposal viewer loader | API-021 / DB-003 / DB-004 / UC-007 / UC-008 / UC-013 | src/server/loaders/get-proposal-for-admin.ts | TASK-006, TASK-009, TASK-010 | TEST-034 | 3h | ready |
| TASK-035 | SCR-002 公開投稿一覧 画面 | SCR-002 / API-010 / UC-011 | src/routes/index.tsx + src/components/proposal-list/* | TASK-023 | TEST-035 | 3h | ready |
| TASK-036 | SCR-003 公開投稿詳細 画面 | SCR-003 / API-011 / UC-011 | src/routes/proposals/$id.tsx + src/components/proposal-detail/* | TASK-024 | TEST-036 | 3h | ready |
| TASK-037 | SCR-004 投稿フォーム（draft 編集 + 提出） | SCR-004 / API-002 / API-018 / API-022 / API-023 / UC-002 / UC-016 | src/routes/proposals/new.tsx + src/components/proposal-form/* | TASK-013, TASK-014, TASK-015, TASK-031 | TEST-037 | 4h | ready |
| TASK-038 | SCR-005 自分の投稿一覧 画面 | SCR-005 / API-012 / UC-010 | src/routes/me/proposals.tsx | TASK-025 | TEST-038 | 2h | ready |
| TASK-039 | SCR-006 自分の投稿詳細 画面（再提出導線） | SCR-006 / API-013 / API-009 / UC-009 / UC-010 | src/routes/me/proposals.$id.tsx | TASK-026, TASK-022 | TEST-039 | 3h | ready |
| TASK-040 | SCR-007 ログイン 画面 | SCR-007 / API-019 / API-020 / UC-018 | src/routes/login.tsx | TASK-032, TASK-033 | TEST-040 | 2h | ready |
| TASK-041 | SCR-008 レビュー待ち一覧 画面（楽観ロック 409 表示） | SCR-008 / API-014 / API-003 / UC-012 | src/routes/review/inbox.tsx | TASK-027, TASK-016 | TEST-041 | 3h | ready |
| TASK-042 | SCR-009 レビュー詳細 画面（判定アクション） | SCR-009 / API-015 / API-003 / API-004 / API-005 / API-006 / API-007 / UC-003 / UC-004 / UC-005 / UC-006 | src/routes/review/$id.tsx | TASK-028, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020 | TEST-042 | 4h | ready |
| TASK-043 | SCR-010 監査ログ一覧 画面 | SCR-010 / API-016 / UC-015 | src/routes/audit/index.tsx | TASK-029 | TEST-043 | 2h | ready |
| TASK-044 | SCR-011 監査ログ詳細 画面 | SCR-011 / API-017 / UC-015 | src/routes/audit/$id.tsx | TASK-030 | TEST-044 | 2h | ready |
| TASK-045 | SCR-012 ポリシーページ | SCR-012 / API-018 / UC-017 | src/routes/policies/posting.tsx + src/routes/policies/privacy.tsx | TASK-031 | TEST-045 | 2h | ready |
| TASK-046 | SCR-013 公開操作画面（admin） | SCR-013 / API-007 / API-008 / API-021 / UC-007 / UC-008 | src/routes/admin/proposals.$id.tsx | TASK-020, TASK-021, TASK-034 | TEST-046 | 3h | ready |
| TASK-047 | E2E: 認可マトリクス（ロール × 操作の禁止セル全件） | NFR-003 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-011 / API-012 / API-013 / API-014 / API-015 / API-016 / API-017 / API-021 / API-022 / API-023 | tests/e2e/authorization-matrix.test.ts | TASK-013, TASK-014, TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021, TASK-022, TASK-024, TASK-025, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030, TASK-034 | TEST-047 | 4h | ready |
| TASK-048 | E2E: visibility × viewer マトリクス（API-010/011/013 18 セル） | NFR-003 / API-010 / API-011 / API-013 / REQ-008 | tests/e2e/visibility-matrix.test.ts | TASK-023, TASK-024, TASK-026 | TEST-048 | 3h | ready |
| TASK-049 | E2E: AuditLog 書き込み（5 種・8 操作 append 確認） | NFR-004 / UC-014 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 | tests/e2e/audit-log-append.test.ts | TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021, TASK-022 | TEST-049 | 3h | ready |
| TASK-050 | E2E: AuditLog append-only（grep + repository export 検査） | NFR-004 / DB-004 / BR-AUDIT-02 | tests/e2e/audit-log-append-only.test.ts + scripts/check-audit-export.ts | TASK-010 | TEST-050 | 2h | ready |
| TASK-051 | E2E: PII logger 不在検証（結果変更 8 操作後） | NFR-005 / NFR-007 | tests/e2e/logger-pii.test.ts | TASK-007, TASK-049 | TEST-051 | 3h | ready |
| TASK-052 | E2E: CSRF 検証（cross-origin → 403 CSRF_DENIED） | NFR-006 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-019 / API-020 / API-022 / API-023 | tests/e2e/csrf-denied.test.ts | TASK-008 | TEST-052 | 2h | ready |
| TASK-053 | wrangler dev / deploy --dry-run の動作確認 | NFR-002 / BD-ARCH | docs/30-implementation-plan/notes/wrangler-dryrun.md | TASK-002 | TEST-053 | 2h | ready |
| TASK-054 | GitHub Actions CI（typecheck / test / trace-check / dry-run） | NFR-002 / NFR-003 / NFR-004 / NFR-005 | .github/workflows/ci.yml | TASK-002, TASK-050 | TEST-054 | 3h | ready |
| TASK-055 | 必須ログフィールド出力の確認（wrangler tail） | NFR-007 | docs/30-implementation-plan/notes/log-fields.md + tests/integration/log-fields.test.ts | TASK-007 | TEST-055 | 2h | ready |
| TASK-056 | README / 開発ドキュメント整備 | BD-ARCH / NFR-002 | README.md + docs/30-implementation-plan/notes/dev-setup.md | TASK-002, TASK-053 | TEST-056 | 2h | ready |

## サンプル（書式の参考。実プロジェクトでは削除して実タスクと差し替える）

> 下のコードブロック内は `validate-traceability.ts` の対象外。書式の参考としてのみ参照してください。

```markdown
| TASK-001 | users テーブル作成 | DB-001 / REQ-001 | migrations/0001_users.sql | (なし) | TEST-001 | 1h | ready |
| TASK-002 | パスワードハッシュユーティリティ | API-001 / NFR-001 | src/lib/password.ts | TASK-001 | TEST-002 | 1h | ready |
| TASK-003 | ログイン API ハンドラ | API-001 / DB-001 / DB-002 / UC-002 | src/api/auth/login.ts | TASK-001, TASK-002 | TEST-003, TEST-004 | 3h | blocked |

### TASK-001 — users テーブル作成
- 参照: DB-001 / REQ-001
- 完了条件:
  - [ ] migrations/0001_users.sql がリポジトリに追加されている
  - [ ] ローカル DB でマイグレーションが成功する
  - [ ] npm run typecheck が緑
  - [ ] TEST-001 が緑
- 出力ファイル: migrations/0001_users.sql, tests/db/users.test.ts
- 影響範囲: 新規

### TEST-001 — users テーブルマイグレーション
- 対象: TASK-001
- 種別: 単体 (DB スキーマ)
- 観点: id が UUID v7、email が UK で小文字正規化済み
```

## タスク詳細

### TASK-002 — プロジェクト初期化
- 参照: BD-ARCH / NFR-002
- 完了条件:
  - [ ] `pnpm install` が成功する
  - [ ] `pnpm typecheck` が緑
  - [ ] `vite.config.ts` の plugin 順序が BD-ARCH の公式推奨順（cloudflare → tanstackStart → react → tsconfigPaths）と一致
  - [ ] `wrangler.jsonc` の `main` に `@tanstack/react-start/server-entry` が設定され、`compatibility_flags` に `nodejs_compat` を含めない
  - [ ] Tailwind v4 + shadcn/ui の最小コンポーネント（Button）が SSR で表示される
- 出力ファイル: `package.json` / `pnpm-lock.yaml` / `tsconfig.json` / `vite.config.ts` / `wrangler.jsonc` / `tailwind.config.ts` / `src/styles.css` / `src/components/ui/button.tsx`
- 影響範囲: 新規（プロジェクトルート全体）
- 依存 TASK: (なし)
- TEST: TEST-002
- 見積: 3h
- 状態: ready
- 注意: GOAL-05 学習テーマ。Vite plugin 順序の理由を README に転記する（TASK-056）。`nodejs_compat` の最終判断は Q-014 / NFR-002 に従い「依存置換優先」を既定とする。

### TASK-003 — ディレクトリ構成スケルトン
- 参照: BD-ARCH
- 完了条件:
  - [ ] `src/{routes,components,lib,server/{auth,observability,audit,repositories,functions,middleware,loaders}}` が空雛形で配置される
  - [ ] 各ディレクトリに用途を記述した `README.md` または index コメントが存在する
  - [ ] `pnpm typecheck` が緑
- 出力ファイル: 各ディレクトリの `index.ts` / `README.md`（最小）
- 影響範囲: 新規
- 依存 TASK: TASK-002
- TEST: TEST-003
- 見積: 1h
- 状態: ready

### TASK-004 — 共通ドメイン型定義
- 参照: BD-ARCH / REQ-008 / REQ-010 / NFR-003
- 完了条件:
  - [ ] `Visibility = 'private' | 'internal' | 'public'`
  - [ ] `ProposalStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'returned' | 'rejected' | 'published' | 'withdrawn'`
  - [ ] `Role = 'guest' | 'user' | 'reviewer' | 'admin' | 'auditor'`
  - [ ] `ErrorCode = 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'CSRF_DENIED' | 'NOT_FOUND' | 'CONFLICT' | 'BUSINESS_RULE_VIOLATION' | 'INTERNAL_ERROR'`
  - [ ] glossary との不一致が無い（用語名が `docs/02-requirements/05-glossary.md` と一致）
- 出力ファイル: `src/lib/domain/types.ts` / `tests/lib/domain/types.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-003
- TEST: TEST-004
- 見積: 2h
- 状態: ready

### TASK-005 — モック認証セッション解決
- 参照: API-019 / API-020 / DB-006 / REQ-015 / NFR-006
- 完了条件:
  - [ ] cookie からセッションを読み出し、許可リストとの照合で viewer (`Role` + `user_id`) を返す
  - [ ] 許可リスト外 cookie は `guest` または `null` を返す（暫定: 04-architecture の Q に従い `null`）
  - [ ] cookie 属性は `HttpOnly` / `Secure`（本番）/ `SameSite=Lax`
- 出力ファイル: `src/server/auth/session.ts` / `tests/server/auth/session.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-005
- 見積: 3h
- 状態: ready
- 注意: ここでは API-019 の cookie 発行ロジックは含めない（TASK-032）。本 TASK は cookie の読み取り側のみ。

### TASK-006 — 認可ヘルパー単一エントリポイント
- 参照: NFR-003 / BR-AUTHZ-03 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-011 / API-012 / API-013 / API-014 / API-015 / API-016 / API-017 / API-021 / API-022 / API-023
- 完了条件:
  - [ ] `authorize(viewer, action, resource)` の単一 export
  - [ ] ロール / visibility / 所有者一致の 3 軸で判定
  - [ ] 拒否時は副作用なし（throw `AuthorizationError`、HTTP 401 / 404 にマップ可能）
  - [ ] `403_reason` を logger に必ず記録（`not_authenticated` / `insufficient_role` / `not_owner` / `not_owner_resource`）
- 出力ファイル: `src/server/auth/authorize.ts` / `tests/server/auth/authorize.test.ts`
- 影響範囲: 新規（以降の API TASK の入口）
- 依存 TASK: TASK-004, TASK-005
- TEST: TEST-006
- 見積: 4h
- 状態: ready
- 注意: NFR-003 の「単一エントリポイント」を満たすため、本ファイル以外で `if (role === ...)` を書かない。CI grep は TASK-054 で追加。

### TASK-007 — ログホワイトリストラッパ
- 参照: NFR-005 / NFR-007
- 完了条件:
  - [ ] `logger.info(payload)` などが許可フィールド外のキーで型エラーになる
  - [ ] 必須フィールド（`timestamp` / `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `403_reason`）を出力
  - [ ] PII（投稿本文 / reason テキスト / メール）が混入した場合に runtime で除外
- 出力ファイル: `src/server/observability/logger.ts` / `tests/server/observability/logger.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-007
- 見積: 3h
- 状態: ready

### TASK-008 — CSRF / Origin 検証ミドルウェア
- 参照: NFR-006 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-019 / API-020 / API-022 / API-023
- 完了条件:
  - [ ] 全 mutation 系 server function の入口で Origin / Sec-Fetch-Site を検証
  - [ ] cross-origin / 不一致なら `403 CSRF_DENIED` を返す
  - [ ] logger に `403_reason=cross_site` を記録
  - [ ] 検証順序は「認証ミドルウェア通過後、認可ヘルパー入口の前」
- 出力ファイル: `src/server/middleware/csrf.ts` / `tests/server/middleware/csrf.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-007
- TEST: TEST-008
- 見積: 3h
- 状態: ready

### TASK-009 — ProposalRepository
- 参照: DB-003 / BR-REVIEW-02
- 完了条件:
  - [ ] インターフェイス（`findById` / `listByAuthor` / `listPublic` / `listForReview` / `insert` / `updateWithLock` / `listAll`）
  - [ ] インメモリ実装で楽観ロック（`lock_version`）が機能（不一致時に専用例外）
  - [ ] `approved_at` / `published_at` / `withdrawn_at` を更新できる
  - [ ] 全 status / visibility の組合せで 1 件以上の fixture を作れる factory を併設
- 出力ファイル: `src/server/repositories/proposals.ts` / `tests/server/repositories/proposals.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-009
- 見積: 4h
- 状態: ready

### TASK-010 — AuditLogRepository
- 参照: DB-004 / NFR-004 / BR-AUDIT-02
- 完了条件:
  - [ ] export 関数は `append` / `find` / `list` / `get` のみ（`update*` / `delete*` は private）
  - [ ] `append` は AuditLog エントリ全項目（actor / role / action / target / before / after / reason / timestamp）を要求
  - [ ] grep で `update*AuditLog` / `delete*AuditLog` パターンが 0 件
- 出力ファイル: `src/server/audit/repository.ts` / `tests/server/audit/repository.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-010
- 見積: 3h
- 状態: ready

### TASK-011 — PolicyAgreementRepository
- 参照: DB-005 / BR-GUARD-02
- 完了条件:
  - [ ] `insert` / `findLatestByUser` を提供
  - [ ] (user_id, proposal_id, policy_version) 一意性をインメモリで強制
- 出力ファイル: `src/server/repositories/policy-agreements.ts` / `tests/server/repositories/policy-agreements.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-011
- 見積: 2h
- 状態: ready

### TASK-012 — UserRepository
- 参照: DB-006 / REQ-015
- 完了条件:
  - [ ] 環境変数 `AUTH_ALLOWLIST` を読んでロール付き user 一覧を保持
  - [ ] `findByIdentifier` / `findById` を提供
  - [ ] PII（メールアドレス）はオブジェクト内に保持しても logger / API レスポンスに出ない（NFR-005）
- 出力ファイル: `src/server/repositories/users.ts` / `tests/server/repositories/users.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-012
- 見積: 2h
- 状態: ready

### TASK-013 — API-022 createDraft
- 参照: API-022 / DB-003 / UC-002
- 完了条件:
  - [ ] ログイン済 user 以外は `401`
  - [ ] `author_id` を server-side で `viewer.user_id` に強制設定（クライアントから上書き不能）
  - [ ] `title` / `body` / `visibility` のスキーマ検証で 400
  - [ ] 成功時 `201 { proposal_id, status: 'draft', version: 0, created_at, updated_at }`
  - [ ] AuditLog 書き込みは行わない
- 出力ファイル: `src/server/functions/create-draft.ts` / `tests/server/functions/create-draft.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009
- TEST: TEST-013
- 見積: 3h
- 状態: ready

### TASK-014 — API-023 updateDraft
- 参照: API-023 / DB-003 / UC-002 / BR-REVIEW-02
- 完了条件:
  - [ ] 投稿者本人 + `status='draft'` のみ許可
  - [ ] `expected_version` 不一致で `409 CONFLICT`
  - [ ] `status != 'draft'` で `422 BUSINESS_RULE_VIOLATION`
  - [ ] 他人の draft で `404`
- 出力ファイル: `src/server/functions/update-draft.ts` / `tests/server/functions/update-draft.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009
- TEST: TEST-014
- 見積: 3h
- 状態: ready

### TASK-015 — API-002 submit
- 参照: API-002 / DB-003 / DB-004 / DB-005 / UC-002 / UC-014 / UC-016 / BR-GUARD-01 / BR-GUARD-02
- 完了条件:
  - [ ] 倫理ガード 3 種が server-side で全て true でなければ 400
  - [ ] PolicyAgreement 初回生成（同 proposal の再 submit では生成しない）
  - [ ] `draft → submitted` 遷移、AuditLog `action=submit` を末尾で append
  - [ ] 失敗時は AuditLog 書き込みなし
- 出力ファイル: `src/server/functions/submit.ts` / `tests/server/functions/submit.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010, TASK-011
- TEST: TEST-015
- 見積: 4h
- 状態: ready

### TASK-016 — API-003 startReview
- 参照: API-003 / DB-003 / DB-004 / UC-003 / UC-014 / BR-REVIEW-01 / BR-REVIEW-02
- 完了条件:
  - [ ] reviewer / admin のみ（assignee 一致は要求しない）
  - [ ] reason 空で 400
  - [ ] 楽観ロック失敗で 409
  - [ ] `submitted → in_review` 以外で 422
  - [ ] AuditLog `action=start_review` を末尾で append
- 出力ファイル: `src/server/functions/start-review.ts` / `tests/server/functions/start-review.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010
- TEST: TEST-016
- 見積: 3h
- 状態: ready

### TASK-017 — API-004 approve
- 参照: API-004 / DB-003 / DB-004 / UC-004 / UC-014 / BR-REVIEW-01
- 完了条件:
  - [ ] `in_review → approved` 以外で 422
  - [ ] `approved_at` を現在時刻で設定
  - [ ] AuditLog `action=approve` を末尾で append
- 出力ファイル: `src/server/functions/approve.ts` / `tests/server/functions/approve.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010
- TEST: TEST-017
- 見積: 3h
- 状態: ready

### TASK-018 — API-005 returnProposal
- 参照: API-005 / DB-003 / DB-004 / UC-005 / UC-014 / BR-REVIEW-01
- 完了条件:
  - [ ] reason 必須
  - [ ] `in_review → returned` 以外で 422
  - [ ] AuditLog `action=return` を末尾で append（reason を保存）
- 出力ファイル: `src/server/functions/return.ts` / `tests/server/functions/return.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010
- TEST: TEST-018
- 見積: 2h
- 状態: ready

### TASK-019 — API-006 reject
- 参照: API-006 / DB-003 / DB-004 / UC-006 / UC-014 / BR-REVIEW-01
- 完了条件:
  - [ ] `in_review → rejected` 以外で 422
  - [ ] AuditLog `action=reject` を末尾で append
- 出力ファイル: `src/server/functions/reject.ts` / `tests/server/functions/reject.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010
- TEST: TEST-019
- 見積: 2h
- 状態: ready

### TASK-020 — API-007 publish
- 参照: API-007 / DB-003 / DB-004 / UC-007 / UC-014 / BR-PUBLISH-01
- 完了条件:
  - [ ] admin 専権（reviewer / user / auditor → 404、guest → 401）
  - [ ] `approved → published` 以外で 422
  - [ ] `published_at` を現在時刻で設定
  - [ ] AuditLog `action=publish` を末尾で append
- 出力ファイル: `src/server/functions/publish.ts` / `tests/server/functions/publish.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010
- TEST: TEST-020
- 見積: 3h
- 状態: ready

### TASK-021 — API-008 withdraw
- 参照: API-008 / DB-003 / DB-004 / UC-008 / UC-014 / BR-PUBLISH-03
- 完了条件:
  - [ ] admin 専権、reason 必須
  - [ ] `published → withdrawn` 以外で 422
  - [ ] `withdrawn_at` を現在時刻で設定
  - [ ] AuditLog `action=withdraw` を末尾で append
- 出力ファイル: `src/server/functions/withdraw.ts` / `tests/server/functions/withdraw.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010
- TEST: TEST-021
- 見積: 3h
- 状態: ready

### TASK-022 — API-009 resubmit
- 参照: API-009 / DB-003 / DB-004 / DB-005 / UC-009 / UC-014 / BR-RESUBMIT-01
- 完了条件:
  - [ ] 投稿者本人のみ（他 user → 404）
  - [ ] `returned → submitted` 以外で 422
  - [ ] PolicyAgreement は再生成しない（初回エントリの継続適用）
  - [ ] AuditLog `action=resubmit` を末尾で append
- 出力ファイル: `src/server/functions/resubmit.ts` / `tests/server/functions/resubmit.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-008, TASK-009, TASK-010, TASK-011
- TEST: TEST-022
- 見積: 3h
- 状態: ready

### TASK-023 — API-010 公開投稿一覧 loader
- 参照: API-010 / DB-003 / UC-011 / REQ-008
- 完了条件:
  - [ ] `viewer === 'guest'` → `visibility=public` のみ返す
  - [ ] `viewer in {user, reviewer, admin, auditor}` → `visibility in [public, internal]` を返す
  - [ ] 公開バイパス（cookie なしで 200 が返る）
  - [ ] `withdrawn` は除外
- 出力ファイル: `src/server/loaders/list-published.ts` / `tests/server/loaders/list-published.test.ts`（route 接続は TASK-035）
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009
- TEST: TEST-023
- 見積: 3h
- 状態: ready

### TASK-024 — API-011 公開投稿詳細 loader
- 参照: API-011 / DB-003 / UC-011 / REQ-005 / REQ-008
- 完了条件:
  - [ ] visibility × viewer マトリクスでフィルタ（guest が `internal` 要求 → 401、user が他人 `private` → 404 等）
  - [ ] `withdrawn` は loader 側でフィルタして 404
  - [ ] admin は全 visibility で 200（ただし `withdrawn` は 404）
- 出力ファイル: `src/server/loaders/get-published.ts` / `tests/server/loaders/get-published.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009
- TEST: TEST-024
- 見積: 3h
- 状態: ready

### TASK-025 — API-012 自分の投稿一覧 loader
- 参照: API-012 / DB-003 / UC-010 / REQ-007
- 完了条件:
  - [ ] guest → 401
  - [ ] ログイン済 → 自身分のみ全 8 ステータスを返す
- 出力ファイル: `src/server/loaders/list-my-proposals.ts` / `tests/server/loaders/list-my-proposals.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009
- TEST: TEST-025
- 見積: 2h
- 状態: ready

### TASK-026 — API-013 自分の投稿詳細 loader
- 参照: API-013 / DB-003 / UC-009 / UC-010 / REQ-005 / REQ-006
- 完了条件:
  - [ ] 投稿者本人以外（他 user / reviewer / admin / auditor）→ 404
  - [ ] `withdrawn` の自身投稿 → 404（REQ-005 整合）
  - [ ] `returned` 状態なら直近 AuditLog の `last_return_reason` を併記
- 出力ファイル: `src/server/loaders/get-my-proposal.ts` / `tests/server/loaders/get-my-proposal.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009
- TEST: TEST-026
- 見積: 3h
- 状態: ready

### TASK-027 — API-014 レビュー待ち一覧 loader
- 参照: API-014 / DB-003 / UC-012 / REQ-009
- 完了条件:
  - [ ] reviewer / admin → 200、`submitted` + `in_review` を返す
  - [ ] reviewer は `private` を server-side で除外
  - [ ] guest → 401、user / auditor → 404
- 出力ファイル: `src/server/loaders/list-review-inbox.ts` / `tests/server/loaders/list-review-inbox.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009
- TEST: TEST-027
- 見積: 2h
- 状態: ready

### TASK-028 — API-015 レビュー詳細 loader
- 参照: API-015 / DB-003 / DB-004 / UC-003 / UC-004 / UC-005 / UC-006
- 完了条件:
  - [ ] reviewer / admin → 200、本文 + AuditLog 履歴抜粋を返す
  - [ ] guest → 401、user / auditor → 404
- 出力ファイル: `src/server/loaders/get-review-proposal.ts` / `tests/server/loaders/get-review-proposal.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009, TASK-010
- TEST: TEST-028
- 見積: 3h
- 状態: ready

### TASK-029 — API-016 監査ログ一覧 loader
- 参照: API-016 / DB-004 / UC-015 / REQ-011 / REQ-012 / NFR-005
- 完了条件:
  - [ ] auditor / admin → 200、`actor / action / from / to` フィルタを受け付ける
  - [ ] reason 本文は API レスポンスに含めない（`reason_present: boolean` のみ）
  - [ ] guest → 401、user / reviewer → 404
- 出力ファイル: `src/server/loaders/list-audit-logs.ts` / `tests/server/loaders/list-audit-logs.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-010
- TEST: TEST-029
- 見積: 3h
- 状態: ready

### TASK-030 — API-017 監査ログ詳細 loader
- 参照: API-017 / DB-004 / UC-015 / REQ-012
- 完了条件:
  - [ ] auditor / admin → 200（メタのみ）
  - [ ] auditor から target proposal 本文 loader への遷移は 404
  - [ ] admin のみ proposal 本文 loader（API-021）への遷移可
- 出力ファイル: `src/server/loaders/get-audit-log.ts` / `tests/server/loaders/get-audit-log.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-010
- TEST: TEST-030
- 見積: 3h
- 状態: ready

### TASK-031 — API-018 ポリシー文書 loader
- 参照: API-018 / DB-005 / UC-017 / REQ-013 / REQ-014
- 完了条件:
  - [ ] `kind=posting|privacy` を受けて該当文書 + `policy_version` を返す
  - [ ] 公開バイパス（全ロール 200、guest 含む）
- 出力ファイル: `src/server/loaders/get-policy-document.ts` / `src/lib/policies/posting.ts` / `src/lib/policies/privacy.ts` / `tests/server/loaders/get-policy-document.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-004
- TEST: TEST-031
- 見積: 2h
- 状態: ready

### TASK-032 — API-019 login（モック認証）
- 参照: API-019 / DB-006 / UC-018 / REQ-015 / NFR-006
- 完了条件:
  - [ ] `user_identifier` を受けて許可リスト照合
  - [ ] 合致時に cookie を発行（`HttpOnly` / `Secure`（本番）/ `SameSite=Lax`）
  - [ ] 不一致時は 401（暫定）
  - [ ] 公開バイパス（認可ヘルパー対象外）
- 出力ファイル: `src/server/functions/login.ts` / `tests/server/functions/login.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-005, TASK-008, TASK-012
- TEST: TEST-032
- 見積: 3h
- 状態: ready

### TASK-033 — API-020 logout
- 参照: API-020 / UC-018
- 完了条件:
  - [ ] ログイン済のみ
  - [ ] cookie を破棄して 200
- 出力ファイル: `src/server/functions/logout.ts` / `tests/server/functions/logout.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-005, TASK-008
- TEST: TEST-033
- 見積: 1h
- 状態: ready

### TASK-034 — API-021 admin 用 proposal viewer loader
- 参照: API-021 / DB-003 / DB-004 / UC-007 / UC-008 / UC-013
- 完了条件:
  - [ ] admin 専権（reviewer / user / auditor → 404、guest → 401）
  - [ ] 全 visibility / 全 status を返す（`withdrawn` 含む）
  - [ ] AuditLog 直近 N 件抜粋を併記
  - [ ] read-only（AuditLog 書き込みなし）
- 出力ファイル: `src/server/loaders/get-proposal-for-admin.ts` / `tests/server/loaders/get-proposal-for-admin.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-006, TASK-009, TASK-010
- TEST: TEST-034
- 見積: 3h
- 状態: ready

### TASK-035 — SCR-002 公開投稿一覧 画面
- 参照: SCR-002 / API-010 / UC-011
- 完了条件:
  - [ ] route `/` で API-010 loader を呼んで一覧表示
  - [ ] guest 経路で SSR 200 が返る
  - [ ] visibility バッジ（public / internal）を表示
- 出力ファイル: `src/routes/index.tsx` / `src/components/proposal-list/*` / `tests/routes/index.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-023
- TEST: TEST-035
- 見積: 3h
- 状態: ready

### TASK-036 — SCR-003 公開投稿詳細 画面
- 参照: SCR-003 / API-011 / UC-011
- 完了条件:
  - [ ] route `/proposals/$id` で API-011 を呼ぶ
  - [ ] 401 / 404 / 200 の状態に応じた UI を表示
  - [ ] `withdrawn` は本文非表示の 404 ページ
- 出力ファイル: `src/routes/proposals/$id.tsx` / `src/components/proposal-detail/*` / `tests/routes/proposal-detail.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-024
- TEST: TEST-036
- 見積: 3h
- 状態: ready

### TASK-037 — SCR-004 投稿フォーム（draft 編集 / 提出）
- 参照: SCR-004 / API-002 / API-018 / API-022 / API-023 / UC-002 / UC-016
- 完了条件:
  - [ ] 新規時 `createDraft` (API-022) を呼んで `proposal_id` を確保
  - [ ] 編集時 `updateDraft` (API-023) を `expected_version` 付きで呼ぶ
  - [ ] 「提出」ボタンで倫理ガード 3 種 + PolicyAgreement 同意を伴う `submit` (API-002) を mutation
  - [ ] PolicyAgreement の表示は API-018 経由
- 出力ファイル: `src/routes/proposals/new.tsx` / `src/components/proposal-form/*` / `tests/routes/proposal-form.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-013, TASK-014, TASK-015, TASK-031
- TEST: TEST-037
- 見積: 4h
- 状態: ready
- 注意: 共通コンポーネント（複数 API 連携）に該当する例外的グルーピング。

### TASK-038 — SCR-005 自分の投稿一覧 画面
- 参照: SCR-005 / API-012 / UC-010
- 完了条件:
  - [ ] route `/me/proposals` で API-012 loader を呼ぶ
  - [ ] guest は `/login` にリダイレクト or 401 表示
  - [ ] status バッジで全 8 ステータスを表示
- 出力ファイル: `src/routes/me/proposals.tsx` / `tests/routes/me-proposals.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-025
- TEST: TEST-038
- 見積: 2h
- 状態: ready

### TASK-039 — SCR-006 自分の投稿詳細 画面
- 参照: SCR-006 / API-013 / API-009 / UC-009 / UC-010
- 完了条件:
  - [ ] route `/me/proposals/$id` で API-013 loader を呼ぶ
  - [ ] `returned` のとき `last_return_reason` を強調表示
  - [ ] 「再提出」ボタンで API-009 mutation を呼ぶ
  - [ ] `withdrawn` 自身分は 404 表示
- 出力ファイル: `src/routes/me/proposals.$id.tsx` / `tests/routes/me-proposal-detail.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-026, TASK-022
- TEST: TEST-039
- 見積: 3h
- 状態: ready
- 注意: 共通コンポーネント（複数 API 連携）に該当する例外的グルーピング。

### TASK-040 — SCR-007 ログイン 画面
- 参照: SCR-007 / API-019 / API-020 / UC-018
- 完了条件:
  - [ ] route `/login` で `user_identifier` 入力フォーム
  - [ ] 送信で API-019 mutation
  - [ ] ログイン済なら logout ボタンで API-020 mutation
- 出力ファイル: `src/routes/login.tsx` / `tests/routes/login.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-032, TASK-033
- TEST: TEST-040
- 見積: 2h
- 状態: ready

### TASK-041 — SCR-008 レビュー待ち一覧 画面
- 参照: SCR-008 / API-014 / API-003 / UC-012
- 完了条件:
  - [ ] route `/review/inbox` で API-014 loader
  - [ ] 「担当開始」ボタンで API-003 mutation
  - [ ] 楽観ロック 409 の場合に「他のレビュアが担当開始しました」表示
- 出力ファイル: `src/routes/review/inbox.tsx` / `tests/routes/review-inbox.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-027, TASK-016
- TEST: TEST-041
- 見積: 3h
- 状態: ready
- 注意: 共通コンポーネント（複数 API 連携）に該当する例外的グルーピング。

### TASK-042 — SCR-009 レビュー詳細 画面（判定アクション）
- 参照: SCR-009 / API-015 / API-003 / API-004 / API-005 / API-006 / API-007 / UC-003 / UC-004 / UC-005 / UC-006
- 完了条件:
  - [ ] route `/review/$id` で API-015 loader
  - [ ] 「承認」「差し戻し」「却下」「公開」ボタンが現在の status に応じて出し分け
  - [ ] reason 入力必須のアクションは UI でも検証（server-side が本体）
- 出力ファイル: `src/routes/review/$id.tsx` / `tests/routes/review-detail.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-028, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020
- TEST: TEST-042
- 見積: 4h
- 状態: ready
- 注意: 1 画面に 6 API（loader 1 + mutation 5）。判定アクションを 1 画面に集約する SCR-009 の設計に従う例外グルーピング。

### TASK-043 — SCR-010 監査ログ一覧 画面
- 参照: SCR-010 / API-016 / UC-015
- 完了条件:
  - [ ] route `/audit` で API-016 loader
  - [ ] フィルタ UI（actor / action / from / to）
  - [ ] reason 本文は表示しない（`reason_present` バッジのみ）
- 出力ファイル: `src/routes/audit/index.tsx` / `tests/routes/audit-list.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-029
- TEST: TEST-043
- 見積: 2h
- 状態: ready

### TASK-044 — SCR-011 監査ログ詳細 画面
- 参照: SCR-011 / API-017 / UC-015
- 完了条件:
  - [ ] route `/audit/$id` で API-017 loader
  - [ ] auditor は target proposal リンク非表示、admin は表示
- 出力ファイル: `src/routes/audit/$id.tsx` / `tests/routes/audit-detail.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-030
- TEST: TEST-044
- 見積: 2h
- 状態: ready

### TASK-045 — SCR-012 ポリシーページ
- 参照: SCR-012 / API-018 / UC-017
- 完了条件:
  - [ ] route `/policies/posting` および `/policies/privacy`
  - [ ] guest を含む全ロールで 200
  - [ ] `policy_version` を画面下部に表示
- 出力ファイル: `src/routes/policies/posting.tsx` / `src/routes/policies/privacy.tsx` / `tests/routes/policies.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-031
- TEST: TEST-045
- 見積: 2h
- 状態: ready

### TASK-046 — SCR-013 公開操作画面（admin）
- 参照: SCR-013 / API-007 / API-008 / API-021 / UC-007 / UC-008
- 完了条件:
  - [ ] route `/admin/proposals/$id` で API-021 loader（admin のみ到達）
  - [ ] `approved` なら「公開」ボタン → API-007 mutation
  - [ ] `published` なら「取り下げ」ボタン → API-008 mutation（reason 必須）
  - [ ] 取り下げ後の本文非表示警告を表示
- 出力ファイル: `src/routes/admin/proposals.$id.tsx` / `tests/routes/admin-proposal.test.tsx`
- 影響範囲: 新規
- 依存 TASK: TASK-020, TASK-021, TASK-034
- TEST: TEST-046
- 見積: 3h
- 状態: ready
- 注意: 共通コンポーネント（複数 API 連携）に該当する例外的グルーピング。

### TASK-047 — E2E: 認可マトリクス
- 参照: NFR-003 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-011 / API-012 / API-013 / API-014 / API-015 / API-016 / API-017 / API-021 / API-022 / API-023
- 完了条件:
  - [ ] ロール（guest / user / reviewer / admin / auditor）× 各 mutation/loader の禁止セル全件で 401 / 404 を確認
  - [ ] 副作用なし（DB / AuditLog に変化が無い）を assert
  - [ ] `mutation 系 export 数 ≦ 認可拒否 E2E ケース数` を CI で検査
- 出力ファイル: `tests/e2e/authorization-matrix.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-013, TASK-014, TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021, TASK-022, TASK-024, TASK-025, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030, TASK-034
- TEST: TEST-047
- 見積: 4h
- 状態: ready

### TASK-048 — E2E: visibility × viewer マトリクス
- 参照: NFR-003 / API-010 / API-011 / API-013 / REQ-008
- 完了条件:
  - [ ] 3 visibility × 5 viewer = 15 セル + 経路差分 = 18 セルで loader の挙動を確認
  - [ ] guest が `internal` 要求で 401、`user` が他人 `private` で 404 等
- 出力ファイル: `tests/e2e/visibility-matrix.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-023, TASK-024, TASK-026
- TEST: TEST-048
- 見積: 3h
- 状態: ready

### TASK-049 — E2E: AuditLog 書き込み
- 参照: NFR-004 / UC-014 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009
- 完了条件:
  - [ ] 5 種・8 操作（submit / start_review / approve / return / reject / publish / withdraw / resubmit）成功時にエントリが 1 件 append
  - [ ] 失敗時（バリデーション / 楽観ロック）はエントリが append されない
- 出力ファイル: `tests/e2e/audit-log-append.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021, TASK-022
- TEST: TEST-049
- 見積: 3h
- 状態: ready

### TASK-050 — E2E: AuditLog append-only
- 参照: NFR-004 / DB-004 / BR-AUDIT-02
- 完了条件:
  - [ ] AuditLog repository の export 関数が `append` / `find` / `list` / `get` のみ
  - [ ] CI grep で `update*AuditLog` / `delete*AuditLog` パターンが 0 件
- 出力ファイル: `tests/e2e/audit-log-append-only.test.ts` / `scripts/check-audit-export.ts`
- 影響範囲: 新規（CI スクリプトは TASK-054 から呼ばれる）
- 依存 TASK: TASK-010
- TEST: TEST-050
- 見積: 2h
- 状態: ready

### TASK-051 — E2E: PII logger 不在検証
- 参照: NFR-005 / NFR-007
- 完了条件:
  - [ ] 結果変更 8 操作後のログをキャプチャし、投稿本文 / reason テキスト / メールアドレス正規表現が 0 件
  - [ ] CI grep で `console.log` / `console.info` / `console.error` が `src/server/` 配下に 0 件
- 出力ファイル: `tests/e2e/logger-pii.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-007, TASK-049
- TEST: TEST-051
- 見積: 3h
- 状態: ready

### TASK-052 — E2E: CSRF 検証
- 参照: NFR-006 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008 / API-009 / API-019 / API-020 / API-022 / API-023
- 完了条件:
  - [ ] cross-origin Origin / Sec-Fetch-Site で全 mutation API に対して 403 `CSRF_DENIED` が返る
  - [ ] logger に `403_reason=cross_site` が記録
- 出力ファイル: `tests/e2e/csrf-denied.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-008
- TEST: TEST-052
- 見積: 2h
- 状態: ready

### TASK-053 — wrangler dev / deploy --dry-run の動作確認
- 参照: NFR-002 / BD-ARCH
- 完了条件:
  - [ ] `pnpm dev` (Vite + Cloudflare plugin) で SSR 起動成功
  - [ ] `wrangler deploy --dry-run --env staging` 終了コード 0
  - [ ] 結果ログを `docs/30-implementation-plan/notes/wrangler-dryrun.md` に記録
- 出力ファイル: `docs/30-implementation-plan/notes/wrangler-dryrun.md`
- 影響範囲: 新規
- 依存 TASK: TASK-002
- TEST: TEST-053
- 見積: 2h
- 状態: ready

### TASK-054 — GitHub Actions CI
- 参照: NFR-002 / NFR-003 / NFR-004 / NFR-005
- 完了条件:
  - [ ] `pnpm typecheck` / `pnpm test` / `npx tsx scripts/validate-traceability.ts` / `wrangler deploy --dry-run` を実行
  - [ ] CI grep（`update*AuditLog` / `delete*AuditLog` / `console.log` / ヘルパー外のロール判定）を実行
  - [ ] PR で全ジョブが緑にならないとマージ不可（branch protection は人間が設定）
- 出力ファイル: `.github/workflows/ci.yml`
- 影響範囲: 新規
- 依存 TASK: TASK-002, TASK-050
- TEST: TEST-054
- 見積: 3h
- 状態: ready

### TASK-055 — 必須ログフィールド出力の確認
- 参照: NFR-007
- 完了条件:
  - [ ] 任意の server function 呼び出し完了時に必須フィールド（`timestamp` / `request_id` / `route` / `method` / `status` / `latency_ms` / `user_id_hash` / `403_reason`）が JSON で出力される
  - [ ] `wrangler tail` で観測した結果を `docs/30-implementation-plan/notes/log-fields.md` に貼る
- 出力ファイル: `docs/30-implementation-plan/notes/log-fields.md` / `tests/integration/log-fields.test.ts`
- 影響範囲: 新規
- 依存 TASK: TASK-007
- TEST: TEST-055
- 見積: 2h
- 状態: ready

### TASK-056 — README / 開発ドキュメント整備
- 参照: BD-ARCH / NFR-002
- 完了条件:
  - [ ] README に `pnpm install` / `pnpm dev` / `pnpm test` / `pnpm trace` の手順
  - [ ] Vite plugin 順序の理由（GOAL-05 学習テーマ）を BD-ARCH から転記
  - [ ] `nodejs_compat` の方針（依存置換優先）を明記
  - [ ] 開発セットアップ手順を `docs/30-implementation-plan/notes/dev-setup.md` に分離
- 出力ファイル: `README.md` / `docs/30-implementation-plan/notes/dev-setup.md`
- 影響範囲: 新規
- 依存 TASK: TASK-002, TASK-053
- TEST: TEST-056
- 見積: 2h
- 状態: ready

## TEST 一覧

### TEST-002 — プロジェクト初期化（疎通）
- 対象: TASK-002
- 種別: untestable（環境設定）。CI 起動成功 + `pnpm typecheck` 緑で代替
- 観点: 依存解決 / Vite plugin 順序 / `wrangler.jsonc` の `main` パス

### TEST-003 — ディレクトリ構成スケルトン
- 対象: TASK-003
- 種別: 単体（静的検証）
- 観点: 期待ディレクトリが全て存在し、空 index で `pnpm typecheck` が緑

### TEST-004 — 共通ドメイン型
- 対象: TASK-004
- 種別: 単体
- 観点: `Visibility` / `ProposalStatus` / `Role` / `ErrorCode` の網羅性、glossary 一致

### TEST-005 — モック認証セッション解決
- 対象: TASK-005
- 種別: 単体
- 観点: 許可リスト内 cookie で viewer 復元、外部 cookie で `null`、cookie 属性

### TEST-006 — 認可ヘルパー
- 対象: TASK-006
- 種別: 単体
- 観点: 5 ロール × 主要 action のテーブル駆動。拒否時 `403_reason` が logger に記録される

### TEST-007 — ログホワイトリストラッパ
- 対象: TASK-007
- 種別: 単体
- 観点: 許可外キーで型エラー、PII 正規表現 0 件、必須フィールド出力

### TEST-008 — CSRF / Origin 検証
- 対象: TASK-008
- 種別: 単体
- 観点: cross-origin で 403 `CSRF_DENIED`、logger に `403_reason=cross_site`

### TEST-009 — ProposalRepository
- 対象: TASK-009
- 種別: 単体
- 観点: 楽観ロック `lock_version` 不一致で例外、status 全 8 種で fixture 生成

### TEST-010 — AuditLogRepository
- 対象: TASK-010
- 種別: 単体
- 観点: export 関数列挙が `append` / `find` / `list` / `get` のみ、append 後 read で完全一致

### TEST-011 — PolicyAgreementRepository
- 対象: TASK-011
- 種別: 単体
- 観点: `(user_id, proposal_id, policy_version)` 一意性、`findLatestByUser` の順序

### TEST-012 — UserRepository
- 対象: TASK-012
- 種別: 単体
- 観点: 環境変数読み出し、PII を `toJSON` / `toString` で漏らさない

### TEST-013 — API-022 createDraft
- 対象: TASK-013
- 種別: 単体
- 観点: 401 / 400 / 201 / `author_id` 強制、AuditLog 0 件

### TEST-014 — API-023 updateDraft
- 対象: TASK-014
- 種別: 単体
- 観点: 401 / 404 / 409 / 422 / 200、AuditLog 0 件、`lock_version+1`

### TEST-015 — API-002 submit
- 対象: TASK-015
- 種別: 単体
- 観点: 倫理ガード未確認 400、PolicyAgreement 初回生成、AuditLog 末尾 append、失敗時 0 件

### TEST-016 — API-003 startReview
- 対象: TASK-016
- 種別: 単体
- 観点: reviewer / admin OK、reason 空 400、楽観ロック 409、422、AuditLog 末尾 append

### TEST-017 — API-004 approve
- 対象: TASK-017
- 種別: 単体
- 観点: `approved_at` 設定、422、AuditLog 末尾 append

### TEST-018 — API-005 returnProposal
- 対象: TASK-018
- 種別: 単体
- 観点: reason 必須、422、AuditLog `action=return` reason 保存

### TEST-019 — API-006 reject
- 対象: TASK-019
- 種別: 単体
- 観点: 422、AuditLog `action=reject`

### TEST-020 — API-007 publish
- 対象: TASK-020
- 種別: 単体
- 観点: admin 専権 404、`approved → published` 以外 422、`published_at`、AuditLog `action=publish`

### TEST-021 — API-008 withdraw
- 対象: TASK-021
- 種別: 単体
- 観点: admin 専権、reason 必須、`withdrawn_at`、AuditLog `action=withdraw`

### TEST-022 — API-009 resubmit
- 対象: TASK-022
- 種別: 単体
- 観点: 投稿者本人 404 (他人)、422、PolicyAgreement 再生成なし、AuditLog `action=resubmit`

### TEST-023 — API-010 公開投稿一覧 loader
- 対象: TASK-023
- 種別: 単体
- 観点: guest → public のみ、ログイン済 → public + internal、`withdrawn` 除外

### TEST-024 — API-011 公開投稿詳細 loader
- 対象: TASK-024
- 種別: 単体
- 観点: visibility × viewer マトリクス、`withdrawn` 404、admin 全 visibility 200

### TEST-025 — API-012 自分の投稿一覧 loader
- 対象: TASK-025
- 種別: 単体
- 観点: guest 401、自身分のみ、全 8 ステータス

### TEST-026 — API-013 自分の投稿詳細 loader
- 対象: TASK-026
- 種別: 単体
- 観点: 他人 404、`withdrawn` 自身分も 404、`returned` で `last_return_reason`

### TEST-027 — API-014 レビュー待ち一覧 loader
- 対象: TASK-027
- 種別: 単体
- 観点: reviewer / admin 200、reviewer は `private` 除外、user / auditor 404

### TEST-028 — API-015 レビュー詳細 loader
- 対象: TASK-028
- 種別: 単体
- 観点: 本文 + AuditLog 履歴、guest 401、user / auditor 404

### TEST-029 — API-016 監査ログ一覧 loader
- 対象: TASK-029
- 種別: 単体
- 観点: フィルタ動作、reason 本文非露出、user / reviewer 404

### TEST-030 — API-017 監査ログ詳細 loader
- 対象: TASK-030
- 種別: 単体
- 観点: メタのみ、auditor は target 本文 404、admin のみ proposal 本文へ遷移可

### TEST-031 — API-018 ポリシー文書 loader
- 対象: TASK-031
- 種別: 単体
- 観点: kind=posting/privacy、`policy_version`、公開バイパス（guest 200）

### TEST-032 — API-019 login
- 対象: TASK-032
- 種別: 単体
- 観点: 許可リスト合致で cookie 発行、不一致 401、cookie 属性、公開バイパス

### TEST-033 — API-020 logout
- 対象: TASK-033
- 種別: 単体
- 観点: cookie 破棄、ログイン済以外で 401

### TEST-034 — API-021 admin 用 proposal viewer loader
- 対象: TASK-034
- 種別: 単体
- 観点: admin のみ 200、reviewer / user / auditor 404、AuditLog 抜粋を含む、副作用なし

### TEST-035 — SCR-002 公開投稿一覧 画面
- 対象: TASK-035
- 種別: 結合（route + loader）
- 観点: guest SSR 200、visibility バッジ表示

### TEST-036 — SCR-003 公開投稿詳細 画面
- 対象: TASK-036
- 種別: 結合
- 観点: 200 / 401 / 404 / `withdrawn` 404 ページ

### TEST-037 — SCR-004 投稿フォーム
- 対象: TASK-037
- 種別: 結合
- 観点: createDraft → updateDraft → submit のシーケンスが成功、倫理ガード未確認で UI / server 双方が拒否

### TEST-038 — SCR-005 自分の投稿一覧
- 対象: TASK-038
- 種別: 結合
- 観点: guest リダイレクト、全 8 ステータスのバッジ表示

### TEST-039 — SCR-006 自分の投稿詳細
- 対象: TASK-039
- 種別: 結合
- 観点: `returned` で reason 強調、再提出ボタンで API-009 mutation、`withdrawn` 自身分 404

### TEST-040 — SCR-007 ログイン
- 対象: TASK-040
- 種別: 結合
- 観点: 許可リスト合致で /me/proposals に遷移、不一致でエラー表示、logout で cookie 破棄

### TEST-041 — SCR-008 レビュー待ち一覧
- 対象: TASK-041
- 種別: 結合
- 観点: 担当開始ボタンで API-003 mutation、楽観ロック 409 表示

### TEST-042 — SCR-009 レビュー詳細
- 対象: TASK-042
- 種別: 結合
- 観点: status に応じたボタン出し分け、reason 必須アクションでフォーム検証

### TEST-043 — SCR-010 監査ログ一覧
- 対象: TASK-043
- 種別: 結合
- 観点: フィルタ動作、reason 本文非表示

### TEST-044 — SCR-011 監査ログ詳細
- 対象: TASK-044
- 種別: 結合
- 観点: auditor で target リンク非表示、admin で表示

### TEST-045 — SCR-012 ポリシーページ
- 対象: TASK-045
- 種別: 結合
- 観点: guest 200、`policy_version` 表示

### TEST-046 — SCR-013 公開操作画面
- 対象: TASK-046
- 種別: 結合
- 観点: `approved` で公開ボタン、`published` で取り下げボタン、reason 必須

### TEST-047 — E2E: 認可マトリクス
- 対象: TASK-047
- 種別: E2E
- 観点: ロール × 操作の禁止セル全件で 401 / 404、副作用なし

### TEST-048 — E2E: visibility × viewer マトリクス
- 対象: TASK-048
- 種別: E2E
- 観点: 18 セルすべての status code と body フィルタ

### TEST-049 — E2E: AuditLog 書き込み
- 対象: TASK-049
- 種別: E2E
- 観点: 8 操作成功で 1 件 append、失敗で 0 件

### TEST-050 — E2E: AuditLog append-only
- 対象: TASK-050
- 種別: E2E + 静的検査
- 観点: export 関数の列挙、grep で update/delete パターン 0 件

### TEST-051 — E2E: PII logger 不在
- 対象: TASK-051
- 種別: E2E
- 観点: ログ JSON に PII 正規表現 0 件、`src/server/` の生 console 0 件

### TEST-052 — E2E: CSRF 検証
- 対象: TASK-052
- 種別: E2E
- 観点: cross-origin で全 mutation 403 `CSRF_DENIED`、logger 記録

### TEST-053 — wrangler dryrun
- 対象: TASK-053
- 種別: untestable（CLI 実行確認）。`wrangler deploy --dry-run` 終了コード 0 で代替
- 観点: 依存解決と `nodejs_compat` 既定方針の整合

### TEST-054 — CI ワークフロー
- 対象: TASK-054
- 種別: untestable（CI 設定）。PR 上で全ジョブ緑になることで代替
- 観点: typecheck / test / trace / dry-run / grep ジョブの存在

### TEST-055 — 必須ログフィールド
- 対象: TASK-055
- 種別: 結合
- 観点: 必須フィールドの 100% 出力

### TEST-056 — README / 開発ドキュメント
- 対象: TASK-056
- 種別: untestable（ドキュメント）。`pnpm install` → `pnpm dev` → `pnpm test` の手順検証で代替
- 観点: 第三者が手順通りに環境構築できる

## マイルストーン振り分け

`docs/30-implementation-plan/02-milestones.md` を参照。各 TASK は 1 つ以上のマイルストーンに紐づく。

| マイルストーン | 含む TASK |
| --- | --- |
| M-01 基盤整備 | TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-053, TASK-056 |
| M-02 認証・ログイン | TASK-032, TASK-033, TASK-040 |
| M-03 投稿フロー（draft → submit） | TASK-013, TASK-014, TASK-015, TASK-031, TASK-037 |
| M-04 レビューフロー | TASK-016, TASK-017, TASK-018, TASK-019, TASK-027, TASK-028, TASK-041, TASK-042 |
| M-05 公開操作 | TASK-020, TASK-021, TASK-022, TASK-034, TASK-039, TASK-046 |
| M-06 閲覧経路 | TASK-023, TASK-024, TASK-025, TASK-026, TASK-035, TASK-036, TASK-038, TASK-045 |
| M-07 監査経路 | TASK-029, TASK-030, TASK-043, TASK-044 |
| M-08 NFR 検証 / CI | TASK-047, TASK-048, TASK-049, TASK-050, TASK-051, TASK-052, TASK-054, TASK-055 |
