---
id: DISC-PROBLEMS
title: 解決したい課題
status: draft
owners: []
updated: 2026-04-30
---

# 解決したい課題 (PROB-XXX)

「何を解決したいか」をアクター視点で記述する。`pain-points.md` のうち、
解決対象として扱う合意のとれたものをここで `PROB-XXX` として採番する。

## PROB 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## PROB-XXX: 課題タイトル
>
> ### Actor
> 誰の課題か（個人 / チーム / 組織）
>
> ### Current Situation
> 現状で何が起きているか（事実ベース）
>
> ### Impact
> 放置するとどんな悪影響があるか（数値で書けるならベター）
>
> ### Desired Outcome
> 解決した後の理想状態
>
> ### Constraints
> - 解決手段に対する制約（技術 / 法令 / 予算 / 期日）
>
> ### Related
> - IDEA-XXX
> - pain-points.md の該当項目
>
> ### Status
> candidate
> ```

## 一覧

> ここに具体的な `## PROB-XXX:` ブロックを追加していく。下に書式参考のサンプルを 1 件残してある。

## PROB-001: 認証手段が無くサービスを開始できない

### Actor
プロダクトを使い始めようとする一般ユーザ。

### Current Situation
プロダクトに認証機能が存在しないため、誰でもアクセスできてしまう、または逆に何も利用開始できない。
（プロジェクト初期段階のため。実在の運用上の課題ではなく構想時点のギャップ。）

### Impact
- 個人ごとのデータ保存が不可能
- セキュリティを必要とするどの機能にも進めない

### Desired Outcome
利用者が自分のアカウントを安全にログインし、自分専用の認証後画面に到達できる。

### Constraints
- パスワードを平文で保管しない（NFR との整合）
- 当面は多要素認証や SSO は対象外

### Related
- IDEA-001
- 関連 pain-point: なし（構想段階）

### Status
candidate

> 上記は書式参考。実プロジェクトでは要件に応じて削除・置換してください。

## 参照

- 上流: `idea-notes.md`, `pain-points.md`
- 下流: `docs/01-requirement-refinement/requirement-candidates.md` の `RC-XXX` (Source 欄)
