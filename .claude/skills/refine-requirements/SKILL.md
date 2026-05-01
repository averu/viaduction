---
name: refine-requirements
description: docs/00-discovery の IDEA / PROB から RC-XXX を起こし、曖昧さ・矛盾・重複・スコープを整理する。requirement-analyst Subagent が動く。Phase 1 の入口。
argument-hint: "[IDEA-XXX | PROB-XXX]"
---

# refine-requirements

Phase 1（要件精査）の入口 Skill。`IDEA-XXX` `PROB-XXX` を整理して `RC-XXX` を起票する。

## いつ使うか

- `docs/00-discovery/` に十分な素材が揃っており、Phase 1 に進める段階
- 既存 `RC-XXX` の `Status: needs-clarification` が解消され、再整理する段階

## 動作

1. 前提チェック：
   - `01-idea-notes.md` または `02-problem-statement.md` に `IDEA-XXX` / `PROB-XXX` が 1 件以上存在するか
   - 無ければ `discover-requirements` を案内して終了
   - `07-open-questions.md` に `open` 質問が大量に残っていれば、「先に `interview-requirements` の回答を済ませることを推奨」と警告（継続は可）
2. `$ARGUMENTS` の解釈：
   - 空 → 未着手の IDEA / PROB すべてを対象
   - `IDEA-XXX` / `PROB-XXX` → その ID から派生する RC のみ起票
3. `Agent(subagent_type=requirement-analyst)` を呼ぶ。
4. Subagent が以下を実行：
   - 各 IDEA / PROB を 1 つ以上の `RC-XXX` にマッピング（1:N または N:1 可）
   - `01-requirement-candidates.md` に `## RC-XXX:` 形式で追記。`### Source` に `IDEA-XXX` `PROB-XXX` を必ず列挙
   - 既存 RC との **重複検出**・**矛盾検出** を `02-ambiguity-review.md` に記録
   - スコープ判定を `03-scope-definition.md` のグレーゾーン表に追記
   - 機能 / 非機能 / 業務ルールへの分類を `04-requirement-classification.md` に追記
5. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
6. 「`review-requirements` で BLOCKER を確認しますか？」と促す。

## 必ず守ること

- `RC-XXX` の **新規採番権** を持つ。既存 RC を **改名・削除しない**
- すべての `RC-XXX` の `### Status` は **初期値 `candidate`** で開始。`refined` への昇格はレビュア通過後
- `Source` が空の `RC-XXX` を作らない（必ず IDEA か PROB を 1 つ以上紐づける）
- 自分で **回答を埋めない**。不明点は `interview-requirements` か `07-open-questions.md` に積む

## 整理の指針

| 状況 | アクション |
| --- | --- |
| IDEA が漠然としすぎ | RC 化せず、`07-open-questions.md` に質問を立てて保留 |
| 似た PROB が複数 | RC で集約。Source 欄に複数列挙 |
| 1 つの IDEA に複数の機能要素 | 機能要素ごとに RC を分割 |
| 非機能要件 | `Priority` のあとに `Category: 非機能` のメタ行を追加 |

## 完了条件

- `01-requirement-candidates.md` に新規 `RC-XXX` が 1 件以上追加
- すべての新規 RC の `### Status` が `candidate`
- `validate-traceability.ts` の error が 0

## 出力フォーマット

```markdown
## 整理結果

- 新規 RC: RC-001 〜 RC-008 (8 件)
- 重複として `rejected` にした RC: 2 件
- スコープ外として `deferred` にした RC: 1 件

## 整合性レビュー
- 矛盾: 1 件 (詳細は 02-ambiguity-review.md)
- 重複: 2 件
- 曖昧: 5 件

## 次のアクション
- `review-requirements` で 5 種レビュアを並列実行
```

## 関連

- 前段: `discover-requirements`、`interview-requirements`
- 次段: `review-requirements`（並列レビュア）→ `specify-requirements`（REQ 化）

## やってはいけないこと

- `REQ-XXX` `NFR-XXX` を採番（フェーズ違反）
- 設計フェーズ (`docs/10-basic-design/` 以降) に踏み込む
- 既存 RC の意味を変えてしまうような大幅な書き換え
- ID の改名
