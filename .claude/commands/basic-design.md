---
description: 要件定義書を入力に、基本設計 (docs/10-basic-design/) を basic-design-architect に生成・更新させる。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[セクション名 (省略可)]"
---

# /basic-design

`basic-design-architect` Subagent を呼んで、`docs/10-basic-design/` 配下の基本設計を生成・更新します。

## 動作

1. 前提チェック:
   - `docs/02-requirements/requirements.md` が存在し、最低 1 件の `REQ-XXX` が定義されているか
   - 存在しなければ `/req-init` を案内して終了
2. `Agent(subagent_type=basic-design-architect)` を呼ぶ。
   - 引数 `$ARGUMENTS` が空 → 全 6 ファイルの再点検を依頼
   - 引数が `01-system-overview` などのセクション名 → 該当ファイルのみ更新を依頼
3. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を回し、エラーが残っていれば再度 Subagent に修正を依頼。
4. 人間に「`/design-review` を実行しますか？」と確認。

## 引数: $ARGUMENTS

省略時は全章を対象にする。指定された場合は次のいずれかと一致するか検証してから渡す：
`01-system-overview` / `02-architecture` / `03-screen-list` / `04-api-list` / `05-data-model` / `06-non-functional`

## 完了条件

- 指定された章が存在し、Front-matter が埋まっている
- `npx tsx scripts/validate-traceability.ts` の終了コードが 0 または 2（warning のみ）
- 採番された新規 `UC/SCR/API/DB/NFR` の一覧がユーザに提示されている

## 関連コマンド

- 入口: `/req-init`
- 次フェーズ: `/detail-design`
- レビュー: `/design-review` `/trace-check`
