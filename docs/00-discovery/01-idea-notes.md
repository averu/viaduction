---
id: DISC-IDEAS
title: アイデアノート
status: draft
owners: []
updated: 2026-05-03
---

# アイデアノート (IDEA-XXX)

人間がラフに書く一次情報。整理は `/discover-requirements` で支援する。
ID 採番は `requirement-analyst` Subagent が行う。

## IDEA 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## IDEA-XXX: アイデアの短いタイトル
>
> ### Source
> どこから来たアイデアか（誰のアイデアか、いつ・どこで思いついたか）
>
> ### Description
> 自由記述で詳細に。技術的な実現性は気にしない。
>
> ### Why interesting
> なぜこのアイデアが価値を持ちうるか。
>
> ### Related
> - 関連する PROB-XXX
> - 関連する競合・先行事例
>
> ### Status
> candidate
> ```

## 一覧（採番済み）

> `requirement-analyst` が `/discover-requirements` で `IDEA-XXX` を採番済み（2026-05-03）。
> 個々の見出しは `IDEA-XXX: タイトル` 形式に統一されている。

### IDEA-001: まちの提案・申請レビューアプリ（プロダクト全体構想）

#### Source
プロダクト構想キックオフ（2026-05-03 ユーザ提示の素材）。学習プロジェクトとしての位置付け。

#### Description
市民・住民・組織メンバーが、地域や組織に関する**提案・報告・申請**を投稿し、
管理者・レビュアーが内容を確認して、**承認・差し戻し・却下・公開範囲の変更**を行えるアプリ。
投稿はすぐに公開せず、レビュー・承認フローを通して公開する。

想定される投稿カテゴリの例：
- 公園や道路などの改善提案
- 街灯・ゴミ・騒音などの課題報告
- 地域イベントの開催申請
- 公開前にレビューが必要な提案
- 個人情報やセンシティブ情報を含む可能性がある相談

#### Why interesting
- 行政・自治会・コミュニティで「とりあえずメールで送る」運用を、レビュー前提のフローに変えられる。
- 説明責任 (accountability) と公開範囲制御を最初から持たせるので、公開後トラブルを抑制できる。

#### Related
- PROB-001: 公開前レビュー無しに投稿が公開されてしまうリスク
- PROB-003: レビュー判断の理由が記録されず説明責任が果たせない
- 競合事例: Decidim、自治体の市民提案フォーム、GitHub Discussions の運用

#### Status
candidate

---

### IDEA-002: 公開前レビュー・承認フロー

#### Source
ユーザ提示の「投稿ステータス」一覧（draft → submitted → in_review → ...）。

#### Description
投稿は `draft / submitted / in_review / returned / approved / published / rejected / withdrawn` の
ステータス機械として進行する。各操作（提出、承認、差し戻し、却下、公開、取り下げ）が
ステータス遷移を発火し、判断理由を必須入力にする。

#### Why interesting
- ステータス機械として扱うことで、UI と server function の責務分離が明確になる。
- 「判断理由必須」をシステムで強制することで、説明責任の運用負荷を下げられる。

#### Related
- PROB-003: レビュー判断の理由が記録されず説明責任が果たせない
- PROB-004: 管理者操作の追跡可能性がない
- PROB-001: 公開前レビュー無しに投稿が公開されてしまうリスク

#### Status
candidate

---

### IDEA-003: 公開範囲（Visibility）の投稿者制御

#### Source
ユーザ提示の「公開範囲」一覧（private / internal / public）。

#### Description
投稿者は `private`（投稿者と管理者のみ）/ `internal`（ログインユーザ全員）/ `public`（全公開）の
3 段階を選べる。レビュー時に管理者が公開範囲を変更できる（縮小/拡大）。
loader と server function の取得制御は **常に Visibility と viewer のロールを掛けて判定**する。

#### Why interesting
- センシティブ相談は `private`、組織内合意形成は `internal`、地域全体への提案は `public` と
  目的別に使い分けられる。
- 「UI で隠す」だけでなく **データアクセス層で弾く** 設計を強制できる。

#### Related
- PROB-006: 投稿者が公開範囲をコントロールできない
- PROB-002: 投稿時の個人情報・センシティブ情報の混入

#### Status
candidate

---

### IDEA-004: 役割分離（user / reviewer / admin / auditor / guest）

#### Source
ユーザ提示の「ロール設計」表。

#### Description
最低 5 ロール (`guest`/`user`/`reviewer`/`admin`/`auditor`) を持つ。
特に **`auditor` は監査ログ閲覧のみ**、`reviewer` は承認/差し戻しはできても監査ログは変更不可、
`admin` は公開範囲変更などの強権を持つが操作はすべて監査される、という非対称設計。

#### Why interesting
- 監査担当を独立ロールにすることで、レビュー実施者と監査者の利害分離が成り立つ。
- ロールごとの能力差を server function 側で強制する設計の練習になる。

#### Related
- PROB-004: 管理者操作の追跡可能性がない
- PROB-005: UI で隠した操作が API から実行できる（権限バイパス）

#### Status
candidate

---

### IDEA-005: 管理者操作の監査ログ

#### Source
ユーザ提示の「監査ログ」要件、技術倫理要件「管理者操作を追跡可能にする」。

#### Description
承認・差し戻し・却下・公開範囲変更・削除など、**結果を変える操作はすべて AuditLog に追記**。
- 誰が（actor + role）
- いつ（timestamp）
- 何を（target proposal id, action）
- なぜ（理由テキスト、必須）
- 何から何へ（before/after status, before/after visibility）

監査ログは `auditor` と `admin` だけが閲覧でき、**書き換え・削除はできない**（append-only）。

#### Why interesting
- 説明責任を果たせる。
- 後から「公開判断の妥当性」を検証できる。

#### Related
- PROB-003: レビュー判断の理由が記録されず説明責任が果たせない
- PROB-004: 管理者操作の追跡可能性がない

#### Status
candidate

---

### IDEA-006: 投稿時のプライバシー・倫理ガード

#### Source
ユーザ提示の「技術倫理・プライバシー要件 / 投稿時」。

#### Description
投稿フォーム送信前に、以下を **UI レベルで明示**：
- 個人情報を入力しない注意喚起
- 第三者を誹謗中傷しない注意喚起
- 公開される可能性があることの明示
- 「非公開相談として扱う」選択肢
- 公開範囲の選択

加えて、投稿時にプライバシーポリシー同意を `PolicyAgreement` として記録する。

#### Why interesting
- 公開後トラブルの源を投稿時点で減らす。
- 同意の記録は法的説明責任にもつながる。

#### Related
- PROB-002: 投稿時の個人情報・センシティブ情報の混入
- PROB-001: 公開前レビュー無しに投稿が公開されてしまうリスク

#### Status
candidate

---

### IDEA-007: TanStack Start + Cloudflare Workers アーキテクチャ採用

#### Source
ユーザ提示の「学習したい技術テーマ」全般。

#### Description
学習目的を兼ねて、以下の構成を採用：
- TanStack Start（routes / loader / server functions / mutation）
- Cloudflare Workers（Edge SSR）
- Cloudflare Vite plugin
- shadcn/ui + Tailwind v4
- 将来段階で Cloudflare D1 / KV / R2 / Turnstile / Queues に拡張

技術選定そのものが学習目的なので、**Workers で動かない Node 専用 API を使わない**点が
全フェーズの不文律の制約になる。

#### Why interesting
- Edge SSR + サーバアクション一体の最新パターンを学べる。
- 公開範囲制御や監査ログの設計と「Edge ランタイム上での権限チェック」は親和性が高い。

#### Related
- このアーキテクチャは Phase 3 `02-architecture.md` で正式決定する。
- Phase 0 では「学習対象として外せない」事実だけ記録。

#### Status
candidate

---

### IDEA-008: 将来拡張候補（記録のみ、MVP 対象外）

#### Source
ユーザ提示の「将来的な拡張候補」一覧。

#### Description
以下は MVP では実装しないが、設計時に拡張可能性として常に意識する：
- Cloudflare D1 / KV / R2 / Turnstile / Queues
- メール通知
- AI によるリスク分類（投稿時の自動チェック補助）
- 添付画像
- データ削除申請（GDPR 的）
- 通報機能
- レート制限
- AI 自動判定でも **必ず人間レビューを前提** にする

#### Why interesting
- 早い段階で「どこに穴を空けておくか」を意識できる。
- AI 自動判定の説明責任は技術倫理上も重要。

#### Related
- 関連 PROB は MVP 内では立てない（拡張時に再評価）。

#### Status
candidate

> 注: 旧サンプル（IDEA-001 ログイン認証）は本プロジェクトのドメインに合わないため
> 削除した。既存サンプルは `git log` で参照可能。

## 参照

このファイルは Phase 0 の素材。上流参照は無い。
- 下流: `docs/01-requirement-refinement/01-requirement-candidates.md` の `RC-XXX` (Source 欄)
