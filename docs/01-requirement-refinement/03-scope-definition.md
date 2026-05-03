---
id: RC-SCOPE
title: スコープ定義
status: draft
owners: []
updated: 2026-05-03
---

# スコープ定義

各 `RC-XXX` の `Scope` セクションを横断的にレビューし、**プロジェクト全体としての** スコープ内 / 外を確定する。
個別 RC のスコープ記述と矛盾するときは、ここで議論して解消する。

## プロジェクト全体スコープ

### スコープ内（MVP IN）

| 項目 | 関連 RC | 関連 GOAL |
| --- | --- | --- |
| 投稿の起票・編集（draft）と提出（submitted） | RC-002 | GOAL-01 |
| レビューフロー（in_review / approved / returned / rejected）と判断理由の必須化 | RC-003 | GOAL-01, GOAL-02 |
| 投稿の公開（published）と公開範囲（visibility）に基づく取得制御 | RC-004 | GOAL-01, GOAL-04 |
| 公開範囲の縮小（admin 単独） | RC-005 | GOAL-04 |
| 投稿の取り下げ（published → withdrawn） / AuditLog 記録 | RC-006 | GOAL-02 |
| 差し戻し後の再提出（同 id） | RC-007 | GOAL-01 |
| 投稿者本人による自分の投稿一覧・ステータス確認 | RC-008 | GOAL-01 |
| 公開済投稿の閲覧（visibility × viewer ロール） | RC-009 | GOAL-01, GOAL-04 |
| レビュー待ち一覧（reviewer / admin） | RC-010 | GOAL-01 |
| 5 ロール定義と server function 側での認可強制 | RC-011, RC-018 | GOAL-03 |
| 結果変更操作の AuditLog 記録（append-only） | RC-012, RC-019 | GOAL-02 |
| AuditLog の閲覧（auditor / admin） | RC-013 | GOAL-02 |
| 投稿時のプライバシー・倫理ガード UI と PolicyAgreement | RC-014 | GOAL-01 |
| ポリシー文書の公開ページ | RC-015 | GOAL-01 |
| モック認証（cookie + 許可リスト） | RC-016 | GOAL-03, GOAL-05 |
| Cloudflare Workers 互換ランタイムでの動作 | RC-017 | GOAL-05 |
| ログに PII を出さない構造化ログ規約 | RC-020 | GOAL-02 |
| レビュー所要時間の観測ポイント定義（AuditLog からの導出） | RC-021 | GOAL-02 |
| セキュリティ NFR（Cookie 属性 / CSRF / XSS / CSP） | RC-022 | GOAL-01, GOAL-03 |
| 可観測性 NFR（必須ログフィールド / `wrangler tail` 集約） | RC-023 | GOAL-02 |
| データストア選定（MVP モック / 将来 D1 移行視野） | RC-024 | GOAL-05 |

### スコープ外（明示的に外す）

| 項目 | 根拠 | 関連 |
| --- | --- | --- |
| メール / プッシュ通知の MVP 内実装 | 06-goals.md 非ゴール | RC-005, RC-006 |
| AI による自動承認（人間レビュー省略） | PROB-001 Constraints / 06-goals.md 非ゴール | RC-003 |
| AI による投稿本文の自動マスキング | PROB-002 Constraints | RC-014 |
| 添付画像 / R2 連携 | 06-goals.md 非ゴール（IDEA-008） | RC-002 |
| 通報機能 | 06-goals.md 非ゴール | - |
| 投稿者間のコメント・いいね機能 | 06-goals.md 非ゴール | RC-009 |
| 既存自治体システムとのデータ連携 | 06-goals.md 非ゴール | - |
| 多言語対応（MVP は日本語のみ） | 06-goals.md 非ゴール | RC-014, RC-015 |
| 多要素認証 / SSO / 実プロバイダ統合 | 06-goals.md 非ゴール、Q-001 暫定 | RC-016 |
| データ削除申請（GDPR 的）の自動化 | 06-goals.md 非ゴール、Q-002 暫定 | RC-006 |
| レート制限・スパム対策（Turnstile 等） | Q-013 暫定（IDEA-008） | - |
| 投稿の物理削除 | Q-003 暫定（公開記録を残す） | RC-006 |
| AuditLog エントリのフリーテキスト検索 / フィルタの確定仕様 | Q-012 open | RC-013 |

### グレーゾーン（未確定）

| 項目 | 関連 RC | 議論の論点 | 決定者 | 期限 |
| --- | --- | --- | --- | --- |
| 公開範囲拡大時の投稿者同意の要否 | RC-005 | Q-010 暫定では「同意不要 / 管理者単独可」だが PROB-006 と部分的に矛盾。投稿者保護とのバランス。 | プロダクトオーナー | Phase 1 内 |
| レビュー所要時間 SLA の数値定義 | RC-021 | MVP では指標のみとするか、数値 SLA まで定義するか。 | プロダクトオーナー | Phase 2 入口 |
| データストア選定（D1 vs インメモリ） | RC-024 | MVP 時点での D1 採用可否、移行タイミング。RC-017 から切り出し。 | プロダクトオーナー | Phase 3 入口 |
| `nodejs_compat` 利用方針 | RC-017, RC-024 | 依存置換と互換フラグ有効化のどちらを優先するか。 | プロダクトオーナー | Phase 3 入口 |
| AuditLog 保持期間と物理削除運用 | RC-013, RC-019, RC-023 | append-only と物理削除運用の両立、法的保管期間。 | プロダクトオーナー / 法務 | Phase 2 |
| AuditLog のフィルタ要件 | RC-013 | actor / action / 期間フィルタの必要性。 | プロダクトオーナー | Phase 3 |
| PolicyAgreement のバージョニング | RC-014, RC-015 | ポリシー文のバージョン管理規約。 | プロダクトオーナー | Phase 2 |
| 開発環境での詳細ログ出力可否 | RC-020, RC-023 | 本番マスク前提下での開発時ログ運用ルール。 | プロダクトオーナー | Phase 6 入口 |
| 投稿者本人による取り下げ可否 | RC-006 | admin 専権か、投稿者セルフ取り下げを許すか。 | プロダクトオーナー | Phase 2 |
| approved → published の遷移単位 | RC-003, RC-004 | approve と同時に公開するか、明示的な公開操作を別に持つか。 | プロダクトオーナー | Phase 2 |
| auditor の本文到達可否 | RC-009, RC-011, RC-013 | AuditLog の `target proposal id` から `private` 投稿本文へ到達できるか（Q-016）。 | プロダクトオーナー / 法務 | Phase 2 入口 |
| 適用される法令の範囲 | RC-014, RC-015, RC-019 | 個人情報保護法と各自治体条例の差、域外適用、保管期間規定（Q-017）。 | 法務 | Phase 2 / Phase 6 |
| returned 再提出時の倫理ガード再確認要否 | RC-007, RC-014 | 初回同意の継続適用 or 再取得（Q-018）。 | プロダクトオーナー | Phase 1 / Phase 2 |
| 提出 (submit) の reason 必須要否 | RC-002, RC-012 | レビュー判定では必須が確定だが、提出側の reason 要否は未定（Q-019）。 | プロダクトオーナー | Phase 1 / Phase 2 |
| フリーテキスト検索機能の MVP 含有可否 | RC-009, RC-013 | 想定では MVP 非対象だが、運用上の必要性確認。 | プロダクトオーナー | Phase 2 |
| 属性ベース権限（組織 / 地域属性等） | RC-011 | 5 ロール体系を超える属性ベース制御の MVP 含有可否。 | プロダクトオーナー | Phase 2 |
| AuditLog の物理ローテーション運用 | RC-013, RC-019, RC-023 | append-only と物理ファイル運用の両立。Q-006 と接続。 | 運用担当 | Phase 2 / Phase 3 |
| AuditLog エクスポート機能 | RC-013 | CSV / JSON 形式でのエクスポート要件。 | プロダクトオーナー | Phase 2 |
| パスワードリセット導線 | RC-016 | モック認証下では非対象だが、将来の実プロバイダ統合時に必要。 | プロダクトオーナー | 将来拡張 |
| レビュアー間チャット / コメント機能 | RC-010 | レビュアー間の議論用 UI の要否。MVP では非ゴール想定。 | プロダクトオーナー | 将来拡張 |

## スコープ判定の指針

`scope-reviewer` Subagent はこのファイルの「スコープ内」「スコープ外」を読み、各 `RC-XXX` の `Scope` 欄が矛盾していないか検査する。

判定の優先順:

1. ビジネスゴール (`docs/00-discovery/06-goals.md`) と整合するか
2. 既知の制約条件（技術・法令・予算・期日）と矛盾しないか
3. 他の RC のスコープ外項目と重複していないか

## 参照

- 上流: `docs/00-discovery/06-goals.md` の GOAL、`01-requirement-candidates.md` の各 RC の Scope
- 下流: `docs/02-requirements/01-requirements.md` の「3. スコープ」
