---
id: BD-TRACE
title: 基本設計トレーサビリティ
status: generated
owners: []
updated: 2026-04-30
---

# 基本設計トレーサビリティ（自動生成）

> このファイルは `npx tsx scripts/validate-traceability.ts --emit` によって自動生成される。
> **手で編集しない**。編集が必要なら元のドキュメント（REQ/UC/SCR/API/DB）を更新してから再生成すること。

## REQ → UC

<!-- TRACE:REQ_TO_UC:START -->
| REQ | 参照する UC |
| --- | --- |
| REQ-001 | UC-001 |
<!-- TRACE:REQ_TO_UC:END -->

## UC → (SCR / API)

<!-- TRACE:UC_TO_LEAF:START -->
| UC | SCR | API |
| --- | --- | --- |
| UC-001 | SCR-001 | API-001 |
<!-- TRACE:UC_TO_LEAF:END -->

## API → DB

<!-- TRACE:API_TO_DB:START -->
| API | DB |
| --- | --- |
| API-001 | DB-001, DB-002 |
<!-- TRACE:API_TO_DB:END -->

## 孤立 ID

<!-- TRACE:ORPHANS:START -->
- (なし)
<!-- TRACE:ORPHANS:END -->
