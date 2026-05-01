---
name: prepare-commit
description: Conventional Commits 形式でコミット案を起草するときに使う。git status / diff を確認し、type/scope/summary とエンドポイントごとの Related ID / Verification を本文に含める。実行はせず、ユーザ承認後に git commit を別途呼ぶ。
argument-hint: "[--split | --single]"
---

# prepare-commit

ユーザが `/prepare-commit` で呼び出す、または「コミットして」と頼まれたとき自動で起動する Skill。
`git-workflow.md` ルールに準拠してコミット **案を提示** するだけで、`git add` / `git commit` の実行は人間承認後の別工程で行う。

## いつ使うか

- 変更を 1 つ以上のコミットにまとめる前
- ユーザが「コミットして」「コミット案出して」と言ったとき
- 既存コミットメッセージのリライトを依頼されたとき

## 動作（コマンド入口としての挙動）

1. 前提チェック：`git status` がクリーンでなければ、変更が無い旨を案内して終了。
2. `Bash(git status --short)` `Bash(git diff --stat)` `Bash(git diff --cached --stat)` `Bash(git log --oneline -10)` で状況把握。
3. `$ARGUMENTS` の解釈：
   - 空 / `--split` → 変更を意味的にグループ化し、必要なら **複数コミット案** を提示
   - `--single` → 1 つのコミットにまとめる前提で起草（混在を承知のうえ）
4. 各グループに対して `git-workflow.md` のテンプレで Header / Body / Footer を起草する。
5. 各案について `git add <files>` の対象ファイルも明示する。
6. 結果をユーザに提示し「この内容で commit してよいですか？」と確認する。

## グループ化の指針

| 元の状態 | type |
| --- | --- |
| 設計ドキュメント (`docs/**`) のみ | `docs` または `design` |
| 実装コード (`src/**`) の追加 | `feat` |
| 実装コード (`src/**`) の修正 | `fix` |
| テストのみ (`tests/**`) | `test` |
| 設定 / `.claude/**` / `package.json` 等 | `chore` / `ci` / `build` |
| リファクタ（振る舞い不変） | `refactor` |
| パフォーマンス改善 | `perf` |
| 整形のみ | `style` |

迷ったら **意味的に変えたか** で判断。挙動が変わるなら `feat` / `fix`、変わらないなら `refactor` / `chore` / `style`。

## scope の選び方

- 機能領域名（`auth` `clock` `billing` 等）が第一候補
- ハーネス系の変更は `claude` `traceability` `requirements` `basic-design` 等
- CI / GitHub 周りは `github` `ci`
- 1 コミットが複数 scope に跨がる場合は分割を検討、それでも 1 コミットなら最も影響が大きい scope を選ぶ

## 必ず守ること

- **検証していないコマンドを実行済みのように書かない**。`Verification` には実行したものだけ記載、未実行は `(not run)` と理由
- **コミット末尾に `Co-Authored-By:` を付けない**（`git-workflow.md` 参照）
- `git add .` / `git add -A` を提案しない。明示パスでステージングする
- 1 コミットに **無関係な変更を混ぜない**。混ざるなら分割を提案する
- BREAKING CHANGE がある場合は footer に必ず明記する
- ユーザの承認なしに `git commit` を実行しない

## 出力フォーマット

```markdown
## コミット案

### 1/3: docs(requirements) — add login REQ template

```
docs(requirements): add login REQ template

Summary:
- Add REQ-001 (login) with Acceptance Criteria.

Reason:
- Required by /specify-requirements output approval.

Related:
- RC-001
- REQ-001

Verification:
- npm run trace (errors=0, warnings=2)

Notes:
- Status は candidate のまま。承認は人間が押してください。
```

stage:
- docs/02-requirements/02-functional-requirements.md

### 2/3: feat(auth) — implement login API handler
...

## 承認後の実行コマンド案
```bash
git add docs/02-requirements/02-functional-requirements.md
git commit -F .claude/.commit-msg-1.txt   # 一時ファイル経由を推奨
```
```

## 完了条件

- 案が `git-workflow.md` の規約を満たしている
- `git add` / `git commit` を **実行していない**
- 検証していないコマンドを Verification に書いていない
- 「これで commit しますか？」とユーザに確認している

## 関連

- ルール: `.claude/rules/git-workflow.md`
- 補完: `prepare-pr`（ブランチ全体を PR にまとめる際）

## やってはいけないこと

- ユーザの承認なしに `git commit` を実行
- `--amend` で既存コミットを書き換える（ユーザが指示した場合のみ）
- `--no-verify` でフックスキップを提案
- 「とりあえず WIP コミット」を勝手に作る
