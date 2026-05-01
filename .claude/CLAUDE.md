# viaduction — 設計駆動開発ハーネス (Claude Code)

このリポジトリは「アイデア・課題メモ → 要件候補 → 正式要件 → 基本設計 → 詳細設計 → 実装タスク → コーディング → 検証」の段階を Claude Code で支援するためのハーネスです。
あなた（Claude）はここに定義された手順・ルール・成果物のフォーマットに従って動作してください。

## 進行プロトコル(必ず守る)

1. **起点は `docs/00-discovery/`**。アイデア・痛み・現状フローはまずここに集約される。
2. **正式要件 `REQ-XXX` の置き場は `docs/02-requirements/`**。`### Status: approved` になっていない要件を実装対象にしない。
3. **要件候補 `RC-XXX` を直接実装対象にしない**（`scripts/validate-traceability.ts` で error）。
4. 段階を飛ばさない。Discovery → Refinement → Specification → Basic → Detail → Plan → Implement → Verify の順。
5. 各成果物には**先頭に Front-matter** とトレーサビリティ表を必ず置く。
6. 設計を書くときは **専用のスラッシュコマンド** を経由するか、対応する Subagent を呼ぶ。
7. **実装系の作業は `TASK-ID` が指定されたときだけ** 行う。`TASK-ID` が無いまま `src/**` を編集してはならない。
8. 破壊的なシェル操作（`rm -rf`、強制 push、`git reset --hard` など）は禁止。
9. すべての成果物・解説は **日本語** で出力する。コード中の識別子・コミットメッセージは英語で良い。

## 成果物の置き場所

| Phase | フェーズ | ディレクトリ | 主担当 Subagent |
| --- | --- | --- | --- |
| 0 | Discovery | `docs/00-discovery/` | `requirement-analyst` |
| 1 | Refinement | `docs/01-requirement-refinement/` | `requirement-analyst` + 5 レビュア |
| 2 | Specification | `docs/02-requirements/` | `requirement-analyst` (specify Skill) |
| 0.5 (補助) | External Inputs | `docs/05-external-inputs/` | `external-input-analyst` + 矛盾レビュア |
| 3 | Basic Design | `docs/10-basic-design/` | `basic-design-architect` |
| 4 | Detail Design | `docs/20-detail-design/` | `detail-design-architect` |
| 5 | Implementation Plan | `docs/30-implementation-plan/` | `task-planner` |
| 6 | Coding | `src/` | `implementer` (TASK-ID 必須) |
| 7 | Verification | `docs/40-verification/` | (人間 + テスト) |

## ID 体系（詳細は `.claude/rules/10-traceability.md`）

| 接頭辞 | 種別 | 採番者 |
| --- | --- | --- |
| `IDEA-XXX` | アイデア | `requirement-analyst` |
| `PROB-XXX` | 解決したい課題 | `requirement-analyst` |
| `RC-XXX` | 要件候補（未承認） | `requirement-analyst` |
| `REQ-XXX` | 正式要件（人間承認済） | 人間（Claude は `candidate` まで） |
| `NFR-XXX` | 非機能要件 | 同上 |
| `UC-XXX` | ユースケース | `basic-design-architect` |
| `SCR-XXX` | 画面 | `basic-design-architect` |
| `API-XXX` | API | `basic-design-architect` |
| `DB-XXX` | データモデル | `basic-design-architect` |
| `TASK-XXX` | 実装タスク | `task-planner` |
| `TEST-XXX` | テストケース | `task-planner` / `implementer` |
| `SRC-XXX` | 外部情報ソース | `external-input-analyst` |
| `QA-XXX` | 外部 Q&A | `external-input-analyst` |
| `DEC-XXX` | 外部由来の決定事項 | `external-input-analyst` |
| `OQ-XXX` | 外部由来の未決事項 | `external-input-analyst` |
| `CONFLICT-XXX` | 既存資料との矛盾 | `external-input-analyst` / `external-conflict-reviewer` |

## ステータス体系（要件のライフサイクル）

```
candidate ─[レビュア通過]─> needs-clarification ─[人間補足]─> refined
refined  ─[/specify-requirements]─> 02-requirements の REQ (status=candidate)
candidate (REQ) ─[人間承認]─> approved ─[実装]─> implemented ─[検証]─> verified
                                  ↓
                          却下 / 保留: rejected / deferred
```

## トレーサビリティの方向

```
SRC ──> QA ──> DEC / OQ / CONFLICT ──┐
                                      ▼
IDEA / PROB ──> RC ──> REQ ──┬─> UC ──┬─> SCR ──┐
                              │        └─> API ──┼─> DB
                              └──────────────────┘
TASK ──> {REQ, UC, SCR, API, DB} を参照
TEST ──> {REQ, UC} を検証
```

参照の向きは **下流が上流を引用する** 形を基本。各設計ドキュメントの末尾に `## 参照` を必ず置く。

## 利用するハーネス機能

- **Skills**: `idea-to-requirement-candidates` / `requirement-interview` / `requirement-refinement` / `requirement-specification` / `traceability-check` / `design-template` / `task-breakdown` / `git-commit-workflow` / `pull-request-workflow` / `external-input-intake` / `external-qa-analysis` / `external-input-to-docs` / `external-conflict-review`
- **Subagents**: `requirement-interviewer` / `requirement-analyst` / `ambiguity-reviewer` / `scope-reviewer` / `business-rule-reviewer` / `non-functional-requirement-reviewer` / `acceptance-criteria-reviewer` / `basic-design-architect` / `detail-design-architect` / `task-planner` / `design-reviewer` / `traceability-auditor` / `implementer` / `external-input-analyst` / `qa-traceability-reviewer` / `document-reflection-planner` / `external-conflict-reviewer`
- **Commands**: `/discover-requirements` `/interview-requirements` `/refine-requirements` `/review-requirements` `/specify-requirements` `/req-init` `/basic-design` `/detail-design` `/task-breakdown` `/design-review` `/trace-check` `/implement` `/prepare-commit` `/prepare-pr` `/import-external-input` `/analyze-external-qa` `/plan-doc-reflection` `/reflect-external-input` `/review-external-conflicts`
- **Hooks**: `PostToolUse` で要件・設計ドキュメント編集後にトレーサビリティの再チェックを促す
- **Validation**: `npx tsx scripts/validate-traceability.ts`

## ルールの読み込み順

このファイルに加えて、`.claude/rules/` 配下のルールはすべて適用される。番号順に上書き解釈：

1. `00-overview.md` — 全体像とフェーズ
2. `10-traceability.md` — ID とトレーサビリティ
3. `20-design-process.md` — 設計プロセス
4. `30-coding-style.md` — コーディング規約
5. `40-review-policy.md` — レビュー方針
6. `50-safety.md` — 安全に関するルール

並列して適用される非番号ルール：

- `git-workflow.md` — Conventional Commits 規約 / Claude のコミット動作
- `github-workflow.md` — Pull Request 規約 / Claude の PR 動作
- `external-input-handling.md` — 外部 Q&A 取り込み・反映規約 / PII 取扱い

衝突したときは **番号が大きい方**（より具体的なルール）を優先する。番号付きと非番号付きが衝突した場合は、内容が具体的な方（典型的には非番号付き）を優先する。

## 困ったとき

- 要件が曖昧なら **自分で書き足さず**、`docs/00-discovery/07-open-questions.md` または `docs/01-requirement-refinement/02-ambiguity-review.md` に質問を残す。
- 要件のステータスが `approved` になっていなければ実装に進まない。レビュア Subagent (`/review-requirements`) を回す。
- 自分の出力に自信が無いとき、対応するレビュア Subagent を呼んで第三者レビューを受ける。
