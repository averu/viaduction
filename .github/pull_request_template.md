# Summary

<!-- このPRで何を変更したかを簡潔に書く -->

## Purpose

<!-- なぜこの変更が必要かを書く -->

## Related IDs

<!-- 関連するものだけ記入。不要な行は削除してよい -->

- IDEA:
- PROB:
- RC:
- REQ:
- UC:
- SCR:
- API:
- DB:
- TASK:
- TEST:

## Change Type

- [ ] Discovery / Requirement candidate
- [ ] Approved requirement
- [ ] Basic design
- [ ] Detail design
- [ ] Implementation plan
- [ ] Feature
- [ ] Bug fix
- [ ] Test
- [ ] Refactor
- [ ] Documentation
- [ ] CI / Build
- [ ] Claude Code rules / skills / agents / commands

## What Changed

<!-- 主な変更点を書く -->

-
-
-

## Design / Requirement Impact

- [ ] 要件変更なし
- [ ] 要件候補 RC を追加・更新した
- [ ] 正式要件 REQ を追加・更新した
- [ ] 基本設計を追加・更新した
- [ ] 詳細設計を追加・更新した
- [ ] 実装タスクを追加・更新した
- [ ] トレーサビリティを更新した
- [ ] 破壊的変更がある

## Traceability

<!-- 要件からコードまでの対応を記載 -->

```txt
IDEA-
  ↓
PROB-
  ↓
RC-
  ↓
REQ-
  ↓
UC-
  ↓
SCR- / API- / DB-
  ↓
TASK-
  ↓
TEST-
  ↓
CODE
```

## Verification

<!-- 実行した検証コマンドと結果を書く -->

```txt
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:validate
pnpm traceability:validate
```

Result:

```txt
<!-- pass / fail / not run と理由 -->
```

## Screenshots / Logs

<!-- UI変更や重要なログがある場合のみ添付 -->

## Risks

<!-- レビュー時に注意すべきリスクを書く -->

-
-

## Rollback Plan

<!-- 問題が出た場合の戻し方を書く -->

-

## Reviewer Checklist

- [ ] 関連する REQ / TASK ID が明記されている
- [ ] `status: approved` の REQ のみを実装対象にしている
- [ ] 要件・設計・実装・テストの対応が追跡できる
- [ ] Acceptance Criteria に対応するテストがある
- [ ] 不要なスコープ拡大がない
- [ ] 破壊的変更が明記されている
- [ ] セキュリティ・認可・入力検証の影響を確認した
- [ ] lint / typecheck / test が実行されている
- [ ] 秘密情報が含まれていない

## Notes

<!-- 未決事項、レビュー依頼事項、補足 -->
