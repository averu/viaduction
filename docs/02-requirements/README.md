# 02-requirements — 正式要件 (Phase 2)

`docs/01-requirement-refinement/` で `refined` になった `RC-XXX` のうち、人間が承認したものだけを **正式要件 (`REQ-XXX` / `NFR-XXX`)** としてここに置く。

## ファイル構成

| ファイル | 用途 |
| --- | --- |
| `requirements.md` | インデックス・スコープ・ステークホルダー・他ファイルへの索引 |
| `functional-requirements.md` | 機能要件 (`REQ-XXX`) |
| `non-functional-requirements.md` | 非機能要件 (`NFR-XXX`) |
| `business-rules.md` | 業務ルール（参照される横断知識） |
| `glossary.md` | 用語集 |
| `traceability-seed.md` | 自動生成のトレーサビリティ索引 |

## 進め方

1. `/specify-requirements` で `RC-XXX (refined)` から `REQ-XXX (candidate)` へ変換した雛形を出す。
2. 人間が `### Status` を `approved` に変える前に：
   - `### Acceptance Criteria` が空でないこと
   - `### Open Questions` が空（または `(なし)`）であること
   - `### Related Items` に元の `RC-XXX` が記載されていること
3. 上記 3 点を満たしたら人間が `approved` に変更。`/trace-check` で検査が通ること。
4. 以降、`/basic-design` で `UC-XXX` を採番していく。

## 状態の遷移

```
candidate ─[人間レビュー]─> needs-clarification → refined ─[人間承認]─> approved
                                                                          │
                                  (実装) approved ─> implemented ─> verified
                                                ↓
                                  (中止)        rejected / deferred
```
