---
id: VERIFY-SIGN-OFF
title: 受け入れ承認
status: draft
owners: []
updated: 2026-04-30
---

# 受け入れ承認

各 `REQ-XXX` を最終的に「受入完了」と判定する人間のサインを記録する。
**Claude はこのファイルを書き換えてはならない。** 人間が手で更新する。

## 承認記録

| REQ | 承認者 | 承認日 | 承認バージョン (commit) | コメント |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 承認の前提

承認するには次のすべてを満たすこと：

- [ ] `verification-results.md` で該当 REQ の結果が `pass`
- [ ] `docs/02-requirements/functional-requirements.md` の該当 REQ の `### Acceptance Criteria` がすべて `pass` のテストでカバーされている
- [ ] `npm run trace` で error が無い
- [ ] 関連する `TASK-XXX` がすべて `done`

## 承認後の遷移

承認すると `02-requirements/functional-requirements.md` 側の `### Status` を `verified` に上げてよい。
承認後の REQ を変更する場合は、改めて `approved` に戻して再検証する。

## 参照

- 上流: `verification-results.md`
- 下流: なし（このファイルがフェーズの終端）
