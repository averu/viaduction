---
description: 貼り付けられた Backlog コメント / スプレッドシート行 / 議事録 / チャット抜粋を docs/05-external-inputs/ に取り込み、SRC-XXX / QA-XXX を採番する。PII を除去する。
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[--service backlog|spreadsheet|meeting|chat|other]"
---

# /import-external-input

`external-input-analyst` Subagent を呼んで、貼り付けられた外部素材を `docs/05-external-inputs/` に整理します。
**外部サービスへ直接アクセスしません**。人間が事前に貼り付け or エクスポートしたものだけを扱います。

## 動作

1. 前提チェック：
   - プロンプトに **取り込み素材本体** が含まれているか（テキスト、CSV、Markdown など）
   - 含まれていなければ「素材を会話に貼り付けてから再実行してください」と案内して終了
2. `$ARGUMENTS` の解釈：
   - `--service backlog` / `spreadsheet` / `meeting` / `chat` / `other`
   - 未指定なら Subagent が自動推測
3. `Agent(subagent_type=external-input-analyst)` を呼び、`external-input-intake` Skill を起動。
4. Subagent が `SRC-XXX` `QA-XXX` を採番し、`01-intake-log.md` `02-qa-imports.md` に追記。
5. PII / 認証情報を **除去** したことを `Sanitization` 欄で確認。
6. 完了後、`Bash(npx tsx scripts/validate-traceability.ts)` を実行。
7. 「`/analyze-external-qa` で分類しますか？」と確認。

## 引数: $ARGUMENTS

`--service <サービス名>` のみ受け付ける。サービス名が無効なら拒否してリストを表示。

## 完了条件

- `01-intake-log.md` に新規 `SRC-XXX` 行が 1 件以上追加
- `02-qa-imports.md` に新規 `## QA-XXX:` ブロックが 1 件以上追加
- すべての新規 QA の `Reflection Status` が `not-reviewed`
- PII / 認証情報を含む箇所がそのまま転記されていない（`Sanitization` 欄に件数記載）
- `validate-traceability.ts` が新採番で error を出さない

## 関連コマンド

- 次段: `/analyze-external-qa`（分類）→ `/plan-doc-reflection`（反映計画）→ `/reflect-external-input`（実反映）
- 補完: `/review-external-conflicts`（矛盾検出）

## 安全ルール

- 機密情報を含むファイル全体は **取り込み拒否** してよい（Subagent が判断）。
- フル URL の貼り付けは要約で記録（`SRC-XXX` の `Source URL or ID`）。
- 取り込み素材を `Bash` 経由で外部に送信しない（`curl` / `gh api` 等は使わない）。
