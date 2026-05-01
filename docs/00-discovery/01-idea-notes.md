---
id: DISC-IDEAS
title: アイデアノート
status: draft
owners: []
updated: 2026-04-30
---

# アイデアノート (IDEA-XXX)

人間がラフに書く一次情報。整理は `/discover-requirements` で支援する。
ID 採番は `requirement-analyst` Subagent が行う。

## IDEA 雛形

> 雛形はコードブロック内なので trace の対象外：
>
> ```
> ## IDEA-XXX: アイデアの短いタイトル
>
> ### Source
> どこから来たアイデアか（誰のアイデアか、いつ・どこで思いついたか）
>
> ### Description
> 自由記述で詳細に。技術的な実現性は気にしない。
>
> ### Why interesting
> なぜこのアイデアが価値を持ちうるか。
>
> ### Related
> - 関連する PROB-XXX
> - 関連する競合・先行事例
>
> ### Status
> candidate
> ```

## 一覧

> ここに具体的な `## IDEA-XXX:` ブロックを追加していく。下に書式参考のサンプルを 1 件残してある。

## IDEA-001: アカウントを使ってサービスにアクセスしたい

### Source
プロダクト構想のキックオフメモより。

### Description
利用者が自分のアカウントを使ってログインし、認証後の機能（ダッシュボード等）にアクセスできる仕組みが欲しい。

### Why interesting
他のすべての利用者向け機能の前提となる。最初に整備しないと先に進めない。

### Related
- 関連 PROB: PROB-001
- 競合事例: 一般的な SaaS のメール+パスワード認証

### Status
candidate

> 上記は書式参考。実プロジェクトでは要件に応じて削除・置換してください。

## 参照

このファイルは Phase 0 の素材。上流参照は無い。
- 下流: `docs/01-requirement-refinement/01-requirement-candidates.md` の `RC-XXX` (Source 欄)
