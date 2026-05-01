---
name: specify-requirements
description: refined 状態の RC-XXX を、正式な REQ-XXX / NFR-XXX / 業務ルールへ変換する。Status は candidate のまま提出し、approved は人間が押す。Phase 2 の入口。
argument-hint: "[RC-XXX]"
---

# specify-requirements

Phase 2（仕様化）の入口 Skill。`docs/01-requirement-refinement/01-requirement-candidates.md` の `RC-XXX (refined)` から `docs/02-requirements/` の正式要件を起票する。

## いつ使うか

- レビュア通過後、`RC-XXX (refined)` が揃った段階
- ユーザが「正式要件に昇格させて」と言ったとき

## 動作

1. 前提チェック：
   - `01-requirement-candidates.md` に `### Status: refined` の RC が 1 件以上あるか
   - 該当 RC に未解消の `Ambiguities` が無いか
   - 1 件も無ければ `refine-requirements` と `review-requirements` を案内して終了
2. `$ARGUMENTS` の解釈：
   - 空 → すべての `refined` RC を対象
   - `RC-XXX` → 指定された RC のみ
3. `Agent(subagent_type=requirement-analyst)` を `requirement-specification` 手順で呼ぶ。
4. Subagent が以下を実行：
   - `04-requirement-classification.md` の分類に従って振り分け
     - 機能要件 → `02-functional-requirements.md` に `## REQ-XXX:`
     - 非機能要件 → `03-non-functional-requirements.md` に `## NFR-XXX:`
     - 業務ルール → `04-business-rules.md`（ID 採番なし）
   - 各 REQ / NFR の必須セクションをすべて埋める
   - **`### Status` は必ず `candidate`** で出力
   - `### Related Items` に元の `RC-XXX` を必ず含める
5. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
6. 「人間が `### Status: approved` に変更してください」と促す。

## 必ず守ること

- **`### Status: approved` を Claude が押さない**。`candidate` までで止める
- `### Acceptance Criteria` を **空にしない**。RC の `Acceptance Criteria Draft` を Given/When/Then に書き直して埋める
- `### Open Questions` を省略しない。残課題が無くても `(なし)` と書く
- 1 RC に対する REQ は **基本 1 つ**。分割が必要なら `refine-requirements` に差し戻す
- 既存 `REQ-XXX` を **上書きしない**。新規は新しい番号を採番

## RC → REQ 変換指針

| RC のセクション | REQ の対応セクション |
| --- | --- |
| `Intent` | `### Summary` の素材 |
| `Source` の PROB | `### Background` の素材 |
| `Actor` | `### Actor` (そのまま) |
| `Candidate Requirement` | `### Summary` の補足 |
| `Acceptance Criteria Draft` | `### Acceptance Criteria` (Given/When/Then 化) |
| `Scope` | `### Scope` |
| `Ambiguities` | `### Open Questions`（解消済なら空、未解消なら残す） |
| 元 RC の ID | `### Related Items` の先頭 |

## 完了条件

- 新規 `## REQ-XXX:` / `## NFR-XXX:` ブロックが追加
- 各ブロックの `### Status` が `candidate`、`### Acceptance Criteria` が空でない
- `### Open Questions` が空（または `(なし)`）
- `### Related Items` に元の `RC-XXX` が含まれる
- `validate-traceability.ts` の error が 0

## 関連

- 前段: `refine-requirements`、`review-requirements`
- 次段: 人間が `approved` に変更 → `basic-design`

## やってはいけないこと

- `Status: approved` への変更
- `Acceptance Criteria` を空のまま提出
- 既存 `REQ-XXX` の上書き
