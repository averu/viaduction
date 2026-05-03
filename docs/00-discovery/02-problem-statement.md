---
id: DISC-PROBLEMS
title: 解決したい課題
status: draft
owners: []
updated: 2026-05-03
---

# 解決したい課題 (PROB-XXX)

「何を解決したいか」をアクター視点で記述する。`05-pain-points.md` のうち、
解決対象として扱う合意のとれたものをここで `PROB-XXX` として採番する。

## PROB 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## PROB-XXX: 課題タイトル
>
> ### Actor
> 誰の課題か（個人 / チーム / 組織）
>
> ### Current Situation
> 現状で何が起きているか（事実ベース）
>
> ### Impact
> 放置するとどんな悪影響があるか（数値で書けるならベター）
>
> ### Desired Outcome
> 解決した後の理想状態
>
> ### Constraints
> - 解決手段に対する制約（技術 / 法令 / 予算 / 期日）
>
> ### Related
> - IDEA-XXX
> - 05-pain-points.md の該当項目
>
> ### Status
> candidate
> ```

## 一覧（採番済み）

> `requirement-analyst` が `/discover-requirements` で `PROB-XXX` を採番済み（2026-05-03）。
> 個々の見出しは `PROB-XXX: タイトル` 形式に統一されている。

### PROB-001: 公開前レビュー無しに投稿が公開されてしまうリスク

#### Actor
一般市民（投稿者）、レビュアー、管理者、自治体・組織運営者。

#### Current Situation
既存の市民提案チャネル（メール、問い合わせフォーム、紙、SNS）では、
投稿された内容が **公開判断のレビューを経ずに公開** されたり、
逆に **担当者の手元で滞留して公開されないまま** になったりする。
「レビュー → 承認 → 公開」というワークフローを強制するチャネルがない。

#### Impact
- 個人情報や誹謗中傷を含む投稿が公開されてトラブル化する。
- 公開されるべき提案が滞留して市民の不信感を生む。
- 「なぜ公開した／しなかった」が誰にも説明できない。

#### Desired Outcome
投稿は必ず `submitted → in_review → (approved | returned | rejected) → published`
のフローを通り、**人間レビュアーの判断と判断理由** が付与されてから公開される。

#### Constraints
- AI 自動判定で人間レビューを省略してはならない。
- レビュー所要時間は別途 NFR で定義する（ここでは数値は出さない）。

#### Related
- IDEA-002: 公開前レビュー・承認フロー
- IDEA-001: まちの提案・申請レビューアプリ（プロダクト全体構想）
- IDEA-006: 投稿時のプライバシー・倫理ガード
- 05-pain-points.md: 公開後に誹謗中傷が発覚する

#### Status
candidate

---

### PROB-002: 投稿時の個人情報・センシティブ情報の混入

#### Actor
一般市民（投稿者）、被言及者（第三者）、レビュアー。

#### Current Situation
自由記述フォームでは投稿者が悪意なく自分や第三者の **氏名・住所・電話番号・症状** などを
書き込んでしまう。レビュアーが気づかず公開されると流出になる。

#### Impact
- 個人情報保護法・条例違反のリスク。
- 第三者から削除請求・損害賠償請求を受ける可能性。
- 当事者の心理的・社会的損害。

#### Desired Outcome
- 投稿時に「個人情報を書かない」注意喚起と、
  **「非公開相談として扱う」公開範囲の明示的選択肢**が提示される。
- レビュー時に「個人情報チェック」の項目を必須化する。
- 「公開してよい」と判断した理由が AuditLog に残る。

#### Constraints
- 投稿者の入力を Claude / システムが自動でマスキングしない（人間レビュー前提）。
  ※将来の AI 自動分類は補助のみ。

#### Related
- IDEA-006: 投稿時のプライバシー・倫理ガード
- IDEA-003: 公開範囲（Visibility）の投稿者制御
- 05-pain-points.md: 投稿時に個人情報を書いてしまう

#### Status
candidate

---

### PROB-003: レビュー判断の理由が記録されず説明責任が果たせない

#### Actor
レビュアー、管理者、監査担当、被レビュー対象者（投稿者）。

#### Current Situation
現状は「メールで承認」「口頭でOK」など属人的に判断され、
**判断理由の記録が残らない**。後から「なぜ却下したのか」「なぜこの公開範囲にしたのか」が
追跡できない。

#### Impact
- 投稿者からの異議申立てに反論できない。
- 監査・内部統制で説明できない。
- レビュアーが交代すると判断基準がリセットされる。

#### Desired Outcome
承認・差し戻し・却下・公開範囲変更の各操作で **判断理由テキストを必須入力** とし、
AuditLog に append-only で残す。`auditor` ロールが事後検証できる。

#### Constraints
- 判断理由テキストには PII を書かない運用ガイドラインを併設する（システム強制は別途検討）。

#### Related
- IDEA-005: 管理者操作の監査ログ
- IDEA-002: 公開前レビュー・承認フロー
- 05-pain-points.md: レビュー判断が属人化していて再現できない

#### Status
candidate

---

### PROB-004: 管理者操作の追跡可能性がない

#### Actor
監査担当、管理者本人、組織責任者。

#### Current Situation
公開範囲を縮小した、削除した、公開済みのものを取り下げた、といった
**結果を変える操作の履歴** が残らない、または DB を直接見ないと分からない。

#### Impact
- 不正・誤操作の検知が遅れる。
- 「権限を持つ人が暴走しても誰も気づけない」状態。
- 内部監査・外部監査の対象になった時に証拠が出せない。

#### Desired Outcome
- すべての結果変更操作が `AuditLog` に append-only で記録される。
- `auditor` ロールが監査ログを **閲覧のみ可能**（編集・削除不可）。
- ログには `actor / role / action / target / before / after / reason / timestamp` を含む。

#### Constraints
- AuditLog 自体への書き込みは server function 経由のみ（クライアントから直接書けない）。
- ログに PII を書かないため、`reason` テキストのバリデーション方針は別途検討。

#### Related
- IDEA-005: 管理者操作の監査ログ
- IDEA-004: 役割分離（user / reviewer / admin / auditor / guest）
- 05-pain-points.md: 管理者操作の履歴が残らない

#### Status
candidate

---

### PROB-005: UI で隠した操作が API から実行できる（権限バイパス）

#### Actor
全ロール、特に攻撃者・誤操作したユーザ。

#### Current Situation
SPA / SSR アプリでよくあるアンチパターンとして、
「UI でボタンを `role !== "admin"` のとき隠す」だけで済ませ、
**サーバ側の認可チェックを忘れる**。結果、`fetch` を直接叩けば
guest でも承認・削除が実行できる。

#### Impact
- 重大な権限昇格（公開判断や削除を非権限者が行える）。
- 監査ログに「誰が」「どの権限で」やったかの整合が取れなくなる。

#### Desired Outcome
- すべての mutation 系 server function の **入口で認可チェック**を行う。
- UI の出し分けはあくまで UX 向上のためで、認可の本体ではない。
- 認可チェックは「ロール」「Visibility」「リソース所有者一致」の組合せで判定する。

#### Constraints
- TanStack Start の server function / mutation は **必ず権限ヘルパー経由** で書くガイドラインを設ける。
- E2E テストで「権限のない呼び出しが 403 になる」ケースを必ず持つ。

#### Related
- IDEA-004: 役割分離（user / reviewer / admin / auditor / guest）
- IDEA-003: 公開範囲（Visibility）の投稿者制御
- 05-pain-points.md: UI で隠しただけの権限制御がバイパスされる

#### Status
candidate

---

### PROB-006: 投稿者が公開範囲をコントロールできない

#### Actor
一般市民（投稿者）。

#### Current Situation
既存チャネルでは「送ったら最後、どこまで公開されるか分からない」。
センシティブな相談を「相談だけしたい」と思っても、公開ルールが不透明。

#### Impact
- センシティブ相談が来なくなる（声を上げる前に止まる）。
- 投稿者の自己決定権が侵害される。

#### Desired Outcome
投稿時に `private / internal / public` を選べ、
管理者が **拡大方向** に変更する場合は投稿者通知＋判断理由必須、
**縮小方向**（公開→ internal、 internal→private）は管理者単独で可能。

#### Constraints
- 公開範囲の遷移ルールは Phase 1 RC で詳細化。
- 通知手段（メール等）は MVP では未定。当面は画面上の表示のみで充足するか要検討。

#### Related
- IDEA-003: 公開範囲（Visibility）の投稿者制御
- IDEA-006: 投稿時のプライバシー・倫理ガード
- 05-pain-points.md: 投稿者が公開範囲をコントロールできない

#### Status
candidate

> 注: 旧サンプル（PROB-001 認証手段が無くサービスを開始できない）は本プロジェクトのドメインに合わないため
> 削除した。既存サンプルは `git log` で参照可能。

## 参照

- 上流: `01-idea-notes.md`, `05-pain-points.md`
- 下流: `docs/01-requirement-refinement/01-requirement-candidates.md` の `RC-XXX` (Source 欄)
