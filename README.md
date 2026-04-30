# viaduction — Claude Code 設計駆動開発ハーネス

要件定義書 (`docs/00-requirements/requirements.md`) を起点に、基本設計 → 詳細設計 → 実装タスク → コーディングを **Claude Code** で支援するためのプロジェクトテンプレートです。

## 全体像

```
[要件] docs/00-requirements/
   │  /req-init で雛形を出す。中身は人間が書く。
   ▼
[基本設計] docs/10-basic-design/
   │  /basic-design → basic-design-architect が UC/SCR/API/DB/NFR を採番
   ▼
[詳細設計] docs/20-detail-design/
   │  /detail-design → detail-design-architect が 1 ID 1 ファイルで生成
   ▼
[タスク分解] docs/30-implementation-plan/task-breakdown.md
   │  /task-breakdown → task-planner が TASK-XXX を起こす
   ▼
[実装] src/, tests/
      /implement TASK-XXX → implementer (TASK-ID 必須)
```

横断: `/design-review` (BLOCKER/MAJOR/MINOR の指摘) と `/trace-check` (ID 整合の機械検証)。

## ディレクトリ

```
.
├── .claude/
│   ├── CLAUDE.md              ハーネス全体の指示書
│   ├── settings.json          permissions / hooks
│   ├── rules/                 番号順に適用されるルール群
│   ├── skills/                Claude が呼び出せる手順スキル
│   ├── agents/                Subagent 定義
│   ├── commands/              スラッシュコマンド
│   └── hooks/                 PostToolUse 等のシェルフック
├── docs/
│   ├── 00-requirements/       要件定義 + 用語集
│   ├── 10-basic-design/       基本設計
│   ├── 20-detail-design/      詳細設計 (1 ID 1 ファイル)
│   └── 30-implementation-plan/タスク分解 + マイルストーン
├── scripts/
│   └── validate-traceability.ts   ID 整合検証
└── package.json
```

## 使い方 (典型フロー)

```bash
# 1. 依存をインストール (tsx を使うため)
npm install

# 2. Claude Code を起動 (このディレクトリで)
#    (.claude/ が自動で読み込まれる)
```

Claude Code 内で：

1. `/req-init` — 要件雛形を生成。人間が中身を書く。
2. `/basic-design` — 基本設計を生成。`basic-design-architect` が動く。
3. `/design-review basic` — 設計レビュー (読み取り専用)。
4. `/trace-check` — ID 整合の機械検証。
5. `/detail-design` — 詳細設計を 1 ID 1 ファイルで生成。
6. `/task-breakdown` — TASK-XXX に分解。
7. `/implement TASK-001` — 1 タスクずつ実装 (TASK-ID 必須)。

## ID 体系

| 接頭辞 | 種別 | 採番者 |
| --- | --- | --- |
| `REQ-XXX` | 機能要件 | 人間 |
| `NFR-XXX` | 非機能要件 | 人間 |
| `UC-XXX` | ユースケース | `basic-design-architect` |
| `SCR-XXX` | 画面 | `basic-design-architect` |
| `API-XXX` | API エンドポイント | `basic-design-architect` |
| `DB-XXX` | データモデル | `basic-design-architect` |
| `TASK-XXX` | 実装タスク | `task-planner` |
| `TEST-XXX` | テストケース | `task-planner` / `implementer` |

トレーサビリティ：

```
REQ ──┬─> UC ──┬─> SCR ──┐
      │        └─> API ──┼─> DB
      └──────────────────┘
TASK ──> {REQ, UC, SCR, API, DB} を参照
TEST ──> {REQ, UC} を検証
```

## 検証スクリプト

```bash
# 検証のみ (終了コード: 0=OK / 1=ERR / 2=WARN)
npm run trace

# 99-traceability.md を再生成
npm run trace:emit

# JSON で出力 (CI 連携用)
npm run trace:json
```

ポイント：
- 例示用の ID（説明文中の書式サンプル）は **コードフェンス（```` ``` ````）の中に書けば検証対象から外れる**。本物の ID は本文中の表や `### XXX-NNN —` 見出しに書く。
- 自動生成ブロック (`<!-- TRACE:NAME:START --> ... <!-- TRACE:NAME:END -->`) も検証対象から外れる。手で編集しない。
- `_TEMPLATE.md` で終わるファイルは丸ごとスキップ。

## フレッシュチェックアウト時の初期状態

このリポジトリをそのままチェックアウトすると、`npm run trace` は次の状態になる：

```
結果: WARN (errors=0, warnings=2)
```

- 警告内容: ログイン例の `SCR-001` `API-001` がまだ TASK に紐づいていない
- これは **意図された状態**。基本設計まで終わっているが、`/task-breakdown` をまだ実行していない、という想定。
- 実プロジェクト開始時は、サンプル例（`requirements.md` の REQ-001、`01-system-overview.md` の UC-001 など）を自分の要件に置き換えてから `/basic-design` を回してください。

## 安全に関する初期設定

- 破壊的コマンド (`rm -rf`、`git push --force`、`git reset --hard` 等) は `.claude/settings.json` で deny。
- `git commit` / `git push` / `gh pr` / 依存追加 / `docs/00-requirements/` への書き込みは ask 権限。
- レビュア系 Subagent (`design-reviewer`, `traceability-auditor`) は読み取り専用。
- 実装系 Subagent (`implementer`) は **TASK-ID 必須**。指定が無いと拒否する。

詳細は `.claude/rules/50-safety.md` を参照。

## 拡張のヒント

- 言語・フレームワーク固有の規約は `.claude/rules/30-coding-style.md` に追記。
- 新しい設計章を増やす場合は (1) `docs/10-basic-design/` にファイル追加 (2) `basic-design-architect.md` の出力リスト更新 (3) `validate-traceability.ts` の対象に組み込む、の 3 点を変更。
- 別言語のフィールドを ID に増やしたい場合は `validate-traceability.ts` の `PREFIXES` を拡張。

## ライセンス

このテンプレート自体は MIT 相当を想定。プロジェクト固有のライセンスを上書きする場合は LICENSE を追加してください。
