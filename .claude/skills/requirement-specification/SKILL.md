---
name: requirement-specification
description: refined 状態の RC-XXX を、正式な REQ-XXX / NFR-XXX / 業務ルールへ変換するときに使うスキル。承認は人間が行うので、Status は candidate のまま提出する。
---

# requirement-specification

## いつ使うか

- `docs/01-requirement-refinement/requirement-candidates.md` の `RC-XXX (refined)` が揃った段階
- `/specify-requirements` コマンドが起動したとき
- レビュア Subagent からの BLOCKER がすべて解消され、人間レビューを受ける準備ができたとき

## 何をするか

1. `requirement-candidates.md` から `### Status: refined` の `RC-XXX` を抽出する。
2. `requirement-classification.md` の分類に従って振り分け：
   - 機能要件 → `docs/02-requirements/functional-requirements.md` に `## REQ-XXX:` を追記
   - 非機能要件 → `docs/02-requirements/non-functional-requirements.md` に `## NFR-XXX:` を追記
   - 業務ルール → `docs/02-requirements/business-rules.md` に追記（ID 採番なし）
3. 各 `REQ-XXX` / `NFR-XXX` の必須セクションをすべて埋める：
   - `### Summary` `### Background` `### Actor` `### Scope` `### Business Rules` `### Acceptance Criteria` `### Related Items` `### Open Questions` `### Status`
4. `### Status` は **必ず `candidate`** で出力する。`approved` にしてはならない。
5. `### Related Items` には元の `RC-XXX` を必ず含める。
6. 元の RC の `### Status` は **`refined` のまま** にする（ライフサイクル上は別フェーズ）。

## 必ず守ること

- **Status を `approved` にしない**。承認は人間の責務。`approved` になっていない `REQ-XXX` を実装してはならない。
- `Acceptance Criteria` を **空にしない**。元の RC の `Acceptance Criteria Draft` を Given/When/Then に書き直して埋める。
- `Open Questions` セクションを **省略しない**。残課題が無くても `(なし)` と書く。
- 1 RC に対する REQ は **基本 1 つ**。分割が必要なら `requirement-refinement` に差し戻す。
- 既存の `REQ-XXX` を **上書きしない**。同じ意味の新規 REQ を起こすときは新しい番号を採番する。

## REQ への変換指針

| RC のセクション | REQ の対応セクション |
| --- | --- |
| `Intent` | `### Summary` の素材 |
| `Source` の PROB | `### Background` の素材 |
| `Actor` | `### Actor` (そのまま) |
| `Candidate Requirement` | `### Summary` の補足 |
| `Acceptance Criteria Draft` | `### Acceptance Criteria` (Given/When/Then 化) |
| `Scope` | `### Scope` (そのまま) |
| `Ambiguities` | `### Open Questions`（解消済なら空、未解消なら残す） |
| `Priority` | (REQ 側にはセクション無し。コメントで残す) |
| 元 RC の ID | `### Related Items` の先頭 |

## 出力フォーマット

```markdown
## 仕様化結果

- 新規 REQ: REQ-001 〜 REQ-005 (5 件、すべて Status=candidate)
- 新規 NFR: NFR-001 〜 NFR-002 (2 件、すべて Status=candidate)
- 業務ルール追加: 3 件 (BR-AUTH-01, BR-AUTH-02, BR-COMMON-01)

## 人間に確認してほしいこと
- これらすべてが Acceptance Criteria を満たしているか
- Open Questions に未解消が無いか
- 承認できると判断したら ### Status を approved に変更してください

## 次のアクション
- 人間が approved に変更する
- /trace-check で error が無いことを確認
- /basic-design で UC 採番に進む
```

## 注意

- このスキルは **書き込みを伴う** が、`docs/02-requirements/**` への Write は `settings.json` で `ask` 権限。実行時にユーザ確認が入る。
- 一度に 30 件を超える REQ を変換しない。マイルストーンに区切る。
