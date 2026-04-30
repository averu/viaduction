---
name: traceability-check
description: REQ/UC/SCR/API/DB/TASK/TEST のトレーサビリティを検査する手順をまとめたスキル。設計ドキュメントを更新したときに必ず実施する。
---

# traceability-check

## いつ使うか

- 任意フェーズの設計ドキュメントを編集した直後
- 基本設計 → 詳細設計 → タスク分解 のフェーズ移行前
- 実装着手前（該当 TASK が参照する設計が approved になっているか確認するため）

## 何をするか

1. `npx tsx scripts/validate-traceability.ts` を実行する。
   - 終了コード 0 なら全エラーが解消されている。
   - 1 ならエラー、2 なら警告のみ。
2. 出力を要約して、影響度（error/warn/info）ごとに分類する。
3. 必要に応じて `npx tsx scripts/validate-traceability.ts --emit` で `99-traceability.md` を再生成する。
4. `docs/{10-basic-design,20-detail-design}/99-traceability.md` の差分を確認し、人間の承認後にコミット候補とする。

## チェックする項目

| ID 種別 | チェック内容 |
| --- | --- |
| `REQ-XXX` | 少なくとも 1 つの `UC-XXX` から参照されているか |
| `UC-XXX` | 少なくとも 1 つの `SCR-XXX` または `API-XXX` から参照されているか |
| `SCR-XXX` / `API-XXX` | 少なくとも 1 つの `TASK-XXX` から参照されているか（実装着手後は error） |
| `DB-XXX` | 少なくとも 1 つの `API-XXX` から参照されているか |
| `TASK-XXX` | 少なくとも 1 つの `TEST-XXX` を持つ（または `untestable: true`） |
| 全 ID | 参照先 ID が実在するか / 重複定義がないか |

## 失敗時の対処

- **未参照の REQ がある**: 要件が設計に取り込まれていない可能性が高い。`basic-design-architect` に再度設計を依頼するか、要件を `[DELETED]` として削除候補にする。
- **未定義 ID への参照**: タイポ、または上流ドキュメントで採番されていない。上流に戻って ID を採番する。
- **重複定義**: 別ファイルで同じ ID を再定義してしまっている。古い方を `[DELETED]` 化するか、ID を変更する。

## 注意

- このスキルは **読み取り中心** の作業。`--emit` を使うときだけドキュメントを書き換える。
- 人間の承認なしに `--emit` の結果をコミットしない。
- ID の改名はこのスキルでは行わない。改名は手動 + git による履歴管理が必要。
