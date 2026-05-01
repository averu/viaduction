---
name: prepare-pr
description: ブランチ全体の差分から Pull Request のタイトルと本文案を起草するときに使う。.github/pull_request_template.md の構造を埋め、Conventional Commits 形式タイトルと Related ID / Verification / Reviewer Checklist を含める。実行はせず、ユーザ承認後に gh pr create を別途呼ぶ。
argument-hint: "[--draft | --ready] [base=main]"
---

# prepare-pr

ユーザが `/prepare-pr` で呼び出す、または PR 起こしを依頼されたときに動く Skill。
`github-workflow.md` ルールに準拠して PR **タイトル案と本文案を提示** するだけで、`gh pr create` は人間承認後の別工程で行う。

## いつ使うか

- 人間が「PR を作って」と言ったとき
- 既存 PR の本文を整える依頼が来たとき
- 大きめのブランチを push する直前に Self-review として PR 文面を起草するとき

## 動作

1. 前提チェック：
   - 現在ブランチが `main` / `master` でないこと（直接 push を防ぐ）
   - 少なくとも 1 つコミットが `main` より進んでいること
2. `Bash(git status)` `Bash(git log origin/main..HEAD --oneline)` `Bash(git diff origin/main...HEAD --stat)` で全体差分を把握。
3. `.github/pull_request_template.md` を読み、必須セクションを把握。
4. `$ARGUMENTS` の解釈：
   - `--draft` (既定) → ドラフト PR として作成案を起草
   - `--ready` → Ready for review 状態を前提
   - `base=<branch>` → ベースブランチ指定（既定: `main`）
5. **PR タイトル** を Conventional Commits 形式で起草。
6. **PR 本文** をテンプレートに沿って起草。プレースホルダ (`<!-- ... -->`) を埋めるか削除。
7. Verification セクションには **実際に実行したコマンド** だけ記載。未実行は `not run` と理由。
8. 結果を提示し「この内容で `gh pr create` を実行してよいですか？」と確認。

## PR タイトルの起草手順

1. `git log origin/main..HEAD --oneline` で各コミットの type/scope/summary を確認
2. もっとも代表的な type/scope を 1 つ選ぶ：
   - すべて `feat(auth)` なら `feat(auth): ...`
   - `feat` + `test` の場合は `feat`、`feat` + `docs` で実装が主なら `feat`
   - 設計のみなら `design` や `docs(<scope>)`
3. summary は実装したものを **動詞で** 簡潔に書く

## PR 本文の起草手順

1. **Summary**: 何を変えたかを 2〜4 行
2. **Purpose**: なぜ変える必要があったか
3. **Related IDs**: 該当する行のみ残し、他は削除
4. **Change Type**: チェックボックスを実態に合わせて埋める
5. **What Changed**: 主要変更を箇条書き 3〜7 件
6. **Design / Requirement Impact**: 影響したフェーズにチェック
7. **Traceability**: ID チェーン
8. **Verification**: 実行ログ（未実行は `not run` と理由）
9. **Reviewer Checklist**: 自分で満たした項目だけチェック
10. **Notes**: 不安な点・設計判断が分かれる点

## 必ず守ること

- **`gh pr create` をユーザの明示確認なしに実行しない**
- **検証していないコマンドを「実行済」と書かない**。未実行は `not run` と理由
- **空欄でマージしない方針**を守る。Related IDs / Reviewer Checklist などの必須セクションを埋める
- 破壊的変更は `Design / Requirement Impact` `Risks` `Rollback Plan` に必ず記載。タイトルにも `!` を付ける
- ドラフト PR で出すか Ready で出すかは **人間判断**。Claude は `--draft` 提案を基本にする

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
  --body-file .claude/.pr-body.md
```
```

## 完了条件

- タイトルが Conventional Commits 形式（英語、命令形、ピリオド無し、50〜72 文字）
- 本文の必須セクションがすべて埋まっている
- Verification に **実行していないコマンドを書いていない**
- 破壊的変更があるなら Risks / Rollback Plan を記載
- `gh pr create` を **実行していない**
- ユーザに承認を求めている

## 関連

- ルール: `.claude/rules/github-workflow.md`
- テンプレ: `.github/pull_request_template.md`
- 補完: `prepare-commit`（コミット単位の整形）

## やってはいけないこと

- ユーザ承認なしの `gh pr create`
- main / master ブランチからの PR 作成
- 既に approved を受けた PR への `git push --force`
- 「だいたい合ってる」「動くはず」のような曖昧な Verification 記述
- 関連 ID を空欄のまま提示
