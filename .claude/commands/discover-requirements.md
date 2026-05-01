---
description: docs/00-discovery/ のラフな素材から IDEA-XXX / PROB-XXX を採番して整理する。requirement-analyst Subagent が動く。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: ""
---

# /discover-requirements

`requirement-analyst` Subagent を呼んで `docs/00-discovery/` の素材を構造化します。

## 動作

1. 前提チェック:
   - `docs/00-discovery/` 配下に少なくとも 1 ファイルが存在し、何らかの素材が書かれているか
   - 素材が無ければ「`docs/00-discovery/01-idea-notes.md` 等にラフメモを書いてから再実行してください」と案内して終了
2. `Agent(subagent_type=requirement-analyst)` を呼ぶ。
   - 引数 `$ARGUMENTS` は無視（フェーズ全体を対象にするため）
3. Subagent が `idea-to-requirement-candidates` Skill 経由で `IDEA-XXX` `PROB-XXX` を採番。
4. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行（新採番が既存と衝突していないか確認）。
5. 「`/interview-requirements` で不明点を質問しますか？」と確認。

## 引数: $ARGUMENTS

未使用。引数があれば警告して無視。

## 完了条件

- `01-idea-notes.md` または `02-problem-statement.md` に `IDEA-XXX` または `PROB-XXX` が 1 件以上採番されている
- `validate-traceability.ts` が error を返さない

## 関連コマンド

- 前段: 人間がラフメモを書く
- 次段: `/interview-requirements`（不足情報の抽出）→ `/refine-requirements`（RC 起票）
