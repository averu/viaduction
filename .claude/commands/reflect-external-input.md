---
description: 承認済みの Reflection Plan に従って、QA / DEC / OQ / CONFLICT を既存または新規ドキュメントへ反映する。反映元 ID を必ず残し、approved 昇格は行わない。
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
argument-hint: "[plan-id | --confirm]"
---

# /reflect-external-input

`external-input-analyst` Subagent を `external-input-to-docs` Skill 経由で起動し、**承認済みの Reflection Plan** に従ってドキュメントへ反映します。

## 動作

1. 前提チェック：
   - 直近の `/plan-doc-reflection` 実行で Reflection Plan が提示されていること
   - **ユーザが明示的に承認していること**。承認が確認できなければ `/plan-doc-reflection` を案内して終了
   - `OQ-XXX (open)` が `Blocked Items` に含まれていれば、その範囲を反映から除外
2. `$ARGUMENTS`：
   - `--confirm` → 承認確認後の実反映
   - `plan-id` 形式は将来予約（現状は最新の plan を対象）
3. `Agent(subagent_type=external-input-analyst)` を呼ぶ。
4. Subagent が Reflection Plan の各行を順に処理：
   - `add` / `append` / `update` / `replace` / `delete` / `link` / `review` の Update Type に従って編集
   - 反映先に **`Source: QA-XXX, DEC-XXX` 等の出典** を残す
   - **REQ への反映は `Status: candidate`** で起こす（`approved` は人間が押す）
5. 関連する `02-qa-imports.md` / `03-decisions.md` / `05-conflicts.md` の `Status` を `reflected` / `resolved` に更新。
6. `06-source-map.md` の対応表を更新。
7. `Bash(npx tsx scripts/validate-traceability.ts)` を実行して error が無いことを確認。
8. 完了後、`/prepare-commit` の起動を促す。

## 引数: $ARGUMENTS

`--confirm` または空（最新の plan を対象）。

## 完了条件

- Reflection Plan の `Update Type: review` 以外の行がすべて反映済
- 反映先に `Source: QA-XXX` 等の引用が残っている
- 反映元の `Status` が `reflected` / `resolved` に更新済
- 新規 REQ がある場合、`Status: candidate` で起票されている
- `validate-traceability.ts` の error が 0
- `06-source-map.md` が更新済

## 安全ルール

- **`Status: approved` への昇格は絶対に行わない**。Reflection Plan の `Requires Human Approval` チェックリストに該当があっても、Claude は実行しない。
- **既存 `approved` REQ の上書き** が伴う場合は、**Reflection Plan に `Risk: high/breaking` が明記されていること** を Subagent が再確認する。明記が無ければ反映を中断して `/plan-doc-reflection` への差し戻しを案内。
- 反映元 ID を **省略しない**。出典が消える反映はやり直し。
- PII / 機密情報を含む内容を **転記しない**（取り込み時に除去済のはずだが、再確認）。

## 関連コマンド

- 前段: `/plan-doc-reflection`
- 次段: `/prepare-commit`、必要なら `/prepare-pr`
- 補完: `/trace-check`
