---
description: refined 状態の RC-XXX を docs/02-requirements/ の正式 REQ-XXX / NFR-XXX / 業務ルールへ変換する。Status は candidate のまま提出し、approved は人間が押す。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[RC-XXX | 範囲指定なし]"
---

# /specify-requirements

`requirement-analyst` Subagent を `requirement-specification` Skill 経由で起動し、`refined` 状態の `RC-XXX` を正式要件に変換します。

## 動作

1. 前提チェック:
   - `requirement-candidates.md` に `### Status: refined` の RC が 1 件以上あるか
   - 1 件も無ければ「先に `/refine-requirements` と `/review-requirements` を回してください」と案内して終了
   - 該当 RC に未解消の `Open Questions` (= `Ambiguities` セクションが空でない) が無いか確認
2. `$ARGUMENTS` の解釈：
   - 空 → すべての `refined` RC を対象
   - `RC-XXX` → 指定された RC のみ
3. `Agent(subagent_type=requirement-analyst)` を `requirement-specification` Skill で呼ぶ。
4. 各 RC を `docs/02-requirements/{functional-requirements,non-functional-requirements,business-rules}.md` のいずれかに振り分けて転記。
5. **`### Status` は必ず `candidate`** として書き込む（このコマンドが `approved` にすることは絶対にない）。
6. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
7. 「人間が `### Status: approved` に変更し、再度 `/trace-check` を回してください」と促す。

## 引数: $ARGUMENTS

`空` / `RC-XXX` のいずれか。

## 完了条件

- `02-requirements/functional-requirements.md` または同階層に新規 `## REQ-XXX:` / `## NFR-XXX:` ブロックが追加
- 各ブロックの `### Status` が `candidate` で、`### Acceptance Criteria` が空でない
- `### Open Questions` が空（または `(なし)`）
- `### Related Items` に元の `RC-XXX` が含まれる

## 関連コマンド

- 前段: `/refine-requirements` `/review-requirements`
- 次段: 人間が `approved` に変更 → `/basic-design`
