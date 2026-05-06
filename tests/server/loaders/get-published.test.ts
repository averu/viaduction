// TEST-024 — getPublished loader (API-011 / REQ-005 / REQ-008 / UC-011 / DB-003)
//
// 検証観点:
//   1. visibility × viewer マトリクス（18 パターン完全網羅）
//      - public:   guest / user(他人) / user(本人) / reviewer / admin / auditor → 200
//      - internal: guest=401, それ以外 → 200
//      - private:  guest=401, user(他人)=404 not_owner_resource, user(本人)=200,
//                  reviewer=404 insufficient_role (Q-016), admin=200,
//                  auditor=404 insufficient_role (Q-016)
//   2. `withdrawn` は viewer に関わらず 404（admin 含む全 viewer / 全 visibility）
//   3. 不在 proposalId → 404 not_owner_resource
//   4. 非 published（draft / submitted / in_review / approved / returned / rejected）→ 404
//   5. 副作用: console.* 呼ばれない / findById は 1 回のみ呼ばれる
//   6. 防御コピー: 戻り値の mutate が repository 内部に影響しない
//   7. レスポンス shape 整合（API-011 §レスポンス §スキーマ、body / version 含む）
//
// 参照: docs/20-detail-design/apis/API-011.md（§認可マトリクス §レスポンス §エラーコード）、
//       docs/02-requirements/02-functional-requirements.md REQ-005 / REQ-008、
//       src/server/auth/authorize.ts (action='get.publishedProposal')

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import { getPublished } from '#/server/loaders/get-published'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
  type ProposalRepository,
} from '#/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const OWNER_ID = 'user-owner'
const OTHER_USER_ID = 'user-other'
const REVIEWER_ID = 'reviewer-1'
const ADMIN_ID = 'admin-1'
const AUDITOR_ID = 'auditor-1'

const ownerViewer: Viewer = { user_id: OWNER_ID, roles: ['user'] }
const otherUserViewer: Viewer = { user_id: OTHER_USER_ID, roles: ['user'] }
const reviewerViewer: Viewer = { user_id: REVIEWER_ID, roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: ADMIN_ID, roles: ['admin'] }
const auditorViewer: Viewer = { user_id: AUDITOR_ID, roles: ['auditor'] }

/** OWNER_ID が author の published proposal を visibility ごとに 1 件ずつ用意する。 */
function makePublishedFixtures(): ReadonlyArray<Proposal> {
  return [
    makeProposal({
      author_id: OWNER_ID,
      status: 'published',
      visibility: 'public',
      id: 'pub-public',
    }),
    makeProposal({
      author_id: OWNER_ID,
      status: 'published',
      visibility: 'internal',
      id: 'pub-internal',
    }),
    makeProposal({
      author_id: OWNER_ID,
      status: 'published',
      visibility: 'private',
      id: 'pub-private',
    }),
  ]
}

const PROPOSAL_ID_BY_VISIBILITY = {
  public: 'pub-public',
  internal: 'pub-internal',
  private: 'pub-private',
} as const

// ---------------------------------------------------------------------------
// 副作用 spy
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleInfoSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNoConsole(): void {
  expect(consoleLogSpy).not.toHaveBeenCalled()
  expect(consoleWarnSpy).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  expect(consoleInfoSpy).not.toHaveBeenCalled()
}

/**
 * findById の呼び出し回数を観測するための薄いラッパ。
 * 内部は createInMemoryProposalRepository に委譲する。
 */
function makeCountingRepo(initial: ReadonlyArray<Proposal>): {
  repo: ProposalRepository
  findByIdCalls: () => number
} {
  const inner = createInMemoryProposalRepository(initial)
  let count = 0
  const repo: ProposalRepository = {
    async findById(id) {
      count += 1
      return inner.findById(id)
    },
    listByAuthor: inner.listByAuthor.bind(inner),
    listPublic: inner.listPublic.bind(inner),
    listForReview: inner.listForReview.bind(inner),
    listAll: inner.listAll.bind(inner),
    insert: inner.insert.bind(inner),
    updateWithLock: inner.updateWithLock.bind(inner),
  }
  return { repo, findByIdCalls: () => count }
}

// ---------------------------------------------------------------------------
// 1. visibility × viewer マトリクス
// ---------------------------------------------------------------------------

describe('REQ-008 / API-011 / TEST-024: visibility × viewer matrix (200 cases)', () => {
  it.each([
    ['public', 'guest', null, 'pub-public'],
    ['public', 'user(other)', otherUserViewer, 'pub-public'],
    ['public', 'user(owner)', ownerViewer, 'pub-public'],
    ['public', 'reviewer', reviewerViewer, 'pub-public'],
    ['public', 'admin', adminViewer, 'pub-public'],
    ['public', 'auditor', auditorViewer, 'pub-public'],
    ['internal', 'user(other)', otherUserViewer, 'pub-internal'],
    ['internal', 'user(owner)', ownerViewer, 'pub-internal'],
    ['internal', 'reviewer', reviewerViewer, 'pub-internal'],
    ['internal', 'admin', adminViewer, 'pub-internal'],
    ['internal', 'auditor', auditorViewer, 'pub-internal'],
    ['private', 'user(owner)', ownerViewer, 'pub-private'],
    ['private', 'admin', adminViewer, 'pub-private'],
  ] as const)(
    'REQ-008 / TEST-024: %s × %s returns 200 with full body',
    async (_visibility, _viewerLabel, viewer, proposalId) => {
      const proposals = createInMemoryProposalRepository(makePublishedFixtures())

      const result = await getPublished(viewer, proposalId, { proposals })

      expect(result.proposal_id).toBe(proposalId)
      expect(result.status).toBe('published')
      expect(typeof result.body).toBe('string')
      expect(result.body.length).toBeGreaterThan(0)
      expect(result.author_id).toBe(OWNER_ID)
    },
  )
})

describe('REQ-008 / API-011 / TEST-024: visibility × viewer matrix (401 cases)', () => {
  it.each([
    ['internal', null],
    ['private', null],
  ] as const)(
    'REQ-008 / TEST-024: %s × guest returns 401 not_authenticated',
    async (visibility, viewer) => {
      const proposals = createInMemoryProposalRepository(makePublishedFixtures())
      const proposalId = PROPOSAL_ID_BY_VISIBILITY[visibility]

      try {
        await getPublished(viewer, proposalId, { proposals })
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_authenticated')
        expect(err.httpStatus).toBe(401)
        expect(err.errorCode).toBe('UNAUTHENTICATED')
      }
    },
  )
})

describe('REQ-008 / API-011 / TEST-024: visibility × viewer matrix (404 cases)', () => {
  it('REQ-008 / TEST-024: private × user(other) returns 404 not_owner_resource', async () => {
    const proposals = createInMemoryProposalRepository(makePublishedFixtures())

    try {
      await getPublished(otherUserViewer, 'pub-private', { proposals })
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_owner_resource')
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    }
  })

  it.each([
    ['reviewer', reviewerViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-008 / Q-016 / TEST-024: private × %s returns 404 insufficient_role',
    async (_label, viewer) => {
      const proposals = createInMemoryProposalRepository(makePublishedFixtures())

      try {
        await getPublished(viewer, 'pub-private', { proposals })
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('insufficient_role')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
    },
  )
})

// ---------------------------------------------------------------------------
// 2. withdrawn は全 viewer × 全 visibility で 404
// ---------------------------------------------------------------------------

describe('REQ-005 / API-011 / TEST-024: withdrawn is 404 for all viewers and all visibilities', () => {
  it.each([
    ['public', 'guest', null],
    ['public', 'user(owner)', ownerViewer],
    ['public', 'user(other)', otherUserViewer],
    ['public', 'reviewer', reviewerViewer],
    ['public', 'admin', adminViewer],
    ['public', 'auditor', auditorViewer],
    ['internal', 'guest', null],
    ['internal', 'admin', adminViewer],
    ['private', 'guest', null],
    ['private', 'user(owner)', ownerViewer],
    ['private', 'admin', adminViewer],
  ] as const)(
    'REQ-005 / TEST-024: withdrawn × %s × %s returns 404 not_owner_resource',
    async (visibility, _viewerLabel, viewer) => {
      const id = `withdrawn-${visibility}`
      const proposals = createInMemoryProposalRepository([
        makeProposal({
          author_id: OWNER_ID,
          status: 'withdrawn',
          visibility,
          id,
        }),
      ])

      try {
        await getPublished(viewer, id, { proposals })
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_owner_resource')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
    },
  )
})

// ---------------------------------------------------------------------------
// 3. 不在 proposalId → 404
// ---------------------------------------------------------------------------

describe('API-011 / TEST-024: missing proposal returns 404', () => {
  it.each([
    ['guest', null],
    ['user', ownerViewer],
    ['admin', adminViewer],
  ] as const)(
    'API-011 / TEST-024: missing proposalId for %s returns 404 not_owner_resource',
    async (_label, viewer) => {
      const proposals = createInMemoryProposalRepository([])

      try {
        await getPublished(viewer, 'does-not-exist', { proposals })
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_owner_resource')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
    },
  )
})

// ---------------------------------------------------------------------------
// 4. 非 published status → 404
// ---------------------------------------------------------------------------

describe('API-011 / TEST-024: non-published statuses return 404', () => {
  it.each([
    'draft',
    'submitted',
    'in_review',
    'approved',
    'returned',
    'rejected',
  ] as const)(
    'API-011 / TEST-024: status=%s × admin × public returns 404 (not exposed via this API)',
    async (status) => {
      const id = `${status}-public`
      const proposals = createInMemoryProposalRepository([
        makeProposal({ author_id: OWNER_ID, status, visibility: 'public', id }),
      ])

      try {
        await getPublished(adminViewer, id, { proposals })
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_owner_resource')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
    },
  )

  it('API-011 / TEST-024: status=draft × owner × private returns 404 (status leak prevented)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: OWNER_ID,
        status: 'draft',
        visibility: 'private',
        id: 'draft-private-owner',
      }),
    ])

    try {
      await getPublished(ownerViewer, 'draft-private-owner', { proposals })
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.httpStatus).toBe(404)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. 副作用: console.* なし、findById は 1 回のみ
// ---------------------------------------------------------------------------

describe('NFR-003 / TEST-024: no side effects', () => {
  it('NFR-003 / TEST-024: success path does not invoke console.*', async () => {
    const proposals = createInMemoryProposalRepository(makePublishedFixtures())

    await getPublished(adminViewer, 'pub-private', { proposals })

    expectNoConsole()
  })

  it('NFR-003 / TEST-024: deny path does not invoke console.*', async () => {
    const proposals = createInMemoryProposalRepository(makePublishedFixtures())

    await expect(getPublished(null, 'pub-private', { proposals })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expectNoConsole()
  })

  it('TEST-024: findById is called exactly once on success', async () => {
    const { repo, findByIdCalls } = makeCountingRepo(makePublishedFixtures())

    await getPublished(ownerViewer, 'pub-public', { proposals: repo })

    expect(findByIdCalls()).toBe(1)
  })

  it('TEST-024: findById is called exactly once on deny (401)', async () => {
    const { repo, findByIdCalls } = makeCountingRepo(makePublishedFixtures())

    await expect(getPublished(null, 'pub-internal', { proposals: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(findByIdCalls()).toBe(1)
  })

  it('TEST-024: findById is called exactly once on missing (404)', async () => {
    const { repo, findByIdCalls } = makeCountingRepo([])

    await expect(
      getPublished(adminViewer, 'does-not-exist', { proposals: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(findByIdCalls()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 6. 防御コピー: 戻り値の mutate が repository 内部に影響しない
// ---------------------------------------------------------------------------

describe('TEST-024: returned object does not leak internal mutable state', () => {
  it('TEST-024: mutating the returned detail does not affect subsequent reads', async () => {
    const proposals = createInMemoryProposalRepository(makePublishedFixtures())

    const first = await getPublished(adminViewer, 'pub-public', { proposals })
    const originalTitle = first.title

    // 戻り値を mutate（readonly 型を握り潰す cast を経由する）。
    ;(first as { title: string }).title = '__mutated__'

    const second = await getPublished(adminViewer, 'pub-public', { proposals })
    expect(second.title).toBe(originalTitle)
    expect(second.title).not.toBe('__mutated__')
  })
})

// ---------------------------------------------------------------------------
// 7. レスポンス shape 整合（API-011 §レスポンス §スキーマ）
// ---------------------------------------------------------------------------

describe('API-011 / TEST-024: response shape matches API-011 schema', () => {
  it('API-011 / TEST-024: detail has full schema fields including body / version', async () => {
    const proposals = createInMemoryProposalRepository(makePublishedFixtures())

    const detail = await getPublished(adminViewer, 'pub-internal', { proposals })

    expect(typeof detail.proposal_id).toBe('string')
    expect(typeof detail.title).toBe('string')
    expect(typeof detail.body).toBe('string')
    expect(['public', 'internal', 'private']).toContain(detail.visibility)
    expect(typeof detail.author_id).toBe('string')
    expect(detail.status).toBe('published')
    expect(typeof detail.published_at).toBe('number')
    expect(typeof detail.updated_at).toBe('number')
    expect(typeof detail.version).toBe('number')
  })

  it('API-011 / TEST-024: published_at is preserved from repository (not zero for published)', async () => {
    const proposals = createInMemoryProposalRepository(makePublishedFixtures())

    const detail = await getPublished(adminViewer, 'pub-public', { proposals })

    // factory が status='published' に対して published_at を設定している
    // （DB-003 §不変条件 5）。0 にフォールバックしないことを確認。
    expect(detail.published_at).toBeGreaterThan(0)
  })
})
