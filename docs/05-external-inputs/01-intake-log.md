---
id: EXT-INTAKE-LOG
title: 外部インプット取り込みログ
status: draft
owners: []
updated: 2026-05-01
---

# 外部インプット取り込みログ (SRC-XXX)

外部サービスから取り込んだ素材の **取り込み履歴** を 1 取り込み = 1 行で記録する。
詳細な Q&A 内容は `02-qa-imports.md` にある。ここはあくまで「いつ、どこから、何件取り込んだか」のメタログ。

## ログ表

| SRC ID | 取り込み日 | サービス | ソース URL / ID | 件数 | 取り込み担当 | 関連 QA-XXX |
| --- | --- | --- | --- | --- | --- | --- |
<!-- ここに /import-external-input で記録された行を追加 -->

> 上の表はサービス・URL・件数を 1 行で示す。実体は `02-qa-imports.md` に複数 `## QA-XXX` で展開される。

## SRC-XXX の詳細セクション

各 `SRC-XXX` について、表だけでは伝わらない補足を以下に追記する。

### SRC 雛形

> 雛形はコードブロック内なので trace 対象外：
>
> ```
> ## SRC-XXX: 取り込みタイトル
>
> ### Service
> Backlog / Spreadsheet / Meeting / Chat / GitHub / Other
>
> ### Source URL or ID
> 外部サービス上の URL、課題 ID、ファイル名、シート名などを記載。
> （秘匿情報を含む URL は要約。例: 「Backlog プロジェクト ABC、課題 #123」）
>
> ### Imported By
> human / Claude Code（取り込みコマンドを叩いた主体）
>
> ### Imported At
> YYYY-MM-DD（時刻が必要なら ISO8601）
>
> ### Scope
> どの範囲を取り込んだか（全件 / 特定フィルタ / 特定期間）
>
> ### Sanitization
> 機密情報・個人情報の除去状況。「PII を 3 件マスク」「秘匿情報なし」など。
>
> ### Related QA
> - QA-XXX
> - QA-YYY
> ```

## 重要ルール

- **個人情報・認証情報・秘匿情報は記録しない**。`Sanitization` 欄に「除去済」とだけ書き、本文は持たない。
- 同じソースを再取り込みする場合は **新しい SRC-XXX** を採番する（差分を取りやすくするため、上書きしない）。
- 取り込み元 URL が秘匿システム内なら、要約のみ記載（フル URL は社内チケットに残す）。

## 参照

- 上流: 外部サービス
- 下流: `02-qa-imports.md` の `QA-XXX`
