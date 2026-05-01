---
name: req-init
description: docs/02-requirements/01-requirements.md と関連ファイル群の雛形を生成する。既存ファイルがあれば上書きしない。
argument-hint: "[--force]"
---

# req-init

要件定義の **入口** Skill。`docs/02-requirements/` 配下の必須ファイル（`01-requirements.md` `05-glossary.md` 等）の雛形を作る。
記述自体は人間が行う。Claude は雛形を出すまで。

## いつ使うか

- 新規プロジェクトで `docs/02-requirements/` がまだ空のとき
- 雛形を意図的に再生成したいとき（`--force`）

## 動作

1. `$ARGUMENTS` 解釈：
   - `--force`: 既存ファイルを上書きしてもよい（**人間の明示確認後**）
   - 空: 既存ファイルは保護
2. `docs/02-requirements/01-requirements.md` の存在を確認：
   - 無ければリポジトリ既定の雛形で新規作成
   - あって `--force` 指定なし → 「既存ファイルを保護しました」と報告して終了
3. `05-glossary.md` も同様に処理
4. 雛形には次のセクションを含める：
   `## 概要` / `## ステークホルダー` / `## スコープ` / `## ユーザストーリー` / `## 機能要件 (REQ-XXX)` / `## 非機能要件 (NFR-XXX)` / `## 制約条件` / `## 用語` / `## オープン課題`

## 引数

- `--force`: 既存ファイルを上書きしてもよい

## 関連

- 設計駆動フローの **入口**。記述自体は人間
- 次段: 人間が要件を書いた後、`basic-design` で UC を採番

## やってはいけないこと

- ユーザの明示確認なしに既存ファイルを上書き
- `### Status: approved` を含めて雛形化（status は `candidate` 始まり）
