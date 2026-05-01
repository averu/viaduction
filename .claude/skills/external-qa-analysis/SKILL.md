---
name: external-qa-analysis
description: 取り込み済みの QA-XXX から要件候補・業務ルール・設計制約・非機能要件を抽出し、DEC-XXX / OQ-XXX / CONFLICT-XXX に分類する。既存の RC / REQ / 設計と関連づける。
---

# external-qa-analysis

## いつ使うか

- `02-qa-imports.md` に `Reflection Status: not-reviewed` の `QA-XXX` がある段階
- `/analyze-external-qa` コマンドが起動したとき
- 既存 QA の分類を見直したいとき（後から既存 REQ との突き合わせなど）

## 入力

- `docs/05-external-inputs/02-qa-imports.md` の `not-reviewed` QA
- `docs/01-requirement-refinement/01-requirement-candidates.md`（重複検出のため）
- `docs/02-requirements/02-functional-requirements.md`、`03-non-functional-requirements.md`、`04-business-rules.md`
- `docs/10-basic-design/*.md` 一覧

## 何をするか

1. 各 `QA-XXX` の `Question` `Answer` を読み、`Extracted Meaning` を埋める：
   - **Claude が解釈を加えた箇所** には `(解釈)` と注記する。
   - 元の発言にない「常識」を勝手に補わない。
2. `Classification` を 1 つ以上選ぶ：
   - `Requirement Candidate` → 後段で `RC-XXX` 候補
   - `Business Rule` → `04-business-rules.md` 候補
   - `Design Constraint` → 基本/詳細設計反映候補
   - `Non-Functional Requirement` → `03-non-functional-requirements.md` 候補
   - `Decision` → `03-decisions.md` に `DEC-XXX` を起票
   - `Open Question` → `04-open-questions.md` に `OQ-XXX` を起票
   - `Conflict` → `05-conflicts.md` に `CONFLICT-XXX` を起票
   - `Note` → 反映なし
3. 既存の `RC-XXX` `REQ-XXX` と意味的に重複しないかをチェック。重複していれば `Related IDs` に列挙。
4. 既存ドキュメントと **食い違う** 場合は `CONFLICT-XXX` を起票。両論併記する。
5. `Reflection Status` を `not-reviewed` → `proposed` に進める。
6. `Proposed Document Updates` 欄に反映先候補を列挙する（**実反映はしない**）。

## 必ず守ること

- **要件相当の内容を直接 REQ に書かない**。`Requirement Candidate` 分類なら、後段の `/refine-requirements` で `RC-XXX` を起こす想定にする。
- `Reflection Status` を `approved` `reflected` に勝手に変えない。
- 矛盾が見つかったら **Claude が片方を採用すると判定しない**。`CONFLICT-XXX` に両方を引用するだけ。
- 解釈と原文を区別する。`Extracted Meaning` で Claude の補完が含まれる箇所には必ず `(解釈)` を残す。
- このスキルは `02-qa-imports.md` `03-decisions.md` `04-open-questions.md` `05-conflicts.md` への **追記** のみ可。既存行は変更しない。

## 派生 ID 採番のタイミング

| Classification | 起票先 | 採番 |
| --- | --- | --- |
| Decision | `03-decisions.md` | `DEC-XXX` |
| Open Question | `04-open-questions.md` | `OQ-XXX` |
| Conflict | `05-conflicts.md` | `CONFLICT-XXX` |
| Requirement Candidate | (このスキルでは採番しない) | 後段の `/refine-requirements` で `RC-XXX` |
| Business Rule | (反映先で書く) | (ID なし。BR-CATEGORY-NN 命名を推奨) |
| Design Constraint | (このスキルでは採番しない) | 設計フェーズで対応 |
| Non-Functional Requirement | (採番しない) | 後段で `NFR-XXX` |
| Note | (なし) | (なし) |

## 出力フォーマット

```markdown
## 分析結果

- 分析対象 QA: <件数>
- 分類別:
  - Requirement Candidate: <件数>
  - Business Rule: <件数>
  - Design Constraint: <件数>
  - Non-Functional Requirement: <件数>
  - Decision (DEC-XXX 起票): <件数>
  - Open Question (OQ-XXX 起票): <件数>
  - Conflict (CONFLICT-XXX 起票): <件数>
  - Note: <件数>

## 起票した派生 ID
- DEC-001, DEC-002
- OQ-005
- CONFLICT-001

## 既存と関連付けた ID
- QA-001 → REQ-001 (既存に重複候補あり、Related に追記)
- QA-007 → 矛盾検出 → CONFLICT-001

## 推奨される次のアクション
- /plan-doc-reflection で反映計画を作成
- OQ-005 を関係者に確認（Owner: PO）
- CONFLICT-001 を /review-external-conflicts でレビュー
```

## やってはいけないこと

- 直接 REQ-XXX を起票・変更する
- `### Status` を変更する
- 解釈と原文を混ぜて書く
- 既存ドキュメントを書き換える（このスキルは 05-external-inputs/ への追記のみ）
