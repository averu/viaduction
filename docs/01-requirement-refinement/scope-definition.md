---
id: RC-SCOPE
title: スコープ定義
status: draft
owners: []
updated: 2026-04-30
---

# スコープ定義

各 `RC-XXX` の `Scope` セクションを横断的にレビューし、**プロジェクト全体としての** スコープ内 / 外を確定する。
個別 RC のスコープ記述と矛盾するときは、ここで議論して解消する。

## プロジェクト全体スコープ

### スコープ内
- (確定したスコープ内項目)

### スコープ外（明示的に外す）
- (確定したスコープ外項目)

### グレーゾーン（未確定）

| 項目 | 関連 RC | 議論の論点 | 決定者 | 期限 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## スコープ判定の指針

`scope-reviewer` Subagent はこのファイルの「スコープ内」「スコープ外」を読み、各 `RC-XXX` の `Scope` 欄が矛盾していないか検査する。

判定の優先順:

1. ビジネスゴール (`docs/00-discovery/goals.md`) と整合するか
2. 既知の制約条件（技術・法令・予算・期日）と矛盾しないか
3. 他の RC のスコープ外項目と重複していないか

## 参照

- 上流: `docs/00-discovery/goals.md` の GOAL、`requirement-candidates.md` の各 RC の Scope
- 下流: `docs/02-requirements/requirements.md` の「3. スコープ」
