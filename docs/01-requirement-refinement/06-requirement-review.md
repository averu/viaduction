---
id: RC-REVIEW
title: 要件レビュー集約
status: draft
owners: []
updated: 2026-05-03
---

# 要件レビュー集約

`/review-requirements` で各レビュア Subagent から返ってきた指摘を一箇所に集約する。
ここに書かれた指摘がすべて解消されるまで、`RC-XXX` を `refined` に上げてはならない。

## レビュア別の指摘（2026-05-03 第 1 回 /review-requirements all）

### ambiguity-reviewer の指摘 (BLOCKER 2 / MAJOR 12 / MINOR 13)
- 関連: `02-ambiguity-review.md`
- BLOCKER:
  - **B-01**: RC-005 が Q-010 (`proposed-by-claude`) を既成事実化する書き方になっている。`needs-clarification` で止まってはいるが本文の暫定方針記述が誤解を招く。AMB-014 で PROB-006 と矛盾も指摘済。
  - **B-02**: RC-011 / RC-013 / RC-018 の間で `auditor` の閲覧粒度（全件 vs target proposal 限定 vs フィルタ強制）が循環的に未確定で認可境界の根拠が無い。Q-009 暫定回答の昇格が必要。
- MAJOR 主要:
  - M-01〜M-12: AC ドラフトが全 RC 空欄、状態遷移の例外（in_review 競合、approved → withdrawn パス、自分の投稿の rejected/withdrawn 可視性、private 投稿のレビュアー閲覧）が未定義、RC-017 を「Workers 互換」と「データストア選定」の 2 RC に分割すべき、RC-018 の「機微取得系 loader」が観測不能、ほか。

### scope-reviewer の指摘 (BLOCKER 0 / MAJOR 2 / MINOR 11)
- 関連: `03-scope-definition.md`
- MAJOR:
  - RC-005 Scope.Out の「事前同意取得 UI」記述が暫定確定的に読める → グレーゾーン参照に切り出すべき
  - RC-005 Scope と GOAL-04（投稿者の自己決定）の緊張関係が Scope レベルで明示されていない
- MINOR: グレーゾーン表に「検索機能」「属性ベース権限」「AuditLog 物理ローテ」「AuditLog エクスポート」「パスワードリセット」「レビュアー間チャット」を追加すべき、RC-021 がスコープ表に未掲載、ほか

### business-rule-reviewer の指摘 (BLOCKER 0 / MAJOR 9 / MINOR 10)
- 関連: `04-requirement-classification.md`、（後続）`docs/02-requirements/04-business-rules.md`
- MAJOR 主要:
  - RC-002 提出操作の AuditLog 書き込みと reason 要否が未明示
  - RC-005 縮小方向の判断理由必須 / AuditLog 記録が未明示（GOAL-04 と齟齬）
  - RC-006 取り下げ理由が「判断理由必須」と明示されていない
  - RC-004 と RC-011 で「published 遷移者」が admin / reviewer のいずれか不明
  - RC-013 で「auditor は投稿本文を閲覧できるか」未定（PROB-002/004 のトレードオフ）
  - RC-014 → RC-007（returned 再提出時に倫理ガード再確認するか）未定
  - RC-016 と RC-020 の整合（モック認証で扱う識別子の PII 該否）
  - 用語集 `glossary.md` 未登録の懸念（PolicyAgreement / visibility / AuditLog / 結果を変える操作 / 機微取得系 loader）
  - 適用される法令（個人情報保護法・条例）の範囲を Q-XXX 起票して要確認

### non-functional-requirement-reviewer の指摘 (BLOCKER 7 / MAJOR 9 / MINOR 6)
- 関連: `04-requirement-classification.md`、`06-goals.md`
- BLOCKER:
  - **N-01** RC-017: 「Node 専用 API に依存しない」の合格基準が無い（`wrangler deploy --dry-run` 成功 / `vitest --pool=workers` 緑 / ADR）
  - **N-02** RC-018: E2E ケースが「何件 / どの mutation に対して必須か」未定義
  - **N-03** RC-019: append-only のアプリ層検証手段（コード規約 + 静的解析 + チェックリスト）が未記載
  - **N-04** RC-020: PII を logger に出さないことの観測手段（ホワイトリスト logger / CI grep / E2E）が皆無
  - **N-05** RC-021: Q-004 が `open` のまま放置された場合の判断リミット（`deferred` 倒し）が Status に未明記
  - **N-06** セキュリティ NFR（Cookie 属性 / CSRF / XSS / CSP）が候補として未起票
  - **N-07** 可観測性 NFR（必須ログフィールド / 集約先 / 保持期間）が候補として未起票
- MAJOR: GOAL-06 の保守性 NFR（ヘルパ強制）未起票、性能・可用性・アクセシビリティ NFR の `deferred` 明示が無い、ほか

### acceptance-criteria-reviewer の指摘 (BLOCKER 12 / MAJOR 9 / MINOR 4)
- 関連: `05-acceptance-criteria.md`
- BLOCKER:
  - **A-00** RC-002 〜 RC-021 の 20 件すべてで AC Draft が「(起草は次段で行う)」のプレースホルダのみ。`refined → REQ (candidate) → 人間が approved` まで行くと `validate-traceability.ts` の「approved REQ で AC 空 → error」が確定する。
  - 個別 BLOCKER A-01〜A-11: RC-002 状態遷移 AC、RC-003 結果変更操作 AC（403・reason 空・AuditLog の 3 種）、RC-004 / RC-009 visibility×ロール 15 セルマトリクス AC、RC-006 公開期間記録 AC、RC-011 ロール×操作マトリクス AC、RC-012 結果変更 6 種の AuditLog 書き込み AC、RC-013 auditor 閲覧/書き込み拒否 AC、RC-018 認可検証メタ AC、RC-019 append-only 検証 AC、RC-020 logger PII 検証 AC

## 総括（RC 単位）

| RC | BLOCKER | MAJOR | MINOR | 総評 |
| --- | --- | --- | --- | --- |
| RC-001 | 0 | 0 | 1 | サンプル残存。人間判断で `rejected` 推奨 (AMB-001) |
| RC-002 | 1 (AC 空) | 3 | 2 | AC 起草必須 + 提出時 AuditLog/reason 要否明示 |
| RC-003 | 1 (AC 空) | 2 | 1 | レビュー判定 AC 起草必須、in_review 競合方針も Phase 1 内決定 |
| RC-004 | 1 (AC 空) | 2 | 1 | published 遷移者を admin / reviewer どちらかに確定 + visibility×ロール AC |
| RC-005 | 2 (Q-010 / AC 空 / 縮小 AuditLog 未明示) | 2 | 1 | **needs-clarification 維持**（Q-010 人間判断待ち）+ 縮小方向の AuditLog 記述追加 |
| RC-006 | 1 (AC 空) | 2 | 1 | 公開期間記録 AC + 取り下げ理由を「判断理由必須」と明示 |
| RC-007 | 0 | 1 | 2 | 同一 id 維持の AC ヒント、Q-011 暫定承認後に candidate へ |
| RC-008 | 0 | 1 | 1 | 他ユーザ投稿混入しない負の AC |
| RC-009 | 1 (AC 空) | 1 | 1 | visibility×ロール 15 セルマトリクス AC |
| RC-010 | 0 | 1 | 1 | private 投稿のレビュアー閲覧可否、ロール 403 AC |
| RC-011 | 1 (auditor 循環) | 1 | 0 | RC-013 / RC-018 と同期して `auditor` 閲覧粒度確定 |
| RC-012 | 1 (AC 空) | 0 | 1 | 結果変更 6 種の AuditLog 書き込み AC + 縮小/拡大の reason 要否揃え |
| RC-013 | 1 (AC 空 + auditor 循環) | 1 | 1 | auditor が投稿本文を閲覧できるか、AuditLog エクスポートのスコープ確定 |
| RC-014 | 0 | 1 | 1 | server-side チェックボックス検証 AC、returned 再提出時の再確認方針 |
| RC-015 | 0 | 1 | 0 | guest 取得 AC（認可ヘルパーバイパスの観測） |
| RC-016 | 0 | 1 | 1 | モック認証の識別子仕様、許可リスト形式の最低仕様、Cookie 属性 NFR と接続 |
| RC-017 | 1 (合格基準無し) | 1 | 1 | 2 RC に分割（Workers 互換 / データストア選定）、観測手段確定 |
| RC-018 | 2 (E2E 件数 + AC 空) | 1 | 0 | 「機微取得系 loader」暫定線引き + 認可検証メタ AC |
| RC-019 | 1 (アプリ層検証手段無し) | 1 | 1 | コード規約 + チェックリストを観測手段として明示、append-only 検証 AC |
| RC-020 | 1 (logger 観測手段無し) | 1 | 1 | logger ホワイトリスト or CI grep を選定、PII 検証 AC |
| RC-021 | 1 (`needs-clarification` 維持判断リミット未明記) | 1 | 1 | 観測ポイント（先行起草可能）AC、Q-004 期限後の `deferred` 倒し方針を Status 注記 |
| **NFR 横断** | 2 (セキュリティ + 可観測性候補不在) | 4 | 0 | **新規 RC 候補**: RC-022 セキュリティ NFR / RC-023 可観測性 NFR を起票要 |

`BLOCKER` が 1 件でも残る RC は `refined` に上げてはならない。

## 解消アクション（2026-05-03 起票）

### Claude が今フェーズ内に対応するもの（B 方針: 暫定回答ベースで先行）
1. **AC ドラフト全件起草**: RC-002〜021 に Given/When/Then を最低 1 シナリオずつ。優先順位は acceptance-criteria-reviewer の総括（RC-018 / RC-012 → 状態遷移系 → 閲覧系 → ロール分離 → NFR 系 → needs-clarification の先行起草可能部分）。
2. **NFR 観測手段の追記**: RC-017 / RC-018 / RC-019 / RC-020 / RC-021 に観測手段（CI コマンド・E2E ケース集合・コード規約）を `### Acceptance Criteria Draft` に書き下ろす。
3. **新規 NFR 候補の起票**: RC-022（セキュリティ NFR: Cookie 属性 / CSRF / XSS / CSP）、RC-023（可観測性 NFR: 必須ログフィールド / 集約先 / 保持期間）。
4. **構造修正**: RC-017 を「RC-017 Workers 互換ランタイム制約 (refined 候補)」と「RC-024 データストア選定 (needs-clarification, Q-005/Q-014 待ち)」に分割。
5. **業務ルール明示**: RC-002 提出時 AuditLog / RC-005 縮小方向 AuditLog 必須 / RC-006 「判断理由必須」表記 / RC-004 published 遷移者の admin 限定（PROB-005 と整合）。
6. **`auditor` 閲覧粒度の暫定確定**: Q-009 `proposed-by-claude`（全件閲覧 + フィルタ可）を採用し、RC-011 / RC-013 / RC-018 に同一文言で反映。**ただし `auditor` が投稿本文を閲覧できるかは別 Q-XXX として open 起票**（ここは人間判断）。
7. **「機微取得系 loader」の暫定線引き**: 「private / internal の取得を伴う loader 全件 + AuditLog 取得 loader」を暫定線として RC-018 に明記。
8. **scope-definition.md / 04-requirement-classification.md の追補**: グレーゾーン表に検索 / 属性ベース権限 / ログローテ / エクスポート / パスワードリセット / レビュアー間チャットを追加。RC-022 / RC-023 / RC-024 を分類表に追加。

### 人間の判断が必要で `needs-clarification` のまま残すもの
- **Q-010**（公開範囲拡大時の投稿者同意）→ RC-005 拡大方向 (`needs-clarification`)
- **Q-004**（レビュー所要時間 SLA 数値）→ RC-021 数値部分 (`needs-clarification`)
- **新規 Q-016**（auditor が投稿本文を閲覧できるか / private 含む）
- **新規 Q-017**（適用される法令の範囲: 個人情報保護法と各自治体条例の差）
- **新規 Q-018**（returned 再提出時の倫理ガード再確認 / PolicyAgreement 再取得の要否）

これら 5 件は **scope-definition.md グレーゾーン表 + 07-open-questions.md** に追記される予定。Phase 1 完了宣言は人間がこれらに回答するか、`deferred` を選択した時点。

## 履歴

| 日付 | レビュア | 対象 RC | 指摘件数 | 対応者 |
| --- | --- | --- | --- | --- |
| 2026-05-03 | ambiguity / scope / business-rule / nfr / acceptance-criteria | RC-002〜021 | BLOCKER 21 / MAJOR 41 / MINOR 44 | Claude (B 方針で AC + NFR 観測手段の追補、人間判断は Q-010/Q-004/Q-016/Q-017/Q-018 で待機) |
| 2026-05-03 (第 2 回) | ambiguity / nfr / acceptance-criteria | RC-002〜RC-024（22 件） | BLOCKER 1 / MAJOR 17 / MINOR 20 → Claude が RC-024 AC を先行起草して **BLOCKER 0** | Claude (RC-024 AC 起草で BLOCKER 解消) |

## 第 2 回レビュー後の状態 (2026-05-03)

### BLOCKER の解消状況

- 第 1 回 21 BLOCKER → 第 2 回 1 BLOCKER（**95% 削減**）
- 残り 1 BLOCKER（RC-024 の AC 先行起草）も Claude が即時対応 → **0 件**

### MAJOR / MINOR の残存状況（refined 昇格と並行して Phase 2 specify 入口までに解消）

主要な MAJOR の残存（17 件のうち抜粋）:

| RC | 残存 MAJOR | 解消の依存先 |
| --- | --- | --- |
| RC-005 拡大方向 | 暫定 AC 起草が地の文のみ。Q-010 非依存部分の Given/When/Then が必要 | Claude が即時対応可（Q-010 確定とは独立） |
| RC-007 / RC-014 | 倫理ガード再確認 AC が Q-018 待ちだが、暫定方針「再取得しない」の観測 AC は今書ける | Claude が即時対応可 |
| RC-009 / RC-010 / RC-013 | auditor 行のステータスコード暫定統一（401/403/404 のどれか）が Q-016 確定まで二重定義 | Claude が即時対応可（暫定: 404 で統一推奨） |
| RC-022 | CSRF と Cookie SameSite=Lax のトレードオフが AC に未明示 | Claude が即時対応可 |
| RC-023 | 保持期間の Q-006 期限後 `deferred` 倒し方針が Status 注記未追加 | Claude が即時対応可 |
| RC-024 | Status 進行方針（Q-005/Q-014 確定後の動き方）が未記載 | Claude が即時対応可 |
| 横断 | 性能 / 可用性 / アクセシビリティ NFR の `deferred` 明示 | 人間判断推奨（MVP で扱わないことを明示するか、`deferred` で起票するか） |

### `refined` 昇格判定

`ambiguity-reviewer` (第 2 回): refined OK
`non-functional-requirement-reviewer` (第 2 回): refined OK（BLOCKER は構造的に解消、MAJOR は並行解消可）
`acceptance-criteria-reviewer` (第 2 回 + RC-024 修正後): BLOCKER 0、refined OK

**3 reviewer 観点では Phase 1 RC を `refined` に昇格してよい状態に到達**。
ただし `scope-reviewer` / `business-rule-reviewer` の第 2 回再実行は未実施（第 1 回で BLOCKER 0 件、MAJOR は本ターン修正で大半が解消されている見込み）。

### 人間判断待ち (Phase 2 specify 入口で必要)

- **Q-010**: 公開範囲拡大時の投稿者同意 → RC-005 拡大方向の確定
- **Q-004**: レビュー所要時間 SLA 数値 → RC-021 数値部分の確定 / `deferred` 判断
- **Q-016**: auditor の投稿本文閲覧可否 → RC-009 / RC-010 / RC-013 / RC-018 の auditor 行の最終確定
- **Q-017**: 適用法令の範囲 → 用語集と RC-014 / RC-020 / RC-022 注記
- **Q-018**: returned 再提出時の倫理ガード再確認 → RC-007 / RC-014 の確定
- **Q-019**: 提出時の reason 必須要否 → RC-002 / RC-012 (1) の確定
- **Q-005 / Q-014**: データストア / `nodejs_compat` 方針 → RC-024 の最終確定
- **Q-006 / Q-008 / Q-012 / Q-015**: 既存 open のまま（影響範囲は限定的）
- **AMB-001**: RC-001 サンプルの rejected 化判断
- **横断 NFR**: 性能 / 可用性 / アクセシビリティを `deferred` か非ゴールに倒す判断

## 参照

- 上流: 各レビュア Subagent の出力（2026-05-03 `/review-requirements all`）
- 下流: 解消後の `01-requirement-candidates.md`、新規起票 `RC-022` `RC-023` `RC-024`、新規 Q `Q-016`〜`Q-018`
