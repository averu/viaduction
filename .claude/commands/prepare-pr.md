---
description: ブランチ全体の差分から Pull Request のタイトルと本文を起草する。.github/pull_request_template.md の構造を埋め、関連 ID と検証結果を含める。実行はせず、ユーザ承認後に gh pr create を別途呼ぶ。
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "[--draft | --ready] [base=main]"
---

# /prepare-pr

`pull-request-workflow` Skill を起動して、現在のブランチを PR にまとめる **タイトル案と本文案** を起草します。
**自動で `gh pr create` は実行しません**。ユーザの承認後に別工程で実行します。

## 動作

1. 前提チェック:
   - 現在ブランチが `main` / `master` でないこと（直接 push を防ぐ）
   - 少なくとも 1 つコミットが `main` より進んでいること
2. `Bash(git status)` `Bash(git log origin/main..HEAD --oneline)` `Bash(git diff origin/main...HEAD --stat)` を実行してブランチ全体の差分を把握。
3. `.github/pull_request_template.md` を読み、必須セクションを把握。
4. `$ARGUMENTS` の解釈：
   - `--draft` (既定) → ドラフト PR として作成案を起草
   - `--ready` → Ready for review 状態を前提にした文面（ただし作成は人間判断）
   - `base=<branch>` → ベースブランチ指定（既定: `main`）
5. **PR タイトル** を Conventional Commits 形式で起草。
6. **PR 本文** をテンプレートに沿って起草。プレースホルダ (`<!-- ... -->`) を埋めるか削除。
7. Verification セクションには **実際に実行したコマンド** だけ記載。未実行は `not run` と理由。
8. 結果を提示し「この内容で `gh pr create` を実行してよいですか？」と確認。

## 引数: $ARGUMENTS

`--draft` / `--ready` / `base=<branch>` の組み合わせ。空なら `--draft base=main`。

## 出力フォーマット

```markdown
## PR 案

### タイトル
feat(auth): implement login API and screen

### 本文
# Summary
...

## Purpose
...

## Related IDs
- REQ: REQ-001
- UC: UC-001
- API: API-001
- DB: DB-001, DB-002
- TASK: TASK-001, TASK-002
- TEST: TEST-001, TEST-002

## Change Type
- [x] Feature

## What Changed
- ...

## Verification
```
npm run lint        pass
npm run typecheck   pass
npm run test        pass (24 passed, 0 failed)
npm run trace       pass (errors=0, warnings=0)
```

## Reviewer Checklist
- [x] 関連する REQ / TASK ID が明記されている
- ...

## Notes
- ...

## 承認後の実行コマンド案
```bash
gh pr create --draft \
  --base main \
  --title "feat(auth): implement login API and screen" \
  --body-file .claude/.pr-body.md   # ※ 一時ファイル経由を推奨
```
```

## 完了条件

- タイトルが Conventional Commits 形式（英語、命令形、ピリオド無し、50〜72 文字目安）
- 本文の必須セクション（Summary / Purpose / Related IDs / What Changed / Verification / Reviewer Checklist）がすべて埋まっている
- Verification に **実行していないコマンドを書いていない**
- 破壊的変更があるなら Risks / Rollback Plan を記載
- `gh pr create` を **実行していない**
- ユーザに承認を求めている

## やってはいけないこと

- ユーザ承認なしの `gh pr create`
- 「だいたい合ってる」「動くはず」のような曖昧な Verification 記述
- 関連 ID を空欄のまま提示
- main / master ブランチからの PR 作成（拒否して別ブランチ作成を案内）

## 関連

- ルール: `.claude/rules/github-workflow.md`
- テンプレ: `.github/pull_request_template.md`
- 補完: `/prepare-commit`（コミット単位の整形）
