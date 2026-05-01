---
name: detail-design
description: 基本設計を入力に、詳細設計 (docs/20-detail-design/) を detail-design-architect に生成させる。SCR/API/DB それぞれ 1 ID 1 ファイル。Phase 4 の入口。
argument-hint: "[ID (例: SCR-001) または PREFIX (例: API)]"
---

# detail-design

Phase 4（詳細設計）の入口 Skill。`detail-design-architect` Subagent を呼んで、`docs/20-detail-design/{screens,apis,db}/` 配下を生成・更新する。

## いつ使うか

- 基本設計 (`docs/10-basic-design/`) で SCR/API/DB が採番済みのとき
- 既存詳細設計の特定 ID を再生成したいとき

## 動作

1. 前提チェック：
   - `docs/10-basic-design/03-screen-list.md` `04-api-list.md` `05-data-model.md` が存在し、それぞれ少なくとも 1 件の ID が定義されているか
   - 存在しなければ `basic-design` を案内して終了
2. `$ARGUMENTS` の解釈：
   - 空 → すべての SCR/API/DB の詳細設計を作成・補完
   - `SCR-001` 等 → その ID のみを対象
   - `SCR` / `API` / `DB` → その種別をすべて対象
3. `Agent(subagent_type=detail-design-architect)` を呼ぶ。
4. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
5. 「`design-review detail` を実行しますか？」と確認。

## 引数: $ARGUMENTS

正規表現 `^([A-Z]+)(?:-\d{3,})?$` に一致しない場合はエラーとして拒否し、使用例を示す。

## 完了条件

- 指定範囲のすべての ID にファイルが存在
- 各ファイルが `_TEMPLATE.md` 由来の必須セクションを満たす
- `validate-traceability.ts` の終了コードが 0 または 2

## 関連

- 前段: `basic-design`
- 次段: `task-breakdown`
- レビュー: `design-review` `trace-check`
