// TEST-025 — listMyProposals loader (API-012 / REQ-007 / UC-010 / DB-003)
//
// 検証観点:
//   1. guest（viewer === null）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   2. ログイン済 → 自身の author_id の投稿のみが返る（他人は除外）
//   3. 全 8 status を含む（draft / submitted / in_review / approved / returned /
//      rejected / published / withdrawn）
//   4. 他人の投稿（author_id 不一致）が混入しないこと
//   5. 空結果（自身が投稿 0 件）→ []
//   6. 並び順: repository の updated_at DESC を維持
//   7. 副作用なし: console.* / 不要な findById / authorize 多重呼び出しなし
//   8. レスポンスのスキーマ整合（API-012 §レスポンス §スキーマ、body 除外）
//
// 参照: docs/20-detail-design/apis/API-012.md（§認可 §レスポンス §スキーマ）、
//       docs/02-requirements/02-functional-requirements.md REQ-007、
//       src/server/auth/authorize.ts、
//       src/server/repositories/proposals.ts (makeProposal / listByAuthor)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authorizeModule from '../../../src/server/auth/authorize'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  listMyProposals,
  type MyProposalSummary,
} from '../../../src/server/loaders/list-my-proposals'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
  type ProposalRepository,
} from '../../../src/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const aliceViewer: Viewer = { user_id: 'alice', roles: ['user'] }
const bobViewer: Viewer = { user_id: 'bob', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

/**
 * alice の投稿を全 8 status × 1 件ずつ + bob の投稿を 2 件作る。
 * factory の id は `proposal-${status}-${visibility}` 形式なので、author を分けるため
 * id を明示的に上書きして衝突を避ける。
 */
function makeMixedAuthorFixtures(): ReadonlyArray<Proposal> {
  const aliceRows: Proposal[] = (
    [
      'draft',
      'submitted',
      'in_review',
      'approved',
      'returned',
      'rejected',
      'published',
      'withdrawn',
    ] as const
  ).map((status) =>
    makeProposal({
      author_id: 'alice',
      status,
      visibility: 'private',
      id: `alice-${status}`,
    }),
  )
  const bobRows: Proposal[] = [
    makeProposal({
      author_id: 'bob',
      status: 'draft',
      visibility: 'private',
      id: 'bob-draft',
    }),
    makeProposal({
      author_id: 'bob',
      status: 'published',
      visibility: 'public',
      id: 'bob-published',
    }),
  ]
  return [...aliceRows, ...bobRows]
}

// ---------------------------------------------------------------------------
// 副作用 spy（authorize の呼び出し回数 / console / repository.findById）
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
 * findById / listPublic / listForReview / listAll などが意図せず呼ばれないことを
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

describe('REQ-007 / API-012 / TEST-025: guest viewer (null) is rejected with 401', () => {
  it('REQ-007 / TEST-025: throws AuthorizationError(reason=not_authenticated, httpStatus=401)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    await expect(listMyProposals(null, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  it('REQ-007 / TEST-025: AuthorizationError carries reason / httpStatus / errorCode', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    let caught: unknown
    try {
      await listMyProposals(null, { proposals })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AuthorizationError)
    const err = caught as AuthorizationError
    expect(err.reason).toBe('not_authenticated')
    expect(err.httpStatus).toBe(401)
    expect(err.errorCode).toBe('UNAUTHENTICATED')
  })

  it('NFR-003 / TEST-025: guest path does not access repository (no DB read on 401)', async () => {
    const { repo, findByIdSpy, listByAuthorSpy, listPublicSpy, listForReviewSpy, listAllSpy } =
      makeSpiedRepo(makeMixedAuthorFixtures())

    await expect(listMyProposals(null, { proposals: repo })).rejects.toBeInstanceOf(
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
// 2. ログイン済 → 自身の投稿のみ
// ---------------------------------------------------------------------------

describe('REQ-007 / API-012 / TEST-025: authenticated viewer sees own proposals only', () => {
  it('REQ-007 / TEST-025: alice sees only own proposals (bob is excluded)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    const result = await listMyProposals(aliceViewer, { proposals })

    // alice の投稿は 8 件、bob の投稿（2 件）は混入しない
    expect(result).toHaveLength(8)
    expect(result.every((r) => r.proposal_id.startsWith('alice-'))).toBe(true)
    expect(result.some((r) => r.proposal_id.startsWith('bob-'))).toBe(false)
  })

  it('REQ-007 / TEST-025: bob sees only own proposals (alice is excluded)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    const result = await listMyProposals(bobViewer, { proposals })

    expect(result).toHaveLength(2)
    expect(result.every((r) => r.proposal_id.startsWith('bob-'))).toBe(true)
    expect(result.some((r) => r.proposal_id.startsWith('alice-'))).toBe(false)
  })

  it.each([
    ['reviewer', reviewerViewer],
    ['admin', adminViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-007 / TEST-025: %s with own author_id sees own proposals (role does not bypass owner filter)',
    async (_label, viewer) => {
      // 当該 viewer の user_id で 1 件起票
      const proposals = createInMemoryProposalRepository([
        makeProposal({
          author_id: viewer.user_id,
          status: 'draft',
          visibility: 'private',
          id: `${viewer.user_id}-draft`,
        }),
        // 他人の投稿（混入してはならない）
        makeProposal({
          author_id: 'someone-else',
          status: 'published',
          visibility: 'public',
          id: 'someone-else-published',
        }),
      ])

      const result = await listMyProposals(viewer, { proposals })

      expect(result).toHaveLength(1)
      expect(result[0]?.proposal_id).toBe(`${viewer.user_id}-draft`)
    },
  )
})

// ---------------------------------------------------------------------------
// 3. 全 8 status を含む
// ---------------------------------------------------------------------------

describe('REQ-007 / API-012 / TEST-025: returns all 8 statuses for own proposals', () => {
  it('REQ-007 / TEST-025: alice with 1 row per status sees all 8 statuses', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    const result = await listMyProposals(aliceViewer, { proposals })

    const statuses = new Set(result.map((r) => r.status))
    expect(statuses.size).toBe(8)
    expect(statuses).toEqual(
      new Set([
        'draft',
        'submitted',
        'in_review',
        'approved',
        'returned',
        'rejected',
        'published',
        'withdrawn',
      ]),
    )
  })

  it('REQ-007 / TEST-025: draft status is included (private own draft is visible to author)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'alice',
        status: 'draft',
        visibility: 'private',
        id: 'alice-draft',
      }),
    ])

    const result = await listMyProposals(aliceViewer, { proposals })

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('draft')
  })

  it('REQ-007 / TEST-025: withdrawn status is included for self (REQ-005 owner exception)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'alice',
        status: 'withdrawn',
        visibility: 'public',
        id: 'alice-withdrawn',
      }),
    ])

    const result = await listMyProposals(aliceViewer, { proposals })

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('withdrawn')
  })
})

// ---------------------------------------------------------------------------
// 4. 空結果
// ---------------------------------------------------------------------------

describe('API-012 / TEST-025: empty result when viewer has no proposals', () => {
  it('TEST-025: returns [] when viewer has no proposals (others exist)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'someone-else',
        status: 'published',
        visibility: 'public',
        id: 'someone-else-published',
      }),
    ])

    const result = await listMyProposals(aliceViewer, { proposals })

    expect(result).toEqual([])
  })

  it('TEST-025: returns [] when repository is empty', async () => {
    const proposals = createInMemoryProposalRepository([])

    const result = await listMyProposals(aliceViewer, { proposals })

    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5. 並び順 (updated_at DESC)
// ---------------------------------------------------------------------------

describe('API-012 / TEST-025: ordering preserves repository.listByAuthor updated_at DESC', () => {
  it('API-012 / TEST-025: items are ordered by updated_at DESC', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    const result = await listMyProposals(aliceViewer, { proposals })

    expect(result.length).toBeGreaterThan(1)
    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1] as MyProposalSummary
      const curr = result[i] as MyProposalSummary
      expect(prev.updated_at).toBeGreaterThanOrEqual(curr.updated_at)
    }
  })

  it('API-012 / TEST-025: latest updated_at appears first (factory STATUS_OFFSET: withdrawn=7000 is largest for alice)', async () => {
    // makeMixedAuthorFixtures では各 status 1 件ずつあり、factory の STATUS_OFFSET により
    // updated_at は status ごとに一意。最大は withdrawn (offset=7000)。
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    const result = await listMyProposals(aliceViewer, { proposals })

    expect(result[0]?.proposal_id).toBe('alice-withdrawn')
  })
})

// ---------------------------------------------------------------------------
// 6. レスポンスのスキーマ整合（API-012 §レスポンス §スキーマ）
// ---------------------------------------------------------------------------

describe('API-012 / TEST-025: response shape matches API-012 schema', () => {
  it('API-012 / TEST-025: each item has proposal_id, title, status, visibility, updated_at, submitted_at, published_at, withdrawn_at, version (no body)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    const result = await listMyProposals(aliceViewer, { proposals })
    expect(result.length).toBeGreaterThan(0)

    for (const item of result) {
      expect(typeof item.proposal_id).toBe('string')
      expect(typeof item.title).toBe('string')
      expect(['draft', 'submitted', 'in_review', 'approved', 'returned', 'rejected', 'published', 'withdrawn']).toContain(item.status)
      expect(['private', 'internal', 'public']).toContain(item.visibility)
      expect(typeof item.updated_at).toBe('number')
      expect(typeof item.version).toBe('number')

      // nullable timestamps: 各 status の不変条件に従って null か number
      expect(item.submitted_at === null || typeof item.submitted_at === 'number').toBe(true)
      expect(item.published_at === null || typeof item.published_at === 'number').toBe(true)
      expect(item.withdrawn_at === null || typeof item.withdrawn_at === 'number').toBe(true)

      // API-012 §スキーマに body / body_excerpt / created_at / approved_at の列なし
      expect(item).not.toHaveProperty('body')
      expect(item).not.toHaveProperty('body_excerpt')
      expect(item).not.toHaveProperty('created_at')
      expect(item).not.toHaveProperty('approved_at')
    }
  })

  it('API-012 / TEST-025: draft row has all timestamps null except created/updated', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'alice',
        status: 'draft',
        visibility: 'private',
        id: 'alice-draft',
      }),
    ])

    const result = await listMyProposals(aliceViewer, { proposals })
    const item = result[0] as MyProposalSummary

    expect(item.submitted_at).toBeNull()
    expect(item.published_at).toBeNull()
    expect(item.withdrawn_at).toBeNull()
  })

  it('API-012 / TEST-025: published row has submitted_at and published_at set, withdrawn_at null', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'alice',
        status: 'published',
        visibility: 'public',
        id: 'alice-published',
      }),
    ])

    const result = await listMyProposals(aliceViewer, { proposals })
    const item = result[0] as MyProposalSummary

    expect(typeof item.submitted_at).toBe('number')
    expect(typeof item.published_at).toBe('number')
    expect(item.withdrawn_at).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. 副作用なし: console / 多重 authorize / 不要な findById
// ---------------------------------------------------------------------------

describe('NFR-003 / API-012 / TEST-025: no unexpected side effects', () => {
  it('NFR-003 / TEST-025: no console output for happy path', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    await listMyProposals(aliceViewer, { proposals })

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-025: no console output for 401 path', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    await expect(listMyProposals(null, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-025: authorize() is called exactly once per invocation', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    await listMyProposals(aliceViewer, { proposals })

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(aliceViewer, 'list.myProposals')
  })

  it('NFR-003 / TEST-025: authorize() is called exactly once even when it throws (no retry)', async () => {
    const proposals = createInMemoryProposalRepository(makeMixedAuthorFixtures())

    await expect(listMyProposals(null, { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(null, 'list.myProposals')
  })

  it('NFR-003 / TEST-025: repository.findById is not called (list-only path)', async () => {
    const { repo, findByIdSpy, listByAuthorSpy } = makeSpiedRepo(makeMixedAuthorFixtures())

    await listMyProposals(aliceViewer, { proposals: repo })

    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByAuthorSpy).toHaveBeenCalledTimes(1)
    expect(listByAuthorSpy).toHaveBeenCalledWith('alice')
  })

  it('NFR-003 / TEST-025: only listByAuthor is called (other repository methods are not touched)', async () => {
    const { repo, listByAuthorSpy, listPublicSpy, listForReviewSpy, listAllSpy } =
      makeSpiedRepo(makeMixedAuthorFixtures())

    await listMyProposals(aliceViewer, { proposals: repo })

    expect(listByAuthorSpy).toHaveBeenCalledTimes(1)
    expect(listPublicSpy).not.toHaveBeenCalled()
    expect(listForReviewSpy).not.toHaveBeenCalled()
    expect(listAllSpy).not.toHaveBeenCalled()
  })
})
