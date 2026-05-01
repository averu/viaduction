# 40 — レビュー方針

このルールは `design-reviewer` および `traceability-auditor` Subagent、ならびに `/design-review` `/trace-check` コマンドの動作を定義する。

## レビューの種別

| 種別 | 担当 | 入力 | 出力 |
| --- | --- | --- | --- |
| 曖昧さレビュー | `ambiguity-reviewer` | RC-XXX | 指摘リスト |
| スコープレビュー | `scope-reviewer` | RC-XXX + 03-scope-definition.md | 指摘リスト |
| 業務ルールレビュー | `business-rule-reviewer` | RC/REQ + 04-business-rules.md | 指摘リスト |
| 非機能要件レビュー | `non-functional-requirement-reviewer` | RC/NFR | 指摘リスト |
| 受入条件レビュー | `acceptance-criteria-reviewer` | RC/REQ の AC | 指摘リスト |
| 設計レビュー | `design-reviewer` | 基本/詳細設計 md | 指摘リスト（影響度付き） |
| トレーサビリティ監査 | `traceability-auditor` | 全 docs + script 実行結果 | カバレッジレポート |
| コードレビュー | (任意のレビュア) | 差分 | 改善提案 |

## レビュア Subagent の権限

要件系レビュア (`ambiguity-reviewer`, `scope-reviewer`, `business-rule-reviewer`, `non-functional-requirement-reviewer`, `acceptance-criteria-reviewer`) と設計系レビュア (`design-reviewer`, `traceability-auditor`) はすべて **読み取り専用**。

- ファイルを書き換えない（`tools` に `Write` `Edit` を含めない）
- ドキュメントの修正案は **本文として返す**。実際の更新は人間が指示するまで行わない
- レビュー結果は所定のフォーマットで返す（後述）

ただし `traceability-auditor` のみ `Bash(npx tsx scripts/validate-traceability.ts:*)` を使うことができる（検証スクリプトの実行のため）。

## レビューの観点

### 設計レビュー(`design-reviewer`)

1. **トレーサビリティ整合性**: Front-matter の `refs.upstream` が要件・上位設計に存在するか
2. **要件カバレッジ**: 該当 ID の要件項目をすべて満たす設計になっているか
3. **曖昧さ**: `??`、`TBD`、`おそらく`、`〜と思われる` を残していないか
4. **一貫性**: 用語が `05-glossary.md` と一致するか
5. **抜け**: エラー系・空状態・権限のない場合などの考慮があるか
6. **過剰**: 要件にない機能が紛れていないか

### トレーサビリティ監査(`traceability-auditor`)

1. `npx tsx scripts/validate-traceability.ts` を実行し、エラー/警告を要約する
2. カバレッジが目標(下表)に満たない場合、未到達 ID をリストする
3. 99-traceability.md の差分があれば `--emit` を提案する

| フェーズ | カバレッジ目標 |
| --- | --- |
| 要件精査完了時 | RC が `Source` (`IDEA-XXX` or `PROB-XXX`) を必ず持ち、`Status` が `refined` 以上 |
| 仕様化完了時 | 各 `RC (refined)` に対し `REQ-XXX (candidate)` が起票され、人間承認後 `approved` |
| 基本設計完了時 | REQ→UC=100%、UC→(SCR or API)=100% |
| 詳細設計完了時 | (SCR/API)→TASK=100%、(API/SCR)→DB のうち必要なもの=100% |
| 実装着手後 | TASK→TEST=80% 以上 |

## 指摘フォーマット

レビュア Subagent は次のフォーマットで返す：

```markdown
## 指摘一覧

### [BLOCKER] (致命的: 進めてはならない)
- (なし) または `SCR-001 §画面項目`: REQ-003 を参照しているが定義が無い。

### [MAJOR] (重要: 次のフェーズ前に解消すること)
- ...

### [MINOR] (軽微: 余裕があれば解消)
- ...

### 提案された修正(自動適用しない)
- `docs/20-detail-design/screens/SCR-001.md` の `## バリデーション` に「メールアドレス必須」を追記してください。
```

`[BLOCKER]` が 1 件でもあれば **次フェーズに進んではならない**。

## レビューを実施するタイミング

- フェーズ完了の宣言前（人間が承認する前）
- 設計ドキュメントの大規模変更があった後
- TASK-XXX の実装着手前（その TASK が参照する設計を念のため再確認）
