# 10 — トレーサビリティ規約

## ID 体系

| 接頭辞 | 種別 | 置き場所 | 採番者 |
| --- | --- | --- | --- |
| `REQ-XXX` | 機能要件 | `docs/00-requirements/requirements.md` | 人間 |
| `NFR-XXX` | 非機能要件 | `docs/00-requirements/requirements.md` または `docs/10-basic-design/06-non-functional.md` | 人間 |
| `UC-XXX` | ユースケース | `docs/10-basic-design/01-system-overview.md` | `basic-design-architect` |
| `SCR-XXX` | 画面 | `docs/10-basic-design/03-screen-list.md` (一覧) / `docs/20-detail-design/screens/SCR-XXX.md` (詳細) | `basic-design-architect` |
| `API-XXX` | API エンドポイント | `docs/10-basic-design/04-api-list.md` (一覧) / `docs/20-detail-design/apis/API-XXX.md` (詳細) | `basic-design-architect` |
| `DB-XXX` | データモデル | `docs/10-basic-design/05-data-model.md` (一覧) / `docs/20-detail-design/db/DB-XXX.md` (詳細) | `basic-design-architect` |
| `TASK-XXX` | 実装タスク | `docs/30-implementation-plan/task-breakdown.md` | `task-planner` |
| `TEST-XXX` | テストケース | 各タスク内、または `tests/` 配下 | `task-planner` / `implementer` |

- `XXX` は **3 桁ゼロ詰め**。100 を超えたら 4 桁に拡張してよい。
- 一度払い出した ID は **再利用しない**。要件が消えた場合は `[DELETED]` 注記を残してリストには残す。
- 接頭辞と数字の間はハイフン 1 つ。`REQ_001` や `REQ001` は不可。

## トレーサビリティの方向

```
REQ ──┬─> UC ──┬─> SCR ──┐
      │        └─> API ──┼─> DB
      └──────────────────┘
NFR ──> 設計のあらゆる層に横断的に適用
TASK ──> {REQ, UC, SCR, API, DB} を参照
TEST ──> {REQ, UC} を検証
```

下流が上流を参照する。各設計ドキュメントの末尾に `## 参照` を必ず置く。
逆向きのリンク（上流から下流）は `docs/{10-basic-design,20-detail-design}/99-traceability.md` に集約する。

## 参照記法

- 同一行に複数 ID がある場合はカンマ区切り: `参照: REQ-001, REQ-002, UC-010`
- 参照は **必ず実在する ID**。存在しない ID を書いた時点でハーネスはエラーとする。
- ID は **どこに書いても良いがフォーマットは固定**: `^([A-Z]+)-(\d{3,})$`

## 必須カバレッジ(`scripts/validate-traceability.ts` が検査する)

| ルール | 重大度 |
| --- | --- |
| すべての `REQ` は少なくとも 1 つの `UC` から参照されている | error |
| すべての `UC` は少なくとも 1 つの `SCR` または `API` から参照されている | error |
| すべての `SCR`/`API` は少なくとも 1 つの `TASK` から参照されている | warn (実装着手前) / error (実装中以降) |
| すべての `TASK` は少なくとも 1 つの `TEST` を持つ (または `untestable: true`) | warn |
| すべての参照 ID は実在する | error |
| ID 重複定義 | error |
| `[DELETED]` ID への新規参照 | error |

## Front-matter 規約

各設計ドキュメントの冒頭は YAML Front-matter で始める：

```markdown
---
id: SCR-001
title: ログイン画面
status: draft | review | approved | deprecated
owners: [@alice]
refs:
  upstream: [UC-001, UC-002]
  downstream: [API-010, API-011]
updated: 2026-04-30
---
```

`refs.upstream` が空の設計ドキュメントは存在してはならない（root の overview を除く）。

## 99-traceability.md について

`docs/10-basic-design/99-traceability.md` および `docs/20-detail-design/99-traceability.md` には、自動生成の表を貼る。手書き編集してはならない。
更新は `npx tsx scripts/validate-traceability.ts --emit` で行う。
