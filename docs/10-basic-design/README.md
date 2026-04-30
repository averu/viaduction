# 基本設計 (Phase 1)

`docs/00-requirements/requirements.md` を入力に、システム全体像を描くフェーズの成果物を置く。

## 構成

| ファイル | 内容 | 主な ID |
| --- | --- | --- |
| `01-system-overview.md` | スコープ、アクター、ユースケース | UC-XXX |
| `02-architecture.md` | 構成図、技術選定、外部連携 | (なし) |
| `03-screen-list.md` | 画面一覧、画面遷移 | SCR-XXX |
| `04-api-list.md` | API 一覧、認可、エラー方針 | API-XXX |
| `05-data-model.md` | エンティティ一覧、ER 図 | DB-XXX |
| `06-non-functional.md` | 非機能要件 | NFR-XXX |
| `99-traceability.md` | 自動生成（手で編集しない） | — |

## 進め方

1. `/basic-design` で雛形を埋める。
2. 各ファイルの `status: draft` を `review` に上げる前に `/design-review`。
3. 人間承認で `approved` にする。
4. `/trace-check --emit` で `99-traceability.md` を再生成。

## 注意

- 詳細レベル（カラム型、画面項目バリデーション、JSON スキーマ）はここでは書かない。詳細設計の責務。
- 用語は `docs/00-requirements/glossary.md` に従う。
