---
name: external-input-intake
description: Backlog / スプレッドシート / 議事録 / チャットログなどの外部情報を docs/05-external-inputs/ の整理済みインプットへ変換する。SRC-XXX / QA-XXX を採番し、PII を除去する。
---

# external-input-intake

## いつ使うか

- 人間が外部サービスの内容を貼り付け or エクスポートして取り込みたいとき
- `/import-external-input` コマンドが起動したとき
- 既存の `02-qa-imports.md` に取り込んでいない素材を後から追加するとき

## 入力

人間が貼り付ける素材（フォーマット問わず）：
- Backlog の課題タイトル / 本文 / コメント / ステータス
- スプレッドシートの行（CSV / TSV / Markdown 表）
- 議事録の議題 / 決定 / 未決 / アクションアイテム
- チャットログの抜粋

## 何をするか

1. **取り込み単位で `SRC-XXX` を 1 件採番** し、`docs/05-external-inputs/01-intake-log.md` の表に行を追加する。
2. 取り込み素材の中の **個別の質疑応答 / 議題** を `QA-XXX` として `02-qa-imports.md` に追記する。
3. 各 `QA-XXX` の必須セクションをすべて埋める（Source / Question / Answer / Extracted Meaning は **空にしない**）。
4. **個人情報・認証情報・秘匿情報を除去** する：
   - 個人名 → 役割名（PO、開発リード、顧客）
   - メールアドレス・電話番号 → マスク（`***@example.com` 等）
   - パスワード・トークン・API キー → 「(認証情報のため記録省略)」
   - クレジットカード等の機微情報 → 「(機微情報のため記録省略)」
5. 取り込み元 URL は **要約** で記録する（フル URL は社内チケット側に残す）。
6. **分類は深追いしない**。`Reflection Status: not-reviewed` で起票するだけ。詳細な抽出は次の Skill (`external-qa-analysis`) の責務。

## 必ず守ること

- ID は **既存最大値 + 1** から採番。欠番は埋めない。
- 既存の `SRC-XXX` `QA-XXX` を **改名・削除しない**。
- **PII / 認証情報をそのまま転記しない**。検出した場合は除去し、`SRC-XXX` の `Sanitization` 欄に件数を残す。
- 機密情報を含むファイルは取り込み拒否してよい（その場合「PII を含むため取り込み不可」と報告して終了）。
- このスキルは **書き込みを伴う**。`Reflection Status` は必ず `not-reviewed` で開始。Claude が `proposed` 以上に上げない。

## 取り込み素材の前処理

| 元の形式 | 前処理 |
| --- | --- |
| Backlog 課題 | タイトル → Question、本文 → Answer のベース、コメント → 追補回答として連結 |
| スプレッドシート | 各行を 1 QA に分解。質問列・回答列のヘッダを Source ID 欄に記録 |
| 議事録 | 議題ごとに QA を 1 件起こす。決定事項は Classification に Decision 候補として注記 |
| チャットログ | 質問 → 回答のターンを 1 QA。発話者は役割名に正規化 |

## 出力フォーマット

```markdown
## 取り込み結果

- 新規 SRC: SRC-NNN 〜 SRC-NNN (N 件)
- 新規 QA:  QA-NNN 〜 QA-NNN (M 件)
- 除去した PII / 秘匿情報: K 件 (詳細は SRC-XXX の Sanitization 欄)
- すべての新規 QA: Reflection Status = not-reviewed

## 推奨される次のアクション
- /analyze-external-qa で Classification と Extracted Meaning を埋める
```

## やってはいけないこと

- PII / 認証情報をそのまま docs に書き込む
- 1 つの SRC を再取り込みするときに既存 SRC を上書きする（必ず新 SRC を採番）
- `Reflection Status` を `proposed` 以上に上げる（このスキルでは行わない）
- 外部サービスへ直接アクセスする（人間が貼り付けたものだけを扱う）
