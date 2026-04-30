---
id: RC-ACCEPTANCE
title: 受け入れ条件の起草
status: draft
owners: []
updated: 2026-04-30
---

# 受け入れ条件の起草

各 `RC-XXX` の `Acceptance Criteria Draft` を **観測可能な条件** に書き直す作業場。
ここで磨いた受入条件は、`02-requirements/functional-requirements.md` の `### Acceptance Criteria` にコピーされる。

## 望ましい形式

```
- Given <前提条件>
  When <操作・イベント>
  Then <期待結果>
```

または、観測可能な箇条書き：

```
- [ ] <観測可能な条件 1>
- [ ] <観測可能な条件 2>
```

## RC ごとの受入条件作業表

### RC-XXX: <タイトル>

| # | Given | When | Then | TEST 候補 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

> `TEST 候補` 列には将来 `TEST-XXX` として採番される予定の番号を仮置きしてもよい。

## アンチパターン

`acceptance-criteria-reviewer` Subagent は次のような書き方を **検出して指摘** する：

| 悪い例 | 何が問題か | 改善 |
| --- | --- | --- |
| 「動作する」 | 観測条件が無い | 「200 OK が返り、画面遷移する」と具体化 |
| 「高速に」 | 数値が無い | 「P95 < 300ms」と数値化 |
| 「適切に」 | 主観的 | 「N 件中 K 件以下のエラー」と客観化 |
| 「将来的に対応」 | 受入条件ではない | 別 RC として起票 or `Out of scope` に |

## 参照

- 上流: `requirement-candidates.md` の各 RC の `Acceptance Criteria Draft`
- 下流: `02-requirements/functional-requirements.md` の `### Acceptance Criteria`
