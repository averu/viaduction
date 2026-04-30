---
description: docs/00-requirements/requirements.md の雛形を生成する。既存ファイルがあれば上書きしない。
allowed-tools: Read, Write, Glob
argument-hint: "[--force]"
---

# /req-init

`docs/00-requirements/requirements.md` と `docs/00-requirements/glossary.md` の雛形を作ります。
既にファイルが存在する場合、`--force` が指定されない限り **上書きしません**。

## 動作

1. `docs/00-requirements/requirements.md` の存在を確認。
   - 無ければ、リポジトリ既定の雛形 (`docs/00-requirements/requirements.md` のテンプレ構成) で新規作成。
   - あって `--force` 指定なし → 「既存ファイルを保護しました」と報告して終了。
2. `glossary.md` も同様。
3. 雛形には次のセクションを含める：
   - `## 概要` / `## ステークホルダー` / `## スコープ` / `## ユーザストーリー` / `## 機能要件 (REQ-XXX)` / `## 非機能要件 (NFR-XXX)` / `## 制約条件` / `## 用語` / `## オープン課題`

## 引数

- `--force`: 既存ファイルを上書きしてもよい（人間の明示確認後）。

## 関連

- このコマンドは要件定義の **入口**。記述自体は人間が行う。
- 雛形を書き換えたい場合は `docs/00-requirements/requirements.md` のリポジトリ版テンプレートを直接編集する。

## 引数: $ARGUMENTS

`$ARGUMENTS` を解釈し、`--force` の有無を判定してください。
