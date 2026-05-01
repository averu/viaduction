---
id: DISC-QUESTIONS
title: オープン質問（発見フェーズ）
status: draft
owners: []
updated: 2026-04-30
---

# オープン質問（Phase 0）

要件を整理する前に、関係者へ確認したい事項を集約する。
`/interview-requirements` を実行すると、`requirement-interviewer` Subagent が現状の素材を読み、不足情報を質問形式でここに追記する。

## 質問一覧

| ID | 質問 | 回答すべき相手 | 起票日 | 期限 | ステータス | 回答 |
| --- | --- | --- | --- | --- | --- | --- |
| Q-001 |  |  |  |  | open |  |

## ステータスの凡例

| Status | 意味 |
| --- | --- |
| `open` | 未回答 |
| `answered` | 回答済（回答列に内容を記載） |
| `deferred` | 後段（Phase 1 以降）で扱う |
| `dropped` | 不要と判断（理由を回答列に） |

## 質問の書き方

- 1 質問 = 1 行。複合質問は分割する。
- 回答可能な相手を明記する（不在なら「未割当」と書く）。
- 「YES/NO」「数値」「列挙」など、期待する回答の形式が想像できる質問にする。

## 参照

- 上流: `01-idea-notes.md`, `05-pain-points.md`, `04-current-workflow.md`
- 下流: 解決した質問は次フェーズの `RC-XXX` 起票に反映される
