// BD-ARCH / REQ-008 / REQ-010 / NFR-003 — 共通ドメイン型定義
//
// 用語と取りうる値は docs/02-requirements/05-glossary.md の正本を参照する。
// runtime で列挙できるよう as const 配列を export し、union 型はその配列から派生させる。
// 列挙の意味（実体定義）は glossary に集約しているため、ここには複製しない。

// 公開範囲 (visibility): docs/02-requirements/05-glossary.md `### 公開範囲 (visibility)`
// 取得制御は server function 側で強制し、UI 出し分けに依存しない（NFR-003 / REQ-008）。
export const VISIBILITIES = ['private', 'internal', 'public'] as const
export type Visibility = (typeof VISIBILITIES)[number]

// ステータス (status): docs/02-requirements/05-glossary.md `### ステータス (status)`
// 提案ライフサイクル全体で同一 proposal_id を維持する 8 値の遷移状態。
export const PROPOSAL_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'approved',
  'returned',
  'rejected',
  'published',
  'withdrawn',
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

// ロール (role): docs/02-requirements/05-glossary.md `### ロール (role)`
// 1 ユーザは複数ロールを兼任可能（暫定: OR 合成、REQ-010 / REQ-015）。
export const ROLES = ['guest', 'user', 'reviewer', 'admin', 'auditor'] as const
export type Role = (typeof ROLES)[number]

// エラーコード: 詳細設計 docs/20-detail-design/apis/*.md のエラー表で採用されている共通コード。
// glossary には個別エントリを置かないため、本ファイルが正本となる。
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'CSRF_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'BUSINESS_RULE_VIOLATION',
  'INTERNAL_ERROR',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
