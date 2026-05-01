# github-workflow — Pull Request 規約

このファイルは Viaduction における Pull Request の運用規約を定義する。
コミット規約は `git-workflow.md` を参照。

## PR タイトル

PR タイトルも **Conventional Commits 形式**：

```
<type>(<scope>): <summary>
```

例：

```
docs(requirements): add requirement discovery templates
design(clock): add clock event detail design
feat(clock): implement clock event creation
test(clock): add clock event validation tests
chore(claude): add git workflow rules
ci(github): add pull request validation workflow
```

ルールはコミット header と同じ：英語、50〜72 文字、命令形、ピリオド無し。

## PR 本文

`.github/pull_request_template.md` の構造を踏襲する。テンプレートのプレースホルダ (`<!-- ... -->`) は **必ず埋めるか削除** する。空欄でマージしない。

### 必須セクション

- `# Summary` — 何を変えたかの要点
- `## Purpose` — なぜ変える必要があったか
- `## Related IDs` — 関連 ID（不要な行は削除してよい）
- `## What Changed` — 主要な変更点
- `## Verification` — 実行コマンドと結果
- `## Reviewer Checklist` — チェック済の項目

### 該当する場合に必須

- `## Traceability` — 要件 → コードの対応図
- `## Design / Requirement Impact` — 要件・設計への影響
- `## Risks` — レビュー時の注意点
- `## Rollback Plan` — 戻し手順
- `## Screenshots / Logs` — UI 変更や重要なログ

## Verification の書き方

実行したコマンドと結果を **正直に** 書く。

```
pnpm lint           pass
pnpm typecheck      pass
pnpm test           pass (12 passed, 0 failed)
npm run trace       pass (errors=0, warnings=2)
```

未実行のコマンドは **`not run` と理由** を書く。

```
pnpm e2e            not run (環境構築未済、手動 staging で代替)
```

**実行していないコマンドを実行済みのように書かない**。

## Related IDs の書き方

PR で扱った ID **だけ** を列挙する。空欄や「未確認」を残さない。

良い例：

```
- REQ: REQ-001
- UC: UC-001
- API: API-001
- DB: DB-001
- TASK: TASK-001
- TEST: TEST-001
```

不要な行（IDEA / PROB / RC など）は削除してよい。

## 1 PR の単位

- **基本: 1 PR = 1 TASK**。実装フェーズではこの単位を守る。
- 設計フェーズ (Phase 0〜2) では **1 機能の素材一式（IDEA + PROB + RC など）** を 1 PR にしてよい。
- 例外（複数 TASK を 1 PR にする）は **PR 説明欄の Notes に理由を書く**。

## 破壊的変更

`BREAKING CHANGE` がコミットメッセージに含まれる PR は、PR タイトルに `!` を付ける：

```
refactor(traceability)!: rename docs/00-requirements to docs/02-requirements
```

PR 本文の `Design / Requirement Impact` で「破壊的変更がある」にチェックし、`Risks` と `Rollback Plan` を必ず書く。

## マージポリシー

- マージ方式: **squash merge** を基本とする（履歴を線形に保つ）。
- マージコミットメッセージは PR タイトル（Conventional Commits 形式）を踏襲。
- マージ前条件:
  - すべての CI が緑
  - 少なくとも 1 名のレビュア承認
  - `npm run trace` が `errors=0`
  - `### Status: approved` でない REQ-XXX を実装対象にしていない（warn は許容）
  - 破壊的変更の場合は migration 手順を Notes に明記

## Claude Code が PR を作成する際の追加ルール

1. **`gh pr create` を人間の明示確認なしに実行しない**。`settings.json` の `ask` 権限により実行時に確認が走るが、Claude も能動的に「この内容で作成してよいか」と聞く。
2. **まず PR タイトル案と本文案を提示する**。その後、ユーザの承認を得てから `gh pr create` を実行する。
3. PR タイトルは Conventional Commits 形式。
4. PR 本文に **関連 ID** を含める（テンプレートの Related IDs セクション）。
5. **検証していないコマンドを実行済みのように書かない**。未実行は `not run` と理由を明示する。
6. 破壊的変更や移行作業がある場合は **明記する**（PR 本文の `Design / Requirement Impact` と Risks）。
7. レビューしてほしい観点を **Notes** に書く（自分が不安に思った点、設計判断が分かれそうな点）。
8. PR の差分は事前に `git diff origin/main...HEAD` で確認する。差分の量が大きい場合は分割を提案する。

## Claude Code が PR を更新する際

- 既存 PR への push は `git-workflow.md` のコミット規約に従う。
- 既に approved を受けた PR に対して **強制 push を行わない**（push --force 系は deny）。
- レビュアからのコメントに対応した変更は別コミットで積み、squash merge で 1 コミットに集約する前提で進める。

## Issue 連携

`Closes #N` をコミット本文または PR 本文に書くと、マージ時に自動クローズされる。
要件側の課題管理（`docs/00-discovery/07-open-questions.md` の `Q-XXX` など）は **Issue とは別系統**。リポジトリ運用に応じて、Issue 番号と Q-XXX の相互参照ルールを別途定めること。

## ドラフト PR の扱い

- ドラフト PR は **作業途中の合意形成** のために作って良い。タイトルに `WIP:` を付けない（GitHub の Draft 機能を使う）。
- ドラフトを `Ready for review` に変えるのは人間の判断。Claude は Draft で作成し、ユーザの確認待ちにする。
