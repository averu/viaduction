# 50 — 安全に関するルール

最も具体的なレベルのルール。これは `.claude/settings.json` の `deny`/`ask` を補完する **行動指針** である。

## 破壊的操作

以下は **禁止**。`settings.json` で deny 済みだが、Claude 自身も自発的に提案してはならない：

- `rm -rf`、`rm -fr`、`find ... -delete`、`xargs rm` 系
- `git push --force` / `--force-with-lease`、`git reset --hard`、`git clean -fd`
- `git branch -D`、`git rebase -i`（非インタラクティブで使えないため）
- `chmod 777`、`chown`、`sudo`
- `dd if=`、`mkfs`
- パイプから直接シェル実行する `curl ... | sh`、`wget ... | bash`
- `.git/`、`.env`、`.env.*` への書き込み

## 確認が必要な操作（**ask** 権限）

以下は **必ず人間に確認** してから実行する。`settings.json` で ask 済みだが、確認のフレーズを Claude が能動的に出すこと：

- `git add`, `git commit`, `git push`
- `gh pr ...`, `gh issue ...`
- `npm install`, `pnpm install`, `yarn install`（依存追加は要件・基本設計の決定が前提）
- `docs/02-requirements/**` への書き込み・編集（正式要件は人間が起点）

## 要件ステータスの遷移ルール

- **`### Status: approved` を Claude が押してはならない**。`/specify-requirements` は `candidate` までで止め、人間に確認を求める。
- **`### Status: verified` を Claude が押してはならない**。検証完了の判断は人間が行う。
- `### Acceptance Criteria` が空の REQ を `approved` にしてはならない（バリデーションで error）。
- `### Open Questions` セクションに未解消項目が残っている REQ を `approved` にしてはならない（バリデーションで error）。
- `RC-XXX` を直接 TASK の参照対象にしてはならない（`approved` の `REQ-XXX` を経由する）。

## レビュア系 Subagent の権限ハードニング

`ambiguity-reviewer`, `scope-reviewer`, `business-rule-reviewer`, `non-functional-requirement-reviewer`, `acceptance-criteria-reviewer`, `design-reviewer`, `traceability-auditor` はすべて以下を順守：

- `tools:` に `Write` `Edit` `NotebookEdit` を **絶対に含めない**
- 「修正しました」と回答しない（修正案を提示するのみ）
- ファイルを開かずに憶測で指摘しない

確認テンプレ：

```
これから次の操作を行います。続行してよいですか？
  - 操作: <command>
  - 影響範囲: <scope>
  - 取り消し方法: <undo>
```

## 実装系 Subagent (`implementer`) の起動条件

- 起動には **`TASK-XXX` の指定が必須**。指定が無いまま `src/**` を編集する依頼が来た場合、`implementer` は次のように応答して停止する：

  > このタスクには `TASK-XXX` が指定されていません。`docs/30-implementation-plan/01-task-breakdown.md` から該当する TASK-ID を選んで `/implement TASK-XXX` で再度ご依頼ください。

- 指定された TASK が `01-task-breakdown.md` に存在しない、または `status: blocked` の場合も停止する。

## レビュア系 Subagent の制約

- `design-reviewer` `traceability-auditor` は **書き込みツールを持たない**（`Read`, `Grep`, `Glob`、および監査では `Bash` の制限付き）。
- レビュア Subagent が「修正しました」と回答することはあり得ない。修正案を出すのみ。

## 秘匿情報

- `.env`、`.env.*`、`secrets/`、`credentials.json`、`*.pem`、`*.key` は `read` も `write` も禁止。
- ログ・ドキュメントへの転記も禁止。万一発見したら **その存在のみ** を報告し、内容には触れない。

## 外部送信

- Claude が `curl`、`gh api`、`fetch` で外部にデータを送るのは、人間が明示的に指示した場合に限る。
- 設計ドキュメントを diagram-as-code レンダラなど外部サービスに送らない。Mermaid のテキストとしてリポジトリ内に保存する。

## ルール衝突時の優先順

1. 人間の明示的な指示
2. `.claude/settings.json` の `deny`
3. このファイル (`50-safety.md`)
4. 番号の小さいルール

ただし「人間の指示」が破壊的な場合は、その確実性を再確認する一手間を惜しまない。
