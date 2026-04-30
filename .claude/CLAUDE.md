# viaduction — 設計駆動開発ハーネス (Claude Code)

このリポジトリは「要件定義書を起点に、基本設計 → 詳細設計 → 実装タスク → コーディング」を Claude Code で支援するためのハーネスです。
あなた（Claude）はここに定義された手順・ルール・成果物のフォーマットに従って動作してください。

## 進行プロトコル(必ず守る)

1. **起点は `docs/00-requirements/requirements.md`**。要件 ID（`REQ-XXX`）が無い記述は仕様として扱わない。
2. 段階を飛ばさない。基本設計が無いまま詳細設計に入らない。詳細設計が無いまま実装に入らない。
3. 各成果物には**先頭に Front-matter** とトレーサビリティ表を必ず置く。
4. 設計を書くときは **`/basic-design` などの専用コマンド** を経由するか、対応する Subagent を呼ぶ。
5. **実装系の作業は `TASK-ID` が指定されたときだけ** 行う。`TASK-ID` が無いまま `src/**` を編集してはならない。
6. 破壊的なシェル操作（`rm -rf`、強制 push、`git reset --hard` など）は禁止。`.claude/settings.json` の `deny` を信頼する前に、まず人間に確認する。
7. すべての成果物・解説は **日本語** で出力する。コード中の識別子・コミットメッセージは英語で良い。

## 成果物の置き場所

| フェーズ | ディレクトリ | 主担当 Subagent |
| --- | --- | --- |
| 要件定義 | `docs/00-requirements/` | (人間が起点) |
| 基本設計 | `docs/10-basic-design/` | `basic-design-architect` |
| 詳細設計 | `docs/20-detail-design/` | `detail-design-architect` |
| 実装計画 | `docs/30-implementation-plan/` | `task-planner` |
| 実装コード | `src/` | `implementer` (TASK-ID 必須) |
| テスト | `tests/` または `src/**/*.test.*` | `implementer` |
| 検証スクリプト | `scripts/` | (共通) |

## ID の命名規則(詳細は `.claude/rules/10-traceability.md`)

- `REQ-XXX` 要件 / `UC-XXX` ユースケース / `SCR-XXX` 画面 / `API-XXX` API / `DB-XXX` データ / `NFR-XXX` 非機能要件
- `TASK-XXX` 実装タスク / `TEST-XXX` テスト
- 番号は 3 桁ゼロ詰め。一度払い出した番号は再利用しない（欠番は許容）。

## トレーサビリティの方向

```
REQ ──┬─> UC ──┬─> SCR ──┐
      │        └─> API ──┼─> DB
      └──────────────────┘

TASK ──> {REQ, UC, SCR, API, DB} を参照
TEST ──> {REQ, UC} を検証
```

参照の向きは **下流が上流を引用する** 形を基本とする。各設計ドキュメントの末尾に `## 参照` セクションを設け、参照する上流 ID を必ず列挙する。

## 利用するハーネス機能

- **Skills**: `traceability-check` / `design-template` / `task-breakdown`
- **Subagents**: `basic-design-architect` / `detail-design-architect` / `task-planner` / `design-reviewer` / `traceability-auditor` / `implementer`
- **Commands**: `/req-init` `/basic-design` `/detail-design` `/task-breakdown` `/design-review` `/trace-check` `/implement`
- **Hooks**: `PostToolUse` でドキュメント編集後にトレーサビリティの再チェックを促す
- **Validation**: `npx tsx scripts/validate-traceability.ts`

## ルールの読み込み順

このファイルに加えて、`.claude/rules/` 配下のルールはすべて適用される。原則として以下の番号順に上書き解釈する：

1. `00-overview.md` — 全体像
2. `10-traceability.md` — ID とトレーサビリティ
3. `20-design-process.md` — 設計プロセス
4. `30-coding-style.md` — コーディング規約
5. `40-review-policy.md` — レビュー方針
6. `50-safety.md` — 安全に関するルール

衝突したときは **番号が大きい方**（より具体的なルール）を優先する。

## 困ったとき

- 要件が曖昧なら **自分で書き足さず**、対応する `REQ-XXX` の `仕様（未確定事項）` セクションに `??` で質問を残し、人間に確認する。
- 設計の選択肢が複数ある場合は、`docs/10-basic-design/02-architecture.md` の `## 検討中の選択肢` に併記し、決定者・期限を明記する。
- 自分の出力に自信が無いとき、`design-reviewer` Subagent を呼んで第三者レビューを受ける。
