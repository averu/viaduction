---
name: idea-to-requirement-candidates
description: docs/00-discovery/ のラフなメモ・アイデア・痛みから IDEA-XXX / PROB-XXX を採番して整理するときに使うスキル。requirement-analyst Subagent から呼ばれる。
---

# idea-to-requirement-candidates

## いつ使うか

- `docs/00-discovery/idea-notes.md` `pain-points.md` `current-workflow.md` などにラフな素材が書かれた直後
- `/discover-requirements` コマンドが起動したとき
- まだ `IDEA-XXX` `PROB-XXX` の採番が無い、または不足しているとき

## 何をするか

1. `docs/00-discovery/` 配下の素材を読む（`idea-notes.md` `pain-points.md` `current-workflow.md` `goals.md`）。
2. **未採番の素材** を抽出する（具体的な「思いつき」「痛み」「現状の不満」）。
3. それぞれを `IDEA-XXX` または `PROB-XXX` の雛形に当てはめて転記する。
   - **「こうしたい」** → `IDEA-XXX`
   - **「困っている」「現状こうなっている」** → `PROB-XXX`
4. 不明点・未確認点があれば `docs/00-discovery/open-questions.md` に新しい `Q-XXX` 行を追加する。
5. 採番した ID の一覧と、新しい質問の一覧をユーザに提示する。

## 必ず守ること

- 既存の `IDEA-XXX` / `PROB-XXX` を **改名・削除しない**。重複の疑いがあれば `Status: needs-clarification` を付けて並置する。
- ID の番号は **既存の最大値 + 1** から採番する。欠番は埋めない。
- 素材に書かれていないことを **創作しない**。元のテキストから引用する形で書く。
- 採番した IDEA / PROB を **直接 RC-XXX や REQ-XXX に進めない**。次フェーズの責務。
- このスキルは **書き込みを伴う**。`requirement-analyst` Subagent から呼ばれる前提。

## ID 採番の指針

| 元の素材 | どこに採番するか |
| --- | --- |
| 「〜があったらいいな」 | `idea-notes.md` の `IDEA-XXX` |
| 「〜が不便」「〜で困っている」 | `pain-points.md` 経由で `problem-statement.md` の `PROB-XXX` |
| 業務フローの記述 | `current-workflow.md` （ID なし） |
| 「いつまでに〜したい」 | `goals.md` の `GOAL-NN` （手動採番） |

## 出力フォーマット

```markdown
## 採番結果

- 新規 IDEA: IDEA-001 〜 IDEA-005 (5 件)
- 新規 PROB: PROB-001 〜 PROB-003 (3 件)
- 新規 質問: Q-010 〜 Q-013 (4 件)

## 次のアクション
- 質問を関係者に投げて回答待ちにする
- 回答が揃ったら `/refine-requirements` で RC-XXX を起こす
```

## 注意

- このスキルは **アイデア発散** を支援するもの。**収束**（重複統合・優先順位付け）は次フェーズ (`requirement-refinement`) の仕事。
- 採番が不要と判断した素材は触らずに残す。
