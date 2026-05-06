// DB-005 / BR-GUARD-02 — policy_agreements リポジトリの抽象 + MVP インメモリ実装
//
// 役割:
//   - `policy_agreements` テーブル（DB-005）の読み書きを Repository インターフェイスで抽象化し、
//     MVP では Map ベースのインメモリ実装を提供する（NFR-002 互換、Workers / D1 移行見越し）。
//   - DB-005 §不変条件 1: 1 proposal = 最大 1 同意レコード（`ux_policy_agreements_proposal`）。
//     Q-018 暫定方針「再提出時は新規生成しない」と整合。本層では proposal_id を一意キーとして
//     Map に保持し、重複 create を `PolicyAgreementConflictError` として throw する。
//   - DB-005 §不変条件 2: append-only に近い（UPDATE / DELETE は MVP で行わない）。
//     `update*` / `delete*` は export しない（アプリ層強制）。
//   - DB-005 §不変条件 4: `INSERT` は API-002 (`submit`) の成功時のみ。API-009 (`resubmit`) は
//     `findByProposalId` で既存を継続適用する（BR-GUARD-02 / REQ-013 AC4）。
//   - FK 整合（user_id / proposal_id 実在、author_id == user_id）は呼び出し側 server function の責務。
//
// 参照: docs/20-detail-design/db/DB-005.md（カラム / 不変条件 / インデックス）、
//       docs/02-requirements/04-business-rules.md（BR-GUARD-02）、
//       docs/20-detail-design/apis/API-002.md（write INSERT）、
//       docs/20-detail-design/apis/API-009.md（read 継続適用、INSERT しない）

// ---------------------------------------------------------------------------
// ドメインモデル
// ---------------------------------------------------------------------------

/**
 * DB-005 policy_agreements 1 行に対応するドメインモデル。
 *
 * NFR-002（Workers 互換）のため `bigint` を使わず、Unix epoch millis は `number` で表現する
 * （DB-003 同様、2^53 まで安全で MVP 範囲では十分）。
 */
export interface PolicyAgreement {
  readonly id: string
  readonly user_id: string
  readonly proposal_id: string
  readonly policy_version: string
  readonly agreed_at: number
}

/**
 * `create` 時に呼び出し側が決める入力。
 * `id` / `agreed_at` は repository 側で `crypto.randomUUID()` / `Date.now()` を用いて自動採番する
 * （DB-005 §カラム、API-002 §write INSERT と整合）。
 */
export interface PolicyAgreementCreateInput {
  readonly user_id: string
  readonly proposal_id: string
  readonly policy_version: string
}

// ---------------------------------------------------------------------------
// 例外
// ---------------------------------------------------------------------------

/**
 * `proposal_id` の UNIQUE 制約 (`ux_policy_agreements_proposal`) 違反時に throw される例外。
 * API 層では 422 BUSINESS_RULE_VIOLATION（API-002 §エラー）に正規化される。
 */
export class PolicyAgreementConflictError extends Error {
  readonly proposalId: string

  constructor(proposalId: string) {
    super(`PolicyAgreementConflictError: proposal_id already has agreement: ${proposalId}`)
    this.name = 'PolicyAgreementConflictError'
    this.proposalId = proposalId
  }
}

/**
 * 入力検証失敗時に throw される例外。
 * API 層では 400 VALIDATION_ERROR に正規化される（API-002 §エラー）。
 */
export type PolicyAgreementValidationField = 'policy_version' | 'user_id' | 'proposal_id'

export class PolicyAgreementValidationError extends Error {
  readonly field: PolicyAgreementValidationField

  constructor(field: PolicyAgreementValidationField, message?: string) {
    super(`PolicyAgreementValidationError: invalid ${field}${message === undefined ? '' : `: ${message}`}`)
    this.name = 'PolicyAgreementValidationError'
    this.field = field
  }
}

// ---------------------------------------------------------------------------
// インターフェイス
// ---------------------------------------------------------------------------

export interface PolicyAgreementRepository {
  /**
   * 新規 INSERT。
   * - `id` は `crypto.randomUUID()` で採番、`agreed_at` は `Date.now()` を設定する。
   * - 同一 `proposal_id` が既に存在する場合は `PolicyAgreementConflictError` を throw
   *   （DB-005 §不変条件 1 / ux_policy_agreements_proposal）。
   * - `user_id` / `proposal_id` / `policy_version` の形式不正は
   *   `PolicyAgreementValidationError` を throw する。
   * - 呼び出しは API-002 (`submit`) のみが想定される（BR-GUARD-02 / DB-005 §不変条件 4）。
   */
  create(input: PolicyAgreementCreateInput): Promise<PolicyAgreement>

  /**
   * `proposal_id` で 1 件取得。存在しなければ `null`。
   * API-002 の重複検査・API-009 の継続適用で利用される。
   */
  findByProposalId(proposalId: string): Promise<PolicyAgreement | null>

  /**
   * `user_id` ごとの最新同意レコード（`agreed_at DESC` の先頭）を 1 件返す。存在しなければ `null`。
   * `ix_policy_agreements_user_agreed_at` を活用する設計。MVP では用途未定だが、
   * 将来「自分の同意履歴」画面（DB-005 §インデックス 注記）の先行サポートとして提供する。
   */
  findLatestByUser(userId: string): Promise<PolicyAgreement | null>
}

// ---------------------------------------------------------------------------
// インメモリ実装
// ---------------------------------------------------------------------------

/**
 * 全件のスナップショットから PolicyAgreementRepository を組み立てる。
 * `initial` で渡したレコードは validate 後に投入される。`proposal_id` の重複は
 * `PolicyAgreementConflictError`、`id` の重複は `PolicyAgreementValidationError('proposal_id')`
 * とは別観点のため、別途 `Set<string>` で id 重複も検知して throw する。
 */
export function createInMemoryPolicyAgreementRepository(
  initial?: ReadonlyArray<PolicyAgreement>,
): PolicyAgreementRepository {
  // proposal_id 単独の UNIQUE を表現するため、Map のキーは proposal_id を採用する。
  const byProposalId = new Map<string, PolicyAgreement>()
  const seenIds = new Set<string>()

  if (initial !== undefined) {
    for (const row of initial) {
      validateUserId(row.user_id)
      validateProposalId(row.proposal_id)
      validatePolicyVersion(row.policy_version)
      if (byProposalId.has(row.proposal_id)) {
        throw new PolicyAgreementConflictError(row.proposal_id)
      }
      if (seenIds.has(row.id)) {
        throw new PolicyAgreementConflictError(row.proposal_id)
      }
      byProposalId.set(row.proposal_id, freeze(row))
      seenIds.add(row.id)
    }
  }

  return {
    async create(input) {
      validateUserId(input.user_id)
      validateProposalId(input.proposal_id)
      validatePolicyVersion(input.policy_version)

      if (byProposalId.has(input.proposal_id)) {
        throw new PolicyAgreementConflictError(input.proposal_id)
      }

      const id = crypto.randomUUID()
      // 主キー衝突は実用上ほぼ起こらないが、防御的に再生成ではなく throw する。
      if (seenIds.has(id)) {
        throw new PolicyAgreementConflictError(input.proposal_id)
      }

      const row: PolicyAgreement = freeze({
        id,
        user_id: input.user_id,
        proposal_id: input.proposal_id,
        policy_version: input.policy_version,
        agreed_at: Date.now(),
      })
      byProposalId.set(row.proposal_id, row)
      seenIds.add(row.id)
      return clone(row)
    },

    async findByProposalId(proposalId) {
      const found = byProposalId.get(proposalId)
      return found === undefined ? null : clone(found)
    },

    async findLatestByUser(userId) {
      let latest: PolicyAgreement | null = null
      for (const row of byProposalId.values()) {
        if (row.user_id !== userId) continue
        if (latest === null || row.agreed_at > latest.agreed_at) {
          latest = row
        }
      }
      return latest === null ? null : clone(latest)
    },
  }
}

// ---------------------------------------------------------------------------
// validators
// ---------------------------------------------------------------------------

// DB-005 §カラム: policy_version は最大 64 文字、API-018 のレスポンスと整合。
// MVP の暫定値は 'mvp-initial'。形式は英数字・ドット・アンダースコア・ハイフンのみ許容。
const POLICY_VERSION_PATTERN = /^[a-zA-Z0-9._-]+$/
const POLICY_VERSION_MAX_LENGTH = 64

function validatePolicyVersion(value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PolicyAgreementValidationError('policy_version', 'must be non-empty string')
  }
  if (value.length > POLICY_VERSION_MAX_LENGTH) {
    throw new PolicyAgreementValidationError(
      'policy_version',
      `must be at most ${String(POLICY_VERSION_MAX_LENGTH)} characters`,
    )
  }
  if (!POLICY_VERSION_PATTERN.test(value)) {
    throw new PolicyAgreementValidationError(
      'policy_version',
      'must match /^[a-zA-Z0-9._-]+$/',
    )
  }
}

function validateUserId(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PolicyAgreementValidationError('user_id', 'must be non-empty string')
  }
}

function validateProposalId(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PolicyAgreementValidationError('proposal_id', 'must be non-empty string')
  }
}

// ---------------------------------------------------------------------------
// 内部ヘルパ
// ---------------------------------------------------------------------------

/**
 * 内部 state を呼び出し側の mutate から守る。`Object.freeze` は浅い凍結のみだが、
 * `PolicyAgreement` は readonly な primitive のみで構成されているため十分。
 */
function freeze(row: PolicyAgreement): PolicyAgreement {
  return Object.freeze({ ...row })
}

/**
 * 戻り値を防御コピー。呼び出し側が `as` で readonly を剥がして mutate しても
 * 内部 Map に反映されないようにする。
 */
function clone(row: PolicyAgreement): PolicyAgreement {
  return { ...row }
}

// ---------------------------------------------------------------------------
// Factory（テスト fixture 用）
// ---------------------------------------------------------------------------

const FIXED_AGREED_AT = 1_700_000_000_000

/**
 * テスト用の PolicyAgreement を 1 件生成する。
 * - デフォルトの `policy_version` は MVP 暫定値 `mvp-initial`（DB-005 / BR-GUARD-02）。
 * - デフォルトの `agreed_at` は固定 epoch millis（並び順の安定検証用）。
 * - `id` 省略時は `crypto.randomUUID()` で採番。
 */
export function makePolicyAgreement(
  base: { user_id: string; proposal_id: string },
  overrides: Partial<PolicyAgreement> = {},
): PolicyAgreement {
  const defaults: PolicyAgreement = {
    id: crypto.randomUUID(),
    user_id: base.user_id,
    proposal_id: base.proposal_id,
    policy_version: 'mvp-initial',
    agreed_at: FIXED_AGREED_AT,
  }
  return { ...defaults, ...overrides }
}
