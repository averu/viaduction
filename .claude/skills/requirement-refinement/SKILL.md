---
name: requirement-refinement
description: IDEA / PROB / 既存 RC を整理して RC-XXX を起こし、曖昧さ・矛盾・重複・スコープを整理するときに使うスキル。requirement-analyst Subagent から呼ばれる。
---

# requirement-refinement

## いつ使うか

- `docs/00-discovery/` に十分な素材が揃っており、Phase 1 に進める段階
- `/refine-requirements` コマンドが起動したとき
- 既存 `RC-XXX` の `Status: needs-clarification` が `open-questions` 解決により `refined` 候補になったとき

## 何をするか

1. `docs/00-discovery/` から `IDEA-XXX` と `PROB-XXX` を取得。
2. それぞれを **1 つ以上の `RC-XXX`** にマッピングする。
   - 1 つの IDEA が複数の RC に分かれることもある。
   - 複数の PROB が 1 つの RC に集約されることもある。
3. `docs/01-requirement-refinement/requirement-candidates.md` に `## RC-XXX:` 形式で追記する。雛形は同ファイルのコードブロック内に提示済み。
4. 各 RC の `### Source` には `IDEA-XXX` `PROB-XXX` を必ず列挙する。
5. 既存 RC との **重複検出** と **矛盾検出** を行う：
   - 重複 → `ambiguity-review.md` に `duplicate` として記録
   - 矛盾 → `ambiguity-review.md` に `conflict` として記録
6. スコープ判定を行い、`scope-definition.md` の「グレーゾーン」表に追記する（決定者・期限欄は空のまま）。
7. 機能 / 非機能 / 業務ルールへの分類を `requirement-classification.md` に追記する。

## 必ず守ること

- `RC-XXX` の **新規採番権** はこのスキル（および呼び出し元の `requirement-analyst`）が持つ。
- 既存 `RC-XXX` を **改名・削除しない**。代わりに `Status` を変える：
  - 重複と判明 → `rejected`（理由をコメントで残す）
  - 範囲外 → `deferred`
- すべての `RC-XXX` の `### Status` は **初期値 `candidate`** で開始。`refined` への昇格はレビュア Subagent 通過後。
- `RC-XXX` を勝手に `### Status: refined` 以上に上げない。
- `Source` が空の `RC-XXX` を作らない（必ず IDEA か PROB を 1 つ以上紐づける）。

## 整理の指針

| 状況 | アクション |
| --- | --- |
| IDEA が漠然としすぎ | RC 化せず、`open-questions.md` に質問を立てて保留 |
| 似た PROB が複数 | RC で集約。Source 欄に複数列挙 |
| 1 つの IDEA に複数の機能要素 | 機能要素ごとに RC を分割 |
| 非機能要件 | `Priority` のあとに `Category: 非機能` のメタ行を追加して識別 |

## 出力フォーマット

```markdown
## 整理結果

- 新規 RC: RC-001 〜 RC-008 (8 件)
- 重複として `rejected` にした RC: 2 件 (RC-009, RC-010)
- スコープ外として `deferred` にした RC: 1 件 (RC-011)

## 整合性レビュー
- 矛盾: 1 件 (RC-002 と RC-005 で削除ポリシーが食い違う)
- 重複: 2 件 (上記)
- 曖昧: 5 件 (詳細は ambiguity-review.md)

## 次のアクション
- /review-requirements を実行して各レビュア Subagent を回す
```

## 注意

- このスキルは **構造化と分類** が責務。**仕様化** (REQ への変換) は `requirement-specification` スキルの仕事。
- 100 件を超える RC を一度に作らない。マイルストーン単位で区切る。
