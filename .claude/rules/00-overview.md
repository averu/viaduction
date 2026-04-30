# 00 — 全体プロセス概要

## 目的

このリポジトリは、ラフなアイデア・課題メモから始めて Claude Code が **要件発見 → 要件精査 → 仕様化 → 設計・タスク分解 → 実装 → 検証** を支援するためのハーネスである。
このルールは、ハーネス全体の動作モデルを宣言する。番号の小さいルールほど抽象度が高い。

## ハーネスのフェーズ

```
[Phase 0] Discovery               docs/00-discovery/
              │
              ▼
[Phase 1] Requirement Refinement  docs/01-requirement-refinement/
              │
              ▼
[Phase 2] Requirement Specification docs/02-requirements/
              │
              ▼
[Phase 3] Basic Design            docs/10-basic-design/*.md
              │
              ▼
[Phase 4] Detail Design           docs/20-detail-design/{screens,apis,db}/*.md
              │
              ▼
[Phase 5] Implementation Plan     docs/30-implementation-plan/task-breakdown.md
              │
              ▼
[Phase 6] Coding                  src/, tests/   ※TASK-ID 必須
              │
              ▼
[Phase 7] Verification            docs/40-verification/
```

## 各フェーズの入口（コマンド）と担当エージェント

| Phase | 入口コマンド | 担当 Subagent | 入力 | 出力 |
| --- | --- | --- | --- | --- |
| 0 | `/discover-requirements` | `requirement-analyst` | `docs/00-discovery/*.md` のラフメモ | `IDEA-XXX` `PROB-XXX` 採番 |
| 1 | `/refine-requirements` | `requirement-analyst` | IDEA / PROB | `RC-XXX` 起票 |
| 1' | `/interview-requirements` | `requirement-interviewer` | 任意フェーズの素材 | `Q-XXX` 質問追加 |
| 1'' | `/review-requirements` | 5 種のレビュア Subagent | RC | 指摘集約 |
| 2 | `/specify-requirements` | `requirement-analyst` | `RC-XXX (refined)` | `REQ-XXX (candidate)` 起票 |
| 2' | (人間) | — | `REQ-XXX (candidate)` | `### Status: approved` を押す |
| 3 | `/basic-design` | `basic-design-architect` | `REQ-XXX (approved)` | `docs/10-basic-design/*.md` |
| 4 | `/detail-design` | `detail-design-architect` | 基本設計 | `docs/20-detail-design/*.md` |
| 5 | `/task-breakdown` | `task-planner` | 詳細設計 | `task-breakdown.md` |
| 6 | `/implement TASK-XXX` | `implementer` | task の指定行 | コード + テスト |
| 7 | (人間 + テスト) | — | 実装 | `docs/40-verification/*.md` |
| 横断 | `/design-review` | `design-reviewer` | 任意の設計 | レビュー指摘 |
| 横断 | `/trace-check` | `traceability-auditor` | 全 docs | レポート |

## やってはいけないこと(ハードルール)

- 要件にない機能を **勝手に増やさない**。必要なら `RC-???` を提案として起票し、レビュア通過後に人間承認を求める。
- `RC-XXX` を **直接実装対象にしない**（バリデーションで error）。
- `REQ-XXX (status != approved)` を実装対象にしない（バリデーションで warn / error）。
- 設計ドキュメント間の ID を **改名しない**。改名は人間が `/trace-check` を承認した後で一括して行う。
- 実装系 Subagent は **TASK-ID なしでは動かない**。
- `docs/02-requirements/**` への書き込みは **ask 権限**。Claude が直接編集することは原則しない。
- 要件の `### Status` を **`approved`/`verified` に上げてよいのは人間のみ**。

## 推奨される進め方

1. 人間がメモを `docs/00-discovery/` に書く（idea-notes、pain-points、current-workflow など）。
2. `/discover-requirements` で `IDEA-XXX` `PROB-XXX` を採番。
3. `/interview-requirements` で不明点を質問化し、人間が回答。
4. `/refine-requirements` で `RC-XXX` を起票・整理。
5. `/review-requirements all` で 5 種類のレビュアを並列に回す。BLOCKER が無くなるまで繰り返し。
6. `/specify-requirements` で `RC (refined)` → `REQ (candidate)` に変換。
7. **人間が** `### Status: approved` を押す。
8. `/basic-design` 以降は元の設計フローに合流。

## メタ原則

- **トレーサビリティは健全性の一次指標**。`scripts/validate-traceability.ts` がエラーを返すならフェーズを進めない。
- **ドキュメントはコードと同じ精度で書く**。曖昧な日本語は避け、固有名詞・数値・例外を明示する。
- **不確かなことは質問として残す**。Claude が勝手に決めない。
