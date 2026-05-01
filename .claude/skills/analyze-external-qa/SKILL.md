---
name: analyze-external-qa
description: 取り込み済みの QA-XXX を分類し、Decision (DEC-XXX) / Open Question (OQ-XXX) / Conflict (CONFLICT-XXX) として転記する。既存 RC / REQ / 設計と関連づける。
argument-hint: "[QA-XXX | --status not-reviewed]"
---

# analyze-external-qa

外部 Q&A の **分類・抽出** Skill。`02-qa-imports.md` の `not-reviewed` QA を読み、`Extracted Meaning` `Classification` を埋めて、必要な派生 ID を起票する。

## いつ使うか

- `02-qa-imports.md` に `Reflection Status: not-reviewed` の QA がある段階
- 既存 QA の分類を見直したいとき

## 動作

1. 前提チェック：`not-reviewed` の QA が無ければ `import-external-input` を案内して終了。
2. `$ARGUMENTS` の解釈：
   - `QA-XXX` → 指定 QA のみ分析
   - `--status not-reviewed` / 空 → 未分析の QA すべて
3. `Agent(subagent_type=external-input-analyst)` を呼ぶ。
4. Subagent が各 QA に対して以下を実行：
   - `Extracted Meaning` を埋める。Claude の解釈には `(解釈)` 注記
   - `Classification` を 1 つ以上選ぶ：
     - `Requirement Candidate` / `Business Rule` / `Design Constraint` / `Non-Functional Requirement` / `Decision` / `Open Question` / `Conflict` / `Note`
   - 該当する場合、対応ファイルへ起票：
     - `Decision` → `03-decisions.md` に `DEC-XXX`
     - `Open Question` → `04-open-questions.md` に `OQ-XXX`
     - `Conflict` → `05-conflicts.md` に `CONFLICT-XXX`
   - 既存 `RC-XXX` `REQ-XXX` との重複候補を `Related IDs` に追記
   - `Reflection Status` を `not-reviewed` → `proposed` に進める
5. 完了後 `Bash(npx tsx scripts/validate-traceability.ts)` を実行。
6. 「`/plan-doc-reflection` で反映計画を作成しますか？ Conflict があれば `/review-external-conflicts` を先に。」と確認。

## 必ず守ること

- **要件相当の内容を直接 REQ に書かない**。`Requirement Candidate` 分類なら、後段で `RC-XXX` を起こす想定にする
- `Reflection Status` を `approved` `reflected` に勝手に変えない
- 矛盾が見つかったら **Claude が片方を採用と判定しない**。`CONFLICT-XXX` に両方を引用するだけ
- 解釈と原文を区別する。`(解釈)` 注記を必ず残す
- このスキルは `02-qa-imports.md` `03-decisions.md` `04-open-questions.md` `05-conflicts.md` への **追記** のみ可

## 派生 ID 採番のタイミング

| Classification | 起票先 | 採番 |
| --- | --- | --- |
| Decision | `03-decisions.md` | `DEC-XXX` |
| Open Question | `04-open-questions.md` | `OQ-XXX` |
| Conflict | `05-conflicts.md` | `CONFLICT-XXX` |
| Requirement Candidate | (このスキルでは採番しない) | 後段の `refine-requirements` で `RC-XXX` |
| Business Rule | (反映先で書く) | (ID なし。BR-CATEGORY-NN 命名を推奨) |
| Design Constraint | (採番しない) | 設計フェーズで対応 |
| Non-Functional Requirement | (採番しない) | 後段で `NFR-XXX` |
| Note | (なし) | (なし) |

## 出力フォーマット

```markdown
## 分析結果

- 分析対象 QA: <件数>
- 分類別:
  - Requirement Candidate: <件数>
  - Decision (DEC-XXX 起票): <件数>
  - Open Question (OQ-XXX 起票): <件数>
  - Conflict (CONFLICT-XXX 起票): <件数>
  - その他: <件数>

## 起票した派生 ID
- DEC-001, DEC-002
- OQ-005
- CONFLICT-001

## 推奨される次のアクション
- /plan-doc-reflection で反映計画を作成
- OQ-005 を関係者に確認（Owner: PO）
- CONFLICT-001 を /review-external-conflicts でレビュー
```

## 完了条件

- 対象 QA すべての `Extracted Meaning` `Classification` が埋まっている
- 該当分類は対応ファイルに転記済
- 対象 QA の `Reflection Status` が `proposed`
- `validate-traceability.ts` の error が 0

## 関連

- 前段: `import-external-input`
- 次段: `plan-doc-reflection`、または `review-external-conflicts`

## やってはいけないこと

- 直接 REQ-XXX を起票・変更する
- `### Status` を変更する
- 解釈と原文を混ぜて書く
- 既存ドキュメントを書き換える
