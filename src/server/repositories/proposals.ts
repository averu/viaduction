// DB-003 / BR-REVIEW-02 — proposals リポジトリの抽象 + MVP インメモリ実装
//
// 役割:
//   - `proposals` テーブル（DB-003）への読み書きを Repository インターフェイスで抽象化し、
//     MVP では Map ベースのインメモリ実装を提供する（NFR-002 互換、Workers / D1 移行見越し）。
//   - 全 status 遷移は CAS（Compare-And-Set: `WHERE id=? AND version=?`）で実行する。
//     `version` 不一致は `ProposalLockError` として throw し、呼び出し側（server function）が
//     `409 CONFLICT` に map する（BR-REVIEW-02 / API-003）。
//   - status 遷移の整合・本文編集禁止・assignee_id 整合などの不変条件（DB-003 §不変条件）は
//     **本 repository では強制しない**。呼び出し側 server function の責務とする。
//     本 repository は (1) CAS による楽観ロック、(2) created_at / updated_at / version の
//     一括採番、(3) 並び順を伴う read のみを担当する。
//
// 参照: docs/20-detail-design/db/DB-003.md（カラム / 不変条件 / 楽観ロック）、
//       docs/02-requirements/04-business-rules.md（BR-REVIEW-02 / BR-PROPOSAL-01..03 / BR-RESUBMIT-01）、
//       docs/20-detail-design/apis/API-003.md（expected_version の使用例）

import {
  PROPOSAL_STATUSES,
  VISIBILITIES,
  type ProposalStatus,
  type Visibility,
} from '#/lib/domain/types'

// ---------------------------------------------------------------------------
// ドメインモデル
// ---------------------------------------------------------------------------

/**
 * DB-003 proposals 1 行に対応するドメインモデル。
 *
 * NFR-002（Workers 互換）のため `bigint` を使わず、Unix epoch millis は `number` で表現する
 * （DB-003 §m-01 整理: 2^53 まで安全、MVP 範囲では十分）。
 */
export interface Proposal {
  readonly id: string
  readonly author_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly status: ProposalStatus
  readonly assignee_id: string | null
  readonly current_policy_agreement_id: string | null
  readonly created_at: number
  readonly updated_at: number
  readonly submitted_at: number | null
  readonly approved_at: number | null
  readonly published_at: number | null
  readonly withdrawn_at: number | null
  readonly version: number
}

/**
 * `insert` 時に呼び出し側が決める入力。
 * `id` 省略時は `crypto.randomUUID()` で採番する。
 * `created_at` / `updated_at` / `version` は repository 側で設定し、外から指定できない。
 * `*_at`（submitted/approved/published/withdrawn）は status 遷移を起こす server function が
 * 後段の `updateWithLock` で設定する想定（initial INSERT 時は常に NULL）。
 */
export interface ProposalInsert {
  readonly id?: string
  readonly author_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly status?: ProposalStatus
  readonly assignee_id?: string | null
  readonly current_policy_agreement_id?: string | null
}

/**
 * `updateWithLock` で書き込めるフィールド集合。
 * `id` / `author_id` / `created_at` / `version` は不変。`updated_at` は repository が自動更新。
 */
export interface ProposalUpdate {
  readonly title?: string
  readonly body?: string
  readonly visibility?: Visibility
  readonly status?: ProposalStatus
  readonly assignee_id?: string | null
  readonly current_policy_agreement_id?: string | null
  readonly submitted_at?: number | null
  readonly approved_at?: number | null
  readonly published_at?: number | null
  readonly withdrawn_at?: number | null
}

// ---------------------------------------------------------------------------
// 例外
// ---------------------------------------------------------------------------

/**
 * 楽観ロック失敗時に throw される例外。
 * - `actualVersion === null`: 対象 id が存在しない（404 相当だが、呼び出し側ですでに
 *   findById で存在確認済の前提で start_review などを呼ぶケースを想定し、本 repository では
 *   CAS 失敗の一形態として扱う）。
 * - `actualVersion !== null`: 競合（API-003 で 409 CONFLICT）。
 */
export class ProposalLockError extends Error {
  readonly id: string
  readonly expectedVersion: number
  readonly actualVersion: number | null

  constructor(id: string, expectedVersion: number, actualVersion: number | null) {
    const reason =
      actualVersion === null
        ? `proposal not found: ${id}`
        : `version mismatch on ${id}: expected=${String(expectedVersion)}, actual=${String(actualVersion)}`
    super(`ProposalLockError: ${reason}`)
    this.name = 'ProposalLockError'
    this.id = id
    this.expectedVersion = expectedVersion
    this.actualVersion = actualVersion
  }
}

/**
 * INSERT 時に id が既に存在した場合に throw される例外。
 * 楽観ロックとは独立した「主キー重複」エラー。
 */
export class ProposalAlreadyExistsError extends Error {
  readonly id: string

  constructor(id: string) {
    super(`ProposalAlreadyExistsError: id already exists: ${id}`)
    this.name = 'ProposalAlreadyExistsError'
    this.id = id
  }
}

// ---------------------------------------------------------------------------
// インターフェイス
// ---------------------------------------------------------------------------

export interface ProposalRepository {
  /** id で 1 件取得。存在しなければ null。 */
  findById(id: string): Promise<Proposal | null>

  /** author_id で取得。`updated_at DESC` で並べる（ix_proposals_author_id 相当、API-012）。 */
  listByAuthor(authorId: string): Promise<ReadonlyArray<Proposal>>

  /**
   * `status='published'` のみを `visibility` フィルタ付きで取得。
   * `published_at DESC`（NULL は末尾）で並べる（ix_proposals_status_published_at 相当、API-010）。
   * `visibilities` を省略または空配列で渡した場合は全 visibility の published を返す。
   */
  listPublic(visibilities?: ReadonlyArray<Visibility>): Promise<ReadonlyArray<Proposal>>

  /**
   * `status IN ('submitted','in_review')` を `updated_at DESC` で取得（API-014）。
   * visibility フィルタ（reviewer から private を除外する Q-016 暫定）は呼び出し側 (server function) の責務。
   */
  listForReview(): Promise<ReadonlyArray<Proposal>>

  /** 全件取得（テスト・admin 用、本番のリスト系では使わない想定）。 */
  listAll(): Promise<ReadonlyArray<Proposal>>

  /**
   * 新規 INSERT。
   * `id` 省略時は `crypto.randomUUID()` で採番。`created_at` / `updated_at` は `Date.now()`、
   * `version` は 0、`status` 省略時は 'draft'、各 `*_at` は NULL で初期化する。
   * 既存 id と衝突した場合は `ProposalAlreadyExistsError` を throw。
   */
  insert(input: ProposalInsert): Promise<Proposal>

  /**
   * CAS UPDATE（BR-REVIEW-02）。
   *
   * - `expectedVersion` が現在の `version` と一致しない場合、`ProposalLockError` を throw。
   * - id 不在の場合も `ProposalLockError(id, expected, null)` を throw（CAS の一形態）。
   * - 成功時は `version` を +1、`updated_at = Date.now()` で書き戻し、新 Proposal を返す。
   * - status 遷移整合（DB-003 §不変条件 1）は呼び出し側の責務。本関数は patch をそのまま適用する。
   * - `patch` に明示的に渡されていないフィールドは現状値を維持する。
   *   `null` を明示的に渡せば NULL に更新できる（assignee_id を `in_review` 抜けで戻す等）。
   */
  updateWithLock(
    id: string,
    expectedVersion: number,
    patch: ProposalUpdate,
  ): Promise<Proposal>
}

// ---------------------------------------------------------------------------
// インメモリ実装
// ---------------------------------------------------------------------------

/**
 * 全件のスナップショットから ProposalRepository を組み立てる。
 * `initial` で渡した Proposal はそのままシードされる（id 重複時は `ProposalAlreadyExistsError`）。
 */
export function createInMemoryProposalRepository(
  initial?: ReadonlyArray<Proposal>,
): ProposalRepository {
  const store = new Map<string, Proposal>()

  if (initial !== undefined) {
    for (const p of initial) {
      if (store.has(p.id)) {
        throw new ProposalAlreadyExistsError(p.id)
      }
      store.set(p.id, p)
    }
  }

  return {
    async findById(id) {
      return store.get(id) ?? null
    },

    async listByAuthor(authorId) {
      return [...store.values()]
        .filter((p) => p.author_id === authorId)
        .sort(byUpdatedAtDesc)
    },

    async listPublic(visibilities) {
      const filter =
        visibilities === undefined || visibilities.length === 0
          ? null
          : new Set<Visibility>(visibilities)
      return [...store.values()]
        .filter(
          (p) => p.status === 'published' && (filter === null || filter.has(p.visibility)),
        )
        .sort(byPublishedAtDesc)
    },

    async listForReview() {
      return [...store.values()]
        .filter((p) => p.status === 'submitted' || p.status === 'in_review')
        .sort(byUpdatedAtDesc)
    },

    async listAll() {
      return [...store.values()]
    },

    async insert(input) {
      const id = input.id ?? crypto.randomUUID()
      if (store.has(id)) {
        throw new ProposalAlreadyExistsError(id)
      }
      const now = Date.now()
      const row: Proposal = {
        id,
        author_id: input.author_id,
        title: input.title,
        body: input.body,
        visibility: input.visibility,
        status: input.status ?? 'draft',
        assignee_id: input.assignee_id ?? null,
        current_policy_agreement_id: input.current_policy_agreement_id ?? null,
        created_at: now,
        updated_at: now,
        submitted_at: null,
        approved_at: null,
        published_at: null,
        withdrawn_at: null,
        version: 0,
      }
      store.set(id, row)
      return row
    },

    async updateWithLock(id, expectedVersion, patch) {
      const current = store.get(id)
      if (current === undefined) {
        throw new ProposalLockError(id, expectedVersion, null)
      }
      if (current.version !== expectedVersion) {
        throw new ProposalLockError(id, expectedVersion, current.version)
      }
      const next: Proposal = {
        ...current,
        ...applyPatch(patch),
        updated_at: Date.now(),
        version: current.version + 1,
      }
      store.set(id, next)
      return next
    },
  }
}

// ---------------------------------------------------------------------------
// 内部ヘルパ
// ---------------------------------------------------------------------------

function byUpdatedAtDesc(a: Proposal, b: Proposal): number {
  return b.updated_at - a.updated_at
}

/** `published_at DESC` で並べる。NULL（未公開だが残したい場合）は末尾に集める。 */
function byPublishedAtDesc(a: Proposal, b: Proposal): number {
  if (a.published_at === null && b.published_at === null) return 0
  if (a.published_at === null) return 1
  if (b.published_at === null) return -1
  return b.published_at - a.published_at
}

/**
 * patch から書き込み対象だけを抜き出した部分オブジェクトを返す。
 * `undefined` のフィールドは出力に含めず、呼び出し側で `{ ...current, ...applyPatch(patch) }`
 * のように合成すれば現状値が維持される。`null` を明示した場合のみ NULL 化が伝搬する。
 */
function applyPatch(patch: ProposalUpdate): Partial<Proposal> {
  const out: Record<string, unknown> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.body !== undefined) out.body = patch.body
  if (patch.visibility !== undefined) out.visibility = patch.visibility
  if (patch.status !== undefined) out.status = patch.status
  if (patch.assignee_id !== undefined) out.assignee_id = patch.assignee_id
  if (patch.current_policy_agreement_id !== undefined) {
    out.current_policy_agreement_id = patch.current_policy_agreement_id
  }
  if (patch.submitted_at !== undefined) out.submitted_at = patch.submitted_at
  if (patch.approved_at !== undefined) out.approved_at = patch.approved_at
  if (patch.published_at !== undefined) out.published_at = patch.published_at
  if (patch.withdrawn_at !== undefined) out.withdrawn_at = patch.withdrawn_at
  return out as Partial<Proposal>
}

// ---------------------------------------------------------------------------
// Factory（テスト fixture 用）
// ---------------------------------------------------------------------------

export interface ProposalFactoryOverrides extends Partial<Proposal> {}

const FIXED_NOW_BASE = 1_700_000_000_000

/**
 * status / visibility を指定して 1 件の Proposal を生成する。
 * 各 status の不変条件（DB-003 §不変条件 4 / 5）を満たすデフォルト値を割り当てる。
 *
 * - `draft`: `submitted_at` 等すべて null、`current_policy_agreement_id=null`
 * - `submitted` / `returned` / `rejected`: `submitted_at` を設定、policy_agreement を設定、`assignee_id=null`
 * - `in_review`: 上記 + `assignee_id='reviewer-1'`
 * - `approved`: 上記 + `approved_at` を設定（assignee_id は null に戻る、不変条件 4）
 * - `published`: 上記 + `published_at` を設定
 * - `withdrawn`: 上記 + `withdrawn_at` を設定
 *
 * 第 2 引数を省略した場合のデフォルトは `status='draft'` / `visibility='private'`。
 * `overrides` で任意のフィールドを上書きできる（テストごとの個別調整用）。
 */
export function makeProposal(
  base: { author_id: string; status?: ProposalStatus; visibility?: Visibility; id?: string },
  overrides: ProposalFactoryOverrides = {},
): Proposal {
  const status = base.status ?? 'draft'
  const visibility = base.visibility ?? 'private'
  const id = base.id ?? `proposal-${status}-${visibility}`

  const created_at = FIXED_NOW_BASE
  const updated_at = FIXED_NOW_BASE + STATUS_OFFSET[status]
  const lifecycle = lifecycleTimestamps(status, FIXED_NOW_BASE)

  const defaults: Proposal = {
    id,
    author_id: base.author_id,
    title: `title-${status}`,
    body: `body-${status}`,
    visibility,
    status,
    assignee_id: status === 'in_review' ? 'reviewer-1' : null,
    current_policy_agreement_id: status === 'draft' ? null : `pa-${id}`,
    created_at,
    updated_at,
    submitted_at: lifecycle.submitted_at,
    approved_at: lifecycle.approved_at,
    published_at: lifecycle.published_at,
    withdrawn_at: lifecycle.withdrawn_at,
    version: 0,
  }

  return { ...defaults, ...overrides }
}

/**
 * 全 status × 全 visibility = 24 件の Proposal を返す（テスト fixture）。
 * id は `${status}-${visibility}` 形式で衝突しない。
 */
export function makeProposalMatrix(authorId: string): ReadonlyArray<Proposal> {
  const out: Proposal[] = []
  for (const status of PROPOSAL_STATUSES) {
    for (const visibility of VISIBILITIES) {
      out.push(makeProposal({ author_id: authorId, status, visibility }))
    }
  }
  return out
}

/**
 * factory が status ごとに付与する updated_at の相対オフセット。
 * リスト系テストで「published_at DESC で並ぶか」「updated_at DESC で並ぶか」を
 * 安定して検証できるよう、status ごとに一意な値を割り当てる。
 */
const STATUS_OFFSET: Record<ProposalStatus, number> = {
  draft: 0,
  submitted: 1_000,
  in_review: 2_000,
  approved: 3_000,
  returned: 4_000,
  rejected: 5_000,
  published: 6_000,
  withdrawn: 7_000,
}

interface LifecycleTimestamps {
  submitted_at: number | null
  approved_at: number | null
  published_at: number | null
  withdrawn_at: number | null
}

/** status ごとに「過去にどの遷移を経ているか」を表現する `*_at` セット。 */
function lifecycleTimestamps(status: ProposalStatus, base: number): LifecycleTimestamps {
  const submitted = base + 100
  const approved = base + 200
  const published = base + 300
  const withdrawn = base + 400

  switch (status) {
    case 'draft':
      return { submitted_at: null, approved_at: null, published_at: null, withdrawn_at: null }
    case 'submitted':
    case 'in_review':
    case 'returned':
    case 'rejected':
      return {
        submitted_at: submitted,
        approved_at: null,
        published_at: null,
        withdrawn_at: null,
      }
    case 'approved':
      return {
        submitted_at: submitted,
        approved_at: approved,
        published_at: null,
        withdrawn_at: null,
      }
    case 'published':
      return {
        submitted_at: submitted,
        approved_at: approved,
        published_at: published,
        withdrawn_at: null,
      }
    case 'withdrawn':
      return {
        submitted_at: submitted,
        approved_at: approved,
        published_at: published,
        withdrawn_at: withdrawn,
      }
  }
}
