---
id: RC-AMBIGUITY
title: 曖昧さレビュー
status: draft
owners: []
updated: 2026-04-30
---

# 曖昧さ・矛盾・重複レビュー

`01-requirement-candidates.md` の `RC-XXX` を `ambiguity-reviewer` Subagent が読み、
曖昧さ・矛盾・重複・抜け漏れを指摘するための置き場。

## 指摘一覧

| ID | 対象 RC | 種別 | 影響度 | 内容 | 対応 | ステータス |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

### 種別の凡例

| 種別 | 意味 |
| --- | --- |
| `vague` | 数値・条件が曖昧 |
| `conflict` | 別の RC と矛盾 |
| `duplicate` | 別の RC と重複 |
| `gap` | 抜け（例外パスやエッジケース） |
| `untestable` | 受け入れ条件として観測不能 |

### 影響度

| Severity | 意味 |
| --- | --- |
| `BLOCKER` | RC を `refined` に上げてはならない |
| `MAJOR` | 次フェーズの前に解消する |
| `MINOR` | 余裕があれば解消 |

## 指摘の書き方

- 「RC-001 の Acceptance Criteria Draft 第 2 項目: 『高速に』が曖昧 → 数値目標を明示すること」のように、**該当箇所と望ましい修正の両方** を書く。
- 修正そのものはこのファイルでは行わず、`01-requirement-candidates.md` を更新する形で反映する。

## 参照

- 上流: `01-requirement-candidates.md`
- 下流: 修正反映後の `01-requirement-candidates.md` の各 RC
