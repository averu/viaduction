---
name: git-commit-workflow
description: Conventional Commits 形式でコミットメッセージを起草するときに使うスキル。type/scope/summary を選び、Related ID と Verification を本文に含める。git-workflow.md ルールに準拠する。
---

# git-commit-workflow

## いつ使うか

- 変更を 1 つ以上のコミットにまとめる前
- ユーザが「コミットして」と言ったとき（ただし実際の `git commit` 実行は `/prepare-commit` 経由か、ユーザ承認後）
- 既存コミットメッセージのリライトを依頼されたとき

## 何をするか

1. `git status` `git diff --stat` `git diff --cached` を実行して、ステージング状況を把握する。
2. 変更の **意味的なグループ** を抽出する：
   - 設計ドキュメント (`docs/**`) のみの変更 → `docs` または `design`
   - 実装コード (`src/**`) の追加 → `feat`
   - 実装コード (`src/**`) の修正 → `fix`
   - テストのみ (`tests/**`) → `test`
   - 設定 / `.claude/**` / `package.json` 等 → `chore` / `ci` / `build`
3. グループが複数あれば **コミット分割を提案** する：
   - `1. docs/design → 2. feat → 3. test → 4. chore` の順を基本とする。
4. 各グループに対して `git-workflow.md` のテンプレで Header / Body / Footer を起草する。
5. 起草結果をユーザに提示し、承認後に実際のコミットへ進む。**実行は別工程**。

## 必ず守ること

- **検証していないコマンドを実行済みのように書かない**。`Verification` には実際に走らせたものだけを記載し、未実行は `(not run)` と理由を書く。
- **コミット末尾に `Co-Authored-By:` を付けない**（`git-workflow.md` 参照）。
- `git add .` / `git add -A` を提案しない。明示パスでステージングする。
- 1 コミットに **無関係な変更を混ぜない**。混ざるなら分割を提案する。
- BREAKING CHANGE がある場合は footer に必ず明記する。

## type の選び方

| 状況 | type |
| --- | --- |
| 新しい画面 / API / 機能を追加 | `feat` |
| 既存の振る舞いの誤りを修正 | `fix` |
| 設計だけ書いた | `design` または `docs(<scope>)` |
| README / コメントの編集 | `docs` |
| テストだけ追加・修正 | `test` |
| リファクタ（振る舞い不変） | `refactor` |
| `.claude/` / `package.json` / `tsconfig` | `chore` |
| GitHub Actions / 検証スクリプト | `ci` |
| ビルド設定（webpack/vite/tsup 等） | `build` |
| パフォーマンス改善 | `perf` |
| プリティア・空白のみ | `style` |

迷ったら **意味的に変えたか** で判断する。挙動が変わるなら `feat` か `fix`、変わらないなら `refactor` か `chore` か `style`。

## scope の選び方

- 機能領域名（`auth` `clock` `billing` 等）が第一候補
- ハーネス系の変更は `claude` `traceability` `requirements` `basic-design` 等を使う
- CI / GitHub 周りは `github` `ci`
- 1 コミットが複数 scope に跨がる場合は分割を検討、それでも 1 コミットなら最も影響が大きい scope を選ぶ

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

```
feat(auth): implement login API handler
...
```

stage:
- src/api/auth/login.ts
- src/api/auth/login.test.ts (... 等)

### 3/3: ...
```

提案を提示するのみ。実際の `git add` / `git commit` 実行はユーザ承認後の別ステップ。

## やってはいけないこと

- ユーザの承認なしに `git commit` を実行
- `--amend` で既存コミットを書き換える（ユーザが指示した場合のみ）
- `--no-verify` でフックスキップを提案
- 「とりあえず WIP コミット」を勝手に作る
