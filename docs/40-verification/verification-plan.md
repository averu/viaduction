---
id: VERIFY-PLAN
title: 検証計画
status: draft
owners: []
updated: 2026-04-30
---

# 検証計画

各 `REQ-XXX` をどの手段で検証するかを計画する。

## 計画表

| REQ | 検証手段 | 担当 TEST | 担当者 | 検証環境 | 計画日 |
| --- | --- | --- | --- | --- | --- |
<!-- ここに各 REQ の検証計画を追加します。書式参考は下のコードブロック。 -->

## サンプル（書式の参考）

```markdown
| REQ-001 | 自動テスト + ステージング手動 | TEST-001, TEST-002 | @alice | staging | 2026-05-15 |
```

### 検証手段の凡例

| 手段 | 用途 |
| --- | --- |
| 自動 (単体) | 関数単位の振る舞い |
| 自動 (結合) | API 単位の振る舞い |
| 自動 (E2E) | ユースケース全体 |
| 手動 (ステージング) | 観測しにくい UI/UX |
| 本番監視 | 性能・SLO 系 NFR |

## 参照

- 上流: `docs/02-requirements/functional-requirements.md` の各 REQ の Acceptance Criteria
- 下流: `verification-results.md`
