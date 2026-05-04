---
id: REQ-DOC
title: 要件定義書（インデックス）
status: draft
owners: []
updated: 2026-05-04
---

# 要件定義書

> このフォルダは **正式要件 (REQ-XXX)** の置き場。フロー上の **Phase 2** に相当する。
> Phase 0 (`docs/00-discovery/`)・Phase 1 (`docs/01-requirement-refinement/`) を経て、
> 人間が承認した要件だけがここに集約される。
>
> Claude は要件を **勝手に承認しない**。 `### Status` を `approved` に変えるのは人間の責務。

## 構成

| ファイル | 役割 |
| --- | --- |
| `01-requirements.md` (このファイル) | 全体概要・スコープ・ステークホルダー・他ファイルへの索引 |
| `02-functional-requirements.md` | 機能要件 (`REQ-XXX`) |
| `03-non-functional-requirements.md` | 非機能要件 (`NFR-XXX`) |
| `04-business-rules.md` | 業務ルール・制約・例外条件 |
| `05-glossary.md` | 用語集 |
| `99-traceability-seed.md` | 自動生成の ID 索引 (`/trace-check --emit` で更新) |

## 1. 概要

- **プロダクト名**: viaduction（仮称）— まちの提案・申請レビューアプリ
- **ミッション (1 行)**: 一般市民の提案・報告・申請を、公開前レビューと AuditLog による説明責任を備えた経路で受け止める。
- **ビジョン**:
  - GOAL-01: 公開前レビューを必須化し、個人情報・誹謗中傷を含む投稿が公開されるリスクを構造的に下げる
  - GOAL-02: 結果を変える管理者操作を AuditLog に append-only で記録し、説明責任を果たせる体制を作る
  - GOAL-03: 5 ロール（guest / user / reviewer / admin / auditor）を、UI ではなく server function 側で強制する設計を確立する
  - GOAL-04: 投稿者が `private / internal / public` の公開範囲を自己決定でき、公開範囲変更が必ず判断理由付きで AuditLog に残る
- **学習目標**:
  - GOAL-05: TanStack Start + Cloudflare Workers + shadcn/ui + Tailwind v4 のフルスタック構成を、設定ファイル設計から実装まで一通り経験する
  - GOAL-06: loader / server function / mutation の責務分離、認可チェックの集中化、監査ログ記録パターンを再利用可能なコード規約として残す
- **解決したい課題**: PROB-001（公開前レビュー無し）, PROB-002（個人情報混入）, PROB-003（判断理由が記録されない）, PROB-004（管理者操作の追跡可能性なし）, PROB-005（権限バイパス）, PROB-006（公開範囲を投稿者がコントロールできない）— 詳細は `docs/00-discovery/02-problem-statement.md`
- **想定読者**: ステークホルダー、開発チーム（Claude を含む）、将来の運用担当・auditor

## 2. ステークホルダー

| 役割 | 氏名 / 部署 | 期待 |
| --- | --- | --- |
| プロダクトオーナー（学習プロジェクト主） | ユーザ本人 | 各フェーズの成果物が技術学習にも繋がる形で揃う |
| 開発リード | Claude Code | 設計駆動ハーネスに沿った各フェーズの ID トレーサビリティが保たれる |
| 一般市民（投稿者） | 想定ペルソナ | 安心して投稿でき、自分の投稿のステータスと判断理由が見える |
| レビュアー | 想定ペルソナ | 効率的にレビューでき、判断根拠が残る |
| 管理者 | 想定ペルソナ | 公開範囲変更・取り下げ等の強権操作が AuditLog に残り、責任が明示される |
| 監査担当 (auditor) | 想定ペルソナ | 監査ログを **読むだけ** で改竄不能、任意の操作の経緯を後から再構成できる |
| 法務・コンプライアンス | 想定ペルソナ | 同意ログ・判断ログが残っており、個人情報保護・誹謗中傷リスクへの対応が運用されている |

> 本プロジェクトは学習目的の単独開発であり、「想定ペルソナ」は実在の関係者ではなく
> ユーザストーリ設計のための仮想ロールである。実在ステークホルダーはプロダクトオーナーと
> 開発リード（Claude）の 2 者のみ。
> 詳細・関係性は `docs/00-discovery/03-stakeholder-notes.md` を参照。

## 3. スコープ

### スコープ内（MVP）

- 投稿の作成・提出フロー（draft / submitted）と倫理ガード（REQ-002, REQ-013）
- 公開前レビュー・承認フロー（submitted → in_review → approved / returned / rejected）（REQ-003）
- 公開操作（approved → published）と公開範囲適用（REQ-004, REQ-008）
- 取り下げ（published → withdrawn）（REQ-005）
- 差し戻し後の再提出（returned → submitted）（REQ-006）
- 自分の投稿一覧（REQ-007）
- 公開済み投稿の一覧・詳細閲覧（REQ-008）
- レビュー待ち一覧（REQ-009）
- 5 ロール権限分離（REQ-010）
- AuditLog 書き込み（REQ-011）と閲覧（REQ-012）
- 投稿時のプライバシー・倫理ガード（REQ-013）
- 投稿ポリシー・プライバシーポリシー公開ページ（REQ-014）
- モック認証（REQ-015）
- Workers 互換性（NFR-002）、認可境界（NFR-003）、AuditLog append-only（NFR-004）、ログ PII 除外（NFR-005）、セキュリティ最低線（NFR-006）、可観測性（NFR-007）

### スコープ外（明示的に外す）

- 公開範囲の変更（縮小・拡大）（RC-005、Q-010 確定待ちで `needs-clarification`）
- レビュー所要時間 SLA の数値定義（RC-021、Q-004 確定待ちで `needs-clarification`、保留可能性あり）
- データストアの具体選定（RC-024、Q-005 / Q-014 確定待ちで `needs-clarification`、Phase 3 でアーキテクチャ確定時に再起票）
- メール通知 / プッシュ通知（非ゴール）
- AI による自動承認・自動分類（非ゴール、IDEA-008 で将来扱う）
- 添付画像（IDEA-008、将来）
- 通報機能（将来）
- 大規模 SNS 化（投稿者間のコメント・いいね機能）
- 既存自治体システムとのデータ連携
- 多言語対応（MVP は日本語のみ）
- 多要素認証 / SSO
- データ削除申請（GDPR 的）の自動化
- 性能 NFR / 可用性 NFR / アクセシビリティ NFR の数値目標化（`docs/00-discovery/06-goals.md` の「横断 NFR の MVP 非ゴール」を参照）

スコープの議論経緯は `docs/01-requirement-refinement/03-scope-definition.md` を参照。

## 4. ユーザストーリー

> "<ロール> として <目的> したい。なぜなら <価値> だから。"

- US-01: 一般市民として、提案・報告・申請を起票して安心して投稿したい。なぜなら自分の発言が公開リスクと判断結果を伴うことを把握したうえで、自己決定したいから。（REQ-002, REQ-013）
- US-02: 一般市民として、自分の投稿のステータスを後から確認したい。なぜなら届いていることと処理状況を能動的に把握したいから。（REQ-007）
- US-03: 一般市民として、差し戻された投稿を再編集して再提出したい。なぜならフィードバックを反映する経路がないとフローが滞留するから。（REQ-006）
- US-04: 一般市民として、公開範囲（private / internal / public）を投稿時に自己決定したい。なぜならセンシティブな相談を「相談だけしたい」と思っても、公開ルールが不透明だと声を上げられないから。（REQ-013, REQ-008, GOAL-04）
- US-05: レビュアーとして、未処理のレビュー待ち投稿を一覧で把握し、判断理由を添えて承認・差し戻し・却下したい。なぜなら属人的な「メール承認」「口頭 OK」では説明責任が果たせないから。（REQ-003, REQ-009）
- US-06: 管理者として、approved 状態の投稿を明示的に publish 操作で公開したい。なぜなら公開判断は強権操作であり、reviewer の approve とは別の責任ラインで記録したいから。（REQ-004）
- US-07: 管理者として、公開済み投稿を判断理由必須で取り下げたい。なぜなら誤公開・事後問題発覚時に AuditLog に経緯を残しつつ非表示化する必要があるから。（REQ-005）
- US-08: 監査担当として、AuditLog を全件閲覧・フィルタしたい。なぜなら任意の操作の経緯を後から再構成し、内部統制で説明できる必要があるから。（REQ-012）
- US-09: ゲスト（未ログイン）として、投稿ポリシーとプライバシーポリシーをログイン不要で閲覧したい。なぜなら投稿前にルールを確認したいから。（REQ-014）
- US-10: システムとして、UI 出し分けに依存しない認可境界を持ちたい。なぜなら `fetch` 直叩きでの権限バイパスを構造的に防ぐ必要があるから。（NFR-003, REQ-010）

## 5. 要件の索引

### 機能要件
全件は `02-functional-requirements.md` を参照。要点のみ：

- REQ-001: 登録済アカウントでログインできる — approved（サンプル要件、AMB-001 で人間判断待ち）
- REQ-002: 投稿の作成と提出（draft / submitted）— candidate
- REQ-003: 公開前レビュー・承認フロー — candidate
- REQ-004: 投稿の公開と公開範囲の適用 — candidate
- REQ-005: 公開済み投稿の取り下げ — candidate
- REQ-006: 差し戻し後の再提出 — candidate
- REQ-007: 自分の投稿一覧・ステータス確認 — candidate
- REQ-008: 公開済み投稿の閲覧 — candidate
- REQ-009: レビュー待ち一覧 — candidate
- REQ-010: 役割と権限分離（5 ロール）— candidate
- REQ-011: 監査ログの記録（AuditLog 書き込み）— candidate
- REQ-012: 監査ログの閲覧 — candidate
- REQ-013: 投稿時のプライバシー・倫理ガード — candidate
- REQ-014: 投稿ポリシー・プライバシーポリシーの公開ページ — candidate
- REQ-015: 認証（モック）— candidate

### 非機能要件
全件は `03-non-functional-requirements.md` を参照。要点のみ：

- NFR-001: パスワードはハッシュで保管する — approved（サンプル要件、本ドメインでは REQ-015 のモック認証下では非適用）
- NFR-002: Workers 互換ランタイム制約 — candidate
- NFR-003: 認可は server function 側で強制すること — candidate
- NFR-004: AuditLog は append-only であること — candidate
- NFR-005: ログに PII を出さないこと — candidate
- NFR-006: セキュリティ NFR（Cookie 属性 / CSRF / XSS / CSP）— candidate
- NFR-007: 可観測性 NFR（必須ログフィールド / 集約先 / 保持期間）— candidate

### 業務ルール
詳細は `04-business-rules.md` を参照。主要カテゴリ：

- 認証関連（BR-AUTH-01, BR-AUTH-02）
- 横断ルール（BR-COMMON-01: PII の取り扱い）
- 投稿フロー関連（BR-PROPOSAL-01〜03, BR-REVIEW-01〜02, BR-PUBLISH-01〜03, BR-RESUBMIT-01）
- 監査関連（BR-AUDIT-01〜03）
- 認可・ロール関連（BR-AUTHZ-01〜03）
- ガード・ポリシー関連（BR-GUARD-01〜02）

### 用語集
`05-glossary.md` を参照。本プロジェクト固有のドメイン用語（提案 / ステータス / 公開範囲 / ロール / AuditLog / append-only / PolicyAgreement / モック認証 / 認可ヘルパー / 機微取得系 loader / mutation 系 server function / 結果を変える操作 等）を集中登録した（AMB-015 解消、2026-05-04）。

## 6. 制約条件

- **技術制約**:
  - Cloudflare Workers ランタイム互換が必須（NFR-002、IDEA-007）
  - データストアは MVP 初期はインメモリ / モックで開始（RC-024、`needs-clarification`）
  - 認可は単一ヘルパーに集約し、UI 出し分けに依存しない（NFR-003）
  - AuditLog は append-only（NFR-004）
- **法令・コンプライアンス**:
  - 個人情報保護法 / 各自治体の個人情報保護条例の範囲は Q-017 (open) 確定待ち
  - PII を logger に出さない（NFR-005）
  - 投稿時の PolicyAgreement 同意ログを保持する（REQ-013）
- **予算・期日**:
  - 学習プロジェクトのため期日は柔軟。各フェーズの完了は `validate-traceability.ts` の errors=0 を最低条件とする（GOAL-05, GOAL-06）

## 7. オープン課題

要件レベルで未確定の事項。Phase 0 / Phase 1 由来の課題は
`docs/00-discovery/07-open-questions.md` および `docs/01-requirement-refinement/02-ambiguity-review.md` を参照。

| ID | 課題 | 影響範囲（REQ / NFR） | 期限 | ステータス |
| --- | --- | --- | --- | --- |
| Q-004 | レビュー所要時間 SLA の数値定義 | RC-021（needs-clarification） | Phase 2 入口 | open |
| Q-005 | データストアを MVP 段階で D1 に乗せるか | RC-024（needs-clarification） | Phase 3 入口 | open |
| Q-006 | AuditLog および運用ログの保持期間 | REQ-012, NFR-004, NFR-007 | Phase 2 | open |
| Q-008 | PolicyAgreement のバージョニング規約 | REQ-002, REQ-013, REQ-014 | Phase 2 | open |
| Q-010 | 公開範囲の拡大時に投稿者同意を必須とするか | RC-005（needs-clarification） | Phase 1 | proposed-by-claude |
| Q-012 | AuditLog 画面のフィルタ条件の必要性 | REQ-012 | Phase 3 | open |
| Q-014 | `nodejs_compat` 有効化方針 | NFR-002, RC-024 | Phase 3 | open |
| Q-015 | 開発環境での詳細ログ出力可否 | NFR-005 | Phase 6 入口 | open |
| Q-016 | auditor / reviewer の private 投稿本文到達可否 | REQ-008, REQ-009, REQ-010, REQ-012, NFR-003 | Phase 2 入口 | open |
| Q-017 | 適用法令の範囲 | 全 REQ / NFR（横断） | Phase 2 / Phase 6 | open |
| Q-018 | 再提出時の倫理ガード再確認 / PolicyAgreement 再取得の要否 | REQ-006, REQ-013 | Phase 1 / Phase 2 | open |
| Q-019 | 提出操作 (submit) の AuditLog reason 必須要否 | REQ-002, REQ-011 | Phase 1 / Phase 2 | open |
| AMB-001 | RC-001（サンプル）の取り扱い | REQ-001 | 人間判断待ち | open |
| AMB-008 | ユーザ識別子の PII 性 | REQ-015, NFR-005, NFR-007 | Phase 2 | 暫定方針あり |
| AMB-009 | approved → published を「approve と同時」とするか「明示操作」とするか | REQ-004 | Phase 2 | 暫定: 明示操作 |
| AMB-010 | 投稿者本人による取り下げを許すか | REQ-005 | Phase 2 | open |
| AMB-011 | 自分の private 投稿の admin による閲覧可否 | REQ-008, REQ-010 | Phase 2 | open |
| AMB-012 | reason テキストへの PII 混入抑止の仕組み | REQ-011 | Phase 2 | open |

> **要件のステータスについて**:
> - 全 REQ-002〜REQ-015 / NFR-002〜NFR-007 は `### Status: candidate`。
> - `approved` への昇格は **人間の責務**。`### Acceptance Criteria` が空でなく、`### Open Questions` が解消（または明示的に「(なし)」）されていることを確認したうえで人間が押す。
> - REQ-001 / NFR-001 は本ハーネス導入時のサンプル要件として `approved` のまま残置（本プロジェクトのドメインでは AMB-001 で人間判断待ち）。

## 参照

- 上流: `docs/00-discovery/*.md`, `docs/01-requirement-refinement/*.md`
- 下流: `docs/10-basic-design/*.md`
