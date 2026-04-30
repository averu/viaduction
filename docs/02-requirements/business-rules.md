---
id: REQ-BUSINESS-RULES
title: 業務ルール
status: draft
owners: []
updated: 2026-04-30
---

# 業務ルール

要件 (`REQ-XXX`) に紐づく業務ルール・制約・例外条件をここに集約する。
業務ルールは ID を持たず、関連する `REQ-XXX` の `### Business Rules` セクションから参照される横断知識。

> 業務ルールが多岐にわたる場合は、機能カテゴリごとにサブセクションを切る。
> 例: 認証、課金、配送、コンテンツ管理 など。

## 認証関連

### BR-AUTH-01: パスワード強度
- 最小 8 文字
- 英数字混在
- 既知の漏洩パスワード（haveibeenpwned 等）に含まれない
- 関連 REQ: REQ-001

### BR-AUTH-02: 連続失敗時のロック
- 連続して 5 回認証に失敗したアカウントは 15 分間ログイン不能とする
- 関連 REQ: REQ-001
- 例外: 管理者による解除

> 業務ルールの ID 接頭辞は `BR-<カテゴリ>-NN` を推奨（自動検証の対象外、管理しやすさのため）。

## 横断ルール

### BR-COMMON-01: 個人情報の取り扱い
- 個人情報（PII）はログ・メッセージ・スクリーンショットに乗せない
- 詳細な PII リストは `glossary.md` を参照

## 参照

- 上流: `docs/02-requirements/functional-requirements.md`、`docs/02-requirements/non-functional-requirements.md`
- 下流: 各 API / 画面の詳細設計
