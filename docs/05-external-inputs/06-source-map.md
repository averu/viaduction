---
id: EXT-SOURCE-MAP
title: 外部情報と反映先ドキュメントの対応表
status: generated
owners: []
updated: 2026-05-01
---

# Source Map（対応表）

外部 Q&A（`QA-XXX`）と、それから派生した `DEC-XXX` / `OQ-XXX` / `CONFLICT-XXX`、
さらにその反映先（`RC-XXX` / `REQ-XXX` / 設計 / 実装タスク）の対応関係を一目で把握するための索引。

> このファイルは **手動更新を許容する** が、`/trace-check --emit` で自動生成も可能（将来的に対応予定）。
> 当面は `/plan-doc-reflection` 実行時に Claude が候補テーブルを提案する。

## QA → 反映状況

<!-- TRACE:EXT:QA_REFLECTION:START -->
| QA | SRC | 分類 | 派生 ID | 反映先ドキュメント | Reflection Status |
| --- | --- | --- | --- | --- | --- |
| (未生成) |  |  |  |  |  |
<!-- TRACE:EXT:QA_REFLECTION:END -->

## DEC → 反映先

<!-- TRACE:EXT:DEC_REFLECTION:START -->
| DEC | 起源 QA | 反映先 | Status |
| --- | --- | --- | --- |
| (未生成) |  |  |  |
<!-- TRACE:EXT:DEC_REFLECTION:END -->

## OQ → ブロックされている下流

<!-- TRACE:EXT:OQ_BLOCKING:START -->
| OQ | 関連 QA | Blocked Items | Status |
| --- | --- | --- | --- |
| (未生成) |  |  |  |
<!-- TRACE:EXT:OQ_BLOCKING:END -->

## CONFLICT → 影響範囲

<!-- TRACE:EXT:CONFLICT_IMPACT:START -->
| CONFLICT | 関連 QA | Conflict Type | Affected Documents | Status |
| --- | --- | --- | --- | --- |
| (未生成) |  |  |  |  |
<!-- TRACE:EXT:CONFLICT_IMPACT:END -->

## サマリ

<!-- TRACE:EXT:SUMMARY:START -->
- 取り込み済 SRC: (未生成)
- 取り込み済 QA: (未生成)
- 反映待ち DEC: (未生成)
- open OQ: (未生成)
- open CONFLICT: (未生成)
<!-- TRACE:EXT:SUMMARY:END -->

## 使い方

- `/plan-doc-reflection` 実行時に、上の表が更新候補として提示される。
- 反映後は各表の `Status` 列を更新する。
- 表の自動再生成（`--emit`）は将来対応。今は人間が更新する前提。
