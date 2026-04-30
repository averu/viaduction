---
name: pull-request-workflow
description: Pull Request のタイトルと本文を起草するときに使うスキル。.github/pull_request_template.md の構造を埋め、Conventional Commits 形式のタイトルと、関連 ID / 検証結果 / レビューチェックリストを含める。github-workflow.md ルールに準拠する。
---

# pull-request-workflow

## いつ使うか

- 人間が「PR を作って」と言ったとき（実行は `/prepare-pr` 経由か、ユーザ承認後）
- 既存 PR の本文を整える依頼が来たとき
- 大きめのブランチを push する直前に Self-review として PR 文面を起草するとき

## 何をするか

1. `git status` `git log origin/main..HEAD --oneline` `git diff origin/main...HEAD --stat` を実行してブランチ全体の差分を把握する。
2. `.github/pull_request_template.md` を読み、必須セクションを把握する。
3. Conventional Commits 形式の **PR タイトル** を起草する：
   - そのブランチの主目的を表す 1 つの type/scope を選ぶ（複数 type が混ざるなら、最も大きい変更の type を採用し Notes に他を書く）。
   - 50〜72 文字、英語、命令形、ピリオドなし。
4. PR 本文を起草する。テンプレートのプレースホルダ (`<!-- ... -->`) はすべて埋めるか削除する。
5. **検証結果は実際に実行したコマンドのみ** 記載。未実行は `not run` と理由を書く。
6. 起草結果をユーザに提示し、承認後に `gh pr create` 実行へ進む。**実行は別工程**。

## 必ず守ること

- **`gh pr create` をユーザの明示確認なしに実行しない**。settings.json で ask 権限になっているが、Claude も能動的に「この内容で作成してよいか」と確認する。
- **検証していないコマンドを「実行済」と書かない**。未実行は `not run` と理由を明示する。
- **空欄でマージしない方針**を守る。Related IDs / Reviewer Checklist などの必須セクションを埋める。
- 破壊的変更は `Design / Requirement Impact` `Risks` `Rollback Plan` に必ず記載する。タイトルにも `!` を付ける。
- ドラフト PR で出すか Ready for review にするかは **人間判断**。Claude は `--draft` で作成することを基本提案にする。

## PR タイトルの起草手順

1. `git log origin/main..HEAD --oneline` で各コミットの type/scope/summary を確認。
2. もっとも代表的な type/scope を 1 つ選ぶ：
   - すべて `feat(auth)` なら `feat(auth): ...`
   - `feat` + `test` の場合は `feat`、`feat` + `docs` で実装が主なら `feat`
   - 設計のみなら `design` や `docs(<scope>)`
3. summary は実装したものを **動詞で** 簡潔に書く：
   - `feat(auth): implement login API and screen`
   - `design(billing): add invoice detail design`
   - `chore(claude): add git and github workflow rules`

## PR 本文の起草手順

1. **Summary**: 何を変えたかを 2〜4 行。コードレベルではなく意図レベルで。
2. **Purpose**: なぜ変える必要があったか。要件 ID / Issue / 障害番号があれば具体的に。
3. **Related IDs**: 該当する行のみ残し、他は削除。空欄を残さない。
4. **Change Type**: チェックボックスを実態に合わせて埋める。
5. **What Changed**: 主要変更を箇条書き 3〜7 件。差分の量で調整。
6. **Design / Requirement Impact**: 影響したフェーズにチェック。破壊的変更があれば最後の項目をチェック。
7. **Traceability**: ID チェーンを書く。空の段は省略してよい。
8. **Verification**: 実行ログを書く。下記参照。
9. **Reviewer Checklist**: 自分で満たした項目だけチェック。残りは未チェックのまま残してレビュアに任せる。
10. **Notes**: 不安な点・設計判断が分かれる点・代替案を書く。

## Verification の書き方

実行したコマンドと結果を **正直に** 書く。

```
npm run lint        pass
npm run typecheck   pass
npm run test        pass (24 passed, 0 failed)
npm run trace       pass (errors=0, warnings=2)
```

未実行のコマンドは：

```
npm run e2e         not run (E2E 環境未構築。手動 staging で代替確認済)
```

## 出力フォーマット

```markdown
## PR 案

### タイトル
feat(auth): implement login API and screen

### 本文
# Summary
- ...

## Purpose
- ...

## Related IDs
- REQ: REQ-001
- UC: UC-001
- API: API-001
- DB: DB-001, DB-002
- TASK: TASK-001, TASK-002, TASK-003
- TEST: TEST-001, TEST-002

## Change Type
- [x] Feature
- [x] Test

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
- [x] status: approved の REQ のみを実装対象にしている
- [ ] (レビュア記入) Acceptance Criteria に対応するテストがある
- ...

## Notes
- ...
```

提示後、ユーザの承認を得てから `gh pr create --draft --title "..." --body "$(cat <<'EOF'\n...\nEOF\n)"` を実行する。

## やってはいけないこと

- ユーザの承認なしに `gh pr create`
- main / master へ直接 push（push は `ask` 権限）
- 既に approved を受けた PR への `git push --force`
- 「だいたい合ってると思う」という曖昧な Verification 記述
- 検証していないことを実行済として偽る
