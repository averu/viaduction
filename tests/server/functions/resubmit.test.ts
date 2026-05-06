// TEST-022 — resubmit server function
// REQ-006 / REQ-010 / REQ-011 / REQ-013 / NFR-002 / NFR-003 / NFR-005 / NFR-006 / NFR-007 /
// API-009 / DB-003 / DB-004 / DB-005 / UC-009 / UC-013 / UC-014 /
// BR-PROPOSAL-01 / BR-RESUBMIT-01 / BR-GUARD-02 /
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
  resubmit,
  ResubmitStateError,
  ResubmitValidationError,
  type ResubmitDeps,
  type ResubmitInput,
  type ResubmitResult,
} from '../../../src/server/functions/resubmit'
import {
  createInMemoryPolicyAgreementRepository,
  makePolicyAgreement,
  type PolicyAgreement,
  type PolicyAgreementRepository,
} from '../../../src/server/repositories/policy-agreements'
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
const otherUserViewer: Viewer = { user_id: 'user-2', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

const PROPOSAL_ID = 'proposal-returned-internal'
const POLICY_VERSION = 'mvp-initial'
const FROZEN_NOW = new Date('2026-05-05T12:00:00.000Z').getTime()

const VALID_INPUT: ResubmitInput = {
  title: 'updated title after return',
  body: 'updated body addressing reviewer feedback',
  reason: 'fixed issues',
  expected_version: 1,
}

/**
 * `returned` 状態の Proposal を作る。
 * makeProposal の `returned` デフォルトは
 *   submitted_at=base+100 / approved_at=null / published_at=null / withdrawn_at=null /
 *   assignee_id=null / current_policy_agreement_id='pa-${id}' / version=0。
 * 楽観ロック検証をしやすくするため version=1 を既定とする。
 *
 * `submitted_at` は factory base（2023-11 頃の epoch）由来のため、テストの FROZEN_NOW
 * （2026-05-05）と必ず異なる値となる。これにより「resubmit 後に submitted_at が
 * 上書きされる」ことを「FROZEN_NOW に変わる」形で確実に検証できる。
 */
function makeReturnedProposal(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'returned', visibility: 'internal' },
    {
      id: PROPOSAL_ID,
      title: 'returned-title',
      body: 'returned-body',
      version: 1,
      ...overrides,
    },
  )
}

interface DepsBundle {
  readonly deps: ResubmitDeps
  readonly proposals: ProposalRepository
  readonly policyAgreements: PolicyAgreementRepository
  readonly audit: AuditLogRepository
}

/**
 * deps を組み立てる。`autoSeedAgreement=true` の場合、proposal の
 * `current_policy_agreement_id` に対応する PolicyAgreement を自動でシードする
 * （`status='returned'` の proposal は必ず一度 submit を経験している前提、
 * DB-005 §不変条件 4 / DB-003 §不変条件 5）。
 */
function makeDeps(
  proposalsInitial: ReadonlyArray<Proposal>,
  agreementsInitial?: ReadonlyArray<PolicyAgreement>,
): DepsBundle {
  const proposals = createInMemoryProposalRepository(proposalsInitial)
  const seeds: PolicyAgreement[] = []
  if (agreementsInitial !== undefined) {
    seeds.push(...agreementsInitial)
  } else {
    // proposal.current_policy_agreement_id が非 null のものに対して PolicyAgreement を自動シード
    for (const p of proposalsInitial) {
      if (p.current_policy_agreement_id !== null) {
        seeds.push(
          makePolicyAgreement(
            { user_id: p.author_id, proposal_id: p.id },
            { id: p.current_policy_agreement_id },
          ),
        )
      }
    }
  }
  const policyAgreements = createInMemoryPolicyAgreementRepository(seeds)
  const audit = createInMemoryAuditLogRepository()
  const deps: ResubmitDeps = { proposals, policyAgreements, audit }
  return { deps, proposals, policyAgreements, audit }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-006 / API-009 / TEST-022: resubmit happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-006 / TEST-022: owner resubmits returned proposal → status=submitted, submitted_at=now (上書き), version+1, PolicyAgreement 既存と一致, AuditLog appended', async () => {
    const initial = makeReturnedProposal({ version: 1 })
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    // 前提: factory が設定する submitted_at は FROZEN_NOW とは別値
    expect(initial.submitted_at).not.toBeNull()
    expect(initial.submitted_at).not.toBe(FROZEN_NOW)
    expect(initial.current_policy_agreement_id).not.toBeNull()

    const result = await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 戻り値（API-009 §200 OK）
    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('submitted')
    expect(result.version).toBe(initial.version + 1)
    expect(result.submitted_at).toBe(FROZEN_NOW)
    expect(result.policy_agreement_id).toBe(initial.current_policy_agreement_id)
    expect(typeof result.audit_log_id).toBe('string')
    expect(result.audit_log_id.length).toBeGreaterThan(0)

    // proposals: status='submitted' / submitted_at 上書き / title・body 更新 / version+1
    //            current_policy_agreement_id 不変、created_at 不変
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe('submitted')
    expect(stored?.submitted_at).toBe(FROZEN_NOW)
    expect(stored?.title).toBe(VALID_INPUT.title)
    expect(stored?.body).toBe(VALID_INPUT.body)
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.current_policy_agreement_id).toBe(initial.current_policy_agreement_id)
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.id).toBe(initial.id)
    expect(stored?.author_id).toBe(initial.author_id)
    expect(stored?.created_at).toBe(initial.created_at)
    expect(stored?.visibility).toBe(initial.visibility) // visibility 不変

    // PolicyAgreement: 既存 1 件のみ、新規生成されていない（Q-018 暫定）
    const allAgreements: PolicyAgreement[] = []
    const pa = await policyAgreements.findByProposalId(PROPOSAL_ID)
    expect(pa).not.toBeNull()
    expect(pa?.id).toBe(initial.current_policy_agreement_id)
    expect(pa?.proposal_id).toBe(PROPOSAL_ID)
    expect(pa?.policy_version).toBe(POLICY_VERSION)
    if (pa !== null) {
      allAgreements.push(pa)
    }

    // AuditLog: 1 件 append、必須フィールドが揃っている
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    const entry = logs[0]
    expect(entry?.id).toBe(result.audit_log_id)
    expect(entry?.action).toBe('resubmit')
    expect(entry?.actor_id).toBe(ownerViewer.user_id)
    expect(entry?.actor_role).toBe('user')
    expect(entry?.target_proposal_id).toBe(PROPOSAL_ID)
    expect(entry?.before_status).toBe('returned')
    expect(entry?.after_status).toBe('submitted')
    expect(entry?.before_visibility).toBeNull()
    expect(entry?.after_visibility).toBeNull()
    expect(entry?.reason).toBe(VALID_INPUT.reason)
    expect(entry?.policy_agreement_id).toBe(initial.current_policy_agreement_id)
  })

  it('API-009 / TEST-022: actor_role joins multiple roles with comma (DB-004 m-02)', async () => {
    const multiRoleViewer: Viewer = {
      user_id: ownerViewer.user_id,
      roles: ['user', 'reviewer'],
    }
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await resubmit(multiRoleViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const logs = await audit.list()
    expect(logs[0]?.actor_role).toBe('user,reviewer')
  })

  it('API-009 / TEST-022: reason is trimmed before persisting in AuditLog', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await resubmit(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, reason: '   addressed concerns   ' },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBe('addressed concerns')
  })

  it('API-009 / TEST-022: reason omitted → AuditLog reason=null (任意, m-03)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    const inputNoReason: ResubmitInput = {
      title: VALID_INPUT.title,
      body: VALID_INPUT.body,
      expected_version: VALID_INPUT.expected_version,
    }
    await resubmit(ownerViewer, PROPOSAL_ID, inputNoReason, deps)

    const logs = await audit.list()
    expect(logs[0]?.reason).toBeNull()
  })

  it('API-009 / TEST-022: reason empty string → AuditLog reason=null (m-03 null 正規化)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await resubmit(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, reason: '' },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBeNull()
  })

  it('API-009 / TEST-022: reason whitespace-only → AuditLog reason=null (m-03 null 正規化)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await resubmit(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, reason: '   \t\n   ' },
      deps,
    )

    const logs = await audit.list()
    expect(logs[0]?.reason).toBeNull()
  })

  it('REQ-006 / BR-RESUBMIT-01 / TEST-022: proposal_id is preserved across resubmit (same id, version+1)', async () => {
    // BR-RESUBMIT-01 の核となる不変条件: 再提出は同一 proposal id を維持
    const initial = makeReturnedProposal({ version: 3 })
    const { deps, proposals } = makeDeps([initial])

    const result = await resubmit(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, expected_version: 3 },
      deps,
    )

    // 同一 id（BR-RESUBMIT-01）
    expect(result.proposal_id).toBe(initial.id)
    expect(result.version).toBe(initial.version + 1)

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.id).toBe(initial.id)
    expect(stored?.version).toBe(initial.version + 1)
  })

  it('REQ-006 / DB-003 / TEST-022: submitted_at is overwritten across resubmit', async () => {
    // DB-003 §submitted_at「`returned → submitted` で上書き更新」の核を直接検証する。
    const customSubmittedAt = 1_745_000_000_000 // 2025-04 頃（FROZEN_NOW より過去）
    const initial = makeReturnedProposal({ submitted_at: customSubmittedAt, version: 2 })
    const { deps, proposals } = makeDeps([initial])

    const result = await resubmit(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, expected_version: 2 },
      deps,
    )

    // 上書きされていること
    expect(result.submitted_at).toBe(FROZEN_NOW)
    expect(result.submitted_at).not.toBe(customSubmittedAt)

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.submitted_at).toBe(FROZEN_NOW)
  })

  it('DB-003 / TEST-022: assignee_id remains null after resubmit (returned では既に null)', async () => {
    // DB-003 §不変条件 4: returned では assignee_id は null。resubmit 後も null のまま。
    const initial = makeReturnedProposal()
    expect(initial.assignee_id).toBeNull()
    const { deps, proposals } = makeDeps([initial])

    await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.assignee_id).toBeNull()
  })

  it('Q-018 / DB-005 / TEST-022: PolicyAgreement is NOT regenerated (continued application)', async () => {
    // Q-018 暫定の核となる不変条件: PolicyAgreement は再生成しない、初回エントリの継続適用。
    const seedPa = makePolicyAgreement(
      { user_id: ownerViewer.user_id, proposal_id: PROPOSAL_ID },
      { id: 'pa-original', agreed_at: 1_700_000_000_000 },
    )
    const { deps, policyAgreements } = makeDeps([
      makeProposal(
        { author_id: ownerViewer.user_id, status: 'returned', visibility: 'internal' },
        { id: PROPOSAL_ID, version: 1, current_policy_agreement_id: 'pa-original' },
      ),
    ], [seedPa])

    const result = await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // policy_agreement_id は seed と完全一致（新規生成されていない）
    expect(result.policy_agreement_id).toBe('pa-original')
    const after = await policyAgreements.findByProposalId(PROPOSAL_ID)
    expect(after).not.toBeNull()
    expect(after?.id).toBe('pa-original')
    // agreed_at が seed の値と完全一致（再生成なら現在時刻に変わるはず）
    expect(after?.agreed_at).toBe(1_700_000_000_000)
  })
})

// ---------------------------------------------------------------------------
// 2. 認可: 401 / 404（owner 強制 — user 他人 / reviewer / admin / auditor すべて 404）
// ---------------------------------------------------------------------------

describe('API-009 / NFR-003 / BR-AUTHZ-03 / TEST-022: authorization (owner only)', () => {
  it('API-009 / TEST-022: guest (viewer === null) → AuthorizationError(401, not_authenticated), no AuditLog, no state change', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit, proposals, policyAgreements } = makeDeps([initial])

    let thrown: unknown
    try {
      await resubmit(null, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(401)
      expect(thrown.reason).toBe('not_authenticated')
    }

    // 副作用なし: proposals / PolicyAgreement / audit が変わらない
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('returned')
    expect(stored?.version).toBe(initial.version)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.body).toBe(initial.body)
    expect(stored?.submitted_at).toBe(initial.submitted_at)
    const pa = await policyAgreements.findByProposalId(PROPOSAL_ID)
    expect(pa?.id).toBe(initial.current_policy_agreement_id)
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: nonexistent proposal id (authenticated owner) → 404 not_owner_resource, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await resubmit(ownerViewer, 'missing-id', VALID_INPUT, deps)
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

  it('API-009 / TEST-022: nonexistent proposal id (guest) → 401 not_authenticated', async () => {
    const { deps, audit } = makeDeps([])

    await expect(resubmit(null, 'missing-id', VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 401,
      reason: 'not_authenticated',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: other user (user role, not author) → 404 not_owner_resource, no AuditLog', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    await expect(
      resubmit(otherUserViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'not_owner_resource',
    })

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('returned')
    expect(stored?.title).toBe(initial.title)
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-AUTHZ-01 / TEST-022: reviewer cannot resubmit other user returned proposal → 404 not_owner_resource', async () => {
    // reviewer が他人の returned proposal を resubmit するのは不可（API-009 §認可拒否）。
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'not_owner_resource',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-AUTHZ-01 / TEST-022: admin cannot resubmit other user returned proposal → 404 not_owner_resource', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(adminViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'not_owner_resource',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-AUTHZ-01 / TEST-022: auditor cannot resubmit other user returned proposal → 404 not_owner_resource', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toMatchObject({
      name: 'AuthorizationError',
      httpStatus: 404,
      reason: 'not_owner_resource',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: admin who is the author can resubmit own returned proposal', async () => {
    // admin ロールのユーザでも、自身が author であれば resubmit 可能（owner 一致）。
    const initial = makeProposal(
      { author_id: adminViewer.user_id, status: 'returned', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps } = makeDeps([initial])

    const result = await resubmit(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('submitted')
    expect(result.proposal_id).toBe(PROPOSAL_ID)
  })
})

// ---------------------------------------------------------------------------
// 3. 入力検証 (title / body / reason / expected_version)
// ---------------------------------------------------------------------------

describe('API-009 / DB-003 / DB-004 / TEST-022: input validation', () => {
  // --- title ---

  it('API-009 / TEST-022: title undefined → ResubmitValidationError(field=title), no AuditLog', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit, proposals } = makeDeps([initial])
    const bad = {
      body: VALID_INPUT.body,
      expected_version: 1,
    } as unknown as ResubmitInput

    let thrown: unknown
    try {
      await resubmit(ownerViewer, PROPOSAL_ID, bad, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(ResubmitValidationError)
    if (thrown instanceof ResubmitValidationError) {
      expect(thrown.field).toBe('title')
      expect(thrown.httpStatus).toBe(400)
      expect(thrown.errorCode).toBe('VALIDATION_ERROR')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('returned')
    expect(stored?.title).toBe(initial.title)
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: title empty string → ResubmitValidationError(field=title)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, title: '' }, deps),
    ).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'title',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: title whitespace-only → ResubmitValidationError(field=title)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, title: '   \t\n   ' },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'title',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-003 / TEST-022: title 201 chars → ResubmitValidationError(field=title)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, title: 'a'.repeat(201) },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'title',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-003 / TEST-022: title exactly 200 chars → success', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makeReturnedProposal()
      const { deps, proposals } = makeDeps([initial])

      const title = 'a'.repeat(200)
      const result = await resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, title },
        deps,
      )
      expect(result.status).toBe('submitted')
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.title).toBe(title)
    } finally {
      vi.useRealTimers()
    }
  })

  // --- body ---

  it('API-009 / TEST-022: body undefined → ResubmitValidationError(field=body)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      title: VALID_INPUT.title,
      expected_version: 1,
    } as unknown as ResubmitInput

    await expect(resubmit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'body',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: body empty string → ResubmitValidationError(field=body)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, body: '' }, deps),
    ).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'body',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-003 / TEST-022: body 10001 chars → ResubmitValidationError(field=body)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, body: 'a'.repeat(10_001) },
        deps,
      ),
    ).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'body',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  // --- reason ---

  it('DB-004 / TEST-022: reason 4001 chars → ResubmitValidationError(field=reason), no AuditLog', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit, proposals } = makeDeps([initial])

    const longReason = 'a'.repeat(4_001)
    let thrown: unknown
    try {
      await resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, reason: longReason },
        deps,
      )
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(ResubmitValidationError)
    if (thrown instanceof ResubmitValidationError) {
      expect(thrown.field).toBe('reason')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('returned')
    expect(await audit.list()).toHaveLength(0)
  })

  it('DB-004 / TEST-022: reason exactly 4000 chars → success', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makeReturnedProposal()
      const { deps, audit } = makeDeps([initial])

      const reason = 'a'.repeat(4_000)
      const result = await resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, reason },
        deps,
      )
      expect(result.status).toBe('submitted')
      const logs = await audit.list()
      expect(logs[0]?.reason).toBe(reason)
    } finally {
      vi.useRealTimers()
    }
  })

  it('API-009 / TEST-022: reason non-string (number) → ResubmitValidationError(field=reason)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      ...VALID_INPUT,
      reason: 123,
    } as unknown as ResubmitInput

    await expect(resubmit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: reason null → ResubmitValidationError(field=reason)', async () => {
    // null は型不一致として 400（API-009 §ボディ「string | null」だが、null も
    // resubmit では非 string として扱う。publish.ts と統一）。
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      ...VALID_INPUT,
      reason: null,
    } as unknown as ResubmitInput

    await expect(resubmit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'ResubmitValidationError',
      field: 'reason',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  // --- expected_version ---

  it('API-009 / TEST-022: expected_version negative → ResubmitValidationError(field=expected_version)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, expected_version: -1 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: expected_version non-integer → ResubmitValidationError(field=expected_version)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])

    await expect(
      resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, expected_version: 1.5 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-009 / TEST-022: expected_version not a number → ResubmitValidationError(field=expected_version)', async () => {
    const initial = makeReturnedProposal()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      ...VALID_INPUT,
      expected_version: 'one',
    } as unknown as ResubmitInput

    await expect(resubmit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'expected_version',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. status != returned (DB-003 不変条件 1 / API-009 §422)
// ---------------------------------------------------------------------------

describe('API-009 / DB-003 / TEST-022: state guard (only returned can be resubmitted)', () => {
  const NON_RETURNED_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'returned'> => s !== 'returned',
  )

  for (const status of NON_RETURNED_STATUSES) {
    it(`DB-003 / TEST-022: status='${status}' → ResubmitStateError(reason=status_not_returned), no AuditLog`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'internal' },
        { id: PROPOSAL_ID, version: 1 },
      )
      const { deps, audit, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(ResubmitStateError)
      if (thrown instanceof ResubmitStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.reason).toBe('status_not_returned')
        expect(thrown.currentStatus).toBe(status)
      }

      // 副作用なし: 元 proposal の status / 各 *_at が変わらない
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe(status)
      expect(stored?.title).toBe(proposal.title)
      expect(stored?.body).toBe(proposal.body)
      expect(stored?.submitted_at).toBe(proposal.submitted_at)
      expect(stored?.version).toBe(proposal.version)
      expect(await audit.list()).toHaveLength(0)
    })
  }
})

// ---------------------------------------------------------------------------
// 5. PolicyAgreement 既存無し (防御的、本来到達しない)
// ---------------------------------------------------------------------------

describe('API-009 / DB-005 / Q-018 / TEST-022: missing policy agreement (defensive)', () => {
  it('Q-018 / TEST-022: returned proposal without existing PolicyAgreement → ResubmitStateError(reason=missing_policy_agreement)', async () => {
    // status='returned' なのに PolicyAgreement が存在しない不整合（本来 DB-005 §不変条件 4 /
    // DB-003 §不変条件 5 で発生し得ない）を防御的に 422 で扱う。
    const initial = makeProposal(
      { author_id: ownerViewer.user_id, status: 'returned', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 1, current_policy_agreement_id: null },
    )
    // PolicyAgreement は明示的に空でシード
    const { deps, audit, proposals } = makeDeps([initial], [])

    let thrown: unknown
    try {
      await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(ResubmitStateError)
    if (thrown instanceof ResubmitStateError) {
      expect(thrown.httpStatus).toBe(422)
      expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
      expect(thrown.reason).toBe('missing_policy_agreement')
    }

    // 副作用なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('returned')
    expect(stored?.version).toBe(initial.version)
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 6. 楽観ロック失敗
// ---------------------------------------------------------------------------

describe('API-009 / TEST-022: optimistic lock', () => {
  it('API-009 / TEST-022: expected_version mismatch → ProposalLockError, no AuditLog, no state change', async () => {
    const initial = makeReturnedProposal({ version: 5 })
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, expected_version: 4 },
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
    expect(stored?.status).toBe('returned')
    expect(stored?.version).toBe(5)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.submitted_at).toBe(initial.submitted_at)

    // AuditLog 不在
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 7. 書き込み順序 / PolicyAgreement.create が呼ばれないこと (Q-018 暫定)
// ---------------------------------------------------------------------------

describe('API-009 / Q-018 / TEST-022: write ordering and PolicyAgreement non-regeneration', () => {
  it('API-009 / TEST-022: spy invocation order is findById → findByProposalId → updateWithLock → audit.append', async () => {
    const initial = makeReturnedProposal()
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const findByIdSpy = vi.spyOn(proposals, 'findById')
    const findByProposalIdSpy = vi.spyOn(policyAgreements, 'findByProposalId')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(findByIdSpy).toHaveBeenCalledTimes(1)
    expect(findByProposalIdSpy).toHaveBeenCalledTimes(1)
    expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
    expect(appendSpy).toHaveBeenCalledTimes(1)

    const findByIdOrder = findByIdSpy.mock.invocationCallOrder[0]
    const findPaOrder = findByProposalIdSpy.mock.invocationCallOrder[0]
    const updateOrder = updateWithLockSpy.mock.invocationCallOrder[0]
    const appendOrder = appendSpy.mock.invocationCallOrder[0]

    expect(findByIdOrder).toBeDefined()
    expect(findPaOrder).toBeDefined()
    expect(updateOrder).toBeDefined()
    expect(appendOrder).toBeDefined()

    if (
      findByIdOrder !== undefined
      && findPaOrder !== undefined
      && updateOrder !== undefined
      && appendOrder !== undefined
    ) {
      expect(findByIdOrder).toBeLessThan(findPaOrder)
      expect(findPaOrder).toBeLessThan(updateOrder)
      expect(updateOrder).toBeLessThan(appendOrder)
    }
  })

  it('Q-018 / DB-005 / TEST-022: PolicyAgreement.create is NEVER called (re-use existing)', async () => {
    const initial = makeReturnedProposal()
    const { deps, policyAgreements } = makeDeps([initial])

    const createSpy = vi.spyOn(policyAgreements, 'create')
    const findByProposalIdSpy = vi.spyOn(policyAgreements, 'findByProposalId')

    await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 再生成なし: create は 0 回呼ばれる（Q-018 暫定の核）
    expect(createSpy).not.toHaveBeenCalled()
    // 既存取得: findByProposalId のみ呼ばれる
    expect(findByProposalIdSpy).toHaveBeenCalledTimes(1)
    expect(findByProposalIdSpy).toHaveBeenCalledWith(PROPOSAL_ID)
  })

  it('API-009 / TEST-022: updateWithLock receives status=submitted, submitted_at=now, title, body, and DOES NOT include current_policy_agreement_id (preservation contract)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makeReturnedProposal()
      const { deps, proposals } = makeDeps([initial])

      const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')

      await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

      expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
      const callArgs = updateWithLockSpy.mock.calls[0]
      expect(callArgs).toBeDefined()
      if (callArgs !== undefined) {
        const [id, expectedVersion, patch] = callArgs
        expect(id).toBe(PROPOSAL_ID)
        expect(expectedVersion).toBe(VALID_INPUT.expected_version)
        expect(patch).toMatchObject({
          status: 'submitted',
          submitted_at: FROZEN_NOW,
          title: VALID_INPUT.title,
          body: VALID_INPUT.body,
        })
        // current_policy_agreement_id は patch に **含めない**（据え置き、Q-018 暫定）。
        // updateWithLock 仕様: undefined のフィールドは現状値を維持する。
        expect('current_policy_agreement_id' in patch).toBe(false)
        // assignee_id も含めない（returned で既に null、明示更新は不要）
        expect('assignee_id' in patch).toBe(false)
        // visibility も含めない（DB-003 §不変条件 7、変更不可）
        expect('visibility' in patch).toBe(false)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('API-009 / TEST-022: when validation fails (title empty), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeReturnedProposal()
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const findPaSpy = vi.spyOn(policyAgreements, 'findByProposalId')
    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      resubmit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, title: '' }, deps),
    ).rejects.toBeInstanceOf(ResubmitValidationError)

    // PolicyAgreement の read も書き込みも呼ばれない（validate は status check より先）
    expect(findPaSpy).not.toHaveBeenCalled()
    expect(createSpy).not.toHaveBeenCalled()
    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-009 / TEST-022: when authorize fails (other user), no write paths are called (BR-AUDIT-03)', async () => {
    const initial = makeReturnedProposal()
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const findPaSpy = vi.spyOn(policyAgreements, 'findByProposalId')
    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      resubmit(otherUserViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(findPaSpy).not.toHaveBeenCalled()
    expect(createSpy).not.toHaveBeenCalled()
    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-009 / TEST-022: when status guard fails (draft), no write paths are called (BR-AUDIT-03)', async () => {
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'draft', visibility: 'internal' },
      { id: PROPOSAL_ID, version: 0 },
    )
    const { deps, proposals, policyAgreements, audit } = makeDeps([proposal])

    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      resubmit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, expected_version: 0 }, deps),
    ).rejects.toBeInstanceOf(ResubmitStateError)

    expect(createSpy).not.toHaveBeenCalled()
    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-009 / TEST-022: when optimistic lock fails, AuditLog is NOT appended (BR-AUDIT-03)', async () => {
    const initial = makeReturnedProposal({ version: 5 })
    const { deps, audit, policyAgreements } = makeDeps([initial])

    const createSpy = vi.spyOn(policyAgreements, 'create')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      resubmit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, expected_version: 4 },
        deps,
      ),
    ).rejects.toBeInstanceOf(ProposalLockError)

    expect(createSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 8. 副作用: console / logger 不呼び出し
// ---------------------------------------------------------------------------

describe('NFR-005 / API-009 / TEST-022: no console / logger side effects', () => {
  it('NFR-005 / TEST-022: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makeReturnedProposal()
      const { deps } = makeDeps([initial])
      await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-022: injected logger is never called by resubmit itself', async () => {
    const initial = makeReturnedProposal()
    const proposals = createInMemoryProposalRepository([initial])
    const policyAgreements = createInMemoryPolicyAgreementRepository([
      makePolicyAgreement(
        { user_id: ownerViewer.user_id, proposal_id: PROPOSAL_ID },
        { id: initial.current_policy_agreement_id ?? 'pa-fallback' },
      ),
    ])
    const audit = createInMemoryAuditLogRepository()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await resubmit(ownerViewer, PROPOSAL_ID, VALID_INPUT, {
      proposals,
      policyAgreements,
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

describe('API-009 / TEST-022: result type narrowing', () => {
  it('API-009 / TEST-022: result.status is the literal "submitted", submitted_at finite, policy_agreement_id non-empty, audit_log_id non-empty', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FROZEN_NOW))
    try {
      const initial = makeReturnedProposal()
      const { deps } = makeDeps([initial])

      const result: ResubmitResult = await resubmit(
        ownerViewer,
        PROPOSAL_ID,
        VALID_INPUT,
        deps,
      )

      // 型レベルチェック: 'submitted' リテラル以外を割り当てると TS2322 が出る。
      const statusLiteral: 'submitted' = result.status
      expect(statusLiteral).toBe('submitted')
      expect(typeof result.version).toBe('number')
      expect(typeof result.submitted_at).toBe('number')
      expect(Number.isFinite(result.submitted_at)).toBe(true)
      expect(result.submitted_at).toBe(FROZEN_NOW)
      expect(typeof result.policy_agreement_id).toBe('string')
      expect(result.policy_agreement_id.length).toBeGreaterThan(0)
      expect(typeof result.audit_log_id).toBe('string')
      expect(result.audit_log_id.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
