// DB-004 / NFR-004 / BR-AUDIT-01 / BR-AUDIT-02 / BR-AUDIT-03 — AuditLog リポジトリ（append-only）
//
// 役割:
//   - `audit_logs` テーブル (DB-004) への書き込みを **append のみ**、読み取りを
//     `findById` / `list` / `listByTarget` の 3 種に限定する Repository を提供する。
//   - export 関数集合は構造的に append-only を保証する: `update*` / `patch*` /
//     `delete*` / `remove*` / `clear` / `reset` / `truncate` / `replace` / `overwrite` /
//     `set*` で始まる関数を export しない（NFR-004 AC、BR-AUDIT-02、CI grep の対象）。
//   - reason 必須・任意の整合 (DB-004 §不変条件 2)、status 遷移系 action での
//     before/after_status NOT NULL (同 §3)、MVP では before/after_visibility が
//     常に NULL (同 §3) を append 時に検証し、違反は `AuditLogValidationError` で
//     拒否する。違反時はエントリを作らない (BR-AUDIT-03 と整合)。
//
// 本 repository が扱わないこと（呼び出し側 server function の責務）:
//   - actor_role と action の組合せ整合 (DB-004 §不変条件 4、authorize 層で担保)
//   - policy_agreement_id の action 別 NOT NULL 整合 (DB-004 §不変条件 6)
//   - 認可失敗時の append 抑止 (BR-AUDIT-03、authorize 層で append を呼ばない)
//   - reason テキストの PII 除外 (NFR-005、運用ガイドライン)
//   - DB 層強制（Phase 3 で D1 トリガ等を確定、DB-004 §不変条件 1）
//
// 参照:
//   - docs/20-detail-design/db/DB-004.md
//   - docs/02-requirements/03-non-functional-requirements.md (NFR-004)
//   - docs/02-requirements/04-business-rules.md (BR-AUDIT-01..03)
//   - docs/20-detail-design/apis/API-015.md (listByTarget の使用例)
//   - docs/20-detail-design/apis/API-016.md (list filter / created_at DESC)
//   - docs/20-detail-design/apis/API-017.md (findById)

import { PROPOSAL_STATUSES, VISIBILITIES, type ProposalStatus, type Visibility } from '#/lib/domain/types'

// ---------------------------------------------------------------------------
// 値域
// ---------------------------------------------------------------------------

/**
 * MVP の action 値（DB-004 §カラム / CHECK 制約と一致）。
 * RC-005 確定後に `visibility_shrink` / `visibility_expand` を追加し、本配列を拡張する。
 */
export const AUDIT_ACTIONS = [
  'submit',
  'start_review',
  'approve',
  'return',
  'reject',
  'publish',
  'withdraw',
  'resubmit',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/**
 * reason 必須 action (DB-004 §不変条件 2、BR-REVIEW-01 / BR-PUBLISH-03)。
 * これ以外の action では reason は null 可 (Q-019 暫定)。
 */
export const REASON_REQUIRED_ACTIONS = [
  'start_review',
  'approve',
  'return',
  'reject',
  'withdraw',
] as const satisfies ReadonlyArray<AuditAction>

/** DB-004 §reason の最大長 4,000 文字（暫定）。 */
const REASON_MAX_LENGTH = 4_000

const REASON_REQUIRED_SET: ReadonlySet<AuditAction> = new Set(REASON_REQUIRED_ACTIONS)
const ACTION_SET: ReadonlySet<AuditAction> = new Set(AUDIT_ACTIONS)
const PROPOSAL_STATUS_SET: ReadonlySet<ProposalStatus> = new Set(PROPOSAL_STATUSES)
const VISIBILITY_SET: ReadonlySet<Visibility> = new Set(VISIBILITIES)

// ---------------------------------------------------------------------------
// ドメインモデル
// ---------------------------------------------------------------------------

/**
 * AuditLog 1 件。append のみで生成・UPDATE 不可（NFR-004 / BR-AUDIT-02）。
 * フィールドは BR-AUDIT-01 の必須項目 (actor / role / action / target / before / after / reason / timestamp)
 * を 1 対 1 でカバーする。
 */
export interface AuditLog {
  readonly id: string
  readonly actor_id: string
  /** 操作時のロールスナップショット。複数ロールはカンマ区切り（例: `reviewer,admin`）。 */
  readonly actor_role: string
  readonly action: AuditAction
  readonly target_proposal_id: string
  readonly before_status: ProposalStatus | null
  readonly after_status: ProposalStatus | null
  /** MVP では常に null（visibility 変更操作が無いため、DB-004 §不変条件 3）。 */
  readonly before_visibility: Visibility | null
  readonly after_visibility: Visibility | null
  readonly reason: string | null
  readonly policy_agreement_id: string | null
  /** Unix epoch millis（NFR-002 互換のため bigint を使わない）。 */
  readonly created_at: number
}

/**
 * `append` への入力。`id` と `created_at` は repository 側で採番・設定するため受け取らない
 * （append-only / NFR-004 と整合: 呼び出し側に過去エントリへの干渉手段を持たせない）。
 */
export interface AuditLogAppendInput {
  readonly actor_id: string
  readonly actor_role: string
  readonly action: AuditAction
  readonly target_proposal_id: string
  readonly before_status: ProposalStatus | null
  readonly after_status: ProposalStatus | null
  /** 省略時は null。MVP では非 null を渡すと AuditLogValidationError。 */
  readonly before_visibility?: Visibility | null
  /** 省略時は null。MVP では非 null を渡すと AuditLogValidationError。 */
  readonly after_visibility?: Visibility | null
  readonly reason: string | null
  /** 省略時は null。 */
  readonly policy_agreement_id?: string | null
}

/**
 * `list` のフィルタ (API-016)。すべて optional、未指定なら全件。
 * 並び順は `created_at DESC` 固定（API-016 既定、`ix_audit_logs_created_at` を想定）。
 *
 * 注: API-016 では `target_proposal_id` フィルタは撤回されている (M-1 整理) が、
 *     repository の汎用 list としては受け付ける。target ごとの時系列取得には
 *     `listByTarget` を使う（API-015 が要求する `created_at ASC` の並び）。
 */
export interface AuditLogListFilter {
  readonly actor_id?: string
  readonly action?: AuditAction
  readonly target_proposal_id?: string
  /** `created_at >= from`（Unix epoch millis）。 */
  readonly from?: number
  /** `created_at < to`（Unix epoch millis、API-016 と同じ排他境界）。 */
  readonly to?: number
}

// ---------------------------------------------------------------------------
// 例外
// ---------------------------------------------------------------------------

/**
 * `append` の入力検証エラー。
 *
 * - reason 必須 action で reason が null / 空 / whitespace-only
 * - status 遷移系 action で before_status / after_status が null
 * - MVP で before_visibility / after_visibility が非 null
 * - reason 文字数が 4,000 超
 * - action / status / visibility が値域外
 *
 * `message` には PII (reason 本文 / actor 名等) を含めない (NFR-005 と整合)。
 * 識別には field 名と action / id 的なものに留める。
 */
export class AuditLogValidationError extends Error {
  readonly field: string
  readonly action: AuditAction | null

  constructor(message: string, options: { field: string; action: AuditAction | null }) {
    super(`AuditLogValidationError: ${message}`)
    this.name = 'AuditLogValidationError'
    this.field = options.field
    this.action = options.action
  }
}

// ---------------------------------------------------------------------------
// インターフェイス
// ---------------------------------------------------------------------------

/**
 * AuditLog の Repository。**書き込みは append のみ**。
 *
 * 公開メソッドは下記 4 つに限定（NFR-004 AC / BR-AUDIT-02）:
 *   - `append` (BR-AUDIT-01 の必須フィールドをすべて要求)
 *   - `findById` (API-017)
 *   - `list` (API-016)
 *   - `listByTarget` (API-015)
 *
 * `update*` / `delete*` 等の名前のメソッドは持たない。仮に内部関数として
 * 追加する場合でも export 関数からは到達不能とし、`Object.keys(repo)` には
 * 表れないよう closure 内に閉じ込める。
 */
export interface AuditLogRepository {
  /**
   * 1 件 append。`id` を `crypto.randomUUID()` で採番、`created_at = Date.now()` を
   * 設定して保存し、保存後の AuditLog を返す。
   *
   * 検証:
   *   1. `action` が AUDIT_ACTIONS のいずれか（型でガード + runtime 二重防御）
   *   2. reason 必須 action で `reason` が null / 空 / whitespace-only → throw
   *   3. status 遷移系 action（MVP は全 action）で before_status / after_status が null → throw
   *   4. MVP で before_visibility / after_visibility が非 null → throw
   *   5. reason が 4,000 文字超 → throw
   *
   * 内部状態への副作用は **配列への push のみ**（`splice` / `pop` / `shift` /
   * 個別 index への代入を行わない）。NFR-004 / BR-AUDIT-02 を構造的に満たす。
   */
  append(input: AuditLogAppendInput): Promise<AuditLog>

  /** 主キー検索 (API-017)。存在しなければ null。 */
  findById(id: string): Promise<AuditLog | null>

  /**
   * filter で絞り込み + `created_at DESC` で返す (API-016 既定の並び順)。
   * filter 省略または全フィールド未指定は全件。
   */
  list(filter?: AuditLogListFilter): Promise<ReadonlyArray<AuditLog>>

  /**
   * `target_proposal_id` ごとの時系列 (API-015)、`created_at ASC` で返す
   * (DB-004 §インデックス `ix_audit_logs_target_proposal` の用途)。
   */
  listByTarget(targetProposalId: string): Promise<ReadonlyArray<AuditLog>>
}

// ---------------------------------------------------------------------------
// インメモリ実装
// ---------------------------------------------------------------------------

/**
 * MVP のインメモリ AuditLog repository を生成する。
 *
 * `initial` で渡したエントリは順序を保ったままシードする（テスト用途）。
 * シード時にも append 時と同じ検証を行う。重複 id はその時点で
 * `AuditLogValidationError` で拒否する（append-only に id 衝突は許されない）。
 *
 * 内部状態 (`entries`) は closure に閉じ込めるため外部から直接参照できない。
 * 読み取り系メソッドは防御コピー (`entries.slice()`) を返し、呼び出し側が
 * 配列を変更しても保存済みエントリには影響しない。
 */
export function createInMemoryAuditLogRepository(
  initial?: ReadonlyArray<AuditLog>,
): AuditLogRepository {
  const entries: AuditLog[] = []
  const seenIds = new Set<string>()

  if (initial !== undefined) {
    for (const entry of initial) {
      assertEntryShape(entry)
      if (seenIds.has(entry.id)) {
        throw new AuditLogValidationError(`duplicate id in initial: ${entry.id}`, {
          field: 'id',
          action: entry.action,
        })
      }
      seenIds.add(entry.id)
      // append-only ガード: シード時もただの push のみで状態に書き込む。
      entries.push(entry)
    }
  }

  return {
    async append(input) {
      validateAppendInput(input)
      const id = crypto.randomUUID()
      // 入力で重複 id を渡す経路は無いが、UUID 衝突の理論的可能性に対して防御。
      if (seenIds.has(id)) {
        throw new AuditLogValidationError(`duplicate id generated: ${id}`, {
          field: 'id',
          action: input.action,
        })
      }
      const created_at = Date.now()
      const entry: AuditLog = {
        id,
        actor_id: input.actor_id,
        actor_role: input.actor_role,
        action: input.action,
        target_proposal_id: input.target_proposal_id,
        before_status: input.before_status,
        after_status: input.after_status,
        before_visibility: input.before_visibility ?? null,
        after_visibility: input.after_visibility ?? null,
        reason: input.reason,
        policy_agreement_id: input.policy_agreement_id ?? null,
        created_at,
      }
      seenIds.add(id)
      entries.push(entry)
      return entry
    },

    async findById(id) {
      for (const entry of entries) {
        if (entry.id === id) return entry
      }
      return null
    },

    async list(filter) {
      const filtered = filter === undefined ? entries.slice() : entries.filter(matches(filter))
      filtered.sort(byCreatedAtDesc)
      return filtered
    },

    async listByTarget(targetProposalId) {
      const filtered = entries.filter((e) => e.target_proposal_id === targetProposalId)
      filtered.sort(byCreatedAtAsc)
      return filtered
    },
  }
}

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

function validateAppendInput(input: AuditLogAppendInput): void {
  // 1. action 値域
  if (!ACTION_SET.has(input.action)) {
    throw new AuditLogValidationError(`unknown action: ${String(input.action)}`, {
      field: 'action',
      action: null,
    })
  }

  // 2. reason 必須・任意の整合
  if (REASON_REQUIRED_SET.has(input.action)) {
    if (input.reason === null || input.reason.trim() === '') {
      throw new AuditLogValidationError(`reason is required for action=${input.action}`, {
        field: 'reason',
        action: input.action,
      })
    }
  }

  // 3. reason 最大長
  if (input.reason !== null && input.reason.length > REASON_MAX_LENGTH) {
    throw new AuditLogValidationError(
      `reason exceeds ${String(REASON_MAX_LENGTH)} chars (got ${String(input.reason.length)})`,
      { field: 'reason', action: input.action },
    )
  }

  // 4. status 遷移系 action（MVP は全 8 action）で before/after_status NOT NULL
  if (input.before_status === null) {
    throw new AuditLogValidationError(`before_status is required for action=${input.action}`, {
      field: 'before_status',
      action: input.action,
    })
  }
  if (input.after_status === null) {
    throw new AuditLogValidationError(`after_status is required for action=${input.action}`, {
      field: 'after_status',
      action: input.action,
    })
  }
  if (!PROPOSAL_STATUS_SET.has(input.before_status)) {
    throw new AuditLogValidationError(
      `unknown before_status: ${String(input.before_status)}`,
      { field: 'before_status', action: input.action },
    )
  }
  if (!PROPOSAL_STATUS_SET.has(input.after_status)) {
    throw new AuditLogValidationError(
      `unknown after_status: ${String(input.after_status)}`,
      { field: 'after_status', action: input.action },
    )
  }

  // 5. MVP では before/after_visibility は常に null
  const beforeVis = input.before_visibility ?? null
  const afterVis = input.after_visibility ?? null
  if (beforeVis !== null) {
    throw new AuditLogValidationError(
      `before_visibility must be null for MVP action=${input.action}`,
      { field: 'before_visibility', action: input.action },
    )
  }
  if (afterVis !== null) {
    throw new AuditLogValidationError(
      `after_visibility must be null for MVP action=${input.action}`,
      { field: 'after_visibility', action: input.action },
    )
  }
}

/**
 * `initial` シード時に渡された AuditLog の最低限の整合を検証する。
 * append 時と同じ規則を適用するため、入力形に揃え直して `validateAppendInput` を呼ぶ。
 */
function assertEntryShape(entry: AuditLog): void {
  validateAppendInput({
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    action: entry.action,
    target_proposal_id: entry.target_proposal_id,
    before_status: entry.before_status,
    after_status: entry.after_status,
    before_visibility: entry.before_visibility,
    after_visibility: entry.after_visibility,
    reason: entry.reason,
    policy_agreement_id: entry.policy_agreement_id,
  })
  if (typeof entry.id !== 'string' || entry.id === '') {
    throw new AuditLogValidationError(`invalid id`, { field: 'id', action: entry.action })
  }
  if (typeof entry.created_at !== 'number' || !Number.isFinite(entry.created_at)) {
    throw new AuditLogValidationError(`invalid created_at`, {
      field: 'created_at',
      action: entry.action,
    })
  }
  if (
    entry.before_visibility !== null
    && !VISIBILITY_SET.has(entry.before_visibility)
  ) {
    throw new AuditLogValidationError(`unknown before_visibility`, {
      field: 'before_visibility',
      action: entry.action,
    })
  }
  if (
    entry.after_visibility !== null
    && !VISIBILITY_SET.has(entry.after_visibility)
  ) {
    throw new AuditLogValidationError(`unknown after_visibility`, {
      field: 'after_visibility',
      action: entry.action,
    })
  }
}

// ---------------------------------------------------------------------------
// 内部ヘルパ
// ---------------------------------------------------------------------------

function matches(filter: AuditLogListFilter): (entry: AuditLog) => boolean {
  return (entry) => {
    if (filter.actor_id !== undefined && entry.actor_id !== filter.actor_id) return false
    if (filter.action !== undefined && entry.action !== filter.action) return false
    if (
      filter.target_proposal_id !== undefined
      && entry.target_proposal_id !== filter.target_proposal_id
    ) {
      return false
    }
    if (filter.from !== undefined && entry.created_at < filter.from) return false
    if (filter.to !== undefined && entry.created_at >= filter.to) return false
    return true
  }
}

function byCreatedAtDesc(a: AuditLog, b: AuditLog): number {
  if (b.created_at !== a.created_at) return b.created_at - a.created_at
  // 同 ms 内は append 順を保つため id の文字列比較を tiebreak に使う。
  // UUID v4/v7 とも文字列ソートで一意な順が定まる。
  if (a.id < b.id) return 1
  if (a.id > b.id) return -1
  return 0
}

function byCreatedAtAsc(a: AuditLog, b: AuditLog): number {
  if (a.created_at !== b.created_at) return a.created_at - b.created_at
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

// ---------------------------------------------------------------------------
// Factory（テスト fixture 用）
// ---------------------------------------------------------------------------

/** action 別の status 遷移デフォルト (DB-004 §不変条件 3 と一致)。 */
const STATUS_TRANSITION: Record<
  AuditAction,
  { readonly before: ProposalStatus; readonly after: ProposalStatus }
> = {
  submit: { before: 'draft', after: 'submitted' },
  start_review: { before: 'submitted', after: 'in_review' },
  approve: { before: 'in_review', after: 'approved' },
  return: { before: 'in_review', after: 'returned' },
  reject: { before: 'in_review', after: 'rejected' },
  publish: { before: 'approved', after: 'published' },
  withdraw: { before: 'published', after: 'withdrawn' },
  resubmit: { before: 'returned', after: 'submitted' },
}

/** action 別の actor_role デフォルト (DB-004 §不変条件 4 と一致)。 */
const DEFAULT_ACTOR_ROLE: Record<AuditAction, string> = {
  submit: 'user',
  start_review: 'reviewer',
  approve: 'reviewer',
  return: 'reviewer',
  reject: 'reviewer',
  publish: 'admin',
  withdraw: 'admin',
  resubmit: 'user',
}

const FIXED_BASE_MS = 1_700_000_000_000

const ACTION_OFFSET: Record<AuditAction, number> = {
  submit: 0,
  start_review: 1_000,
  approve: 2_000,
  return: 3_000,
  reject: 4_000,
  publish: 5_000,
  withdraw: 6_000,
  resubmit: 7_000,
}

/**
 * テスト用 fixture を 1 件生成する。
 *
 * - status 遷移は STATUS_TRANSITION のデフォルトに従う。
 * - actor_role は DEFAULT_ACTOR_ROLE。
 * - reason は必須 action では `'tested-reason'`、それ以外は null。
 * - policy_agreement_id は `submit` / `resubmit` でのみ `'pa-1'` を入れる。
 * - id 省略時は `audit-${action}` 形式で衝突しないよう生成。
 * - created_at は FIXED_BASE_MS + action 別オフセット。
 *
 * `overrides` で任意フィールドを上書き可能（個別テストの調整用）。
 */
export function makeAuditLog(
  base: { actor_id: string; target_proposal_id: string; action: AuditAction },
  overrides: Partial<AuditLog> = {},
): AuditLog {
  const transition = STATUS_TRANSITION[base.action]
  const reasonRequired = REASON_REQUIRED_SET.has(base.action)
  const policyRelevant = base.action === 'submit' || base.action === 'resubmit'
  const id = overrides.id ?? `audit-${base.action}-${base.target_proposal_id}`

  const defaults: AuditLog = {
    id,
    actor_id: base.actor_id,
    actor_role: DEFAULT_ACTOR_ROLE[base.action],
    action: base.action,
    target_proposal_id: base.target_proposal_id,
    before_status: transition.before,
    after_status: transition.after,
    before_visibility: null,
    after_visibility: null,
    reason: reasonRequired ? 'tested-reason' : null,
    policy_agreement_id: policyRelevant ? 'pa-1' : null,
    created_at: FIXED_BASE_MS + ACTION_OFFSET[base.action],
  }

  return { ...defaults, ...overrides }
}
