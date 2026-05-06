// TEST-020 — publish server function
// REQ-004 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-005 / NFR-006 / NFR-007 /
// API-007 / DB-003 / DB-004 / UC-007 / UC-013 / UC-014 /
// BR-PROPOSAL-01 / BR-PUBLISH-01 /
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
  publish,
  PublishStateError,
  PublishValidationError,
  type PublishDeps,
  type PublishInput,
  type PublishResult,
} from '../../../src/server/functions/publish'
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
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const otherAdminViewer: Viewer = { user_id: 'admin-2', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

const PROPOSAL_ID = 'proposal-approved-internal'
const FROZEN_NOW = new Date('2026-05-05T12:00:00.000Z').getTime()

const VALID_INPUT: PublishInput = {
  reason: '市民意見として広報誌掲載予定',
  expected_version: 1,
}

/**
 * `approved` 状態の Proposal を作る。
 * makeProposal の `approved` デフォルトは assignee_id=null / approved_at=base+200 / version=0。
 * 楽観ロック検証をしやすくするため version=1 を既定とする。
 */
function makeApprovedProposal(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'approved', visibility: 'internal' },
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
  readonly deps: PublishDeps
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

function makeDeps(proposalsInitial: ReadonlyArray<Proposal>): DepsBundle {
  const proposals = createInMemoryProposalRepository(proposalsInitial)
  const audit = createInMemoryAuditLogRepository()
  const deps: PublishDeps = { proposals, audit }
  return { deps, proposals, audit }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-004 / API-007 / TEST-020: publish happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-004 / TEST-020: admin publishes approved proposal → status=published, published_at=now, version+1, AuditLog appended', async () => {
    const initial = makeApprovedProposal({ version: 1 })
    const { deps, proposals, audit } = makeDeps([initial])

    const result = await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 戻り値（API-007 §200 OK）
    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('published')
    expect(result.version).toBe(initial.version + 1)
    expect(result.published_at).toBe(FROZEN_NOW)
    expect(typeof result.audit_log_id).toBe('string')
    expect(result.audit_log_id.length).toBeGreaterThan(0)

    // proposals: status / published_at=now / version+1、本文不変、approved_at は維持
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe('published')
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.published_at).toBe(FROZEN_NOW)
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.body).toBe(initial.body)
    expect(stored?.created_at).toBe(initial.created_at)
    expect(stored?.submitted_at).toBe(initial.submitted_at)
    expect(stored?.approved_at).toBe(initial.approved_at)
    expect(stored?.withdrawn_at).toBeNull()

    // AuditLog: 1 件 append、必須フィールド検証
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    const entry = logs[0]
    expect(entry?.id).toBe(result.audit_log_id)
    expect(entry?.action).toBe('publish')
    expect(entry?.actor_id).toBe(adminViewer.user_id)
    expect(entry?.actor_role).toBe('admin')
    expect(entry?.target_proposal_id).toBe(PROPOSAL_ID)
    expect(entry?.before_status).toBe('approved')
    expect(entry?.after_status).toBe('published')
    expect(entry?.before_visibility).toBeNull()
    expect(entry?.after_visibility).toBeNull()
    expect(entry?.reason).toBe(VALID_INPUT.reason)
    expect(entry?.policy_agreement_id).toBeNull()
  })

  it('API-007 / TEST-020: actor_role joins multiple roles with comma (DB-004 m-02)', async () => {
    const multiRoleViewer: Viewer = {
      user_id: 'admin-1',
      roles: ['admin', 'auditor'],
    }
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await publish(multiRoleViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const logs = await audit.list()
    expect(logs[0]?.actor_role).toBe('admin,auditor')
  })

  it('API-007 / TEST-020: reason is trimmed before persisting in AuditLog', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await publish(
      adminViewer,
      PROPOSAL_ID,
      { reason: '   公開します   ', expected_version: 1 },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBe('公開します')
  })

  it('API-007 / TEST-020: admin (not the original author) can publish (admin 専権、author 一致は不要)', async () => {
    const initial = makeApprovedProposal()
    const { deps, proposals } = makeDeps([initial])

    const result = await publish(otherAdminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('published')

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.published_at).toBe(FROZEN_NOW)
  })

  it('API-007 / TEST-020: admin can publish approved private proposal', async () => {
    // private 投稿でも admin であれば publish 可能（admin.publish は visibility を参照しない）。
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'approved', visibility: 'private' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps } = makeDeps([initial])

    const result = await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('published')
    expect(result.published_at).toBe(FROZEN_NOW)
  })
})

// ---------------------------------------------------------------------------
// 2. 認可: 401 / 404（reviewer / user / auditor 全て 404、admin のみ通過）
// ---------------------------------------------------------------------------

describe('API-007 / NFR-003 / BR-PUBLISH-01 / BR-AUTHZ-03 / TEST-020: authorization', () => {
  it('API-007 / TEST-020: guest (viewer === null) → AuthorizationError(401, not_authenticated), no AuditLog', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await publish(null, PROPOSAL_ID, VALID_INPUT, deps)
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
    expect(stored?.status).toBe('approved')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.published_at).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-007 / TEST-020: nonexistent proposal id (authenticated admin) → 404 not_owner_resource, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await publish(adminViewer, 'missing-id', VALID_INPUT, deps)
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

  it('API-007 / TEST-020: nonexistent proposal id (guest) → 401 not_authenticated', async () => {
    const { deps, audit } = makeDeps([])

    await expect(publish(null, 'missing-id', VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 401,
      reason: 'not_authenticated',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-01 / TEST-020: user role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(publish(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-01 / TEST-020: reviewer role → AuthorizationError(404, insufficient_role) (publish は admin 専権、reviewer は不可)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    await expect(
      publish(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })

    // 副作用なし: reviewer の publish 試行は AuditLog を残さない（BR-AUDIT-03）
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('approved')
    expect(stored?.published_at).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-01 / TEST-020: auditor role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      publish(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-01 / TEST-020: admin (only admin role) → passes authorization', async () => {
    // admin のみが authorize を通過することを正面から確認する。
    const initial = makeApprovedProposal()
    const { deps } = makeDeps([initial])

    const result = await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('published')
  })
})

// ---------------------------------------------------------------------------
// 3. reason 検証 (DB-004 §reason 任意 + 最大長)
// ---------------------------------------------------------------------------

describe('API-007 / DB-004 / TEST-020: reason validation (任意 + 4000 上限)', () => {
  it('API-007 / TEST-020: reason undefined → AuditLog reason: null, status=published', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    const result = await publish(
      adminViewer,
      PROPOSAL_ID,
      { expected_version: 1 },
      deps,
    )
    expect(result.status).toBe('published')

    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.reason).toBeNull()
  })

  it('API-007 / TEST-020: reason empty string → AuditLog reason: null (m-03 正規化)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    const result = await publish(
      adminViewer,
      PROPOSAL_ID,
      { reason: '', expected_version: 1 },
      deps,
    )
    expect(result.status).toBe('published')

    const logs = await audit.list()
    expect(logs[0]?.reason).toBeNull()
  })

  it('API-007 / TEST-020: reason whitespace-only → AuditLog reason: null (m-03 正規化)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    const result = await publish(
      adminViewer,
      PROPOSAL_ID,
      { reason: '   \t\n   ', expected_version: 1 },
      deps,
    )
    expect(result.status).toBe('published')

    const logs = await audit.list()
    expect(logs[0]?.reason).toBeNull()
  })

  it('API-007 / TEST-020: reason valid text → trim 済を AuditLog に保存', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await publish(
      adminViewer,
      PROPOSAL_ID,
      { reason: '  market launch  ', expected_version: 1 },
      deps,
    )
    const logs = await audit.list()
    expect(logs[0]?.reason).toBe('market launch')
  })

  it('DB-004 / TEST-020: reason 4001 chars → PublishValidationError(field=reason), no AuditLog', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    const longReason = 'a'.repeat(4_001)
    let thrown: unknown
    try {
      await publish(
        adminViewer,
        PROPOSAL_ID,
        { reason: longReason, expected_version: 1 },
        deps,
      )
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(PublishValidationError)
    if (thrown instanceof PublishValidationError) {
      expect(thrown.field).toBe('reason')
      expect(thrown.httpStatus).toBe(400)
      expect(thrown.errorCode).toBe('VALIDATION_ERROR')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('approved')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.published_at).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-004 / TEST-020: reason exactly 4000 chars → success', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    const reason = 'a'.repeat(4_000)
    const result = await publish(
      adminViewer,
      PROPOSAL_ID,
      { reason, expected_version: 1 },
      deps,
    )
    expect(result.status).toBe('published')
    const logs = await audit.list()
    expect(logs[0]?.reason).toBe(reason)
  })

  it('API-007 / TEST-020: reason non-string (number) → PublishValidationError(field=reason)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = { reason: 123, expected_version: 1 } as unknown as PublishInput

    await expect(publish(adminViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'PublishValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. expected_version 検証
// ---------------------------------------------------------------------------

describe('API-007 / TEST-020: expected_version validation', () => {
  it('API-007 / TEST-020: expected_version negative → PublishValidationError(field=expected_version)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      publish(adminViewer, PROPOSAL_ID, { expected_version: -1 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-007 / TEST-020: expected_version non-integer → PublishValidationError(field=expected_version)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      publish(adminViewer, PROPOSAL_ID, { expected_version: 1.5 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-007 / TEST-020: expected_version not a number → PublishValidationError(field=expected_version)', async () => {
    const initial = makeApprovedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      expected_version: 'one',
    } as unknown as PublishInput

    await expect(publish(adminViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'expected_version',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. status != approved (DB-003 不変条件 1 / API-007 §422)
// ---------------------------------------------------------------------------

describe('API-007 / DB-003 / TEST-020: state guard (only approved can be published)', () => {
  const NON_APPROVED_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'approved'> => s !== 'approved',
  )

  for (const status of NON_APPROVED_STATUSES) {
    it(`DB-003 / TEST-020: status='${status}' → PublishStateError(reason=status_not_approved), no AuditLog`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'internal' },
        { id: PROPOSAL_ID, version: 1 },
      )
      const { deps, audit, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(PublishStateError)
      if (thrown instanceof PublishStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.reason).toBe('status_not_approved')
        expect(thrown.currentStatus).toBe(status)
      }

      // 副作用なし: 元 proposal の status 不変、published_at は元の値を維持
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe(status)
      // published 状態の fixture は published_at が設定されているため、
      // 「publish が published_at を上書きしていない」ことを確認する。
      expect(stored?.published_at).toBe(proposal.published_at)
      expect(await audit.list()).toHaveLength(0)
    })
  }
})

// ---------------------------------------------------------------------------
// 6. 楽観ロック失敗
// ---------------------------------------------------------------------------

describe('API-007 / TEST-020: optimistic lock', () => {
  it('API-007 / TEST-020: expected_version mismatch → ProposalLockError, no AuditLog, no state change', async () => {
    const initial = makeApprovedProposal({ version: 5 })
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await publish(
        adminViewer,
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
    expect(stored?.status).toBe('approved')
    expect(stored?.version).toBe(5)
    expect(stored?.published_at).toBeNull()

    // AuditLog 不在
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-007 / TEST-020: simultaneous publish by two admins → only first succeeds, second gets PublishStateError (post-transition)', async () => {
    const initial = makeApprovedProposal({ version: 1 })
    const { deps, audit } = makeDeps([initial])

    // admin-1 が先に成功
    const first = await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(first.status).toBe('published')

    // admin-2 が同じ expected_version=1 で呼ぶと、現バージョンは 2 / 状態は published
    // のため status guard で 422 に倒れる（CAS ではなく status 検査が先に失敗する経路）。
    await expect(
      publish(otherAdminViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(PublishStateError)

    // AuditLog: 1 件目のみ append（成功した側のみ）
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actor_id).toBe(adminViewer.user_id)
  })

  it('API-007 / TEST-020: stale expected_version on still-approved proposal → ProposalLockError (409 path)', async () => {
    // proposals の version が 7 まで進んだ状態で、status は approved のまま
    // （別経路で version だけ進んだ想定）。admin が古い version=6 を指定して
    // publish すると CAS 失敗で ProposalLockError → 呼び出し側 wrapper が 409 にマップ。
    const initial = makeApprovedProposal({ version: 7 })
    const { deps, audit } = makeDeps([initial])

    await expect(
      publish(
        adminViewer,
        PROPOSAL_ID,
        { reason: 'reason', expected_version: 6 },
        deps,
      ),
    ).rejects.toBeInstanceOf(ProposalLockError)

    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 7. 書き込み順序 (API-007 §バリデーション規約 / §AuditLog 書き込み)
// ---------------------------------------------------------------------------

describe('API-007 / TEST-020: write ordering', () => {
  it('API-007 / TEST-020: spy invocation order is findById → updateWithLock → audit.append', async () => {
    const initial = makeApprovedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const findByIdSpy = vi.spyOn(proposals, 'findById')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

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

  it('API-007 / TEST-020: updateWithLock receives status=published, assignee_id=null, published_at=now', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makeApprovedProposal()
      const { deps, proposals } = makeDeps([initial])

      const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')

      await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

      expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
      const callArgs = updateWithLockSpy.mock.calls[0]
      expect(callArgs).toBeDefined()
      if (callArgs !== undefined) {
        const [id, expectedVersion, patch] = callArgs
        expect(id).toBe(PROPOSAL_ID)
        expect(expectedVersion).toBe(VALID_INPUT.expected_version)
        expect(patch).toMatchObject({
          status: 'published',
          assignee_id: null,
          published_at: FROZEN_NOW,
        })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('API-007 / TEST-020: when validation fails (reason too long), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeApprovedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      publish(
        adminViewer,
        PROPOSAL_ID,
        { reason: 'a'.repeat(4_001), expected_version: 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(PublishValidationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-007 / TEST-020: when authorize fails (reviewer), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeApprovedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      publish(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-007 / TEST-020: when status guard fails, no write paths are called (BR-AUDIT-03)', async () => {
    // submitted は approved に到達していないため 422
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'submitted', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps, proposals, audit } = makeDeps([proposal])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(PublishStateError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-007 / TEST-020: when optimistic lock fails, AuditLog is NOT appended (BR-AUDIT-03)', async () => {
    const initial = makeApprovedProposal({ version: 5 })
    const { deps, audit } = makeDeps([initial])

    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      publish(
        adminViewer,
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

describe('NFR-005 / API-007 / TEST-020: no console / logger side effects', () => {
  it('NFR-005 / TEST-020: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makeApprovedProposal()
      const { deps } = makeDeps([initial])
      await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-020: injected logger is never called by publish itself', async () => {
    const initial = makeApprovedProposal()
    const proposals = createInMemoryProposalRepository([initial])
    const audit = createInMemoryAuditLogRepository()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await publish(adminViewer, PROPOSAL_ID, VALID_INPUT, {
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

describe('API-007 / TEST-020: result type narrowing', () => {
  it('API-007 / TEST-020: result.status is the literal "published" and published_at is a finite number', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makeApprovedProposal()
      const { deps } = makeDeps([initial])

      const result: PublishResult = await publish(
        adminViewer,
        PROPOSAL_ID,
        VALID_INPUT,
        deps,
      )

      // 型レベルチェック: 'published' リテラル以外を割り当てると TS2322 が出る。
      const statusLiteral: 'published' = result.status
      expect(statusLiteral).toBe('published')
      expect(typeof result.version).toBe('number')
      expect(typeof result.published_at).toBe('number')
      expect(Number.isFinite(result.published_at)).toBe(true)
      expect(result.published_at).toBe(FROZEN_NOW)
      expect(typeof result.audit_log_id).toBe('string')
      expect(result.audit_log_id.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
