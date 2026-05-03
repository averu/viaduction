---
id: RC-ACCEPTANCE
title: 受け入れ条件の起草
status: draft
owners: []
updated: 2026-04-30
---

# 受け入れ条件の起草

各 `RC-XXX` の `Acceptance Criteria Draft` を **観測可能な条件** に書き直す作業場。
ここで磨いた受入条件は、`02-requirements/02-functional-requirements.md` の `### Acceptance Criteria` にコピーされる。

## 望ましい形式

```
- Given <前提条件>
  When <操作・イベント>
  Then <期待結果>
```

または、観測可能な箇条書き：

```
- [ ] <観測可能な条件 1>
- [ ] <観測可能な条件 2>
```

## RC ごとの受入条件作業表

### RC-XXX: <タイトル>

| # | Given | When | Then | TEST 候補 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

> `TEST 候補` 列には将来 `TEST-XXX` として採番される予定の番号を仮置きしてもよい。

## 起草進捗（2026-05-03 第 1 回 BLOCKER 解消ターン）

`/review-requirements all` の acceptance-criteria-reviewer から「RC-002〜RC-021 全件で AC Draft 空欄 (BLOCKER A-00)」の指摘を受け、本ターンで `01-requirement-candidates.md` の各 RC の `### Acceptance Criteria Draft` を Given/When/Then 形式で起草した。本表は集計用。

| 対象 | 起草状態 | 主な観点 | 残課題 |
| --- | --- | --- | --- |
| `RC-002` | 起草済 | 提出成功 / チェック未確認 4xx / PolicyAgreement 未同意 4xx / 他人 draft 提出 403 | 提出 reason 必須要否（Q-019） |
| `RC-003` | 起草済 | start_review / approve / return / reject の遷移 + reason 空 4xx + 認可 403 + 競合 409 | 競合解決方針の最終確定（Phase 3） |
| `RC-004` | 起草済 | admin publish 成功 / reviewer publish 403 / 一般ロール 403 | approve と publish の分離方針（AMB-009） |
| `RC-005` | 部分起草（縮小方向のみ確定） | 縮小方向: admin reason 必須 + AuditLog / 一般ロール 403。拡大方向: Q-010 確定後 | Q-010（投稿者同意の要否） |
| `RC-006` | 起草済 | withdraw 成功 + 公開期間 / reason 空 4xx / 本文非表示 / approved → withdrawn 不可 | 投稿者セルフ取り下げ（AMB-010） |
| `RC-007` | 起草済 | 同一 id 維持 / 差し戻し回数追跡 / 投稿者本人以外 403 | 倫理ガード再確認（Q-018） |
| `RC-008` | 起草済 | 全 8 ステータス可視 / 他ユーザ混入なしの負の AC / guest 401 | ステータス別フィルタ要否（Phase 3） |
| `RC-009` | 起草済 | visibility × viewer 18 セルマトリクス（暫定 15 セル + 本人区別） | private 投稿の reviewer / auditor 閲覧（Q-016） |
| `RC-010` | 起草済 | submitted/in_review 一覧 / 他ステータス除外 / 認可 403 | private 投稿の一覧含有（Q-016） |
| `RC-011` | 起草済 | 5 ロール × 11 操作の禁止セル全件で 401 / 403 | ロール合成ルール（Phase 2）/ admin による private 閲覧（AMB-011） |
| `RC-012` | 起草済 | 結果変更 6 種それぞれの append AC + 共通負の AC | 認可失敗試行のログ要否（Phase 2） |
| `RC-013` | 起草済 | auditor 全件閲覧 + フィルタ / user/guest/reviewer 認可拒否 / update/delete 403 / 本文到達不可（暫定） | Q-016 確定後の本文到達 AC 再評価 |
| `RC-014` | 起草済 | server-side チェックボックス検証 / PolicyAgreement 生成 / private 選択 | 再提出時の再確認（Q-018）/ ポリシー版（Q-008） |
| `RC-015` | 起草済 | guest 200 / 全ロール 200 / バージョン識別子表示 | Q-008 確定後の version 形式 |
| `RC-016` | 起草済 | 許可リスト内 cookie 認証 / 許可リスト外 401 or guest / cookie なし guest / Cookie 属性 | Q-001 最終形 / RC-022 と同期 |
| `RC-017` | 起草済 | wrangler dev 起動 / `wrangler deploy --dry-run` / Node 専用 API 静的検出 / nodejs_compat ADR | Q-014 確定 |
| `RC-018` | 起草済 | 単一エントリ認可ヘルパー / 暫定対象集合の 401-403 E2E / export 数 ≦ 拒否 E2E ケース数 | 機微取得系 loader 最終定義（Phase 2） |
| `RC-019` | 起草済 | grep + コードレビューチェックリスト / repository export 制限 / データ層強制は Phase 3 | データ層強制手段（Phase 3） |
| `RC-020` | 起草済 | logger ホワイトリスト / E2E でログから PII 除外確認 / 生 console 禁止 / 開発環境ルール保留 | Q-015（開発環境ログ） |
| `RC-021` | 部分起草（観測ポイントのみ） | AuditLog から (submitted_at, decision_at) 抽出可能 / KPI 算出可能 | Q-004（SLA 数値）/ Phase 2 入口で `deferred` 倒し判断 |
| `RC-022` | 起草済（新規） | Cookie 属性 / Origin or CSRF token / dangerouslySetInnerHTML 0 件 / CSP ヘッダ | CSRF / CSP の最終仕様（Phase 3） |
| `RC-023` | 起草済（新規） | 必須ログフィールド / 403_reason / 許可外キー検出 / wrangler tail 観測 | Q-006（保持期間） |
| `RC-024` | 未起草（needs-clarification） | Q-005 / Q-014 確定後に起草 | Q-005 / Q-014 |

## アンチパターン

`acceptance-criteria-reviewer` Subagent は次のような書き方を **検出して指摘** する：

| 悪い例 | 何が問題か | 改善 |
| --- | --- | --- |
| 「動作する」 | 観測条件が無い | 「200 OK が返り、画面遷移する」と具体化 |
| 「高速に」 | 数値が無い | 「P95 < 300ms」と数値化 |
| 「適切に」 | 主観的 | 「N 件中 K 件以下のエラー」と客観化 |
| 「将来的に対応」 | 受入条件ではない | 別 RC として起票 or `Out of scope` に |

## 参照

- 上流: `01-requirement-candidates.md` の各 RC の `Acceptance Criteria Draft`
- 下流: `02-requirements/02-functional-requirements.md` の `### Acceptance Criteria`
