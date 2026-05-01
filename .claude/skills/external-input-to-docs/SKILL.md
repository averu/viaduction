---
name: external-input-to-docs
description: 分析済みの QA / DEC / OQ / CONFLICT を、既存または新規ドキュメントへ反映する計画を作り、人間承認後に実反映する。Reflection Plan を必ず先に提示し、人間の承認なしに REQ status=approved に上げない。
---

# external-input-to-docs

## いつ使うか

- `02-qa-imports.md` に `Reflection Status: proposed` の QA があり、反映計画を作るとき
- `/plan-doc-reflection` または `/reflect-external-input` コマンドが起動したとき
- DEC / OQ / CONFLICT の解消方針が決まり、ドキュメント更新を進めるとき

## 入力

- `docs/05-external-inputs/02-qa-imports.md` の `proposed` QA
- `docs/05-external-inputs/03-decisions.md` の `proposed` DEC
- `docs/05-external-inputs/04-open-questions.md` の `answered` OQ
- `docs/05-external-inputs/05-conflicts.md` の `resolved` CONFLICT
- 反映先候補ドキュメント（`Proposed Document Updates` / `Reflection Target`）

## 何をするか

### Phase 1: Reflection Plan の起草（書き込みなし）

1. 対象 QA / DEC / OQ / CONFLICT を抽出。
2. それぞれの `Proposed Document Updates` / `Reflection Target` をマージ。
3. `docs/05-external-inputs/README.md` の **Reflection Plan** テンプレに沿って計画を作る：

```markdown
# Reflection Plan

## Source Inputs
- QA-001, QA-002
- DEC-001
- OQ-005 (answered)
- CONFLICT-001 (resolved)

## Proposed Updates

| Source ID | Target Document | Update Type | Summary | Risk |
| --- | --- | --- | --- | --- |
| QA-001 | docs/01-requirement-refinement/01-requirement-candidates.md | add | RC-NNN を追加 (ログイン条件補足) | low |
| DEC-001 | docs/02-requirements/04-business-rules.md | update | BR-AUTH-02 にロック解除手順を追記 | medium |

## Conflicts
- CONFLICT-001: 解消済 (案 B 採用)

## Open Questions
- (なし)

## Requires Human Approval
- [x] 正式要件 REQ への反映 (該当 / 非該当)
- [ ] status を approved に変更
- [ ] 既存仕様の上書き
- [ ] スコープ変更
- [ ] 破壊的変更

## Verification
- npx tsx scripts/validate-traceability.ts (反映後)
- /design-review があれば実施
```

4. 人間に「この計画で反映してよいですか？」と確認する。

### Phase 2: 実反映（人間承認後のみ）

1. Reflection Plan の各行に従って、対象ファイルを編集する。
2. 反映先には **必ず反映元の ID** を残す。例：

```markdown
> Source: QA-001, DEC-001 (取り込み 2026-05-01)
```

3. **REQ への反映時は必ず `Status: candidate`** で起こす。`approved` は人間が押す。
4. 既存記述の上書きが伴う場合、**削除した文を当該 PR の説明 or コミット本文に残す**（履歴の手がかり）。
5. 反映後、`02-qa-imports.md` `03-decisions.md` `05-conflicts.md` の各 ID の `Status` を `reflected` / `resolved` に更新。
6. `06-source-map.md` の対応表を更新。
7. `Bash(npx tsx scripts/validate-traceability.ts)` を実行。

## 必ず守ること

- **Reflection Plan を提示せずに反映しない**。Phase 1 を必ず通す。
- **REQ-XXX を `approved` にしない**。Claude が押すのは `candidate` まで。
- 既存の `approved` REQ や設計ドキュメントを **上書きする場合**、削除する文・置換する文を Reflection Plan の `Update Type: replace` で明示し、Risk を `high` か `breaking` にする。
- 反映元 ID（`QA-XXX` 等）を **省略しない**。出典が消えると後続の追跡が崩れる。
- PII / 機密情報を **転記しない**。元 QA で除去済のものをわざわざ復元しない。

## Update Type の凡例

| Update Type | 意味 | Risk 目安 |
| --- | --- | --- |
| `add` | 新規セクション・ID 追加 | low |
| `append` | 既存セクション内に追記 | low / medium |
| `update` | 既存記述を補強（意味の追加） | medium |
| `replace` | 既存記述を置換（意味の上書き） | high / breaking |
| `delete` | 既存記述を削除 | high (理由必須) |
| `link` | 別ドキュメントへの参照を追加するだけ | low |
| `review` | 矛盾あり、人間レビューが必要（Claude は反映しない） | high |

## やってはいけないこと

- Reflection Plan なしの直接反映
- `Status: approved` への昇格
- 反映元 ID の省略
- 「だいたい合ってると思う」での Reflection Plan 提出（Risk 評価を必ず付ける）
- 既存ドキュメントを **黙って削除** する
- 計画外のドキュメントに「ついで」で書き込む
