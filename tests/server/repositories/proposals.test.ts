// TEST-009 — ProposalRepository（インメモリ実装 + factory）
// REQ-002 / REQ-004 / REQ-005 / REQ-006 / REQ-007 / REQ-008
// DB-003 / BR-REVIEW-02 / BR-PROPOSAL-01..03 / BR-RESUBMIT-01
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROPOSAL_STATUSES,
  VISIBILITIES,
  type ProposalStatus,
  type Visibility,
} from '../../../src/lib/domain/types'
import {
  createInMemoryProposalRepository,
  makeProposal,
  makeProposalMatrix,
  ProposalAlreadyExistsError,
  ProposalLockError,
  type Proposal,
  type ProposalRepository,
} from '../../../src/server/repositories/proposals'

const AUTHOR = 'user-author-1'
const OTHER_AUTHOR = 'user-author-2'

// ---------------------------------------------------------------------------
// 1. insert
// ---------------------------------------------------------------------------
describe('REQ-002 / TEST-009: insert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-002 / TEST-009: insert auto-generates id when omitted (UUID v7 相当)', async () => {
    const repo = createInMemoryProposalRepository()
    const created = await repo.insert({
      author_id: AUTHOR,
      title: 't',
      body: 'b',
      visibility: 'private',
    })
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('REQ-002 / TEST-009: insert respects explicit id', async () => {
    const repo = createInMemoryProposalRepository()
    const created = await repo.insert({
      id: 'fixed-1',
      author_id: AUTHOR,
      title: 't',
      body: 'b',
      visibility: 'private',
    })
    expect(created.id).toBe('fixed-1')
  })

  it('REQ-002 / TEST-009: insert sets created_at = updated_at = Date.now() and version=0', async () => {
    const repo = createInMemoryProposalRepository()
    const created = await repo.insert({
      author_id: AUTHOR,
      title: 't',
      body: 'b',
      visibility: 'private',
    })
    const expected = new Date('2026-05-05T00:00:00.000Z').getTime()
    expect(created.created_at).toBe(expected)
    expect(created.updated_at).toBe(expected)
    expect(created.version).toBe(0)
  })

  it('REQ-002 / TEST-009: insert defaults status to "draft" and lifecycle timestamps to null', async () => {
    const repo = createInMemoryProposalRepository()
    const created = await repo.insert({
      author_id: AUTHOR,
      title: 't',
      body: 'b',
      visibility: 'public',
    })
    expect(created.status).toBe('draft')
    expect(created.assignee_id).toBeNull()
    expect(created.current_policy_agreement_id).toBeNull()
    expect(created.submitted_at).toBeNull()
    expect(created.approved_at).toBeNull()
    expect(created.published_at).toBeNull()
    expect(created.withdrawn_at).toBeNull()
  })

  it('REQ-002 / TEST-009: insert throws ProposalAlreadyExistsError on duplicate id', async () => {
    const repo = createInMemoryProposalRepository()
    await repo.insert({
      id: 'dup-1',
      author_id: AUTHOR,
      title: 't',
      body: 'b',
      visibility: 'private',
    })
    await expect(
      repo.insert({
        id: 'dup-1',
        author_id: AUTHOR,
        title: 't2',
        body: 'b2',
        visibility: 'private',
      }),
    ).rejects.toBeInstanceOf(ProposalAlreadyExistsError)
  })

  it('REQ-002 / TEST-009: createInMemoryProposalRepository(initial) seeds rows and rejects duplicate seed', () => {
    const seed = makeProposal({ author_id: AUTHOR, status: 'draft', visibility: 'private', id: 's-1' })
    const seedDup = { ...seed }
    expect(() => createInMemoryProposalRepository([seed, seedDup])).toThrow(ProposalAlreadyExistsError)
  })
})

// ---------------------------------------------------------------------------
// 2. findById
// ---------------------------------------------------------------------------
describe('REQ-007 / TEST-009: findById', () => {
  it('REQ-007 / TEST-009: returns a row when id exists', async () => {
    const repo = freshRepoWith([
      makeProposal({ author_id: AUTHOR, id: 'p-1', status: 'draft', visibility: 'private' }),
    ])
    const row = await repo.findById('p-1')
    expect(row?.id).toBe('p-1')
  })

  it('REQ-007 / TEST-009: returns null when id does not exist', async () => {
    const repo = createInMemoryProposalRepository()
    expect(await repo.findById('missing')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. listByAuthor
// ---------------------------------------------------------------------------
describe('REQ-007 / TEST-009: listByAuthor', () => {
  it('REQ-007 / TEST-009: only returns rows whose author_id matches', async () => {
    const repo = freshRepoWith([
      makeProposal({ author_id: AUTHOR, id: 'mine-1', status: 'draft', visibility: 'private' }),
      makeProposal({ author_id: OTHER_AUTHOR, id: 'theirs-1', status: 'draft', visibility: 'private' }),
    ])
    const rows = await repo.listByAuthor(AUTHOR)
    expect(rows.map((r) => r.id)).toEqual(['mine-1'])
  })

  it('REQ-007 / TEST-009: sorts by updated_at DESC (ix_proposals_author_id)', async () => {
    const older: Proposal = makeProposal(
      { author_id: AUTHOR, id: 'old', status: 'draft', visibility: 'private' },
      { updated_at: 100 },
    )
    const newer: Proposal = makeProposal(
      { author_id: AUTHOR, id: 'new', status: 'draft', visibility: 'private' },
      { updated_at: 200 },
    )
    const middle: Proposal = makeProposal(
      { author_id: AUTHOR, id: 'mid', status: 'draft', visibility: 'private' },
      { updated_at: 150 },
    )
    const repo = freshRepoWith([older, newer, middle])
    const rows = await repo.listByAuthor(AUTHOR)
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
  })

  it('REQ-007 / TEST-009: returns empty array when nothing matches', async () => {
    const repo = createInMemoryProposalRepository()
    expect(await repo.listByAuthor(AUTHOR)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. listPublic
// ---------------------------------------------------------------------------
describe('REQ-008 / TEST-009: listPublic', () => {
  it("REQ-008 / TEST-009: only returns rows with status='published'", async () => {
    const matrix = makeProposalMatrix(AUTHOR)
    const repo = freshRepoWith(matrix)
    const rows = await repo.listPublic()
    for (const r of rows) {
      expect(r.status).toBe('published')
    }
    // 8 status × 3 visibility のうち published × 3 のみ
    expect(rows.length).toBe(VISIBILITIES.length)
  })

  it('REQ-008 / TEST-009: visibilities omitted -> all 3 visibilities of published returned', async () => {
    const repo = freshRepoWith(makeProposalMatrix(AUTHOR))
    const rows = await repo.listPublic()
    const visSet = new Set(rows.map((r) => r.visibility))
    expect(visSet).toEqual(new Set<Visibility>(['private', 'internal', 'public']))
  })

  it('REQ-008 / TEST-009: visibilities=[] -> equivalent to omitting (returns all visibilities)', async () => {
    const repo = freshRepoWith(makeProposalMatrix(AUTHOR))
    const rows = await repo.listPublic([])
    expect(rows.length).toBe(VISIBILITIES.length)
  })

  it("REQ-008 / TEST-009: visibilities=['public'] filters to public only", async () => {
    const repo = freshRepoWith(makeProposalMatrix(AUTHOR))
    const rows = await repo.listPublic(['public'])
    expect(rows.length).toBe(1)
    expect(rows[0]?.visibility).toBe('public')
  })

  it("REQ-008 / TEST-009: visibilities=['public','internal'] returns 2 visibilities", async () => {
    const repo = freshRepoWith(makeProposalMatrix(AUTHOR))
    const rows = await repo.listPublic(['public', 'internal'])
    const visSet = new Set(rows.map((r) => r.visibility))
    expect(visSet).toEqual(new Set<Visibility>(['public', 'internal']))
  })

  it('REQ-008 / TEST-009: sorts by published_at DESC (ix_proposals_status_published_at)', async () => {
    const repo = freshRepoWith([
      makeProposal(
        { author_id: AUTHOR, id: 'pub-old', status: 'published', visibility: 'public' },
        { published_at: 100 },
      ),
      makeProposal(
        { author_id: AUTHOR, id: 'pub-new', status: 'published', visibility: 'public' },
        { published_at: 300 },
      ),
      makeProposal(
        { author_id: AUTHOR, id: 'pub-mid', status: 'published', visibility: 'public' },
        { published_at: 200 },
      ),
    ])
    const rows = await repo.listPublic(['public'])
    expect(rows.map((r) => r.id)).toEqual(['pub-new', 'pub-mid', 'pub-old'])
  })
})

// ---------------------------------------------------------------------------
// 5. listForReview
// ---------------------------------------------------------------------------
describe('REQ-004 / TEST-009: listForReview', () => {
  it("REQ-004 / TEST-009: returns rows whose status IN ('submitted','in_review') and excludes others", async () => {
    const repo = freshRepoWith(makeProposalMatrix(AUTHOR))
    const rows = await repo.listForReview()
    const statuses = new Set(rows.map((r) => r.status))
    expect(statuses).toEqual(new Set<ProposalStatus>(['submitted', 'in_review']))
    // excluded statuses do not appear
    for (const r of rows) {
      expect(['draft', 'approved', 'returned', 'rejected', 'published', 'withdrawn']).not.toContain(
        r.status,
      )
    }
  })

  it('REQ-004 / TEST-009: sorts by updated_at DESC', async () => {
    const repo = freshRepoWith([
      makeProposal(
        { author_id: AUTHOR, id: 's-old', status: 'submitted', visibility: 'public' },
        { updated_at: 100 },
      ),
      makeProposal(
        { author_id: AUTHOR, id: 'r-new', status: 'in_review', visibility: 'public' },
        { updated_at: 300, assignee_id: 'reviewer-1' },
      ),
      makeProposal(
        { author_id: AUTHOR, id: 's-mid', status: 'submitted', visibility: 'public' },
        { updated_at: 200 },
      ),
    ])
    const rows = await repo.listForReview()
    expect(rows.map((r) => r.id)).toEqual(['r-new', 's-mid', 's-old'])
  })
})

// ---------------------------------------------------------------------------
// 6. listAll
// ---------------------------------------------------------------------------
describe('REQ-002 / TEST-009: listAll', () => {
  it('REQ-002 / TEST-009: returns every row (admin/test purpose)', async () => {
    const matrix = makeProposalMatrix(AUTHOR)
    const repo = freshRepoWith(matrix)
    const rows = await repo.listAll()
    expect(rows.length).toBe(matrix.length)
  })

  it('REQ-002 / TEST-009: returns [] for empty repository', async () => {
    const repo = createInMemoryProposalRepository()
    expect(await repo.listAll()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. updateWithLock — happy path
// ---------------------------------------------------------------------------
describe('BR-REVIEW-02 / TEST-009: updateWithLock success', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('BR-REVIEW-02 / TEST-009: increments version by 1 and refreshes updated_at', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'draft', visibility: 'private' },
      { version: 3, updated_at: 1 },
    )
    const repo = freshRepoWith([seed])
    const next = await repo.updateWithLock('p-1', 3, { title: 'updated' })
    expect(next.version).toBe(4)
    expect(next.updated_at).toBe(new Date('2026-05-05T12:00:00.000Z').getTime())
  })

  it('BR-REVIEW-02 / TEST-009: applies only fields present in patch (others unchanged)', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'draft', visibility: 'private' },
      { title: 'before', body: 'b1', version: 0 },
    )
    const repo = freshRepoWith([seed])
    const next = await repo.updateWithLock('p-1', 0, { title: 'after' })
    expect(next.title).toBe('after')
    expect(next.body).toBe('b1')
  })

  it('BR-REVIEW-02 / TEST-009: distinguishes undefined (untouched) vs null (explicit clear) for assignee_id', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'in_review', visibility: 'public' },
      { assignee_id: 'reviewer-9', version: 0 },
    )
    const repo = freshRepoWith([seed])
    const untouched = await repo.updateWithLock('p-1', 0, { title: 'x' })
    expect(untouched.assignee_id).toBe('reviewer-9')
    const cleared = await repo.updateWithLock('p-1', 1, { assignee_id: null, status: 'approved' })
    expect(cleared.assignee_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 8. updateWithLock — CAS failure
// ---------------------------------------------------------------------------
describe('BR-REVIEW-02 / TEST-009: updateWithLock CAS failure', () => {
  it('BR-REVIEW-02 / TEST-009: throws ProposalLockError when expectedVersion mismatches actual', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'submitted', visibility: 'public' },
      { version: 2 },
    )
    const repo = freshRepoWith([seed])
    await expect(
      repo.updateWithLock('p-1', 1, { status: 'in_review', assignee_id: 'reviewer-1' }),
    ).rejects.toBeInstanceOf(ProposalLockError)
  })

  it('BR-REVIEW-02 / TEST-009: lock error carries id / expectedVersion / actualVersion', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'submitted', visibility: 'public' },
      { version: 2 },
    )
    const repo = freshRepoWith([seed])
    let caught: ProposalLockError | null = null
    try {
      await repo.updateWithLock('p-1', 1, { title: 'x' })
    } catch (e) {
      caught = e as ProposalLockError
    }
    expect(caught).toBeInstanceOf(ProposalLockError)
    expect(caught?.id).toBe('p-1')
    expect(caught?.expectedVersion).toBe(1)
    expect(caught?.actualVersion).toBe(2)
  })

  it('BR-REVIEW-02 / TEST-009: state is unchanged after CAS failure (no side effects)', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'submitted', visibility: 'public' },
      { version: 2, title: 'untouched' },
    )
    const repo = freshRepoWith([seed])
    await expect(repo.updateWithLock('p-1', 99, { title: 'WILL NOT APPLY' })).rejects.toBeInstanceOf(
      ProposalLockError,
    )
    const after = await repo.findById('p-1')
    expect(after?.title).toBe('untouched')
    expect(after?.version).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 9. updateWithLock — id 不在
// ---------------------------------------------------------------------------
describe('BR-REVIEW-02 / TEST-009: updateWithLock when id is missing', () => {
  it('BR-REVIEW-02 / TEST-009: throws ProposalLockError with actualVersion=null', async () => {
    const repo = createInMemoryProposalRepository()
    let caught: ProposalLockError | null = null
    try {
      await repo.updateWithLock('missing', 0, { title: 'x' })
    } catch (e) {
      caught = e as ProposalLockError
    }
    expect(caught).toBeInstanceOf(ProposalLockError)
    expect(caught?.id).toBe('missing')
    expect(caught?.expectedVersion).toBe(0)
    expect(caught?.actualVersion).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 10. updateWithLock — approved_at / published_at / withdrawn_at
// ---------------------------------------------------------------------------
describe('REQ-004 / REQ-005 / TEST-009: updateWithLock lifecycle timestamps', () => {
  it('REQ-004 / TEST-009: approved_at can be set via updateWithLock', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'in_review', visibility: 'public' },
      { version: 0, assignee_id: 'reviewer-1' },
    )
    const repo = freshRepoWith([seed])
    const next = await repo.updateWithLock('p-1', 0, {
      status: 'approved',
      assignee_id: null,
      approved_at: 1_700_000_999_000,
    })
    expect(next.status).toBe('approved')
    expect(next.approved_at).toBe(1_700_000_999_000)
    expect(next.assignee_id).toBeNull()
  })

  it('REQ-005 / TEST-009: published_at can be set on approved -> published transition', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'approved', visibility: 'public' },
      { version: 0 },
    )
    const repo = freshRepoWith([seed])
    const next = await repo.updateWithLock('p-1', 0, {
      status: 'published',
      published_at: 1_700_001_000_000,
    })
    expect(next.published_at).toBe(1_700_001_000_000)
  })

  it('REQ-005 / TEST-009: withdrawn_at can be set on published -> withdrawn transition', async () => {
    const seed = makeProposal(
      { author_id: AUTHOR, id: 'p-1', status: 'published', visibility: 'public' },
      { version: 0, published_at: 1_700_001_000_000 },
    )
    const repo = freshRepoWith([seed])
    const next = await repo.updateWithLock('p-1', 0, {
      status: 'withdrawn',
      withdrawn_at: 1_700_002_000_000,
    })
    expect(next.published_at).toBe(1_700_001_000_000)
    expect(next.withdrawn_at).toBe(1_700_002_000_000)
  })
})

// ---------------------------------------------------------------------------
// 11. factory makeProposal
// ---------------------------------------------------------------------------
describe('DB-003 / TEST-009: makeProposal factory', () => {
  it('DB-003 / TEST-009: status="draft" produces all-null lifecycle timestamps and null current_policy_agreement_id', () => {
    const p = makeProposal({ author_id: AUTHOR, status: 'draft', visibility: 'private' })
    expect(p.submitted_at).toBeNull()
    expect(p.approved_at).toBeNull()
    expect(p.published_at).toBeNull()
    expect(p.withdrawn_at).toBeNull()
    expect(p.assignee_id).toBeNull()
    expect(p.current_policy_agreement_id).toBeNull()
  })

  it('DB-003 / TEST-009: status="in_review" sets assignee_id and submitted_at, no approved_at', () => {
    const p = makeProposal({ author_id: AUTHOR, status: 'in_review', visibility: 'public' })
    expect(p.assignee_id).toBe('reviewer-1')
    expect(p.submitted_at).not.toBeNull()
    expect(p.approved_at).toBeNull()
    expect(p.current_policy_agreement_id).not.toBeNull()
  })

  it('DB-003 / TEST-009: status="approved" sets approved_at and clears assignee_id (invariant 4)', () => {
    const p = makeProposal({ author_id: AUTHOR, status: 'approved', visibility: 'public' })
    expect(p.approved_at).not.toBeNull()
    expect(p.assignee_id).toBeNull()
    expect(p.published_at).toBeNull()
  })

  it('DB-003 / TEST-009: status="published" sets published_at and keeps approved_at', () => {
    const p = makeProposal({ author_id: AUTHOR, status: 'published', visibility: 'public' })
    expect(p.published_at).not.toBeNull()
    expect(p.approved_at).not.toBeNull()
    expect(p.withdrawn_at).toBeNull()
  })

  it('DB-003 / TEST-009: status="withdrawn" sets withdrawn_at and keeps published_at (REQ-005)', () => {
    const p = makeProposal({ author_id: AUTHOR, status: 'withdrawn', visibility: 'public' })
    expect(p.withdrawn_at).not.toBeNull()
    expect(p.published_at).not.toBeNull()
  })

  it('DB-003 / TEST-009: overrides win over factory defaults', () => {
    const p = makeProposal(
      { author_id: AUTHOR, status: 'draft', visibility: 'private' },
      { title: 'custom-title', version: 7 },
    )
    expect(p.title).toBe('custom-title')
    expect(p.version).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// 12. factory makeProposalMatrix
// ---------------------------------------------------------------------------
describe('DB-003 / TEST-009: makeProposalMatrix factory', () => {
  it('DB-003 / TEST-009: returns 8 statuses × 3 visibilities = 24 rows', () => {
    const rows = makeProposalMatrix(AUTHOR)
    expect(rows.length).toBe(PROPOSAL_STATUSES.length * VISIBILITIES.length)
    expect(rows.length).toBe(24)
  })

  it('DB-003 / TEST-009: covers every (status, visibility) combination exactly once', () => {
    const rows = makeProposalMatrix(AUTHOR)
    const seen = new Set<string>()
    for (const r of rows) {
      seen.add(`${r.status}:${r.visibility}`)
    }
    expect(seen.size).toBe(24)
    for (const status of PROPOSAL_STATUSES) {
      for (const visibility of VISIBILITIES) {
        expect(seen.has(`${status}:${visibility}`)).toBe(true)
      }
    }
  })

  it('DB-003 / TEST-009: every id is unique', () => {
    const rows = makeProposalMatrix(AUTHOR)
    const ids = new Set(rows.map((r) => r.id))
    expect(ids.size).toBe(rows.length)
  })

  it('DB-003 / TEST-009: every row uses the requested authorId', () => {
    const rows = makeProposalMatrix(AUTHOR)
    for (const r of rows) {
      expect(r.author_id).toBe(AUTHOR)
    }
  })
})

// ---------------------------------------------------------------------------
// 13. ProposalLockError shape
// ---------------------------------------------------------------------------
describe('BR-REVIEW-02 / TEST-009: ProposalLockError', () => {
  it('BR-REVIEW-02 / TEST-009: instanceof Error and carries name/id/expected/actual', () => {
    const err = new ProposalLockError('p-1', 1, 2)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ProposalLockError')
    expect(err.id).toBe('p-1')
    expect(err.expectedVersion).toBe(1)
    expect(err.actualVersion).toBe(2)
    expect(err.message).toMatch(/p-1/)
  })

  it('BR-REVIEW-02 / TEST-009: actualVersion=null is allowed (id missing)', () => {
    const err = new ProposalLockError('p-2', 0, null)
    expect(err.actualVersion).toBeNull()
    expect(err.message).toMatch(/not found/)
  })
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function freshRepoWith(rows: ReadonlyArray<Proposal>): ProposalRepository {
  return createInMemoryProposalRepository(rows)
}
