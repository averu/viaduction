# 05-external-inputs — 外部 Q&A インプット (Phase 0.5)

Backlog / GitHub Issues / スプレッドシート / 議事録 / チャットログ / 外部ドキュメントなど、**リポジトリ外** で行われた質疑応答や決定を、ハーネス内で扱える素材に変換するフェーズ。

> **位置づけ**: `00-discovery/` `01-requirement-refinement/` の補助。要件発見の前段でも、要件精査の途中でも、設計フェーズでも発生しうる。
> **Claude が外部サービスに直接アクセスしない**。人間が貼り付け・エクスポートしたものを取り込む。

## ファイル構成

| ファイル | 用途 | 採番 ID |
| --- | --- | --- |
| `README.md` (このファイル) | 取り込みルール、Reflection Plan テンプレ | (なし) |
| `01-intake-log.md` | いつ・どの外部情報を取り込んだかの記録 | `SRC-XXX` |
| `02-qa-imports.md` | 外部 Q&A の整理済みログ | `QA-XXX` |
| `03-decisions.md` | 外部 Q&A から得られた決定事項 | `DEC-XXX` |
| `04-open-questions.md` | まだ未解決の質問・確認事項 | `OQ-XXX` |
| `05-conflicts.md` | 既存ドキュメントと矛盾する情報 | `CONFLICT-XXX` |
| `06-source-map.md` | 外部情報と反映先ドキュメントの対応表 | (索引) |

## 取り込みフロー

```
Backlog / Spreadsheet / Meeting Notes / Chat
              │
              ▼
人間が貼り付け or エクスポート（CSV / Markdown / 平文）
              │
              ▼
/import-external-input → SRC-XXX 採番、01-intake-log.md に記録
              │
              ▼
/analyze-external-qa  → QA-XXX を 02-qa-imports.md に整理
                       → DEC-XXX / OQ-XXX / CONFLICT-XXX に分類
              │
              ▼
/plan-doc-reflection  → Reflection Plan を提示（書き込みはしない）
              │
              ▼
人間が承認
              │
              ▼
/reflect-external-input → 既存または新規ドキュメントを更新
                          反映元 ID を残す
```

## ID 体系

| 接頭辞 | 種別 | 採番者 |
| --- | --- | --- |
| `SRC-XXX` | 外部情報ソース（1 件 = 1 取り込み） | `external-input-analyst` |
| `QA-XXX` | 外部 Q&A の 1 件 | `external-input-analyst` |
| `DEC-XXX` | Q&A から得られた決定事項 | `external-input-analyst` |
| `OQ-XXX` | 未解決の質問 | `external-input-analyst` |
| `CONFLICT-XXX` | 既存ドキュメントとの矛盾 | `external-conflict-reviewer`（指摘）/ `external-input-analyst`（記録） |

トレーサビリティ：

```
SRC-XXX
  ↓
QA-XXX
  ↓
DEC-XXX / OQ-XXX / CONFLICT-XXX
  ↓
RC-XXX / REQ-XXX / UC-XXX / SCR-XXX / API-XXX / DB-XXX / TASK-XXX
```

## 重要ルール（要約。詳細は `.claude/rules/external-input-handling.md`）

- 外部 Q&A を **無条件に正式要件として扱わない**。抽出した要件相当の内容は **`RC-XXX`** として 01-requirement-refinement/ に起こす。
- 既存ドキュメントの記述を **勝手に上書きしない**。矛盾は `05-conflicts.md` に `CONFLICT-XXX` として記録。
- 反映前に必ず **Reflection Plan** を提示する（下記テンプレ）。
- 反映時は **反映元 ID（`QA-XXX` / `DEC-XXX` 等）を必ず残す**。
- **機密情報・個人情報・認証情報を docs に転記しない**。万一含まれていたら「該当箇所あり」とだけ報告し、内容は記録しない。

## Reflection Plan テンプレート

外部 Q&A をドキュメントへ反映する前に、`document-reflection-planner` Subagent が次の形式で計画を提示する。**人間の承認なしに反映しない**。

```markdown
# Reflection Plan

## Source Inputs

- QA-XXX
- DEC-XXX
- OQ-XXX
- CONFLICT-XXX

## Proposed Updates

| Source ID | Target Document | Update Type | Summary | Risk |
| --- | --- | --- | --- | --- |
| QA-001 | docs/01-requirement-refinement/01-requirement-candidates.md | add | RC-NNN を追加（ログイン条件の補足） | low |
| DEC-001 | docs/02-requirements/04-business-rules.md | update | BR-AUTH-02 にロック解除手順を追記 | medium |
| CONFLICT-001 | docs/02-requirements/02-functional-requirements.md | review | REQ-003 と矛盾。要件レビューが必要 | high |

## Conflicts

- CONFLICT-XXX: <概要>

## Open Questions

- OQ-XXX: <概要>

## Requires Human Approval

- [ ] 正式要件 REQ への反映
- [ ] status を approved に変更
- [ ] 既存仕様の上書き
- [ ] スコープ変更
- [ ] 破壊的変更

## Verification

- npx tsx scripts/validate-traceability.ts
- /design-review があれば実施
```

`Risk` の凡例：

| Risk | 意味 |
| --- | --- |
| low | 既存ドキュメントへの追記。意味的な変更なし |
| medium | 既存記述の意味を補強。互換性は保たれる |
| high | 既存仕様の上書きや矛盾あり。人間レビュー必須 |
| breaking | 破壊的変更。`BREAKING CHANGE` を明記してコミット |

## 関連

- 上流: 外部サービス（Backlog / Spreadsheet / Meeting / Chat / 他）
- 下流: `docs/01-requirement-refinement/`、`docs/02-requirements/`、設計フェーズ各種
- ルール: `.claude/rules/external-input-handling.md`
