---
name: reflect-external-input
description: 承認済みの Reflection Plan に従って、QA / DEC / OQ / CONFLICT を既存または新規ドキュメントへ反映する。反映元 ID を必ず残し、approved 昇格は行わない。
argument-hint: "[--confirm]"
---

# reflect-external-input

外部 Q&A 反映の **実反映** Skill。`plan-doc-reflection` で承認された Reflection Plan に従ってドキュメントを更新する。

## いつ使うか

- 直近の `plan-doc-reflection` で Reflection Plan が提示され、ユーザが承認したとき
- ユーザが「Reflection Plan の通り反映して」「承認したから反映実行」と言ったとき

## 動作

1. 前提チェック：
   - 直近の `plan-doc-reflection` 実行で Reflection Plan が提示されていること
   - **ユーザが明示的に承認していること**。確認できなければ `plan-doc-reflection` を案内して終了
   - `OQ-XXX (open)` が `Blocked Items` に含まれていれば、その範囲を反映から除外
2. `Agent(subagent_type=external-input-analyst)` を `external-input-to-docs` 手順で呼ぶ。
3. Subagent が Reflection Plan の各行を順に処理：
   - `add` / `append` / `update` / `replace` / `delete` / `link` / `review` の Update Type に従う
   - 反映先に **`Source: QA-XXX, DEC-XXX` 等の出典** を残す
   - **REQ への反映は `Status: candidate`** で起こす
4. 関連する `02-qa-imports.md` / `03-decisions.md` / `05-conflicts.md` の `Status` を `reflected` / `resolved` に更新。
5. `06-source-map.md` の対応表を更新。
6. `Bash(npx tsx scripts/validate-traceability.ts)` を実行して error が無いことを確認。
7. 完了後、`/prepare-commit` の起動を促す。

## 反映時の必須項目

反映先には次を **必ず残す**：

```markdown
> Source: QA-001, DEC-001 (取り込み 2026-05-01 / SRC-001)
```

引用が無い反映は **やり直し**。

## 必ず守ること

- **`Status: approved` への昇格は絶対に行わない**。Reflection Plan の `Requires Human Approval` チェックリストに該当があっても、Claude は実行しない
- **既存 `approved` REQ の上書き** が伴う場合、Reflection Plan に `Risk: high/breaking` が明記されていることを Subagent が再確認。明記が無ければ反映を中断
- 反映元 ID を **省略しない**。出典が消える反映はやり直し
- PII / 機密情報を含む内容を **転記しない**

## 完了条件

- Reflection Plan の `Update Type: review` 以外の行がすべて反映済
- 反映先に `Source: QA-XXX` 等の引用が残っている
- 反映元の `Status` が `reflected` / `resolved` に更新済
- 新規 REQ がある場合、`Status: candidate` で起票
- `validate-traceability.ts` の error が 0
- `06-source-map.md` が更新済

## 関連

- 前段: `plan-doc-reflection`（承認済み計画）
- 次段: `prepare-commit`、必要なら `prepare-pr`
- 補完: `trace-check`

## やってはいけないこと

- Reflection Plan なしの直接反映
- `Status: approved` への昇格
- 反映元 ID の省略
- 既存 `approved` REQ を黙って書き換える
- 計画外のドキュメントに「ついで」で書き込む
