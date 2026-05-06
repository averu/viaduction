// TEST-026 — getMyProposal loader (API-013 / REQ-005 / REQ-006 / REQ-007 / UC-009 / UC-010 / DB-003 / DB-004)
//
// 検証観点:
//   1. owner happy path: status ∈ {draft, submitted, in_review, approved, returned, rejected, published} → 200
//   2. status='withdrawn' は owner 含む全 viewer で 404 not_owner_resource（REQ-005 AC）
//   3. 不在 proposalId: viewer null → 401 / 認証済 → 404 not_owner_resource
//   4. guest（viewer === null） + 存在する proposal → 401
//   5. 他人の投稿: user(他人) / reviewer / admin / auditor すべて 404 not_owner_resource
//      （所有者一致がトップ優先、ロール特権は本 API では効かない）
//   6. last_return_reason の併記:
//      - status='returned' で return エントリ 1 件 → reason / returned_at / audit_log_id がコピー
//      - status='returned' で return エントリ複数 → 最新（created_at 最大）が選ばれる
//      - status='returned' だが return が無い（防御的）→ null
//      - status !== 'returned' → null（draft / submitted / in_review / approved / rejected / published）
//   7. 副作用: console.* なし
//   8. AuditLog 読み込みの最適化:
//      - status='returned' のときのみ listByTarget が呼ばれる
//      - それ以外の status では listByTarget は呼ばれない
//
// 参照: docs/20-detail-design/apis/API-013.md（§認可 §レスポンス §last_return_reason）、
//       docs/02-requirements/02-functional-requirements.md REQ-005 / REQ-006 / REQ-007、
//       src/server/auth/authorize.ts (action='get.myProposal')、
//       src/server/audit/repository.ts (AuditLogRepository.listByTarget / makeAuditLog)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInMemoryAuditLogRepository,
  makeAuditLog,
  type AuditLog,
  type AuditLogRepository,
} from '#/server/audit/repository'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import { getMyProposal } from '#/server/loaders/get-my-proposal'
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

const NON_RETURNED_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'published',
] as const

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
 * listByTarget の呼び出し回数を観測するための薄いラッパ。
 * 内部は createInMemoryAuditLogRepository に委譲する。
 */
function makeCountingAuditRepo(initial: ReadonlyArray<AuditLog>): {
  repo: AuditLogRepository
  listByTargetCalls: () => number
} {
  const inner = createInMemoryAuditLogRepository(initial)
  let count = 0
  const repo: AuditLogRepository = {
    append: inner.append.bind(inner),
    findById: inner.findById.bind(inner),
    list: inner.list.bind(inner),
    async listByTarget(targetProposalId) {
      count += 1
      return inner.listByTarget(targetProposalId)
    },
  }
  return { repo, listByTargetCalls: () => count }
}

// ---------------------------------------------------------------------------
// 1. owner happy path（全 7 status: withdrawn 以外）
// ---------------------------------------------------------------------------

describe('REQ-007 / API-013 / TEST-026: owner happy path returns 200 for 7 statuses', () => {
  it.each([
    'draft',
    'submitted',
    'in_review',
    'approved',
    'returned',
    'rejected',
    'published',
  ] as const)(
    'REQ-007 / TEST-026: status=%s × owner returns 200 with full body',
    async (status) => {
      const id = `owner-${status}`
      const proposal = makeProposal({
        author_id: OWNER_ID,
        status,
        visibility: 'private',
        id,
      })
      const proposals = createInMemoryProposalRepository([proposal])

      // status='returned' のときだけ整合する return エントリを 1 件入れておく。
      const auditEntries: AuditLog[] =
        status === 'returned'
          ? [
              makeAuditLog({
                actor_id: REVIEWER_ID,
                target_proposal_id: id,
                action: 'return',
              }),
            ]
          : []
      const audit = createInMemoryAuditLogRepository(auditEntries)

      const result = await getMyProposal(ownerViewer, id, { proposals, audit })

      expect(result.proposal_id).toBe(id)
      expect(result.author_id).toBe(OWNER_ID)
      expect(result.status).toBe(status)
      expect(typeof result.body).toBe('string')
      expect(result.body.length).toBeGreaterThan(0)
      // last_return_reason は returned のときのみ非 null
      if (status === 'returned') {
        expect(result.last_return_reason).not.toBeNull()
      } else {
        expect(result.last_return_reason).toBeNull()
      }
    },
  )
})

// ---------------------------------------------------------------------------
// 2. withdrawn は owner 含む全 viewer で 404
// ---------------------------------------------------------------------------

describe('REQ-005 / API-013 / TEST-026: withdrawn returns 404 for owner and others', () => {
  it.each([
    ['owner', ownerViewer],
    ['user(other)', otherUserViewer],
    ['reviewer', reviewerViewer],
    ['admin', adminViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-005 / TEST-026: withdrawn × %s returns 404 not_owner_resource',
    async (_label, viewer) => {
      const id = 'withdrawn-private'
      const proposals = createInMemoryProposalRepository([
        makeProposal({
          author_id: OWNER_ID,
          status: 'withdrawn',
          visibility: 'private',
          id,
        }),
      ])
      const audit = createInMemoryAuditLogRepository([])

      try {
        await getMyProposal(viewer, id, { proposals, audit })
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

  it('REQ-005 / TEST-026: withdrawn × guest returns 401 not_authenticated', async () => {
    const id = 'withdrawn-guest'
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: OWNER_ID,
        status: 'withdrawn',
        visibility: 'private',
        id,
      }),
    ])
    const audit = createInMemoryAuditLogRepository([])

    try {
      await getMyProposal(null, id, { proposals, audit })
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
      expect(err.errorCode).toBe('UNAUTHENTICATED')
    }
  })
})

// ---------------------------------------------------------------------------
// 3. 不在 proposalId
// ---------------------------------------------------------------------------

describe('API-013 / TEST-026: missing proposalId', () => {
  it('API-013 / TEST-026: missing × authenticated owner returns 404', async () => {
    const proposals = createInMemoryProposalRepository([])
    const audit = createInMemoryAuditLogRepository([])

    try {
      await getMyProposal(ownerViewer, 'does-not-exist', { proposals, audit })
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_owner_resource')
      expect(err.httpStatus).toBe(404)
    }
  })

  it('API-013 / TEST-026: missing × guest returns 401', async () => {
    const proposals = createInMemoryProposalRepository([])
    const audit = createInMemoryAuditLogRepository([])

    try {
      await getMyProposal(null, 'does-not-exist', { proposals, audit })
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. guest（cookie なし） × 存在する proposal → 401
// ---------------------------------------------------------------------------

describe('API-013 / TEST-026: guest is rejected as 401', () => {
  it('API-013 / TEST-026: guest × existing draft returns 401 not_authenticated', async () => {
    const id = 'owner-draft-guest-test'
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: OWNER_ID,
        status: 'draft',
        visibility: 'private',
        id,
      }),
    ])
    const audit = createInMemoryAuditLogRepository([])

    try {
      await getMyProposal(null, id, { proposals, audit })
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
      expect(err.errorCode).toBe('UNAUTHENTICATED')
    }
  })
})

// ---------------------------------------------------------------------------
// 5. 他人の投稿: user(他人) / reviewer / admin / auditor すべて 404
// ---------------------------------------------------------------------------

describe('REQ-006 / API-013 / TEST-026: other-author proposals are 404 for everyone', () => {
  it.each([
    ['user(other)', otherUserViewer],
    ['reviewer', reviewerViewer],
    ['admin', adminViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-006 / TEST-026: other-author × %s returns 404 not_owner_resource',
    async (_label, viewer) => {
      const id = 'owners-private-draft'
      const proposals = createInMemoryProposalRepository([
        makeProposal({
          author_id: OWNER_ID,
          status: 'draft',
          visibility: 'private',
          id,
        }),
      ])
      const audit = createInMemoryAuditLogRepository([])

      try {
        await getMyProposal(viewer, id, { proposals, audit })
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
// 6. last_return_reason の併記
// ---------------------------------------------------------------------------

describe('API-013 / TEST-026: last_return_reason is set only for status=returned', () => {
  it('API-013 / TEST-026: returned + 1 return entry → reason copied verbatim', async () => {
    const id = 'returned-single'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'returned', visibility: 'private', id }),
    ])
    const returnEntry = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      {
        id: 'audit-return-only',
        reason: '本文に個人名が含まれている可能性があるため、該当箇所の修正をお願いします',
        created_at: 1_700_000_005_000,
      },
    )
    const audit = createInMemoryAuditLogRepository([returnEntry])

    const result = await getMyProposal(ownerViewer, id, { proposals, audit })

    expect(result.last_return_reason).not.toBeNull()
    const lrr = result.last_return_reason as NonNullable<typeof result.last_return_reason>
    expect(lrr.reason).toBe(
      '本文に個人名が含まれている可能性があるため、該当箇所の修正をお願いします',
    )
    expect(lrr.returned_at).toBe(1_700_000_005_000)
    expect(lrr.audit_log_id).toBe('audit-return-only')
  })

  it('API-013 / TEST-026: returned + multiple return entries → latest by created_at wins', async () => {
    const id = 'returned-multi'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'returned', visibility: 'private', id }),
    ])
    // 3 件の return を意図的に created_at 順序で混ぜて投入する。
    // listByTarget は created_at ASC で返すため、loader は filter+末尾で latest を選ぶはず。
    const older = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'audit-return-older', reason: 'oldest reason', created_at: 1_700_000_001_000 },
    )
    const middle = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'audit-return-middle', reason: 'middle reason', created_at: 1_700_000_010_000 },
    )
    const latest = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'audit-return-latest', reason: 'latest reason', created_at: 1_700_000_020_000 },
    )
    // 投入順は ASC でないことに意味がある（loader 側が created_at で正しく選ぶことを検証）。
    const audit = createInMemoryAuditLogRepository([older, latest, middle])

    const result = await getMyProposal(ownerViewer, id, { proposals, audit })

    expect(result.last_return_reason).not.toBeNull()
    const lrr = result.last_return_reason as NonNullable<typeof result.last_return_reason>
    expect(lrr.reason).toBe('latest reason')
    expect(lrr.returned_at).toBe(1_700_000_020_000)
    expect(lrr.audit_log_id).toBe('audit-return-latest')
  })

  it('API-013 / TEST-026: returned but no return entry (defensive) → last_return_reason is null', async () => {
    const id = 'returned-no-audit'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'returned', visibility: 'private', id }),
    ])
    // 別 action（submit / start_review）はあるが return は無い、という不整合状態を防御的に検証。
    const submitEntry = makeAuditLog(
      { actor_id: OWNER_ID, target_proposal_id: id, action: 'submit' },
      { id: 'audit-submit-1' },
    )
    const startReview = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'start_review' },
      { id: 'audit-start-1' },
    )
    const audit = createInMemoryAuditLogRepository([submitEntry, startReview])

    const result = await getMyProposal(ownerViewer, id, { proposals, audit })

    expect(result.last_return_reason).toBeNull()
  })

  it.each(NON_RETURNED_STATUSES)(
    'API-013 / TEST-026: status=%s → last_return_reason is null even if return entries exist for the proposal',
    async (status) => {
      const id = `nonreturned-${status}`
      const proposals = createInMemoryProposalRepository([
        makeProposal({ author_id: OWNER_ID, status, visibility: 'private', id }),
      ])
      // 過去に return された履歴があっても、現 status が returned でなければ併記しない。
      const pastReturn = makeAuditLog(
        { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
        { id: `audit-return-past-${status}`, reason: 'past return reason' },
      )
      const audit = createInMemoryAuditLogRepository([pastReturn])

      const result = await getMyProposal(ownerViewer, id, { proposals, audit })

      expect(result.last_return_reason).toBeNull()
    },
  )
})

// ---------------------------------------------------------------------------
// 7. 副作用: console.* なし
// ---------------------------------------------------------------------------

describe('NFR-003 / TEST-026: no console side effects', () => {
  it('NFR-003 / TEST-026: success path does not invoke console.*', async () => {
    const id = 'noop-draft'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'draft', visibility: 'private', id }),
    ])
    const audit = createInMemoryAuditLogRepository([])

    await getMyProposal(ownerViewer, id, { proposals, audit })

    expectNoConsole()
  })

  it('NFR-003 / TEST-026: deny path (other-user) does not invoke console.*', async () => {
    const id = 'noop-deny-draft'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'draft', visibility: 'private', id }),
    ])
    const audit = createInMemoryAuditLogRepository([])

    await expect(
      getMyProposal(otherUserViewer, id, { proposals, audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expectNoConsole()
  })

  it('NFR-003 / TEST-026: returned + audit read does not invoke console.*', async () => {
    const id = 'noop-returned'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'returned', visibility: 'private', id }),
    ])
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
        { id: 'audit-return-noop' },
      ),
    ])

    await getMyProposal(ownerViewer, id, { proposals, audit })

    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 8. AuditLog 読み込みの最適化: status='returned' のときのみ listByTarget が呼ばれる
// ---------------------------------------------------------------------------

describe('TEST-026: listByTarget is invoked only when status=returned', () => {
  it('TEST-026: status=returned → listByTarget is called exactly once', async () => {
    const id = 'opt-returned'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'returned', visibility: 'private', id }),
    ])
    const { repo, listByTargetCalls } = makeCountingAuditRepo([
      makeAuditLog(
        { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
        { id: 'audit-return-opt' },
      ),
    ])

    await getMyProposal(ownerViewer, id, { proposals, audit: repo })

    expect(listByTargetCalls()).toBe(1)
  })

  it.each(NON_RETURNED_STATUSES)(
    'TEST-026: status=%s → listByTarget is not called',
    async (status) => {
      const id = `opt-${status}`
      const proposals = createInMemoryProposalRepository([
        makeProposal({ author_id: OWNER_ID, status, visibility: 'private', id }),
      ])
      const { repo, listByTargetCalls } = makeCountingAuditRepo([])

      await getMyProposal(ownerViewer, id, { proposals, audit: repo })

      expect(listByTargetCalls()).toBe(0)
    },
  )

  it('TEST-026: deny path does not call listByTarget', async () => {
    const id = 'opt-deny-returned'
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: OWNER_ID, status: 'returned', visibility: 'private', id }),
    ])
    const { repo, listByTargetCalls } = makeCountingAuditRepo([
      makeAuditLog(
        { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
        { id: 'audit-return-deny' },
      ),
    ])

    await expect(
      getMyProposal(otherUserViewer, id, { proposals, audit: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(listByTargetCalls()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 9. レスポンス shape の整合（API-013 §レスポンス §スキーマ）
// ---------------------------------------------------------------------------

describe('API-013 / TEST-026: response shape matches API-013 schema', () => {
  it('API-013 / TEST-026: returned proposal exposes full schema fields', async () => {
    const id = 'shape-returned'
    const proposal: Proposal = makeProposal({
      author_id: OWNER_ID,
      status: 'returned',
      visibility: 'internal',
      id,
    })
    const proposals: ProposalRepository = createInMemoryProposalRepository([proposal])
    const audit: AuditLogRepository = createInMemoryAuditLogRepository([
      makeAuditLog(
        { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
        { id: 'audit-shape-return' },
      ),
    ])

    const detail = await getMyProposal(ownerViewer, id, { proposals, audit })

    expect(typeof detail.proposal_id).toBe('string')
    expect(typeof detail.title).toBe('string')
    expect(typeof detail.body).toBe('string')
    expect(['public', 'internal', 'private']).toContain(detail.visibility)
    expect(detail.status).toBe('returned')
    expect(typeof detail.author_id).toBe('string')
    expect(typeof detail.created_at).toBe('number')
    expect(typeof detail.updated_at).toBe('number')
    expect(typeof detail.version).toBe('number')
    expect(detail.author_id).toBe(OWNER_ID)
    // returned のため submitted_at は NOT NULL（DB-003 §不変条件と factory 定義）
    expect(detail.submitted_at).not.toBeNull()
    // returned のため approved_at / published_at / withdrawn_at は null
    expect(detail.approved_at).toBeNull()
    expect(detail.published_at).toBeNull()
    expect(detail.withdrawn_at).toBeNull()
    // current_policy_agreement_id は draft 以外で NOT NULL（factory）
    expect(detail.current_policy_agreement_id).not.toBeNull()
    // last_return_reason は object 形式
    expect(detail.last_return_reason).not.toBeNull()
  })
})
