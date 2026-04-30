---
description: ステージング状況を確認して Conventional Commits 形式のコミット案を起草する。実行はせず、ユーザ承認後に git commit を別途呼ぶ。
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "[--split | --single]"
---

# /prepare-commit

`git-commit-workflow` Skill を起動して、現在の変更を Conventional Commits 形式のコミット案にまとめます。
**自動でコミットは実行しません**。ユーザの承認後に `git add` / `git commit` を別途実行します。

## 動作

1. 前提チェック:
   - リポジトリで `git status` がクリーンでないこと（変更が無ければ案内して終了）
2. `Bash(git status --short)` `Bash(git diff --stat)` `Bash(git diff --cached --stat)` `Bash(git log --oneline -10)` を実行して状況を把握。
3. `$ARGUMENTS` の解釈：
   - 空 / `--split` → 変更を意味的にグループ化し、必要なら **複数コミット案** を提示。
   - `--single` → 1 つのコミットにまとめる前提で起草（混在を承知のうえ）。
4. 各グループに対して `git-workflow.md` のテンプレで Header / Body / Footer を起草。
5. 各案について `git add <files>` の対象ファイルも明示する。
6. 結果をユーザに提示し「この内容で commit してよいですか？」と確認する。

## 引数: $ARGUMENTS

`空` / `--split` / `--single` のいずれか。

## 出力フォーマット

```markdown
## コミット案

### 1/3: docs(requirements) — add login REQ template
ヘッダ: docs(requirements): add login REQ template
本文 / footer: ...
git add 対象:
- docs/02-requirements/functional-requirements.md

### 2/3: feat(auth) — implement login API handler
...

### 3/3: test(auth) — add login API tests
...

## 承認後の実行コマンド案
```bash
git add docs/02-requirements/functional-requirements.md
git commit -F .claude/.commit-msg-1.txt   # ※ 一時ファイル経由を推奨

git add src/api/auth/login.ts
git commit -F .claude/.commit-msg-2.txt
```
```

## 完了条件

- 案が `git-workflow.md` の規約を満たしている
- `git add` / `git commit` を **実行していない**
- 検証していないコマンドを Verification に書いていない
- 「これで commit しますか？」とユーザに確認している

## 関連

- ルール: `.claude/rules/git-workflow.md`
- 次段: ユーザ承認後に `git add` / `git commit` 実行（settings.json で ask 権限）
- 補完: `/prepare-pr`（ブランチ全体を PR にまとめる際）
