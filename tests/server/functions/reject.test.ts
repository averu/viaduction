// TEST-019 — reject server function
// REQ-003 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-005 / NFR-006 /
// NFR-007 / API-006 / DB-003 / DB-004 / UC-006 / UC-013 / UC-014 /
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
  reject,
  RejectStateError,
  RejectValidationError,
  type RejectDeps,
  type RejectInput,
  type RejectResult,
} from '../../../src/server/functions/reject'
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
const otherReviewerViewer: Viewer = { user_id: 'reviewer-2', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

const PROPOSAL_ID = 'proposal-in-review-internal'
const FROZEN_NOW = new Date('2026-05-05T12:00:00.000Z').getTime()

const VALID_INPUT: RejectInput = {
  reason: '本サービスの取扱範囲外（個人間の民事紛争）のため受理しません',
  expected_version: 1,
}

/**
 * `in_review` 状態の Proposal を作る。
 * makeProposal の `in_review` デフォルトは assignee_id='reviewer-1' / version=0。
 * 楽観ロック検証をしやすくするため version=1 を既定とする。
 */
function makeInReviewProposal(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'in_review', visibility: 'internal' },
    {
      id: PROPOSAL_ID,
      title: 'submitted-title',
      body: 'submitted-body',
      version: 1,
      ...overrides,
    },
  )
}

interface DepsBundle {
  readonly deps: RejectDeps
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

function makeDeps(proposalsInitial: ReadonlyArray<Proposal>): DepsBundle {
  const proposals = createInMemoryProposalRepository(proposalsInitial)
  const audit = createInMemoryAuditLogRepository()
  const deps: RejectDeps = { proposals, audit }
  return { deps, proposals, audit }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-003 / API-006 / TEST-019: reject happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-003 / TEST-019: reviewer rejects in_review proposal → status=rejected, assignee_id=null, approved_at=null, version+1, AuditLog appended', async () => {
    const initial = makeInReviewProposal({ version: 1 })
    const { deps, proposals, audit } = makeDeps([initial])

    const result = await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 戻り値（API-006 §200 OK）
    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('rejected')
    expect(result.version).toBe(initial.version + 1)
    expect(typeof result.audit_log_id).toBe('string')
    expect(result.audit_log_id.length).toBeGreaterThan(0)

    // proposals: status / assignee_id=NULL / approved_at=NULL のまま / version+1、本文不変
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe('rejected')
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.approved_at).toBeNull()
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.body).toBe(initial.body)
    expect(stored?.created_at).toBe(initial.created_at)
    expect(stored?.submitted_at).toBe(initial.submitted_at)
    expect(stored?.published_at).toBeNull()
    expect(stored?.withdrawn_at).toBeNull()

    // AuditLog: 1 件 append、必須フィールド検証
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    const entry = logs[0]
    expect(entry?.id).toBe(result.audit_log_id)
    expect(entry?.action).toBe('reject')
    expect(entry?.actor_id).toBe(reviewerViewer.user_id)
    expect(entry?.actor_role).toBe('reviewer')
    expect(entry?.target_proposal_id).toBe(PROPOSAL_ID)
    expect(entry?.before_status).toBe('in_review')
    expect(entry?.after_status).toBe('rejected')
    expect(entry?.before_visibility).toBeNull()
    expect(entry?.after_visibility).toBeNull()
    expect(entry?.reason).toBe(VALID_INPUT.reason)
    expect(entry?.policy_agreement_id).toBeNull()
  })

  it('REQ-003 / TEST-019: admin rejects in_review proposal → status=rejected, AuditLog actor_role=admin', async () => {
    const initial = makeInReviewProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const result = await reject(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(result.status).toBe('rejected')

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('rejected')
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.approved_at).toBeNull()

    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actor_role).toBe('admin')
  })

  it('API-006 / TEST-019: actor_role joins multiple roles with comma (DB-004 m-02)', async () => {
    const multiRoleViewer: Viewer = {
      user_id: 'reviewer-1',
      roles: ['reviewer', 'admin'],
    }
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await reject(multiRoleViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const logs = await audit.list()
    expect(logs[0]?.actor_role).toBe('reviewer,admin')
  })

  it('BR-REVIEW-01 / TEST-019: reason is trimmed before persisting in AuditLog', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await reject(
      reviewerViewer,
      PROPOSAL_ID,
      { reason: '   取扱範囲外のため却下します   ', expected_version: 1 },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBe('取扱範囲外のため却下します')
  })

  it('API-006 / TEST-019: reviewer (not the original assignee) can reject → B-3 撤回（assignee 一致は要求しない）', async () => {
    // initial の assignee_id=reviewer-1 だが、別の reviewer-2 が reject できる
    const initial = makeInReviewProposal({ assignee_id: reviewerViewer.user_id })
    const { deps, proposals } = makeDeps([initial])

    const result = await reject(otherReviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('rejected')

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.assignee_id).toBeNull()
  })

  it('API-006 / TEST-019: admin can reject in_review private proposal (B-3 撤回 + Q-016 はここでは無関係)', async () => {
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'in_review', visibility: 'private' },
      { id: PROPOSAL_ID, version: 1, assignee_id: adminViewer.user_id },
    )
    const { deps } = makeDeps([initial])

    const result = await reject(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('rejected')
  })

  it('API-006 / TEST-019: reviewer can reject in_review private proposal (review.reject は visibility を参照しない)', async () => {
    // start_review は reviewer + private を 404 にするが (Q-016 暫定)、
    // 一度 in_review に到達した proposal の判定 (approve / return / reject) は
    // authorize の review.reject 分岐で resource を参照しないため、
    // reviewer + private + in_review でも通過する（B-3 撤回 + API-006 §認可）。
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'in_review', visibility: 'private' },
      { id: PROPOSAL_ID, version: 1, assignee_id: adminViewer.user_id },
    )
    const { deps, proposals } = makeDeps([initial])

    const result = await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('rejected')

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.assignee_id).toBeNull()
  })

  it('API-006 / TEST-019: rejected proposal preserves submitted_at (rejected は終端のため再提出されない)', async () => {
    // rejected 状態は終端のため submitted_at の上書きは発生しない。元値が保存され続ける。
    const initial = makeInReviewProposal({ submitted_at: 1_000 })
    const { deps, proposals } = makeDeps([initial])

    await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.submitted_at).toBe(1_000)
  })
})

// ---------------------------------------------------------------------------
// 2. 認可: 401 / 404
// ---------------------------------------------------------------------------

describe('API-006 / NFR-003 / BR-AUTHZ-03 / TEST-019: authorization', () => {
  it('API-006 / TEST-019: guest (viewer === null) → AuthorizationError(401, not_authenticated), no AuditLog', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await reject(null, PROPOSAL_ID, VALID_INPUT, deps)
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
    expect(stored?.status).toBe('in_review')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.assignee_id).toBe(initial.assignee_id)
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-006 / TEST-019: nonexistent proposal id (authenticated reviewer) → 404 not_owner_resource, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await reject(reviewerViewer, 'missing-id', VALID_INPUT, deps)
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

  it('API-006 / TEST-019: nonexistent proposal id (guest) → 401 not_authenticated', async () => {
    const { deps, audit } = makeDeps([])

    await expect(
      reject(null, 'missing-id', VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 401,
      reason: 'not_authenticated',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-006 / TEST-019: user role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      reject(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-006 / TEST-019: auditor role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      reject(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps),
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
//
// 注: TASK-019 完了条件 (L361-363) には reason 必須の項目が明記されていないが、
//     正典である DB-004 §不変条件 2 / API-006 §AuditLog 書き込み では reason 必須。
//     このセクションは設計を正典として「reason 必須」を検証する。
// ---------------------------------------------------------------------------

describe('BR-REVIEW-01 / API-006 / TEST-019: reason validation', () => {
  it('BR-REVIEW-01 / TEST-019: reason empty string → RejectValidationError(field=reason), no AuditLog', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await reject(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: '', expected_version: 1 },
        deps,
      )
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(RejectValidationError)
    if (thrown instanceof RejectValidationError) {
      expect(thrown.field).toBe('reason')
      expect(thrown.httpStatus).toBe(400)
      expect(thrown.errorCode).toBe('VALIDATION_ERROR')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('in_review')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.assignee_id).toBe(initial.assignee_id)
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-REVIEW-01 / TEST-019: reason whitespace-only → RejectValidationError(field=reason), no AuditLog', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      reject(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: '   \t\n   ', expected_version: 1 },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'RejectValidationError',
      field: 'reason',
      httpStatus: 400,
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-REVIEW-01 / TEST-019: reason 4001 chars → RejectValidationError(field=reason), no AuditLog', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    const longReason = 'a'.repeat(4_001)
    await expect(
      reject(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: longReason, expected_version: 1 },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'RejectValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-REVIEW-01 / TEST-019: reason exactly 4000 chars → success', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    const reason = 'a'.repeat(4_000)
    const result = await reject(
      reviewerViewer,
      PROPOSAL_ID,
      { reason, expected_version: 1 },
      deps,
    )
    expect(result.status).toBe('rejected')
    const logs = await audit.list()
    expect(logs[0]?.reason).toBe(reason)
  })

  it('API-006 / TEST-019: reason non-string → RejectValidationError(field=reason)', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = { reason: 123, expected_version: 1 } as unknown as RejectInput

    await expect(
      reject(reviewerViewer, PROPOSAL_ID, bad, deps),
    ).rejects.toMatchObject({
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. expected_version 検証
// ---------------------------------------------------------------------------

describe('API-006 / BR-REVIEW-02 / TEST-019: expected_version validation', () => {
  it('API-006 / TEST-019: expected_version negative → RejectValidationError(field=expected_version)', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      reject(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: -1 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-006 / TEST-019: expected_version non-integer → RejectValidationError(field=expected_version)', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      reject(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: 1.5 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-006 / TEST-019: expected_version not a number → RejectValidationError(field=expected_version)', async () => {
    const initial = makeInReviewProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      reason: 'reason',
      expected_version: 'one',
    } as unknown as RejectInput

    await expect(
      reject(reviewerViewer, PROPOSAL_ID, bad, deps),
    ).rejects.toMatchObject({
      field: 'expected_version',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. status != in_review (DB-003 不変条件 1 / API-006 §422)
// ---------------------------------------------------------------------------

describe('API-006 / DB-003 / TEST-019: state guard (only in_review can be rejected)', () => {
  const NON_IN_REVIEW_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'in_review'> => s !== 'in_review',
  )

  for (const status of NON_IN_REVIEW_STATUSES) {
    it(`DB-003 / TEST-019: status='${status}' → RejectStateError(reason=status_not_in_review), no AuditLog`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'internal' },
        { id: PROPOSAL_ID, version: 1 },
      )
      const { deps, audit, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(RejectStateError)
      if (thrown instanceof RejectStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.reason).toBe('status_not_in_review')
        expect(thrown.currentStatus).toBe(status)
      }

      // 副作用なし: 元 proposal の status / approved_at 不変
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe(status)
      // approved 状態の fixture は approved_at が設定されているため、
      // 「reject が approved_at を上書きしていない」ことを確認する。
      expect(stored?.approved_at).toBe(proposal.approved_at)
      expect(await audit.list()).toHaveLength(0)
    })
  }

  it('DB-003 / TEST-019: rejected は終端 — すでに rejected の proposal を再度 reject できない', async () => {
    // rejected 起点の遷移は存在しないため、status guard で 422 になる。
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'rejected', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 5 },
    )
    const { deps, audit, proposals } = makeDeps([proposal])

    await expect(
      reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'RejectStateError',
      reason: 'status_not_in_review',
      currentStatus: 'rejected',
    })
    expect(await audit.list()).toHaveLength(0)
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('rejected')
    expect(stored?.version).toBe(5) // version も不変
  })
})

// ---------------------------------------------------------------------------
// 6. 楽観ロック失敗 (BR-REVIEW-02)
// ---------------------------------------------------------------------------

describe('API-006 / BR-REVIEW-02 / TEST-019: optimistic lock', () => {
  it('API-006 / TEST-019: expected_version mismatch → ProposalLockError, no AuditLog, no state change', async () => {
    const initial = makeInReviewProposal({ version: 5 })
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await reject(
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
    expect(stored?.status).toBe('in_review')
    expect(stored?.version).toBe(5)
    expect(stored?.assignee_id).toBe(initial.assignee_id)

    // AuditLog 不在
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-006 / TEST-019: simultaneous reject by two reviewers → only first succeeds, second gets RejectStateError (post-transition)', async () => {
    const initial = makeInReviewProposal({ version: 1 })
    const { deps, audit } = makeDeps([initial])

    // reviewer-1 が先に成功
    const first = await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(first.status).toBe('rejected')

    // reviewer-2 が同じ expected_version=1 で呼ぶと、現バージョンは 2 / 状態は rejected
    // のため status guard で 422 に倒れる（CAS ではなく status 検査が先に失敗する経路）。
    await expect(
      reject(otherReviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(RejectStateError)

    // AuditLog: 1 件目のみ append（成功した側のみ）
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actor_id).toBe(reviewerViewer.user_id)
  })

  it('API-006 / TEST-019: stale expected_version on still-in_review proposal → ProposalLockError (409 path)', async () => {
    // proposals の version が 7 まで進んだ状態で、status は in_review のまま
    // （別経路で version だけ進んだ想定）。reviewer が古い version=6 を指定して
    // reject すると CAS 失敗で ProposalLockError → 呼び出し側 wrapper が 409 にマップ。
    const initial = makeInReviewProposal({ version: 7 })
    const { deps, audit } = makeDeps([initial])

    await expect(
      reject(
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
// 7. 書き込み順序 (API-006 §書き込み順序)
// ---------------------------------------------------------------------------

describe('API-006 / TEST-019: write ordering', () => {
  it('API-006 / TEST-019: spy invocation order is findById → updateWithLock → audit.append', async () => {
    const initial = makeInReviewProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const findByIdSpy = vi.spyOn(proposals, 'findById')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)

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

  it('API-006 / TEST-019: updateWithLock receives status=rejected, assignee_id=null, NO approved_at key', async () => {
    const initial = makeInReviewProposal()
    const { deps, proposals } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')

    await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
    const callArgs = updateWithLockSpy.mock.calls[0]
    expect(callArgs).toBeDefined()
    if (callArgs !== undefined) {
      const [id, expectedVersion, patch] = callArgs
      expect(id).toBe(PROPOSAL_ID)
      expect(expectedVersion).toBe(VALID_INPUT.expected_version)
      expect(patch).toMatchObject({
        status: 'rejected',
        assignee_id: null,
      })
      // approved_at は patch に含めない（DB-003 §approved_at「rejected 経路では NULL のまま」）。
      // patch のキー集合に approved_at が含まれないことを確認する。
      expect(Object.prototype.hasOwnProperty.call(patch, 'approved_at')).toBe(false)
    }
  })

  it('API-006 / TEST-019: when validation fails, no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeInReviewProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      reject(
        reviewerViewer,
        PROPOSAL_ID,
        { reason: '', expected_version: 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(RejectValidationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-006 / TEST-019: when authorize fails, no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeInReviewProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      reject(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-006 / TEST-019: when status guard fails, no write paths are called (BR-AUDIT-03)', async () => {
    // submitted は in_review に到達していないため 422
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'submitted', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps, proposals, audit } = makeDeps([proposal])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(RejectStateError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-006 / TEST-019: when optimistic lock fails, AuditLog is NOT appended (BR-AUDIT-03)', async () => {
    const initial = makeInReviewProposal({ version: 5 })
    const { deps, audit } = makeDeps([initial])

    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      reject(
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

describe('NFR-005 / API-006 / TEST-019: no console / logger side effects', () => {
  it('NFR-005 / TEST-019: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makeInReviewProposal()
      const { deps } = makeDeps([initial])
      await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-019: injected logger is never called by reject itself', async () => {
    const initial = makeInReviewProposal()
    const proposals = createInMemoryProposalRepository([initial])
    const audit = createInMemoryAuditLogRepository()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await reject(reviewerViewer, PROPOSAL_ID, VALID_INPUT, {
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

describe('API-006 / TEST-019: result type narrowing', () => {
  it('API-006 / TEST-019: result.status is the literal "rejected" and version is a finite number', async () => {
    const initial = makeInReviewProposal()
    const { deps } = makeDeps([initial])

    const result: RejectResult = await reject(
      reviewerViewer,
      PROPOSAL_ID,
      VALID_INPUT,
      deps,
    )

    // 型レベルチェック: 'rejected' リテラル以外を割り当てると TS2322 が出る。
    const statusLiteral: 'rejected' = result.status
    expect(statusLiteral).toBe('rejected')
    expect(typeof result.version).toBe('number')
    expect(Number.isFinite(result.version)).toBe(true)
    expect(typeof result.audit_log_id).toBe('string')
    expect(result.audit_log_id.length).toBeGreaterThan(0)
  })
})
