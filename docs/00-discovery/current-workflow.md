---
id: DISC-WORKFLOW
title: 現在の業務フロー
status: draft
owners: []
updated: 2026-04-30
---

# 現在の業務フロー

「今、どうやって回しているか」を Claude が要件を抽出する素材として記述する。
**理想形ではなく現実** を書く。例外フローや手作業も省略しない。

## 主要フロー

### フロー 1: <タイトル>

```mermaid
flowchart LR
  start([開始]) --> step1[ステップ1]
  step1 --> step2[ステップ2]
  step2 --> end1([終了])
```

#### ステップ詳細
1. **ステップ 1**: 誰が、何を、どのくらいの頻度で、どのツールで
2. **ステップ 2**: ...
3. ...

#### 例外・エッジケース
- ...

#### 関連 PROB
- (このフローのどこに痛みがあるか → `pain-points.md` を参照)

## 用語

このファイル内で使う業務用語のうち、`glossary.md` に未登録のものを仮置き。

## 参照

- 上流: 一次インタビュー、業務観察、既存ドキュメント
- 下流: `docs/01-requirement-refinement/requirement-classification.md` でフロー単位の RC を整理
