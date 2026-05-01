# viaduction — Claude Code 設計駆動開発ハーネス

ラフなアイデアや業務メモから始めて、要件発見 → 要件精査 → 仕様化 → 基本設計 → 詳細設計 → 実装タスク → コーディング → 検証までを **Claude Code** で支援するためのプロジェクトテンプレートです。

## 全体像

```
[Phase 0] 発見          docs/00-discovery/
   │  /discover-requirements → IDEA-XXX / PROB-XXX を採番
   ▼
[Phase 1] 精査          docs/01-requirement-refinement/
   │  /interview-requirements → 質問抽出
   │  /refine-requirements   → RC-XXX を起票
   │  /review-requirements   → 5 種レビュアを並列実行
   ▼
[Phase 2] 仕様化        docs/02-requirements/
   │  /specify-requirements  → REQ-XXX (candidate) を起票
   │  ※ status=approved を押すのは人間のみ
   ▼
[Phase 3] 基本設計      docs/10-basic-design/
   │  /basic-design → UC/SCR/API/DB/NFR を採番
   ▼
[Phase 4] 詳細設計      docs/20-detail-design/
   │  /detail-design → 1 ID 1 ファイルで生成
   ▼
[Phase 5] タスク分解    docs/30-implementation-plan/01-task-breakdown.md
   │  /task-breakdown → TASK-XXX を起こす
   ▼
[Phase 6] 実装          src/, tests/
   │  /implement TASK-XXX → implementer (TASK-ID 必須)
   ▼
[Phase 7] 検証          docs/40-verification/
        テスト緑 → 人間が verified を承認

[Phase 0.5 補助] 外部インプット   docs/05-external-inputs/
   /import-external-input → SRC-XXX / QA-XXX 採番（PII 除去）
   /analyze-external-qa  → DEC / OQ / CONFLICT に分類
   /plan-doc-reflection  → Reflection Plan 起草（書き込みなし）
   /reflect-external-input → 既存 / 新規ドキュメントへ反映
```

横断: `/design-review` (BLOCKER/MAJOR/MINOR の指摘) と `/trace-check` (ID 整合の機械検証)。

## ディレクトリ

```
.
├── .claude/
│   ├── CLAUDE.md              ハーネス全体の指示書
│   ├── settings.json          permissions / hooks
│   ├── rules/                 番号順 (00〜50) + git/github-workflow + external-input-handling
│   ├── skills/                Skill 定義 (入口 19 + 参照 1。/skill-name で起動 / 自動発火)
│   ├── agents/                Subagent 定義 (要件系 7 + 設計系 6 + 外部系 4)
│   └── hooks/                 PostToolUse 等のシェルフック
├── .github/
│   └── pull_request_template.md  PR 説明欄のテンプレート
├── docs/
│   ├── 00-discovery/             IDEA / PROB / 痛み / ゴール / 質問
│   ├── 01-requirement-refinement/ RC + 5 種のレビュー素材
│   ├── 02-requirements/          正式要件 (REQ / NFR / 業務ルール / 用語集)
│   ├── 05-external-inputs/       外部 Q&A 取り込み (SRC / QA / DEC / OQ / CONFLICT)
│   ├── 10-basic-design/          基本設計
│   ├── 20-detail-design/         詳細設計 (1 ID 1 ファイル)
│   ├── 30-implementation-plan/   タスク分解 + マイルストーン
│   └── 40-verification/          検証計画・結果・受入承認
├── scripts/
│   └── validate-traceability.ts  ID 整合検証
└── package.json
```

## 使い方 (典型フロー)

```bash
# 1. 依存をインストール
npm install

# 2. Claude Code を起動 (このディレクトリで)
#    .claude/ が自動で読み込まれる
```

Claude Code 内で：

1. 人間が `docs/00-discovery/01-idea-notes.md` `05-pain-points.md` 等にラフメモを書く。
2. `/discover-requirements` — IDEA-XXX / PROB-XXX を採番。
3. `/interview-requirements` — 不明点を質問化。人間が回答。
4. `/refine-requirements` — RC-XXX を起票して整理。
5. `/review-requirements all` — 5 種レビュアを並列実行。BLOCKER 解消まで反復。
6. `/specify-requirements` — RC (refined) → REQ (candidate) に変換。
7. **人間が** `### Status: approved` に変更。
8. `/basic-design` — UC/SCR/API/DB を採番。
9. `/design-review basic` → `/trace-check` で確認。
10. `/detail-design` → `/task-breakdown` → `/implement TASK-001` の順に進む。

## ID 体系

| 接頭辞 | 種別 | 採番者 |
| --- | --- | --- |
| `IDEA-XXX` | アイデア | `requirement-analyst` |
| `PROB-XXX` | 解決したい課題 | `requirement-analyst` |
| `RC-XXX` | 要件候補（未承認） | `requirement-analyst` |
| `REQ-XXX` | 機能要件（人間承認済） | 人間（Claude は `candidate` まで） |
| `NFR-XXX` | 非機能要件 | 同上 |
| `UC-XXX` | ユースケース | `basic-design-architect` |
| `SCR-XXX` | 画面 | `basic-design-architect` |
| `API-XXX` | API エンドポイント | `basic-design-architect` |
| `DB-XXX` | データモデル | `basic-design-architect` |
| `TASK-XXX` | 実装タスク | `task-planner` |
| `TEST-XXX` | テストケース | `task-planner` / `implementer` |
| `SRC-XXX` | 外部情報ソース | `external-input-analyst` |
| `QA-XXX` | 外部 Q&A | `external-input-analyst` |
| `DEC-XXX` | 外部由来の決定事項 | `external-input-analyst` |
| `OQ-XXX` | 外部由来の未決事項 | `external-input-analyst` |
| `CONFLICT-XXX` | 既存資料との矛盾 | `external-input-analyst` / `external-conflict-reviewer` |

トレーサビリティ：

```
IDEA / PROB ──> RC ──> REQ ──┬─> UC ──┬─> SCR ──┐
                              │        └─> API ──┼─> DB
                              └──────────────────┘
TASK ──> {REQ, UC, SCR, API, DB} を参照
TEST ──> {REQ, UC} を検証
```

## 要件ステータス

要件 (`RC-XXX` / `REQ-XXX` / `NFR-XXX`) の `### Status` セクションは次のいずれか：

```
candidate ─[レビュア通過]─> needs-clarification ─[人間補足]─> refined
refined  ─[/specify-requirements]─> 02-requirements の REQ (status=candidate)
candidate (REQ) ─[人間承認]─> approved ─[実装]─> implemented ─[検証]─> verified
                                                   ↓
                                       却下 / 保留: rejected / deferred
```

**Claude は `approved` `verified` を押さない**。これらは人間の責務。

## 検証スクリプト

```bash
# 検証のみ (終了コード: 0=OK / 1=ERR / 2=WARN)
npm run trace

# 99-traceability.md / 99-traceability-seed.md を再生成
npm run trace:emit

# JSON で出力 (CI 連携用)
npm run trace:json
```

検査内容：

| 種別 | 重大度 |
| --- | --- |
| 未定義 ID への参照 | error |
| ID 重複定義（4 箇所以上） | error |
| `REQ` がいずれの `UC` からも参照されない | error |
| `UC` がいずれの `SCR/API` からも参照されない | error |
| `SCR/API` がいずれの `TASK` からも参照されない | warn |
| `DB` がいずれの `API` からも参照されない | warn |
| `TASK` に `TEST` が無い | warn |
| **`TASK` が `RC-XXX` を直接参照** | **error** |
| **`REQ approved` で `### Acceptance Criteria` が空** | **error** |
| **`REQ approved` で `### Open Questions` が残る** | **error** |
| `TASK` が `REQ (status != approved)` を参照 | warn |

ポイント：
- 例示用の ID（説明文中の書式サンプル）は **コードフェンス（```` ``` ````）の中に書けば検証対象から外れる**。
- 自動生成ブロック (`<!-- TRACE:NAME:START --> ... <!-- TRACE:NAME:END -->`) も検証対象から外れる。手で編集しない。
- `_TEMPLATE.md` で終わるファイルは丸ごとスキップ。

## フレッシュチェックアウト時の初期状態

このリポジトリをそのままチェックアウトすると、`npm run trace` は次の状態になる：

```
結果: WARN (errors=0, warnings=2)
```

- 警告内容: ログイン例の `SCR-001` `API-001` がまだ TASK に紐づいていない
- これは **意図された状態**。基本設計まで終わっているが `/task-breakdown` を実行していない、という想定。
- サンプルチェーンは `IDEA-001 → PROB-001 → RC-001 → REQ-001 → UC-001 → SCR-001/API-001 → DB-001/DB-002` まで揃っている。
- 実プロジェクト開始時はサンプル一式を削除し、自分の要件で `/discover-requirements` から始めてください。

## 安全に関する初期設定

- 破壊的コマンド (`rm -rf`、`git push --force`、`git reset --hard` 等) は `.claude/settings.json` で deny。
- `git commit` / `git push` / `gh pr` / 依存追加 / `docs/02-requirements/` への書き込みは ask 権限。
- レビュア系 Subagent (5 種要件レビュア + `design-reviewer` + `traceability-auditor`) は **読み取り専用**。
- 実装系 Subagent (`implementer`) は **TASK-ID 必須**。指定が無いと拒否する。
- **要件の `approved` / `verified` は Claude が押さない**（rule 50-safety で禁止）。

詳細は `.claude/rules/50-safety.md` を参照。

## 外部 Q&A の取り込み (Phase 0.5)

Backlog / GitHub Issues / スプレッドシート / 議事録 / チャットログなど、Git 外で行われた質疑応答を取り込む補助フェーズ。

```
人間が貼り付け or エクスポート
  ↓
/import-external-input  → SRC-XXX / QA-XXX 採番、PII 除去
  ↓
/analyze-external-qa    → Decision (DEC) / Open Question (OQ) / Conflict (CONFLICT) に分類
  ↓
/review-external-conflicts (該当時) → 矛盾レビュー
  ↓
/plan-doc-reflection    → Reflection Plan 起草（書き込みなし）
  ↓
人間が承認
  ↓
/reflect-external-input → 既存 / 新規ドキュメントへ反映、出典 ID を残す
```

要点：
- **外部サービスへ直アクセスしない**。人間が貼り付けたものだけを扱う。
- **PII / 認証情報 / 機密情報を docs に転記しない**。
- **REQ への反映は `Status: candidate` のみ**。`approved` への昇格は人間。
- **既存ドキュメントを勝手に上書きしない**。矛盾は `05-conflicts.md` に両論併記。

詳細は `docs/05-external-inputs/README.md` と `.claude/rules/external-input-handling.md`。

## コミットと Pull Request

- **コミット**: Conventional Commits 形式 (`<type>(<scope>): <summary>`)。詳細は `.claude/rules/git-workflow.md`。
- **PR**: タイトルも Conventional Commits。本文は `.github/pull_request_template.md` の構造に従い、Related IDs / Verification / Reviewer Checklist を必ず埋める。詳細は `.claude/rules/github-workflow.md`。
- Claude Code 内で `/prepare-commit` を実行するとコミット案を、`/prepare-pr` を実行するとPR タイトル案と本文案を起草する。**実行は人間の承認後**。
- `Co-Authored-By` トレーラはこのプロジェクトでは付けない。

## 拡張のヒント

- 新しい ID 接頭辞を追加する場合は `scripts/validate-traceability.ts` の `PREFIXES` を拡張。
- 新しいレビュー観点を加えるなら `.claude/agents/` に Read-only Subagent を追加して `/review-requirements` を更新。
- 言語・フレームワーク固有の規約は `.claude/rules/30-coding-style.md` に追記。

## ライセンス

このテンプレート自体は MIT 相当を想定。プロジェクト固有のライセンスを上書きする場合は LICENSE を追加してください。
