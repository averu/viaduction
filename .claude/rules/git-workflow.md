# git-workflow — コミット規約

このファイルは Viaduction におけるコミットメッセージ規約を定義する。
番号付きルール (`00-50_*.md`) と並列に適用される。

## 基本方針

コミットメッセージは **Conventional Commits** ベース。形式は次の通り：

```
<type>(<scope>): <summary>

<body>

<footer>
```

例：

```
feat(clock): implement clock event creation

Summary:
- Add clock event creation usecase, API procedure, and repository logic.

Reason:
- Required by REQ-001 (approved on 2026-04-30) for the launch milestone.

Related:
- REQ-001
- UC-001
- API-001
- DB-001
- TASK-001

Verification:
- npm run typecheck
- npm run test
- npm run trace
```

## Header

形式: `<type>(<scope>): <summary>`

### type 一覧

| type | 用途 |
| --- | --- |
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみ |
| `design` | 要件・基本設計・詳細設計（実装は伴わない） |
| `test` | テスト追加・修正 |
| `refactor` | 振る舞いを変えない整理 |
| `chore` | 設定・雑務 |
| `ci` | CI/CD |
| `build` | ビルド関連 |
| `perf` | 性能改善 |
| `style` | フォーマットのみ（コードに意味的変更なし） |

### scope の例

`requirements` / `basic-design` / `detail-design` / `traceability` / `clock` / `auth` / `api` / `web` / `db` / `test` / `claude` / `github` / `ci`

scope は **1 単語または 2 単語のハイフン区切り**。括弧を入れ子にしない。

### summary のルール

- 英語で書く
- 50〜72 文字程度を目安にする
- 文末にピリオドを付けない
- 命令形または簡潔な動詞で始める（`add` `update` `fix` など）
- 曖昧な `update` `fix stuff` `misc` `WIP` `対応` は避ける

良い例：

```
docs(requirements): add discovery phase templates
design(clock): add clock event detail design
feat(clock): implement clock event creation
test(clock): add clock event validation tests
chore(claude): add requirement interview skill
ci(github): add traceability validation workflow
```

悪い例：

```
update files
fix
misc changes
WIP
対応
いろいろ修正
```

## Body テンプレート

必要に応じて、本文には次のセクションを含める。空のセクションは省略してよい。

```
Summary:
- 何を変えたかの要点（コードレベルではなく意図レベルで）

Reason:
- なぜ変える必要があったか（要件・障害・運用上の理由）

Related:
- IDEA-
- PROB-
- RC-
- REQ-
- UC-
- SCR-
- API-
- DB-
- TASK-
- TEST-

Verification:
- 実行したコマンドと結果
- 実行していないものは "(not run)" と理由

Notes:
- レビューで注意してほしい点・補足
```

`Related` には **本コミットで実際に追加・更新・参照した ID のみ** 列挙する。網羅性が無くてもよいが、虚偽は書かない。

## Footer ルール

### 破壊的変更

破壊的変更がある場合は **必ず** footer に `BREAKING CHANGE:` を書く。

```
BREAKING CHANGE: rename docs/00-requirements to docs/02-requirements
```

破壊的変更の典型例：
- ディレクトリ・ファイルのリネーム
- ID 接頭辞の変更
- 公開 API のシグネチャ変更
- DB スキーマの非互換変更

### Issue / PR 連携

```
Closes #123
Refs #456
```

`Closes` は対象 issue を自動クローズする。`Refs` は参照のみ。

### Co-Authored-By

このプロジェクトでは **Co-Authored-By トレーラを付けない**。
- 理由: 過去のコミットで明示的に拒否された（Content Integrity / Impersonation の観点）。
- Claude が自動コミットする際もこのトレーラは省略する。

## コミット分割の指針

大きめの変更は次の単位で分割する：

```
1. docs/design: 要件・設計・タスク定義
2. feat / fix:  実装
3. test:        テスト
4. chore / ci:  設定・CI
5. docs:        README や運用ドキュメント
```

混ざっているとレビュー時に「どの差分が要件由来でどの差分がリファクタか」が判別できなくなるため、フェーズが違う変更を 1 コミットにまとめない。

## Claude Code がコミットを作る際の追加ルール

1. **コミット前に必ず `git status` と `git diff --stat` を確認する**。意図しないファイルが含まれていないかチェックする。
2. **`git add .` / `git add -A` は原則使わない**。関連ファイルを明示して `git add <path>` する。
3. 1 コミットに **無関係な変更を混ぜない**。要件・設計・実装・テストが大きく混ざる場合はコミットを分ける。
4. コミット本文に **関連 ID と検証結果** を含める。
5. **`WIP` コミットは人間の明示指示がある場合のみ** 許可する。
6. 既に push 済みのコミットを `--amend` しない（新規コミットを作る）。
7. `--no-verify` でフックをスキップしない（`50-safety.md` の delete/push 系の方針と整合）。
8. 失敗したフックはバイパスせず、原因を直してから再コミットする。
9. **コミット末尾に Co-Authored-By トレーラを付けない**（このプロジェクトの方針）。

## ブランチ命名

- `feature/TASK-XXX-short-slug` 実装タスク単位
- `design/REQ-XXX-short-slug` 設計フェーズの大きな単位
- `chore/<topic>` 設定・雑務
- `fix/TASK-XXX-short-slug` バグ修正

slug は kebab-case の英単語 3 〜 5 語程度。`feature/TASK-010-login-api` のように TASK-ID をブランチ名に必ず含める（実装系の場合）。

## 推奨フロー

1. `git status` `git diff` `git log` を確認
2. 変更を意味単位でグループ化
3. グループごとに `git add <files>` で個別ステージング
4. 各グループに対して `<type>(<scope>): <summary>` ヘッダ + 本文を書いてコミット
5. push する前に `git log --oneline -10` で並びを確認
6. push は `ask` 権限。明示的にユーザ許可を取る
