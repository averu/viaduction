---
name: import-external-input
description: 貼り付けられた Backlog コメント / スプレッドシート行 / 議事録 / チャット抜粋を docs/05-external-inputs/ に取り込み、SRC-XXX / QA-XXX を採番する。PII を除去する。Phase 0.5 の入口。
argument-hint: "[--service backlog|spreadsheet|meeting|chat|other]"
---

# import-external-input

Phase 0.5（外部インプット）の取り込み入口 Skill。**外部サービスへ直接アクセスしない**。人間が事前に貼り付け / エクスポートしたものだけを扱う。

## いつ使うか

- 人間が外部サービスの内容を貼り付け / エクスポートして取り込みたいとき
- 既存の `02-qa-imports.md` に取り込んでいない素材を後から追加するとき

## 動作

1. 前提チェック：
   - プロンプトに **取り込み素材本体** が含まれているか
   - 含まれていなければ「素材を会話に貼り付けてから再実行してください」と案内して終了
2. `$ARGUMENTS` の解釈：
   - `--service backlog` / `spreadsheet` / `meeting` / `chat` / `other`
   - 未指定なら Subagent が自動推測
3. `Agent(subagent_type=external-input-analyst)` を呼ぶ。
4. Subagent が以下を実行：
   - 取り込み単位で `SRC-XXX` を 1 件採番、`01-intake-log.md` に行追加
   - 個別の質疑応答 / 議題を `QA-XXX` として `02-qa-imports.md` に追記
   - 各 `QA-XXX` の必須セクションを埋める
   - **PII / 認証情報を除去**（個人名 → 役割名、メール → マスク、認証情報 → 「(認証情報のため記録省略)」）
   - 取り込み元 URL は **要約** で記録
5. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
6. 「`/analyze-external-qa` で分類しますか？」と確認。

## 必ず守ること

- ID は **既存最大値 + 1** から採番。欠番は埋めない
- 既存の `SRC-XXX` `QA-XXX` を **改名・削除しない**
- **PII / 認証情報をそのまま転記しない**。検出した場合は除去し、`Sanitization` 欄に件数のみ残す
- 機密情報を含むファイルは取り込み拒否してよい
- すべての新規 QA は `Reflection Status: not-reviewed` で開始。Claude が `proposed` 以上に上げない

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

## 完了条件

- `01-intake-log.md` に新規 `SRC-XXX` 行
- `02-qa-imports.md` に新規 `## QA-XXX:` ブロック
- すべての新規 QA の `Reflection Status` が `not-reviewed`
- PII / 認証情報を含む箇所がそのまま転記されていない

## 関連

- ルール: `.claude/rules/external-input-handling.md`
- 次段: `analyze-external-qa`（分類）→ `plan-doc-reflection` → `reflect-external-input`

## やってはいけないこと

- PII / 認証情報を docs に転記
- 1 つの SRC を再取り込みする際に既存 SRC を上書きする（必ず新 SRC を採番）
- `Reflection Status` を `proposed` 以上に上げる
- 外部サービスへ直接アクセス（curl / gh api / fetch 等）
