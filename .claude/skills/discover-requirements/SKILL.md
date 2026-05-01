---
name: discover-requirements
description: docs/00-discovery/ のラフな素材から IDEA-XXX / PROB-XXX を採番して整理する。requirement-analyst Subagent を呼び出す。Phase 0 の入口。
argument-hint: ""
---

# discover-requirements

Phase 0（Discovery）の入口 Skill。`docs/00-discovery/idea-notes.md` `pain-points.md` `current-workflow.md` などのラフメモから `IDEA-XXX` `PROB-XXX` を採番する。

## いつ使うか

- 人間が `docs/00-discovery/` 配下にラフメモを書いた直後
- ユーザが「アイデアを整理して」「課題を ID 化して」と言ったとき
- まだ `IDEA-XXX` `PROB-XXX` の採番が無い、または不足しているとき

## 動作

1. 前提チェック：`docs/00-discovery/` 配下に少なくとも 1 ファイルが存在し、何らかの素材が書かれているか。素材が無ければ案内して終了。
2. `Agent(subagent_type=requirement-analyst)` を呼ぶ。
3. Subagent が以下を実行：
   - `docs/00-discovery/` 配下の素材を読む（`01-idea-notes.md` `05-pain-points.md` `04-current-workflow.md` `06-goals.md`）
   - **未採番の素材** を抽出する（具体的な「思いつき」「痛み」「現状の不満」）
   - それぞれを `IDEA-XXX` または `PROB-XXX` の雛形に当てはめて転記
     - **「こうしたい」** → `IDEA-XXX`
     - **「困っている」「現状こうなっている」** → `PROB-XXX`
   - 不明点・未確認点があれば `docs/00-discovery/07-open-questions.md` に新しい `Q-XXX` 行を追加
4. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行（新採番が既存と衝突していないか確認）。
5. 「`/interview-requirements` で不明点を質問しますか？」と確認。

## 必ず守ること

- 既存の `IDEA-XXX` / `PROB-XXX` を **改名・削除しない**。重複の疑いがあれば `Status: needs-clarification` を付けて並置
- ID の番号は **既存最大値 + 1** から採番。欠番は埋めない
- 素材に書かれていないことを **創作しない**。元のテキストから引用する形で書く
- 採番した IDEA / PROB を **直接 RC-XXX や REQ-XXX に進めない**。次フェーズの責務

## ID 採番の指針

| 元の素材 | どこに採番するか |
| --- | --- |
| 「〜があったらいいな」 | `01-idea-notes.md` の `IDEA-XXX` |
| 「〜が不便」「〜で困っている」 | `05-pain-points.md` 経由で `02-problem-statement.md` の `PROB-XXX` |
| 業務フローの記述 | `04-current-workflow.md` （ID なし） |
| 「いつまでに〜したい」 | `06-goals.md` の `GOAL-NN` （手動採番） |

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

## 完了条件

- `01-idea-notes.md` または `02-problem-statement.md` に `IDEA-XXX` または `PROB-XXX` が 1 件以上採番されている
- `validate-traceability.ts` が error を返さない

## 関連

- 前段: 人間がラフメモを書く
- 次段: `/interview-requirements`（不足情報の抽出）→ `/refine-requirements`（RC 起票）

## やってはいけないこと

- `RC-XXX` `REQ-XXX` を採番する（フェーズ違反）
- `### Status` を `refined` 以上に上げる
- 既存ドキュメントを書き換える
