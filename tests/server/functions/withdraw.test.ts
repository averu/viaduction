// TEST-021 — withdraw server function
// REQ-005 / REQ-010 / REQ-011 / NFR-002 / NFR-003 / NFR-005 / NFR-006 / NFR-007 /
// API-008 / DB-003 / DB-004 / UC-008 / UC-013 / UC-014 /
// BR-PROPOSAL-01 / BR-PUBLISH-03 /
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
  withdraw,
  WithdrawStateError,
  WithdrawValidationError,
  type WithdrawDeps,
  type WithdrawInput,
  type WithdrawResult,
} from '../../../src/server/functions/withdraw'
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

const PROPOSAL_ID = 'proposal-published-internal'
const FROZEN_NOW = new Date('2026-05-05T12:00:00.000Z').getTime()

const VALID_INPUT: WithdrawInput = {
  reason: 'violates community guidelines',
  expected_version: 1,
}

/**
 * `published` 状態の Proposal を作る。
 * makeProposal の `published` デフォルトは
 *   submitted_at=base+100 / approved_at=base+200 / published_at=base+300 / withdrawn_at=null /
 *   assignee_id=null / version=0。
 * 楽観ロック検証をしやすくするため version=1 を既定とする。
 *
 * `published_at` は factory base（2023-11 頃の epoch）由来のため、テストの FROZEN_NOW
 * （2026-05-05）と必ず異なる値となる。これにより「withdraw 後も published_at が保持される」
 * ことを「FROZEN_NOW で上書きされていない」形で確実に検証できる。
 */
function makePublishedProposal(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'published', visibility: 'internal' },
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
  readonly deps: WithdrawDeps
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

function makeDeps(proposalsInitial: ReadonlyArray<Proposal>): DepsBundle {
  const proposals = createInMemoryProposalRepository(proposalsInitial)
  const audit = createInMemoryAuditLogRepository()
  const deps: WithdrawDeps = { proposals, audit }
  return { deps, proposals, audit }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-005 / API-008 / TEST-021: withdraw happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-005 / TEST-021: admin withdraws published proposal → status=withdrawn, withdrawn_at=now, published_at preserved, version+1, AuditLog appended', async () => {
    const initial = makePublishedProposal({ version: 1 })
    const { deps, proposals, audit } = makeDeps([initial])

    // 前提: factory が設定する published_at は FROZEN_NOW とは別値であること
    // （保持の検証を意味のあるものにするため）。
    expect(initial.published_at).not.toBeNull()
    expect(initial.published_at).not.toBe(FROZEN_NOW)

    const result = await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 戻り値（API-008 §200 OK）
    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('withdrawn')
    expect(result.version).toBe(initial.version + 1)
    expect(result.withdrawn_at).toBe(FROZEN_NOW)
    // published_at は保持される（REQ-005、API-008 §200 OK）
    expect(result.published_at).toBe(initial.published_at)
    expect(typeof result.audit_log_id).toBe('string')
    expect(result.audit_log_id.length).toBeGreaterThan(0)

    // proposals: status='withdrawn' / withdrawn_at=now / published_at 保持 / version+1
    //            本文不変、approved_at / submitted_at は維持
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe('withdrawn')
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.withdrawn_at).toBe(FROZEN_NOW)
    expect(stored?.published_at).toBe(initial.published_at)
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.body).toBe(initial.body)
    expect(stored?.created_at).toBe(initial.created_at)
    expect(stored?.submitted_at).toBe(initial.submitted_at)
    expect(stored?.approved_at).toBe(initial.approved_at)

    // AuditLog: 1 件 append、必須フィールド検証
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    const entry = logs[0]
    expect(entry?.id).toBe(result.audit_log_id)
    expect(entry?.action).toBe('withdraw')
    expect(entry?.actor_id).toBe(adminViewer.user_id)
    expect(entry?.actor_role).toBe('admin')
    expect(entry?.target_proposal_id).toBe(PROPOSAL_ID)
    expect(entry?.before_status).toBe('published')
    expect(entry?.after_status).toBe('withdrawn')
    expect(entry?.before_visibility).toBeNull()
    expect(entry?.after_visibility).toBeNull()
    expect(entry?.reason).toBe(VALID_INPUT.reason)
    expect(entry?.policy_agreement_id).toBeNull()
  })

  it('API-008 / TEST-021: actor_role joins multiple roles with comma (DB-004 m-02)', async () => {
    const multiRoleViewer: Viewer = {
      user_id: 'admin-1',
      roles: ['admin', 'auditor'],
    }
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await withdraw(multiRoleViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const logs = await audit.list()
    expect(logs[0]?.actor_role).toBe('admin,auditor')
  })

  it('API-008 / TEST-021: reason is trimmed before persisting in AuditLog', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await withdraw(
      adminViewer,
      PROPOSAL_ID,
      { reason: '   take-down requested   ', expected_version: 1 },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBe('take-down requested')
  })

  it('API-008 / TEST-021: admin (not the original author) can withdraw (admin 専権、author 一致は不要)', async () => {
    const initial = makePublishedProposal()
    const { deps, proposals } = makeDeps([initial])

    const result = await withdraw(otherAdminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('withdrawn')
    expect(result.withdrawn_at).toBe(FROZEN_NOW)

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.withdrawn_at).toBe(FROZEN_NOW)
    expect(stored?.published_at).toBe(initial.published_at)
  })

  it('API-008 / TEST-021: admin can withdraw published private proposal', async () => {
    // private 投稿でも admin であれば withdraw 可能（admin.withdraw は visibility を参照しない）。
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'published', visibility: 'private' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps } = makeDeps([initial])

    const result = await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('withdrawn')
    expect(result.withdrawn_at).toBe(FROZEN_NOW)
    expect(result.published_at).toBe(initial.published_at)
  })

  it('REQ-005 / TEST-021: published_at is preserved across withdraw (audit pair extractable)', async () => {
    // REQ-005 の核となる不変条件: withdraw 後も published_at が残ることで
    // AuditLog から (published_at, withdrawn_at) のペアが抽出可能であること。
    const customPublishedAt = 1_745_000_000_000 // 2025-04 頃（FROZEN_NOW より過去）
    const initial = makePublishedProposal({ published_at: customPublishedAt, version: 3 })
    const { deps, proposals, audit } = makeDeps([initial])

    const result = await withdraw(
      adminViewer,
      PROPOSAL_ID,
      { reason: 'editorial decision', expected_version: 3 },
      deps,
    )

    expect(result.published_at).toBe(customPublishedAt)
    expect(result.withdrawn_at).toBe(FROZEN_NOW)
    expect(result.published_at).toBeLessThan(result.withdrawn_at)

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.published_at).toBe(customPublishedAt)
    expect(stored?.withdrawn_at).toBe(FROZEN_NOW)

    // AuditLog 経路でも published_at の保持を間接的に検証できる（API-008 §後続挙動の注記）
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.before_status).toBe('published')
    expect(logs[0]?.after_status).toBe('withdrawn')
  })
})

// ---------------------------------------------------------------------------
// 2. 認可: 401 / 404（reviewer / user / auditor 全て 404、admin のみ通過）
// ---------------------------------------------------------------------------

describe('API-008 / NFR-003 / BR-PUBLISH-03 / BR-AUTHZ-03 / TEST-021: authorization', () => {
  it('API-008 / TEST-021: guest (viewer === null) → AuthorizationError(401, not_authenticated), no AuditLog', async () => {
    const initial = makePublishedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await withdraw(null, PROPOSAL_ID, VALID_INPUT, deps)
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
    expect(stored?.status).toBe('published')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.withdrawn_at).toBeNull()
    expect(stored?.published_at).toBe(initial.published_at)
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-008 / TEST-021: nonexistent proposal id (authenticated admin) → 404 not_owner_resource, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await withdraw(adminViewer, 'missing-id', VALID_INPUT, deps)
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

  it('API-008 / TEST-021: nonexistent proposal id (guest) → 401 not_authenticated', async () => {
    const { deps, audit } = makeDeps([])

    await expect(withdraw(null, 'missing-id', VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 401,
      reason: 'not_authenticated',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-03 / TEST-021: user role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(withdraw(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-03 / TEST-021: reviewer role → AuthorizationError(404, insufficient_role) (withdraw は admin 専権、reviewer は不可)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    await expect(
      withdraw(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })

    // 副作用なし: reviewer の withdraw 試行は AuditLog を残さない（BR-AUDIT-03）
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('published')
    expect(stored?.withdrawn_at).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-03 / TEST-021: auditor role → AuthorizationError(404, insufficient_role)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      withdraw(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'insufficient_role',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-03 / TEST-021: admin (only admin role) → passes authorization', async () => {
    // admin のみが authorize を通過することを正面から確認する。
    const initial = makePublishedProposal()
    const { deps } = makeDeps([initial])

    const result = await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('withdrawn')
  })
})

// ---------------------------------------------------------------------------
// 3. reason 検証 (DB-004 §reason 必須 + 4000 上限、BR-PUBLISH-03)
// ---------------------------------------------------------------------------

describe('API-008 / DB-004 / BR-PUBLISH-03 / TEST-021: reason validation (必須 + 4000 上限)', () => {
  it('BR-PUBLISH-03 / TEST-021: reason undefined → WithdrawValidationError(field=reason), no AuditLog', async () => {
    const initial = makePublishedProposal()
    const { deps, audit, proposals } = makeDeps([initial])
    // reason 未指定の入力（必須なので 400）
    const bad = { expected_version: 1 } as unknown as WithdrawInput

    let thrown: unknown
    try {
      await withdraw(adminViewer, PROPOSAL_ID, bad, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(WithdrawValidationError)
    if (thrown instanceof WithdrawValidationError) {
      expect(thrown.field).toBe('reason')
      expect(thrown.httpStatus).toBe(400)
      expect(thrown.errorCode).toBe('VALIDATION_ERROR')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('published')
    expect(stored?.withdrawn_at).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-03 / TEST-021: reason empty string → WithdrawValidationError(field=reason)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      withdraw(adminViewer, PROPOSAL_ID, { reason: '', expected_version: 1 }, deps),
    ).rejects.toMatchObject({
      name: 'WithdrawValidationError',
      field: 'reason',
      httpStatus: 400,
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PUBLISH-03 / TEST-021: reason whitespace-only → WithdrawValidationError(field=reason)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      withdraw(
        adminViewer,
        PROPOSAL_ID,
        { reason: '   \t\n   ', expected_version: 1 },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'WithdrawValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-004 / TEST-021: reason 4001 chars → WithdrawValidationError(field=reason), no AuditLog', async () => {
    const initial = makePublishedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    const longReason = 'a'.repeat(4_001)
    let thrown: unknown
    try {
      await withdraw(
        adminViewer,
        PROPOSAL_ID,
        { reason: longReason, expected_version: 1 },
        deps,
      )
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(WithdrawValidationError)
    if (thrown instanceof WithdrawValidationError) {
      expect(thrown.field).toBe('reason')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('published')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.withdrawn_at).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-004 / TEST-021: reason exactly 4000 chars → success', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makePublishedProposal()
      const { deps, audit } = makeDeps([initial])

      const reason = 'a'.repeat(4_000)
      const result = await withdraw(
        adminViewer,
        PROPOSAL_ID,
        { reason, expected_version: 1 },
        deps,
      )
      expect(result.status).toBe('withdrawn')
      const logs = await audit.list()
      expect(logs[0]?.reason).toBe(reason)
    } finally {
      vi.useRealTimers()
    }
  })

  it('API-008 / TEST-021: reason non-string (number) → WithdrawValidationError(field=reason)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = { reason: 123, expected_version: 1 } as unknown as WithdrawInput

    await expect(withdraw(adminViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'WithdrawValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-008 / TEST-021: reason null → WithdrawValidationError(field=reason)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = { reason: null, expected_version: 1 } as unknown as WithdrawInput

    await expect(withdraw(adminViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'WithdrawValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. expected_version 検証
// ---------------------------------------------------------------------------

describe('API-008 / TEST-021: expected_version validation', () => {
  it('API-008 / TEST-021: expected_version negative → WithdrawValidationError(field=expected_version)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      withdraw(adminViewer, PROPOSAL_ID, { reason: 'r', expected_version: -1 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-008 / TEST-021: expected_version non-integer → WithdrawValidationError(field=expected_version)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      withdraw(adminViewer, PROPOSAL_ID, { reason: 'r', expected_version: 1.5 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-008 / TEST-021: expected_version not a number → WithdrawValidationError(field=expected_version)', async () => {
    const initial = makePublishedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      reason: 'r',
      expected_version: 'one',
    } as unknown as WithdrawInput

    await expect(withdraw(adminViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'expected_version',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. status != published (DB-003 不変条件 1 / API-008 §422)
//    REQ-005 の核: approved → withdrawn は不可 (必ず published 経由)
// ---------------------------------------------------------------------------

describe('API-008 / DB-003 / REQ-005 / TEST-021: state guard (only published can be withdrawn)', () => {
  const NON_PUBLISHED_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'published'> => s !== 'published',
  )

  for (const status of NON_PUBLISHED_STATUSES) {
    it(`DB-003 / TEST-021: status='${status}' → WithdrawStateError(reason=status_not_published), no AuditLog`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'internal' },
        { id: PROPOSAL_ID, version: 1 },
      )
      const { deps, audit, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(WithdrawStateError)
      if (thrown instanceof WithdrawStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.reason).toBe('status_not_published')
        expect(thrown.currentStatus).toBe(status)
      }

      // 副作用なし: 元 proposal の status / withdrawn_at / published_at が変わらないこと
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe(status)
      expect(stored?.withdrawn_at).toBe(proposal.withdrawn_at)
      expect(stored?.published_at).toBe(proposal.published_at)
      expect(await audit.list()).toHaveLength(0)
    })
  }

  it('REQ-005 / BR-PUBLISH-03 / TEST-021: approved → withdrawn is rejected (must go through published)', async () => {
    // REQ-005 の最重要不変条件を正面から確認: approved 状態の proposal を直接 withdraw
    // しようとすると 422。published を経由する必要がある。
    const approved = makeProposal(
      { author_id: ownerViewer.user_id, status: 'approved', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps, audit, proposals } = makeDeps([approved])

    let thrown: unknown
    try {
      await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(WithdrawStateError)
    if (thrown instanceof WithdrawStateError) {
      expect(thrown.reason).toBe('status_not_published')
      expect(thrown.currentStatus).toBe('approved')
      expect(thrown.httpStatus).toBe(422)
    }

    // 副作用なし: approved のまま、withdrawn_at は null、published_at も null（approved の不変条件）
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('approved')
    expect(stored?.withdrawn_at).toBeNull()
    expect(stored?.published_at).toBeNull()
    expect(stored?.version).toBe(approved.version)
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 6. 楽観ロック失敗
// ---------------------------------------------------------------------------

describe('API-008 / TEST-021: optimistic lock', () => {
  it('API-008 / TEST-021: expected_version mismatch → ProposalLockError, no AuditLog, no state change', async () => {
    const initial = makePublishedProposal({ version: 5 })
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await withdraw(
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
    expect(stored?.status).toBe('published')
    expect(stored?.version).toBe(5)
    expect(stored?.withdrawn_at).toBeNull()
    expect(stored?.published_at).toBe(initial.published_at)

    // AuditLog 不在
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-008 / TEST-021: simultaneous withdraw by two admins → only first succeeds, second gets WithdrawStateError (post-transition)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makePublishedProposal({ version: 1 })
      const { deps, audit } = makeDeps([initial])

      // admin-1 が先に成功
      const first = await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
      expect(first.status).toBe('withdrawn')

      // admin-2 が同じ expected_version=1 で呼ぶと、現バージョンは 2 / 状態は withdrawn
      // のため status guard で 422 に倒れる（CAS ではなく status 検査が先に失敗する経路）。
      await expect(
        withdraw(otherAdminViewer, PROPOSAL_ID, VALID_INPUT, deps),
      ).rejects.toBeInstanceOf(WithdrawStateError)

      // AuditLog: 1 件目のみ append（成功した側のみ）
      const logs = await audit.list()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.actor_id).toBe(adminViewer.user_id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('API-008 / TEST-021: stale expected_version on still-published proposal → ProposalLockError (409 path)', async () => {
    // proposals の version が 7 まで進んだ状態で、status は published のまま
    // （別経路で version だけ進んだ想定）。admin が古い version=6 を指定して
    // withdraw すると CAS 失敗で ProposalLockError → 呼び出し側 wrapper が 409 にマップ。
    const initial = makePublishedProposal({ version: 7 })
    const { deps, audit } = makeDeps([initial])

    await expect(
      withdraw(
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
// 7. 書き込み順序 (API-008 §バリデーション規約 / §AuditLog 書き込み)
// ---------------------------------------------------------------------------

describe('API-008 / TEST-021: write ordering', () => {
  it('API-008 / TEST-021: spy invocation order is findById → updateWithLock → audit.append', async () => {
    const initial = makePublishedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const findByIdSpy = vi.spyOn(proposals, 'findById')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

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

  it('API-008 / TEST-021: updateWithLock receives status=withdrawn, withdrawn_at=now, and DOES NOT include published_at (preservation contract)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makePublishedProposal()
      const { deps, proposals } = makeDeps([initial])

      const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')

      await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)

      expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
      const callArgs = updateWithLockSpy.mock.calls[0]
      expect(callArgs).toBeDefined()
      if (callArgs !== undefined) {
        const [id, expectedVersion, patch] = callArgs
        expect(id).toBe(PROPOSAL_ID)
        expect(expectedVersion).toBe(VALID_INPUT.expected_version)
        expect(patch).toMatchObject({
          status: 'withdrawn',
          withdrawn_at: FROZEN_NOW,
        })
        // published_at は patch に **含めない**（保持、REQ-005）。
        // updateWithLock 仕様: undefined のフィールドは現状値を維持する。
        expect('published_at' in patch).toBe(false)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('API-008 / TEST-021: when validation fails (reason empty), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makePublishedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      withdraw(
        adminViewer,
        PROPOSAL_ID,
        { reason: '', expected_version: 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(WithdrawValidationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-008 / TEST-021: when validation fails (reason too long), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makePublishedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      withdraw(
        adminViewer,
        PROPOSAL_ID,
        { reason: 'a'.repeat(4_001), expected_version: 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(WithdrawValidationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-008 / TEST-021: when authorize fails (reviewer), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makePublishedProposal()
    const { deps, proposals, audit } = makeDeps([initial])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      withdraw(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-008 / TEST-021: when status guard fails (approved), no write paths are called (BR-AUDIT-03)', async () => {
    // approved → withdrawn は不可 (REQ-005)
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'approved', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps, proposals, audit } = makeDeps([proposal])

    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(WithdrawStateError)

    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-008 / TEST-021: when optimistic lock fails, AuditLog is NOT appended (BR-AUDIT-03)', async () => {
    const initial = makePublishedProposal({ version: 5 })
    const { deps, audit } = makeDeps([initial])

    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      withdraw(
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

describe('NFR-005 / API-008 / TEST-021: no console / logger side effects', () => {
  it('NFR-005 / TEST-021: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makePublishedProposal()
      const { deps } = makeDeps([initial])
      await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-021: injected logger is never called by withdraw itself', async () => {
    const initial = makePublishedProposal()
    const proposals = createInMemoryProposalRepository([initial])
    const audit = createInMemoryAuditLogRepository()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await withdraw(adminViewer, PROPOSAL_ID, VALID_INPUT, {
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

describe('API-008 / TEST-021: result type narrowing', () => {
  it('API-008 / TEST-021: result.status is the literal "withdrawn", withdrawn_at is finite, published_at is preserved finite', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makePublishedProposal()
      const { deps } = makeDeps([initial])

      const result: WithdrawResult = await withdraw(
        adminViewer,
        PROPOSAL_ID,
        VALID_INPUT,
        deps,
      )

      // 型レベルチェック: 'withdrawn' リテラル以外を割り当てると TS2322 が出る。
      const statusLiteral: 'withdrawn' = result.status
      expect(statusLiteral).toBe('withdrawn')
      expect(typeof result.version).toBe('number')
      expect(typeof result.withdrawn_at).toBe('number')
      expect(Number.isFinite(result.withdrawn_at)).toBe(true)
      expect(result.withdrawn_at).toBe(FROZEN_NOW)
      expect(typeof result.published_at).toBe('number')
      expect(Number.isFinite(result.published_at)).toBe(true)
      expect(result.published_at).toBe(initial.published_at)
      expect(typeof result.audit_log_id).toBe('string')
      expect(result.audit_log_id.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
