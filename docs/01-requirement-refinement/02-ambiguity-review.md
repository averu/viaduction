---
id: RC-AMBIGUITY
title: 曖昧さレビュー
status: draft
owners: []
updated: 2026-05-03
---

# 曖昧さ・矛盾・重複レビュー

`01-requirement-candidates.md` の `RC-XXX` を `ambiguity-reviewer` Subagent が読み、
曖昧さ・矛盾・重複・抜け漏れを指摘するための置き場。

## 指摘一覧

| ID | 対象 RC | 種別 | 影響度 | 内容 | 対応 | ステータス |
| --- | --- | --- | --- | --- | --- | --- |
| AMB-001 | RC-001 | duplicate | MINOR | RC-001 はサンプル（ログイン認証）でドメイン非合致。新ドメインの認証は RC-016（モック認証）で別途定義済。RC-001 は書式参考として温存中。 | 人間判断で `rejected` 化 or 別ファイルへ退避を検討。Claude は手を付けない。 | open |
| AMB-002 | RC-005 | vague | MAJOR | 公開範囲の拡大（internal → public）時に投稿者の同意を要求するか否かが Q-010 の暫定回答に依存。投稿者保護の観点でリスク高。 | Q-010 を人間が承認するか、要求変更（同意必須化）のうえで RC-005 の Status を `candidate` に上げる。 | open |
| AMB-003 | RC-021 | vague | MAJOR | レビュー所要時間 SLA の数値が未定（Q-004 open）。NFR 化に必要な閾値が出ていない。 | Q-004 への回答待ち。回答後に SLA 数値・観測ポイントを RC-021 へ追記。 | open |
| AMB-004 | RC-017 | vague | MAJOR | データストア選定（D1 vs インメモリ）が Q-005 open、`nodejs_compat` 方針が Q-014 open。Workers 互換要件は確定だが、実装手段が不確定。 | Q-005 / Q-014 の回答後、Phase 3 の `02-architecture.md` へ確定事項を引き継ぐ。 | open |
| AMB-005 | RC-013 | vague | MINOR | フィルタ条件（actor / action / 期間）の必要性が Q-012 open、保持期間が Q-006 open。閲覧 UI の最終仕様に影響。 | Q-012 / Q-006 の回答後、Phase 2-3 で UI / 保持ポリシー確定。 | open |
| AMB-006 | RC-014, RC-015 | vague | MAJOR | PolicyAgreement のバージョニング（Q-008 open）。RC-014 と RC-015 が同じ未確定事項に依存。 | Q-008 の回答後、両 RC に同時反映。 | open |
| AMB-007 | RC-020 | vague | MINOR | 開発環境での詳細ログ出力可否が Q-015 open。本番マスク方針は決まっているが、開発時の運用ルールが未定。 | Q-015 の回答後、運用ガイドラインを追記。 | open |
| AMB-008 | RC-002, RC-008 | vague | MINOR | ユーザ識別子の PII 性が Q-001（モック認証）の最終形に依存。モック実装次第で PII 該当の有無が変わる。 | Q-001 が `answered` に確定後、RC-020 と整合確認。 | open |
| AMB-009 | RC-003, RC-004 | gap | MINOR | approved → published の遷移を「approve と同時」とするか「明示的な公開操作」とするかが未確定。RC-003 と RC-004 の境界を曖昧にしている。 | Phase 2 の REQ 起票前に方針確定。 | open |
| AMB-010 | RC-006 | gap | MINOR | 投稿者本人による取り下げの可否が未確定。RC-006 では admin のみ記載。 | Phase 2 で再評価。投稿者セルフ取り下げを別 RC に切り出す可能性あり。 | open |
| AMB-011 | RC-011 | gap | MINOR | 投稿者本人と admin の能力境界（admin が `private` 投稿を閲覧できるか）が RC-009 の取得制御と要整合。 | Phase 2 の REQ 起票時に明示。RC-009 と RC-011 を相互参照させる。 | open |
| AMB-012 | RC-012 | gap | MINOR | AuditLog の `reason` テキストへの PII 混入抑止策（システム強制 vs 運用ガイドラインのみ）が未確定。PROB-003 / PROB-004 の Constraints と接続。 | Phase 2 で別 RC への切り出しを検討。 | open |
| AMB-013 | RC-002, RC-014 | duplicate | MINOR | 倫理ガード UI と PolicyAgreement の責務が RC-002（提出フロー）と RC-014（倫理ガード）で重なる。RC-002 は「提出フロー全体」、RC-014 は「ガード UI と PolicyAgreement の独立要件」として切り出してあるが、Phase 2 では REQ 化時に責務再整理が必要。 | Phase 2 で REQ-XXX に分割する際に再整理。 | open |
| AMB-014 | RC-005 | conflict | MINOR | 「縮小は管理者単独」「拡大は判断理由必須 + AuditLog」と PROB-006 Desired Outcome（拡大時は投稿者通知必須）が部分的に矛盾。Q-010 暫定で「通知 / 同意は MVP 非対象」と決めたが、PROB-006 本文との差分を明示しておく必要。 | Q-010 確定後、PROB-006 の本文更新可否を人間に確認（IDEA / PROB の本文書き換えは Claude 不可）。 | open |
| AMB-015 | RC-002, RC-005, RC-012, RC-014, RC-018, RC-019, RC-023 | gap | MAJOR | 用語集 `02-requirements/05-glossary.md` 未登録の概念が複数 RC で利用されている: `PolicyAgreement` / `visibility` (private/internal/public) / `AuditLog` / `結果を変える操作` / `機微取得系 loader` / `mutation 系 server function` / `認可ヘルパー` / `必須ログフィールド` / `user_id_hash`。Phase 2 の REQ 化前に用語定義を集中管理する必要。 | Phase 2 入口で `requirement-analyst` (specify) が用語集に追記。本フェーズではこの懸念のみ記録。 | open |

### 種別の凡例

| 種別 | 意味 |
| --- | --- |
| `vague` | 数値・条件が曖昧 |
| `conflict` | 別の RC と矛盾 |
| `duplicate` | 別の RC と重複 |
| `gap` | 抜け（例外パスやエッジケース） |
| `untestable` | 受け入れ条件として観測不能 |

### 影響度

| Severity | 意味 |
| --- | --- |
| `BLOCKER` | RC を `refined` に上げてはならない |
| `MAJOR` | 次フェーズの前に解消する |
| `MINOR` | 余裕があれば解消 |

## 指摘の書き方

- 「RC-001 の Acceptance Criteria Draft 第 2 項目: 『高速に』が曖昧 → 数値目標を明示すること」のように、**該当箇所と望ましい修正の両方** を書く。
- 修正そのものはこのファイルでは行わず、`01-requirement-candidates.md` を更新する形で反映する。

## 参照

- 上流: `01-requirement-candidates.md`
- 下流: 修正反映後の `01-requirement-candidates.md` の各 RC
