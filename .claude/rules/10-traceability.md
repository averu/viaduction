# 10 — トレーサビリティ規約

## ID 体系

| 接頭辞 | 種別 | 置き場所 | 採番者 |
| --- | --- | --- | --- |
| `IDEA-XXX` | アイデア | `docs/00-discovery/01-idea-notes.md` | `requirement-analyst` |
| `PROB-XXX` | 解決したい課題 | `docs/00-discovery/02-problem-statement.md` | `requirement-analyst` |
| `RC-XXX` | 要件候補 | `docs/01-requirement-refinement/01-requirement-candidates.md` | `requirement-analyst` |
| `REQ-XXX` | 機能要件 | `docs/02-requirements/02-functional-requirements.md`（索引は `01-requirements.md`） | 人間が承認 |
| `NFR-XXX` | 非機能要件 | `docs/02-requirements/03-non-functional-requirements.md` | 人間が承認 |
| `UC-XXX` | ユースケース | `docs/10-basic-design/01-system-overview.md` | `basic-design-architect` |
| `SCR-XXX` | 画面 | `docs/10-basic-design/03-screen-list.md` (一覧) / `docs/20-detail-design/screens/SCR-XXX.md` (詳細) | `basic-design-architect` |
| `API-XXX` | API エンドポイント | `docs/10-basic-design/04-api-list.md` (一覧) / `docs/20-detail-design/apis/API-XXX.md` (詳細) | `basic-design-architect` |
| `DB-XXX` | データモデル | `docs/10-basic-design/05-data-model.md` (一覧) / `docs/20-detail-design/db/DB-XXX.md` (詳細) | `basic-design-architect` |
| `TASK-XXX` | 実装タスク | `docs/30-implementation-plan/01-task-breakdown.md` | `task-planner` |
| `TEST-XXX` | テストケース | 各タスク内、または `tests/` 配下 | `task-planner` / `implementer` |

- `XXX` は **3 桁ゼロ詰め**。100 を超えたら 4 桁に拡張してよい。
- 一度払い出した ID は **再利用しない**。要件が消えた場合は `Status: rejected` または `[DELETED]` 注記を残してリストには残す。
- 接頭辞と数字の間はハイフン 1 つ。`REQ_001` や `REQ001` は不可。

## トレーサビリティの方向

```
IDEA / PROB ──> RC ──> REQ ──┬─> UC ──┬─> SCR ──┐
                              │        └─> API ──┼─> DB
                              └──────────────────┘
NFR ──> 設計のあらゆる層に横断的に適用
TASK ──> {REQ, UC, SCR, API, DB} を参照
TEST ──> {REQ, UC} を検証
```

下流が上流を参照する。各設計ドキュメントの末尾に `## 参照` を必ず置く。
逆向きのリンク（上流から下流）は `99-traceability.md` および `02-requirements/99-traceability-seed.md` に集約する。

## 要件ライフサイクルのステータス

`RC-XXX` `REQ-XXX` `NFR-XXX` の `### Status` は次のいずれかを取る：

| Status | 意味 | 取りうる遷移 |
| --- | --- | --- |
| `candidate` | 起票直後 | → `needs-clarification` / `refined` / `rejected` / `deferred` |
| `needs-clarification` | 質問が残っている | → `refined` / `rejected` |
| `refined` | レビュア通過、仕様化前 | → REQ-XXX (candidate) として 02-requirements/ に転記 |
| `approved` | 人間が承認した正式要件 | → `implemented` / `deferred` |
| `implemented` | 実装完了 | → `verified` |
| `verified` | 検証完了 | (終端) |
| `deferred` | 一時保留 | → `candidate` 等に再投入可能 |
| `rejected` | 却下 | (終端) |

**Claude は `approved` `verified` を押さない**。これらは人間の責務。

## 参照記法

- 同一行に複数 ID がある場合はカンマ区切り: `参照: REQ-001, REQ-002, UC-010`
- 参照は **必ず実在する ID**。存在しない ID を書いた時点でハーネスはエラーとする。
- ID は **どこに書いても良いがフォーマットは固定**: `^([A-Z]+)-(\d{3,})$`

## 必須カバレッジ(`scripts/validate-traceability.ts` が検査する)

| ルール | 重大度 |
| --- | --- |
| すべての参照 ID は実在する | error |
| ID 重複定義（同じ ID が 4 箇所以上で定義） | error |
| すべての `REQ` は少なくとも 1 つの `UC` から参照されている | error |
| すべての `UC` は少なくとも 1 つの `SCR` または `API` から参照されている | error |
| すべての `SCR`/`API` は少なくとも 1 つの `TASK` から参照されている | warn (実装着手前) / error (実装中以降) |
| すべての `TASK` は少なくとも 1 つの `TEST` を持つ | warn |
| `TASK` が `RC-XXX` を直接参照する | **error** |
| `TASK` が `REQ-XXX (status != approved)` を参照する | warn |
| `REQ-XXX (status = approved)` が `### Acceptance Criteria` 空 | error |
| `REQ-XXX (status = approved)` が `### Open Questions` 非空 | error |
| `[DELETED]` ID への新規参照 | error |

## Front-matter 規約

各設計ドキュメントの冒頭は YAML Front-matter で始める：

```markdown
---
id: SCR-001
title: ログイン画面
status: draft | review | approved | deprecated   # ファイル単位の状態
owners: [@alice]
refs:
  upstream: [UC-001, UC-002]
  downstream: [API-010, API-011]
updated: 2026-04-30
---
```

`refs.upstream` が空の設計ドキュメントは存在してはならない（root の overview を除く）。
要件 (`REQ-XXX` `RC-XXX` 等) の **個別ステータス** は本文の `### Status` セクションで管理し、Front-matter の `status` とは別物として扱う。

## 99-traceability.md / 99-traceability-seed.md について

- `docs/10-basic-design/99-traceability.md` および `docs/20-detail-design/99-traceability.md` には設計フェーズの自動生成表を貼る。
- `docs/02-requirements/99-traceability-seed.md` には IDEA → PROB → RC → REQ の連鎖と要件ステータス分布を貼る。
- 手書き編集してはならない。更新は `npx tsx scripts/validate-traceability.ts --emit` で行う。
