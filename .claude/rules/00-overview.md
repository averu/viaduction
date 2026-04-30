# 00 — 全体プロセス概要

## 目的

このリポジトリは、要件定義書を起点に Claude Code が **設計・タスク分解・実装** を支援するためのハーネスである。
このルールは、ハーネス全体の動作モデルを宣言する。番号の小さいルールほど抽象度が高い。

## ハーネスのフェーズ

```
[Phase 0] 要件定義  docs/00-requirements/requirements.md
              │
              ▼
[Phase 1] 基本設計  docs/10-basic-design/*.md
              │
              ▼
[Phase 2] 詳細設計  docs/20-detail-design/{screens,apis,db}/*.md
              │
              ▼
[Phase 3] タスク分解 docs/30-implementation-plan/task-breakdown.md
              │
              ▼
[Phase 4] 実装/テスト src/, tests/   ※TASK-ID 必須
```

## 各フェーズの入口（コマンド）と担当エージェント

| Phase | 入口コマンド | 担当 Subagent | 入力 | 出力 |
| --- | --- | --- | --- | --- |
| 0 | `/req-init` | (なし、人間が編集) | (空) | `requirements.md` 雛形 |
| 1 | `/basic-design` | `basic-design-architect` | `requirements.md` | `docs/10-basic-design/*.md` |
| 2 | `/detail-design` | `detail-design-architect` | `docs/10-basic-design/*.md` | `docs/20-detail-design/*.md` |
| 3 | `/task-breakdown` | `task-planner` | `docs/20-detail-design/*.md` | `task-breakdown.md` |
| 4 | `/implement TASK-XXX` | `implementer` | `task-breakdown.md` の指定行 | コード + テスト |
| 横断 | `/design-review` | `design-reviewer` | 任意フェーズの成果物 | レビュー指摘 |
| 横断 | `/trace-check` | `traceability-auditor` | 全 docs | レポート |

## やってはいけないこと(ハードルール)

- 要件にない機能を **勝手に増やさない**。必要なら `REQ-???` を提案として書き、人間に承認を求める。
- 設計ドキュメント間の ID を **改名しない**。改名は人間が `/trace-check` を承認した後で一括して行う。
- 実装系 Subagent は **TASK-ID なしでは動かない**。`TASK-ID 未指定` で呼ばれた場合、即座に拒否してタスク ID を要求する。
- `docs/00-requirements/**` への書き込みは **ask 権限**。Claude が直接編集することは原則しない。

## 推奨される進め方

1. 人間が `requirements.md` を埋める（Claude は `/req-init` で雛形を出すまで）。
2. `/basic-design` で基本設計の骨格を出す。Claude は **既知の要件 ID にのみ** 言及して書く。
3. 基本設計を人間がレビュー → `/design-review` で Claude の自己レビューを補助。
4. `/detail-design` で画面・API・DB の詳細設計を生成。
5. `/task-breakdown` で `TASK-XXX` に分解。各 TASK は **1〜4 時間で完了する粒度** が目安。
6. `/implement TASK-XXX` で 1 タスクずつ実装。完了するたびに `/trace-check` を回す。

## メタ原則

- **トレーサビリティは健全性の一次指標**。`scripts/validate-traceability.ts` がエラーを返すなら、フェーズを進めない。
- **ドキュメントはコードと同じ精度で書く**。曖昧な日本語は避け、固有名詞・数値・例外を明示する。
- **不確かなことは ?? で残す**。Claude が勝手に決めない。
