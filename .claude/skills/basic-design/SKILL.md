---
name: basic-design
description: 要件定義書を入力に、基本設計 (docs/10-basic-design/) を basic-design-architect に生成・更新させる。Phase 3 の入口。
argument-hint: "[セクション名 (例: 01-system-overview)]"
---

# basic-design

Phase 3（基本設計）の入口 Skill。`basic-design-architect` Subagent を呼んで `docs/10-basic-design/` を生成・更新する。

## いつ使うか

- `docs/02-requirements/02-functional-requirements.md` に `Status: approved` の REQ がある状態
- 既存基本設計の特定章を再生成したいとき

## 動作

1. 前提チェック：
   - `docs/02-requirements/01-requirements.md` および `02-functional-requirements.md` に少なくとも 1 件の `REQ-XXX (approved)` が定義されているか
   - 存在しなければ `req-init` / `specify-requirements` を案内して終了
2. `Agent(subagent_type=basic-design-architect)` を呼ぶ。
   - 引数 `$ARGUMENTS` が空 → 全 6 ファイルの再点検
   - 引数が `01-system-overview` などのセクション名 → 該当ファイルのみ更新
3. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。エラーが残れば再度 Subagent に修正を依頼。
4. 「`design-review basic` を実行しますか？」と確認。

## 引数: $ARGUMENTS

省略時は全章対象。指定時は次のいずれかと一致するか検証：
`01-system-overview` / `02-architecture` / `03-screen-list` / `04-api-list` / `05-data-model` / `06-non-functional`

## 完了条件

- 指定された章が存在し、Front-matter が埋まっている
- `validate-traceability.ts` の終了コードが 0 または 2（warning のみ）
- 採番された新規 `UC/SCR/API/DB/NFR` の一覧がユーザに提示されている

## 関連

- 入口: `req-init`
- 次段: `detail-design`
- レビュー: `design-review` `trace-check`
