# 00-discovery — 発見フェーズ (Phase 0)

人間がラフに書いたアイデア・課題・業務メモを **構造化された素材** に整理するフェーズ。
ここで採番されるのは `IDEA-XXX`（思いつきの元ネタ）と `PROB-XXX`（解決したい課題）のみ。
要件 (`RC-XXX`/`REQ-XXX`) はまだ作らない。

## ファイル構成

| ファイル | 内容 | 採番 ID |
| --- | --- | --- |
| `01-idea-notes.md` | アイデア・思いつきの一次情報 | `IDEA-XXX` |
| `02-problem-statement.md` | 解決したい課題 | `PROB-XXX` |
| `03-stakeholder-notes.md` | 関係者の関心・期待 | (なし) |
| `04-current-workflow.md` | 現在の業務フロー | (なし) |
| `05-pain-points.md` | 痛み・困りごとの整理 | (なし) |
| `06-goals.md` | 達成したい目標・KPI | (なし) |
| `07-open-questions.md` | 未確認事項・確認したい相手 | (なし) |

## 進め方

1. 人間がメモやインタビュー素材を `01-idea-notes.md` `04-current-workflow.md` `05-pain-points.md` 等にラフに書く。
2. `/discover-requirements` を実行すると `idea-to-requirement-candidates` Skill 経由で `requirement-analyst` Subagent が動き、`IDEA-XXX` `PROB-XXX` を採番する。
3. 不足情報があれば `07-open-questions.md` に追記される（人間が答える）。
4. 次フェーズ (`docs/01-requirement-refinement/`) で `RC-XXX` を起票。

## 注意

- このフェーズの素材は **すべて draft 扱い**。Claude が承認することはない。
- `IDEA-XXX` `PROB-XXX` は **採番だけして残す**。後段で `RC-XXX` がこれらを `### Source` で参照する。
