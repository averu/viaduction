// TEST-027 — listReviewInbox loader (API-014 / REQ-009 / UC-012 / DB-003)
//
// 検証観点:
//   1. guest（viewer === null）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   2. user 単独 → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   3. auditor 単独 → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   4. reviewer → submitted + in_review の public / internal のみ（private は server-side で除外）
//   5. reviewer → 他 status (draft / approved / returned / rejected / published / withdrawn) は除外
//   6. admin → 全 visibility（private 含む）の submitted + in_review が返る
//   7. role 多重保有 (reviewer + admin) → admin として扱い全 visibility が返る
//   8. 空結果 → []
//   9. 副作用なし: console.* / 不要な findById / authorize 多重呼び出しなし
//   10. レスポンスのスキーマ整合（API-014 §レスポンス §スキーマ、body 除外）
//
// 参照: docs/20-detail-design/apis/API-014.md（§認可 §レスポンス §スキーマ §フィルタ条件）、
//       docs/02-requirements/02-functional-requirements.md REQ-009、
//       src/server/auth/authorize.ts、
//       src/server/repositories/proposals.ts (makeProposal / listForReview)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authorizeModule from '../../../src/server/auth/authorize'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  listReviewInbox,
  type ReviewInboxItem,
} from '../../../src/server/loaders/list-review-inbox'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
  type ProposalRepository,
} from '../../../src/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userViewer: Viewer = { user_id: 'user-1', roles: ['user'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const reviewerAdminViewer: Viewer = {
  user_id: 'reviewer-admin-1',
  roles: ['reviewer', 'admin'],
}

/**
 * submitted × 3 visibility + in_review × 3 visibility の 6 件を作る。
 * id は `${status}-${visibility}` 形式（factory のデフォルト）で衝突しない。
 */
function makeReviewQueueFixtures(): ReadonlyArray<Proposal> {
  return [
    makeProposal({ author_id: 'a-public', status: 'submitted', visibility: 'public' }),
    makeProposal({ author_id: 'a-internal', status: 'submitted', visibility: 'internal' }),
    makeProposal({ author_id: 'a-private', status: 'submitted', visibility: 'private' }),
    makeProposal({ author_id: 'b-public', status: 'in_review', visibility: 'public' }),
    makeProposal({ author_id: 'b-internal', status: 'in_review', visibility: 'internal' }),
    makeProposal({ author_id: 'b-private', status: 'in_review', visibility: 'private' }),
  ]
}

/**
 * 上記 6 件 + 他 status（draft / approved / returned / rejected / published / withdrawn）を
 * 全 visibility 付きで混ぜたフィクスチャ。レビュー待ち以外が混入しないことを検証する。
 *
 * makeProposal の id デフォルトは `proposal-${status}-${visibility}` のため、
 * makeReviewQueueFixtures（同じ id 体系）と衝突しないように `extra-` プレフィックスを付ける。
 */
function makeMixedStatusFixtures(): ReadonlyArray<Proposal> {
  const queue = makeReviewQueueFixtures()
  const others: Proposal[] = []
  for (const status of [
    'draft',
    'approved',
    'returned',
    'rejected',
    'published',
    'withdrawn',
  ] as const) {
    for (const visibility of ['public', 'internal', 'private'] as const) {
      others.push(
        makeProposal({
          author_id: `extra-${status}`,
          status,
          visibility,
          id: `extra-${status}-${visibility}`,
        }),
      )
    }
  }
  return [...queue, ...others]
}

// ---------------------------------------------------------------------------
// 副作用 spy（authorize の呼び出し回数 / console / repository.findById 等）
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleInfoSpy: ReturnType<typeof vi.spyOn>
let authorizeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  authorizeSpy = vi.spyOn(authorizeModule, 'authorize')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNoConsoleSideEffects(): void {
  expect(consoleLogSpy).not.toHaveBeenCalled()
  expect(consoleWarnSpy).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  expect(consoleInfoSpy).not.toHaveBeenCalled()
}

/**
 * findById / listByAuthor / listPublic / listAll などが意図せず呼ばれないことを
 * 確認するため、ProposalRepository を spy 付きで作る。
 */
function makeSpiedRepo(initial: ReadonlyArray<Proposal>): {
  repo: ProposalRepository
  findByIdSpy: ReturnType<typeof vi.fn>
  listByAuthorSpy: ReturnType<typeof vi.fn>
  listPublicSpy: ReturnType<typeof vi.fn>
  listForReviewSpy: ReturnType<typeof vi.fn>
  listAllSpy: ReturnType<typeof vi.fn>
} {
  const inner = createInMemoryProposalRepository(initial)
  const findByIdSpy = vi.fn(inner.findById.bind(inner))
  const listByAuthorSpy = vi.fn(inner.listByAuthor.bind(inner))
  const listPublicSpy = vi.fn(inner.listPublic.bind(inner))
  const listForReviewSpy = vi.fn(inner.listForReview.bind(inner))
  const listAllSpy = vi.fn(inner.listAll.bind(inner))
  const repo: ProposalRepository = {
    findById: findByIdSpy,
    listByAuthor: listByAuthorSpy,
    listPublic: listPublicSpy,
    listForReview: listForReviewSpy,
    listAll: listAllSpy,
    insert: inner.insert.bind(inner),
    updateWithLock: inner.updateWithLock.bind(inner),
  }
  return { repo, findByIdSpy, listByAuthorSpy, listPublicSpy, listForReviewSpy, listAllSpy }
}

// ---------------------------------------------------------------------------
// 1. guest → 401 AuthorizationError
// ---------------------------------------------------------------------------

describe('REQ-009 / API-014 / TEST-027: guest viewer (null) is rejected with 401', () => {
  it('REQ-009 / TEST-027: throws AuthorizationError for null viewer', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await expect(listReviewInbox(null, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  it('REQ-009 / TEST-027: AuthorizationError carries reason=not_authenticated / httpStatus=401', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    let caught: unknown
    try {
      await listReviewInbox(null, { proposals })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AuthorizationError)
    const err = caught as AuthorizationError
    expect(err.reason).toBe('not_authenticated')
    expect(err.httpStatus).toBe(401)
    expect(err.errorCode).toBe('UNAUTHENTICATED')
  })

  it('NFR-003 / TEST-027: guest path does not access repository (no DB read on 401)', async () => {
    const { repo, findByIdSpy, listByAuthorSpy, listPublicSpy, listForReviewSpy, listAllSpy } =
      makeSpiedRepo(makeReviewQueueFixtures())

    await expect(listReviewInbox(null, { proposals: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByAuthorSpy).not.toHaveBeenCalled()
    expect(listPublicSpy).not.toHaveBeenCalled()
    expect(listForReviewSpy).not.toHaveBeenCalled()
    expect(listAllSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. user / auditor → 404 insufficient_role
// ---------------------------------------------------------------------------

describe('REQ-009 / API-014 / TEST-027: user / auditor are rejected with 404 insufficient_role', () => {
  it.each([
    ['user', userViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-009 / TEST-027: %s is rejected with reason=insufficient_role / httpStatus=404',
    async (_label, viewer) => {
      const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

      let caught: unknown
      try {
        await listReviewInbox(viewer, { proposals })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(AuthorizationError)
      const err = caught as AuthorizationError
      expect(err.reason).toBe('insufficient_role')
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    },
  )

  it('NFR-003 / TEST-027: user / auditor path does not access repository (no DB read on 404)', async () => {
    const { repo, findByIdSpy, listByAuthorSpy, listPublicSpy, listForReviewSpy, listAllSpy } =
      makeSpiedRepo(makeReviewQueueFixtures())

    await expect(listReviewInbox(userViewer, { proposals: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
    await expect(listReviewInbox(auditorViewer, { proposals: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByAuthorSpy).not.toHaveBeenCalled()
    expect(listPublicSpy).not.toHaveBeenCalled()
    expect(listForReviewSpy).not.toHaveBeenCalled()
    expect(listAllSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. reviewer → submitted + in_review の public / internal のみ
// ---------------------------------------------------------------------------

describe('REQ-009 / API-014 / TEST-027: reviewer sees submitted + in_review with private filtered out (Q-016)', () => {
  it('REQ-009 / TEST-027: reviewer sees 4 items (public + internal × 2 statuses)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    const result = await listReviewInbox(reviewerViewer, { proposals })

    expect(result).toHaveLength(4)
    // visibility: public / internal のみ。private は server-side で除外される（Q-016 暫定）
    expect(result.every((r) => r.visibility !== 'private')).toBe(true)
    // status: submitted と in_review の双方が含まれる
    const statuses = new Set(result.map((r) => r.status))
    expect(statuses).toEqual(new Set(['submitted', 'in_review']))
    // visibility: public と internal の双方が含まれる
    const visibilities = new Set(result.map((r) => r.visibility))
    expect(visibilities).toEqual(new Set(['public', 'internal']))
  })

  it('REQ-009 / TEST-027: reviewer with mixed-status fixtures sees only submitted/in_review × public/internal (4 items)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedStatusFixtures())

    const result = await listReviewInbox(reviewerViewer, { proposals })

    expect(result).toHaveLength(4)
    expect(result.every((r) => r.status === 'submitted' || r.status === 'in_review')).toBe(true)
    expect(result.every((r) => r.visibility !== 'private')).toBe(true)
    // 他 status (draft / approved / returned / rejected / published / withdrawn) は除外
    const ids = result.map((r) => r.proposal_id)
    expect(ids.every((id) => !id.startsWith('extra-'))).toBe(true)
  })

  it('REQ-009 / TEST-027: reviewer never receives any private item even when private is the majority', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'a-private-1',
        status: 'submitted',
        visibility: 'private',
        id: 'private-1',
      }),
      makeProposal({
        author_id: 'a-private-2',
        status: 'in_review',
        visibility: 'private',
        id: 'private-2',
      }),
      makeProposal({
        author_id: 'a-public',
        status: 'submitted',
        visibility: 'public',
        id: 'public-1',
      }),
    ])

    const result = await listReviewInbox(reviewerViewer, { proposals })

    expect(result).toHaveLength(1)
    expect(result[0]?.proposal_id).toBe('public-1')
    expect(result[0]?.visibility).toBe('public')
  })
})

// ---------------------------------------------------------------------------
// 4. admin → 全 visibility が返る
// ---------------------------------------------------------------------------

describe('REQ-009 / API-014 / TEST-027: admin sees all 6 items including private', () => {
  it('REQ-009 / TEST-027: admin sees 6 items (public + internal + private × 2 statuses)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    const result = await listReviewInbox(adminViewer, { proposals })

    expect(result).toHaveLength(6)
    const visibilities = new Set(result.map((r) => r.visibility))
    expect(visibilities).toEqual(new Set(['public', 'internal', 'private']))
    const statuses = new Set(result.map((r) => r.status))
    expect(statuses).toEqual(new Set(['submitted', 'in_review']))
    // private が確実に含まれる（M-7 確定: admin はレビュー判定対象として private も明示）
    expect(result.some((r) => r.visibility === 'private')).toBe(true)
  })

  it('REQ-009 / TEST-027: admin with mixed-status fixtures still sees only submitted/in_review (6 items)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedStatusFixtures())

    const result = await listReviewInbox(adminViewer, { proposals })

    expect(result).toHaveLength(6)
    expect(result.every((r) => r.status === 'submitted' || r.status === 'in_review')).toBe(true)
    // 他 status (draft / approved / returned / rejected / published / withdrawn) は除外
    expect(result.every((r) => !r.proposal_id.startsWith('extra-'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. role 多重保有 (reviewer + admin) → admin として扱う
// ---------------------------------------------------------------------------

describe('REQ-009 / API-014 / TEST-027: role union (reviewer + admin) is treated as admin', () => {
  it('REQ-009 / TEST-027: reviewer+admin sees all 6 items (private not filtered)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    const result = await listReviewInbox(reviewerAdminViewer, { proposals })

    expect(result).toHaveLength(6)
    expect(result.some((r) => r.visibility === 'private')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. 空結果
// ---------------------------------------------------------------------------

describe('API-014 / TEST-027: empty result when no submitted/in_review proposals exist', () => {
  it('TEST-027: reviewer sees [] when repository is empty', async () => {
    const proposals = createInMemoryProposalRepository([])

    const result = await listReviewInbox(reviewerViewer, { proposals })

    expect(result).toEqual([])
  })

  it('TEST-027: admin sees [] when repository is empty', async () => {
    const proposals = createInMemoryProposalRepository([])

    const result = await listReviewInbox(adminViewer, { proposals })

    expect(result).toEqual([])
  })

  it('TEST-027: reviewer sees [] when only non-queue statuses exist', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: 'a', status: 'draft', visibility: 'public', id: 'd-1' }),
      makeProposal({ author_id: 'a', status: 'approved', visibility: 'internal', id: 'a-1' }),
      makeProposal({ author_id: 'a', status: 'published', visibility: 'public', id: 'p-1' }),
    ])

    const result = await listReviewInbox(reviewerViewer, { proposals })

    expect(result).toEqual([])
  })

  it('TEST-027: reviewer sees [] when only private submitted/in_review exist (all filtered)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'a',
        status: 'submitted',
        visibility: 'private',
        id: 'priv-1',
      }),
      makeProposal({
        author_id: 'a',
        status: 'in_review',
        visibility: 'private',
        id: 'priv-2',
      }),
    ])

    const result = await listReviewInbox(reviewerViewer, { proposals })

    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. レスポンスのスキーマ整合（API-014 §レスポンス §スキーマ）
// ---------------------------------------------------------------------------

describe('API-014 / TEST-027: response shape matches API-014 schema', () => {
  it('API-014 / TEST-027: each item carries proposal_id, title, visibility, status, version, author_id, assignee_id, submitted_at, updated_at (no body)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    const result = await listReviewInbox(adminViewer, { proposals })
    expect(result.length).toBeGreaterThan(0)

    for (const item of result) {
      expect(typeof item.proposal_id).toBe('string')
      expect(typeof item.title).toBe('string')
      expect(['private', 'internal', 'public']).toContain(item.visibility)
      expect(['submitted', 'in_review']).toContain(item.status)
      expect(typeof item.version).toBe('number')
      expect(typeof item.author_id).toBe('string')
      // assignee_id: in_review なら string、submitted なら null（factory のデフォルト挙動）
      expect(item.assignee_id === null || typeof item.assignee_id === 'string').toBe(true)
      // submitted_at: submitted / in_review はいずれも DB-003 不変条件で NOT NULL
      expect(typeof item.submitted_at).toBe('number')
      expect(typeof item.updated_at).toBe('number')

      // API-014 §スキーマに body 列なし
      expect(item).not.toHaveProperty('body')
      expect(item).not.toHaveProperty('body_excerpt')
      expect(item).not.toHaveProperty('created_at')
      expect(item).not.toHaveProperty('approved_at')
      expect(item).not.toHaveProperty('published_at')
      expect(item).not.toHaveProperty('withdrawn_at')
    }
  })

  it('API-014 / TEST-027: in_review item has non-null assignee_id (factory default reviewer-1)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'a',
        status: 'in_review',
        visibility: 'public',
        id: 'ir-1',
      }),
    ])

    const result = await listReviewInbox(adminViewer, { proposals })
    const item = result[0] as ReviewInboxItem

    expect(item.status).toBe('in_review')
    expect(item.assignee_id).toBe('reviewer-1')
  })

  it('API-014 / TEST-027: submitted item has null assignee_id (factory default)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'a',
        status: 'submitted',
        visibility: 'public',
        id: 's-1',
      }),
    ])

    const result = await listReviewInbox(adminViewer, { proposals })
    const item = result[0] as ReviewInboxItem

    expect(item.status).toBe('submitted')
    expect(item.assignee_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 8. 並び順 (updated_at DESC、repository が返す順序を維持)
// ---------------------------------------------------------------------------

describe('API-014 / TEST-027: ordering preserves repository.listForReview updated_at DESC', () => {
  it('API-014 / TEST-027: items are ordered by updated_at DESC', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    const result = await listReviewInbox(adminViewer, { proposals })

    expect(result.length).toBeGreaterThan(1)
    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1] as ReviewInboxItem
      const curr = result[i] as ReviewInboxItem
      expect(prev.updated_at).toBeGreaterThanOrEqual(curr.updated_at)
    }
  })

  it('API-014 / TEST-027: in_review items appear before submitted (factory STATUS_OFFSET: in_review=2000 > submitted=1000)', async () => {
    // makeProposal の STATUS_OFFSET: submitted=1_000 / in_review=2_000。updated_at DESC で
    // in_review が先頭側に並ぶ。filter 後も相対順は保たれる。
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    const result = await listReviewInbox(adminViewer, { proposals })

    // 先頭の in_review 群（3 件）の後に submitted 群（3 件）が並ぶ
    expect(result.slice(0, 3).every((r) => r.status === 'in_review')).toBe(true)
    expect(result.slice(3, 6).every((r) => r.status === 'submitted')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 9. 副作用なし: console / 多重 authorize / 不要な repository 呼び出し
// ---------------------------------------------------------------------------

describe('NFR-003 / API-014 / TEST-027: no unexpected side effects', () => {
  it('NFR-003 / TEST-027: no console output for happy path (reviewer)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await listReviewInbox(reviewerViewer, { proposals })

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-027: no console output for happy path (admin)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await listReviewInbox(adminViewer, { proposals })

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-027: no console output for 401 path', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await expect(listReviewInbox(null, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-027: no console output for 404 path (user)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await expect(listReviewInbox(userViewer, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-027: authorize() is called exactly once per invocation', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await listReviewInbox(reviewerViewer, { proposals })

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(reviewerViewer, 'list.reviewInbox')
  })

  it('NFR-003 / TEST-027: authorize() is called exactly once even when it throws (no retry)', async () => {
    const proposals = createInMemoryProposalRepository(makeReviewQueueFixtures())

    await expect(listReviewInbox(null, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(null, 'list.reviewInbox')
  })

  it('NFR-003 / TEST-027: only listForReview is called (other repository methods are not touched)', async () => {
    const { repo, findByIdSpy, listByAuthorSpy, listPublicSpy, listForReviewSpy, listAllSpy } =
      makeSpiedRepo(makeReviewQueueFixtures())

    await listReviewInbox(adminViewer, { proposals: repo })

    expect(listForReviewSpy).toHaveBeenCalledTimes(1)
    expect(listForReviewSpy).toHaveBeenCalledWith()
    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByAuthorSpy).not.toHaveBeenCalled()
    expect(listPublicSpy).not.toHaveBeenCalled()
    expect(listAllSpy).not.toHaveBeenCalled()
  })
})
