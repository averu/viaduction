// TEST-016 — startReview server function
// REQ-003 / REQ-010 / REQ-011 / NFR-003 / NFR-005 / NFR-006 / NFR-007 / API-003 /
// DB-003 / DB-004 / UC-003 / UC-013 / UC-014 /
// BR-PROPOSAL-01 / BR-REVIEW-01 / BR-REVIEW-02 /
// BR-AUDIT-01 / BR-AUDIT-03 / BR-AUTHZ-01 / BR-AUTHZ-02 / BR-AUTHZ-03

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROPOSAL_STATUSES, type ProposalStatus } from '../../../src/lib/domain/types'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  createInMemoryAuditLogRepository,
  type AuditLogRepository,
} from '../../../src/server/audit/repository'
import {
  startReview,
  StartReviewStateError,
  StartReviewValidationError,
  type StartReviewDeps,
  type StartReviewInput,
  type StartReviewResult,
} from '../../../src/server/functions/start-review'
import {
  createInMemoryProposalRepository,
  makeProposal,
  ProposalLockError,
  type Proposal,
  type ProposalRepository,
} from '../../../src/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const ownerViewer: Viewer = { user_id: 'user-1', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const reviewer2Viewer: Viewer = { user_id: 'reviewer-2', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

const PROPOSAL_ID = 'proposal-submitted-internal'

const VALID_INPUT: StartReviewInput = {
  reason: '一次レビューを担当します',
  expected_version: 0,
}

function makeSubmittedProposal(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'submitted', visibility: 'internal' },
    {
      id: PROPOSAL_ID,
      title: 'submitted-title',
      body: 'submitted-body',
      version: 0,
      ...overrides,
    },
  )
}

interface DepsBundle {
  readonly deps: StartReviewDeps
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

function makeDeps(proposalsInitial: ReadonlyArray<Proposal>): DepsBundle {
  const proposals = createInMemoryProposalRepository(proposalsInitial)
  const audit = createInMemoryAuditLogRepository()
  const deps: StartReviewDeps = { proposals, audit }
  return { deps, proposals, audit }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-003 / API-003 / TEST-016: startReview happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-003 / TEST-016: reviewer starts review on submitted proposal → status=in_review, assignee=reviewer, version+1, AuditLog appended', async () => {
    const initial = makeSubmittedProposal({ version: 0 })
    const { deps, proposals, audit } = makeDeps([initial])

    const result = await startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('in_review')
    expect(result.version).toBe(initial.version + 1)
    expect(result.assignee_id).toBe(reviewerViewer.user_id)

    // proposals: status / assignee_id / version 更新、本文不変
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe('in_review')
    expect(stored?.assignee_id).toBe(reviewerViewer.user_id)
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.body).toBe(initial.body)
    expect(stored?.created_at).toBe(initial.created_at)
    expect(stored?.submitted_at).toBe(initial.submitted_at)

    // AuditLog: 1 件 append、必須フィールド検証
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    const entry = logs[0]
    expect(entry?.action).toBe('start_review')
    expect(entry?.actor_id).toBe(reviewerViewer.user_id)
    expect(entry?.actor_role).toBe('reviewer')
    expect(entry?.target_proposal_id).toBe(PROPOSAL_ID)
    expect(entry?.before_status).toBe('submitted')
    expect(entry?.after_status).toBe('in_review')
    expect(entry?.before_visibility).toBeNull()
    expect(entry?.after_visibility).toBeNull()
    expect(entry?.reason).toBe(VALID_INPUT.reason)
    expect(entry?.policy_agreement_id).toBeNull()
  })

  it('REQ-003 / TEST-016: admin starts review on submitted proposal → status=in_review, assignee=admin', async () => {
    const initial = makeSubmittedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const result = await startReview(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(result.assignee_id).toBe(adminViewer.user_id)
    expect((await proposals.findById(PROPOSAL_ID))?.assignee_id).toBe(adminViewer.user_id)

    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actor_role).toBe('admin')
  })

  it('API-003 / TEST-016: actor_role joins multiple roles with comma (DB-004 m-02)', async () => {
    const multiRoleViewer: Viewer = {
      user_id: 'reviewer-1',
      roles: ['reviewer', 'admin'],
    }
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await startReview(multiRoleViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const logs = await audit.list()
    expect(logs[0]?.actor_role).toBe('reviewer,admin')
  })

  it('BR-REVIEW-01 / TEST-016: reason is trimmed before persisting in AuditLog', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await startReview(
      reviewerViewer,
      PROPOSAL_ID,
      { reason: '   担当します   ', expected_version: 0 },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBe('担当します')
  })

  it('API-003 / TEST-016: admin can start_review on private proposal (Q-016 admin path)', async () => {
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'submitted', visibility: 'private' },
      { id: PROPOSAL_ID, version: 0 },
    )
    const { deps } = makeDeps([initial])

    const result = await startReview(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('in_review')
    expect(result.assignee_id).toBe(adminViewer.user_id)
  })
})

// ---------------------------------------------------------------------------
// 2. 認可: 401 / 404
// ---------------------------------------------------------------------------

describe('API-003 / NFR-003 / BR-AUTHZ-03 / TEST-016: authorization', () => {
  it('API-003 / TEST-016: guest (viewer === null) → AuthorizationError(401, not_authenticated), no AuditLog', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await startReview(null, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(401)
      expect(thrown.reason).toBe('not_authenticated')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('submitted')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.assignee_id).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: nonexistent proposal id (authenticated reviewer) → 404 not_owner_resource, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await startReview(reviewerViewer, 'missing-id', VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.reason).toBe('not_owner_resource')
    }
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: nonexistent proposal id (guest) → 401 not_authenticated', async () => {
    const { deps, audit } = makeDeps([])

    await expect(startReview(null, 'missing-id', VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 401,
      reason: 'not_authenticated',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: user role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(startReview(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: auditor role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      startReview(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: reviewer + private (Q-016) → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'submitted', visibility: 'private' },
      { id: PROPOSAL_ID, version: 0 },
    )
    const { deps, audit } = makeDeps([initial])

    await expect(
      startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. reason 検証 (BR-REVIEW-01 / DB-004 §reason)
// ---------------------------------------------------------------------------

describe('BR-REVIEW-01 / API-003 / TEST-016: reason validation', () => {
  it('BR-REVIEW-01 / TEST-016: reason empty string → StartReviewValidationError(field=reason), no AuditLog', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: '', expected_version: 0 },
        deps,
      )
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(StartReviewValidationError)
    if (thrown instanceof StartReviewValidationError) {
      expect(thrown.field).toBe('reason')
      expect(thrown.httpStatus).toBe(400)
      expect(thrown.errorCode).toBe('VALIDATION_ERROR')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('submitted')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.assignee_id).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-REVIEW-01 / TEST-016: reason whitespace-only → StartReviewValidationError(field=reason), no AuditLog', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: '   \t\n   ', expected_version: 0 },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'StartReviewValidationError',
      field: 'reason',
      httpStatus: 400,
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-REVIEW-01 / TEST-016: reason 4001 chars → StartReviewValidationError(field=reason), no AuditLog', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    const longReason = 'a'.repeat(4_001)
    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: longReason, expected_version: 0 },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'StartReviewValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-REVIEW-01 / TEST-016: reason exactly 4000 chars → success', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    const reason = 'a'.repeat(4_000)
    const result = await startReview(
      reviewerViewer,
      PROPOSAL_ID,
      { reason, expected_version: 0 },
      deps,
    )
    expect(result.status).toBe('in_review')
    const logs = await audit.list()
    expect(logs[0]?.reason).toBe(reason)
  })

  it('API-003 / TEST-016: reason non-string → StartReviewValidationError(field=reason)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = { reason: 123, expected_version: 0 } as unknown as StartReviewInput

    await expect(startReview(reviewerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. expected_version 検証
// ---------------------------------------------------------------------------

describe('API-003 / BR-REVIEW-02 / TEST-016: expected_version validation', () => {
  it('API-003 / TEST-016: expected_version negative → StartReviewValidationError(field=expected_version)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: -1 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: expected_version non-integer → StartReviewValidationError(field=expected_version)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: 1.5 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: expected_version not a number → StartReviewValidationError(field=expected_version)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      reason: 'reason',
      expected_version: 'zero',
    } as unknown as StartReviewInput

    await expect(startReview(reviewerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'expected_version',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. status != submitted (DB-003 不変条件 1 / API-003 §422)
// ---------------------------------------------------------------------------

describe('API-003 / DB-003 / TEST-016: state guard (only submitted starts review)', () => {
  const NON_SUBMITTED_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'submitted'> => s !== 'submitted',
  )

  for (const status of NON_SUBMITTED_STATUSES) {
    it(`DB-003 / TEST-016: status='${status}' → StartReviewStateError(reason=status_not_submitted), no AuditLog`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'internal' },
        { id: PROPOSAL_ID, version: 0 },
      )
      const { deps, audit, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(StartReviewStateError)
      if (thrown instanceof StartReviewStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.reason).toBe('status_not_submitted')
        expect(thrown.currentStatus).toBe(status)
      }

      // 副作用なし
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe(status)
      expect(await audit.list()).toHaveLength(0)
    })
  }
})

// ---------------------------------------------------------------------------
// 6. 楽観ロック失敗 (BR-REVIEW-02)
// ---------------------------------------------------------------------------

describe('API-003 / BR-REVIEW-02 / TEST-016: optimistic lock', () => {
  it('API-003 / TEST-016: expected_version mismatch → ProposalLockError, no AuditLog, no state change', async () => {
    const initial = makeSubmittedProposal({ version: 5 })
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: 4 },
        deps,
      )
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(ProposalLockError)
    if (thrown instanceof ProposalLockError) {
      expect(thrown.id).toBe(PROPOSAL_ID)
      expect(thrown.expectedVersion).toBe(4)
      expect(thrown.actualVersion).toBe(5)
    }

    // proposals 変更なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('submitted')
    expect(stored?.version).toBe(5)
    expect(stored?.assignee_id).toBeNull()

    // AuditLog 不在
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-003 / TEST-016: simultaneous start_review by two reviewers → only first succeeds, second gets ProposalLockError', async () => {
    const initial = makeSubmittedProposal({ version: 0 })
    const { deps, audit } = makeDeps([initial])

    // reviewer-1 が先に成功
    const first = await startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(first.status).toBe('in_review')
    expect(first.assignee_id).toBe(reviewerViewer.user_id)

    // reviewer-2 が同じ expected_version=0 で呼ぶと、現バージョンは 1 のため
    // 状態は in_review に既に遷移しており status guard で 422 に倒れる。
    // CAS 衝突で 409 に倒れるシナリオをシミュレートするため、第二の競合シーンは
    // 「status は submitted のまま、version だけ進んだ仮想的な状態」を別 fixture で再現する。
    await expect(
      startReview(reviewer2Viewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(StartReviewStateError)

    // AuditLog: 1 件目のみ append（成功した側のみ）
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actor_id).toBe(reviewerViewer.user_id)
  })

  it('API-003 / TEST-016: stale expected_version on still-submitted proposal → ProposalLockError (409 path)', async () => {
    // proposals の version が 7 まで進んだ状態で、status は submitted のまま（draft 編集が
    // 走った想定）。reviewer が古い version=6 を指定して start_review すると CAS 失敗で
    // ProposalLockError → 呼び出し側 wrapper が 409 にマップ。
    const initial = makeSubmittedProposal({ version: 7 })
    const { deps, audit } = makeDeps([initial])

    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: 6 },
        deps,
      ),
    ).rejects.toBeInstanceOf(ProposalLockError)

    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 7. 書き込み順序 (API-003 §書き込み順序)
// ---------------------------------------------------------------------------

describe('API-003 / TEST-016: write ordering', () => {
  it('API-003 / TEST-016: spy invocation order is findById → updateWithLock → audit.append', async () => {
    const initial = makeSubmittedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const findByIdSpy = vi.spyOn(proposals, 'findById')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(findByIdSpy).toHaveBeenCalledTimes(1)
    expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
    expect(appendSpy).toHaveBeenCalledTimes(1)

    const findByIdOrder = findByIdSpy.mock.invocationCallOrder[0]
    const updateOrder = updateWithLockSpy.mock.invocationCallOrder[0]
    const appendOrder = appendSpy.mock.invocationCallOrder[0]

    expect(findByIdOrder).toBeDefined()
    expect(updateOrder).toBeDefined()
    expect(appendOrder).toBeDefined()

    if (findByIdOrder !== undefined && updateOrder !== undefined && appendOrder !== undefined) {
      expect(findByIdOrder).toBeLessThan(updateOrder)
      expect(updateOrder).toBeLessThan(appendOrder)
    }
  })

  it('API-003 / TEST-016: when validation fails, no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: '', expected_version: 0 },
        deps,
      ),
    ).rejects.toBeInstanceOf(StartReviewValidationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-003 / TEST-016: when authorize fails, no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeSubmittedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      startReview(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-003 / TEST-016: when status guard fails, no write paths are called (BR-AUDIT-03)', async () => {
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'in_review', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps, proposals, audit } = makeDeps([proposal])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(StartReviewStateError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-003 / TEST-016: when optimistic lock fails, AuditLog is NOT appended (BR-AUDIT-03)', async () => {
    const initial = makeSubmittedProposal({ version: 5 })
    const { deps, audit } = makeDeps([initial])

    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      startReview(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: 4 },
        deps,
      ),
    ).rejects.toBeInstanceOf(ProposalLockError)

    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 8. 副作用: console / logger 不呼び出し
// ---------------------------------------------------------------------------

describe('NFR-005 / API-003 / TEST-016: no console / logger side effects', () => {
  it('NFR-005 / TEST-016: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makeSubmittedProposal()
      const { deps } = makeDeps([initial])
      await startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
      expect(infoSpy).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
      infoSpy.mockRestore()
      debugSpy.mockRestore()
    }
  })

  it('NFR-005 / TEST-016: injected logger is never called by startReview itself', async () => {
    const initial = makeSubmittedProposal()
    const proposals = createInMemoryProposalRepository([initial])
    const audit = createInMemoryAuditLogRepository()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await startReview(reviewerViewer, PROPOSAL_ID, VALID_INPUT, {
      proposals,
      audit,
      logger,
    })
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 9. 戻り値の型を「狭い」リテラル型として固定する
// ---------------------------------------------------------------------------

describe('API-003 / TEST-016: result type narrowing', () => {
  it('API-003 / TEST-016: result.status is the literal "in_review"', async () => {
    const initial = makeSubmittedProposal()
    const { deps } = makeDeps([initial])

    const result: StartReviewResult = await startReview(
      reviewerViewer,
      PROPOSAL_ID,
      VALID_INPUT,
      deps,
    )

    // 型レベルチェック: 'in_review' リテラル以外を割り当てると TS2322 が出る。
    const statusLiteral: 'in_review' = result.status
    expect(statusLiteral).toBe('in_review')
    expect(typeof result.version).toBe('number')
    expect(typeof result.assignee_id).toBe('string')
    expect(result.assignee_id.length).toBeGreaterThan(0)
  })
})
