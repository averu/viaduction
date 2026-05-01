---
name: plan-doc-reflection
description: proposed 状態の QA / DEC / OQ / CONFLICT を、どのドキュメントへどう反映するかの Reflection Plan を起草する。書き込みはせず、ユーザ承認後に reflect-external-input を別途呼ぶ。
argument-hint: "[QA-XXX | DEC-XXX | --all-proposed]"
---

# plan-doc-reflection

外部 Q&A 反映の **計画起案** Skill。`document-reflection-planner` Subagent を呼んで Reflection Plan を提示するだけ。**書き込みはしない**。

## いつ使うか

- `02-qa-imports.md` に `proposed` の QA、または `03-decisions.md` に `proposed` の DEC があるとき
- ユーザが「反映計画を出して」と言ったとき

## 動作

1. 前提チェック：proposed 状態の QA / DEC が無ければ `analyze-external-qa` を案内して終了。
2. `$ARGUMENTS` の解釈：
   - `QA-XXX` / `DEC-XXX` → 指定 ID のみ計画
   - `--all-proposed` / 空 → 全 proposed を対象
3. `Agent(subagent_type=document-reflection-planner)` を呼ぶ。
4. Subagent が `docs/05-external-inputs/README.md` の Reflection Plan テンプレートに従って計画を起草。
5. 計画には **Risk** と **Requires Human Approval** チェックリストを含める。
6. 結果を提示し「この計画で `/reflect-external-input` を実行しますか？」と確認。

## Reflection Plan の必須項目

```markdown
# Reflection Plan

## Source Inputs
- QA-XXX, DEC-XXX, OQ-XXX (answered), CONFLICT-XXX (resolved)

## Proposed Updates

| Source ID | Target Document | Update Type | Summary | Risk |
| --- | --- | --- | --- | --- |
| QA-001 | docs/01-requirement-refinement/01-requirement-candidates.md | add | RC-NNN を追加 | low |
| DEC-001 | docs/02-requirements/04-business-rules.md | update | BR-AUTH-02 補強 | medium |
| CONFLICT-001 | docs/02-requirements/02-functional-requirements.md | review | REQ-003 と矛盾。要件レビュー必須 | high |

## Conflicts
- CONFLICT-001: 解消済 (案 B 採用)

## Open Questions
- OQ-005: open のため反映保留

## Requires Human Approval
- [x] 既存仕様の上書き
- [ ] 正式要件 REQ への反映
- [ ] status を approved に変更 (人間が押す)
- [x] 破壊的変更

## Verification
- npx tsx scripts/validate-traceability.ts
- /design-review basic (該当時)
```

## Update Type の凡例

| Update Type | 意味 | Risk 目安 |
| --- | --- | --- |
| `add` | 新規セクション・ID 追加 | low |
| `append` | 既存セクション内に追記 | low / medium |
| `update` | 既存記述を補強 | medium |
| `replace` | 既存記述を置換 | high / breaking |
| `delete` | 既存記述を削除 | high (理由必須) |
| `link` | 別ドキュメントへの参照を追加 | low |
| `review` | 矛盾あり、人間レビューが必要 | high |

## Risk の凡例

| Risk | 意味 |
| --- | --- |
| low | 既存ドキュメントへの追記。意味的な変更なし |
| medium | 既存記述の意味を補強。互換性は保たれる |
| high | 既存仕様の上書きや矛盾あり。人間レビュー必須 |
| breaking | 破壊的変更。`BREAKING CHANGE` を明記してコミット |

## 必ず守ること

- **書き込みツールを使わない**（読み取り専用）
- 各 Update に Risk を必ず付ける
- **`approved` への昇格は計画に含めない**。`Requires Human Approval` のチェックリストに置く
- 既存 `approved` REQ / 設計の上書きが伴う計画は Risk を `high` 以上にする
- `OQ-XXX (open)` でブロックされている範囲は計画に含めない（Open Questions 欄に列挙）
- フェーズの順序（要件 → 設計 → タスク）が守られているか確認

## 完了条件

- Reflection Plan が `Source Inputs` / `Proposed Updates` / `Conflicts` / `Open Questions` / `Requires Human Approval` / `Verification` を含む
- 各 Update に Risk が付いている
- `OQ-XXX (open)` でブロックされている範囲は計画に含まれていない
- Subagent が **書き込みを行っていない**

## 関連

- 前段: `analyze-external-qa`、`review-external-conflicts`
- 次段: ユーザ承認後 `reflect-external-input`

## やってはいけないこと

- ドキュメントを書き換える（このスキルは計画提示のみ）
- `gh pr create` `git commit` を提案する
- `Status: approved` への変更を計画に含める
- Risk の自己判断で `low` に丸める
