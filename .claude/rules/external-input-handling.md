# external-input-handling — 外部 Q&A インプットの取り扱い規約

このファイルは、Backlog / GitHub Issues / スプレッドシート / 議事録 / チャットログなどの **リポジトリ外** で行われた質疑応答を、Viaduction のドキュメントへ反映する際のルールを定義する。
番号付きルール (`00-50_*.md`) と並列に適用される。

## 基本原則

- **外部 Q&A を無条件に正式要件として扱わない**。抽出した要件相当の内容は **`RC-XXX`** として `docs/01-requirement-refinement/01-requirement-candidates.md` に起こす。
- **正式要件 `REQ-XXX` の `Status: approved` は人間のみが押す**。Claude は `candidate` までで止める。
- **既存ドキュメントを勝手に上書きしない**。意味の上書きが伴うときは `Risk: high` 以上として Reflection Plan に明示し、人間の承認を取る。
- **出典を必ず残す**。反映先には `Source: QA-XXX, DEC-XXX, SRC-XXX` を引用する。
- **矛盾を検出したら勝手に判定しない**。両論を `CONFLICT-XXX` に併記し、解消は人間レビューに委ねる。
- **PII / 認証情報 / 機密情報を docs に転記しない**。取り込み時に除去し、`SRC-XXX` の `Sanitization` 欄に件数のみ残す。

## 取り込みフロー（必ず順序を守る）

```
1. 人間が外部素材を会話に貼り付け
2. /import-external-input  → SRC-XXX / QA-XXX 採番（PII 除去）
3. /analyze-external-qa    → Classification、DEC / OQ / CONFLICT 起票
4. /review-external-conflicts (該当時) → CONFLICT 詳細レビュー
5. /plan-doc-reflection    → Reflection Plan 起草（書き込みなし）
6. 人間が承認
7. /reflect-external-input → 既存または新規ドキュメントを更新
8. /prepare-commit → /prepare-pr で記録
```

`/reflect-external-input` を **5 を飛ばして** 実行することは禁止。

## ID 体系

| 接頭辞 | 種別 | 採番者 |
| --- | --- | --- |
| `SRC-XXX` | 外部情報ソース（1 取り込み = 1 件） | `external-input-analyst` |
| `QA-XXX` | 外部 Q&A の 1 件 | `external-input-analyst` |
| `DEC-XXX` | Q&A から得られた決定事項 | `external-input-analyst` |
| `OQ-XXX` | 未解決の質問 | `external-input-analyst` |
| `CONFLICT-XXX` | 既存ドキュメントとの矛盾 | `external-input-analyst`（記録）/ `external-conflict-reviewer`（指摘） |

`OQ-XXX` は **外部 Q&A 由来の未確定事項**。Phase 0 の `Q-XXX` (`docs/00-discovery/07-open-questions.md`) は **内部観点の質問**。区別して使う。

## トレーサビリティ

```
SRC-XXX
  ↓
QA-XXX
  ↓
DEC-XXX / OQ-XXX / CONFLICT-XXX
  ↓
RC-XXX / REQ-XXX / UC-XXX / SCR-XXX / API-XXX / DB-XXX / TASK-XXX
```

下流が上流を引用する。反映先には `Source: QA-XXX` を必ず残す。

## やってはいけないこと

1. **外部サービスへ直接アクセスする** (`curl` / `gh api` / `fetch` 等で外部 URL に取りに行く)。Claude は **人間が貼り付けたものだけ** を扱う。
2. **PII / 認証情報 / 機密情報を docs に転記する**。取り込み時に必ず除去。元素材に該当箇所があった事実だけを `Sanitization` で記録。
3. **`Reflection Status` / `Status` を Claude が `approved` に変更する**。`candidate` までしか上げない。
4. **Reflection Plan を提示せずに反映する**。`/plan-doc-reflection` の通過を必須とする。
5. **既存 `approved` の REQ / 設計を黙って書き換える**。Risk を `high` 以上にして Reflection Plan に明記。
6. **矛盾の片方を Claude が「正しい」と判定する**。常に両論を併記し、`OQ-XXX` を経由して人間に確認を委ねる。
7. **削除を黙って実行する**。`Update Type: delete` は理由を Reflection Plan に必ず明示する。

## 反映時の必須項目

`/reflect-external-input` でドキュメントを編集するとき、反映先には次を **必ず残す**：

```markdown
> Source: QA-001, DEC-001 (取り込み 2026-05-01 / SRC-001)
```

引用が無い反映は **やり直し**。

## 既存ルールとの関係

- `00-overview.md`: フェーズの位置づけは「Phase 0.5（補助）」。要件発見・精査・仕様化のいずれにも素材を提供する。
- `10-traceability.md`: ID 体系の追加分は `validate-traceability.ts` の `PREFIXES` に登録済。
- `40-review-policy.md`: 外部 Q&A 系のレビュアは `external-conflict-reviewer` `qa-traceability-reviewer`。読み取り専用。
- `50-safety.md`: 外部から取り込んだ秘匿情報は秘匿情報のルールに従う。`docs/05-external-inputs/` でも例外なし。
- `git-workflow.md`: 反映コミットの `Related:` 行に `QA-XXX` `DEC-XXX` 等を含める。

## ステータス凡例の参照先

| 種別 | ファイル | Status の取りうる値 |
| --- | --- | --- |
| `QA-XXX` の Reflection Status | `02-qa-imports.md` | not-reviewed / proposed / approved / reflected / rejected / conflict |
| `DEC-XXX` の Status | `03-decisions.md` | proposed / approved / reflected / superseded |
| `OQ-XXX` の Status | `04-open-questions.md` | open / answered / closed |
| `CONFLICT-XXX` の Status | `05-conflicts.md` | open / resolved / rejected |
