// TEST-015 — submit server function
// REQ-002 / REQ-013 / REQ-014 / NFR-003 / NFR-006 / NFR-007 / API-002 /
// DB-003 / DB-004 / DB-005 / UC-002 / UC-014 / UC-016 /
// BR-PROPOSAL-01 / BR-PROPOSAL-02 / BR-AUTHZ-03 /
// BR-GUARD-01 / BR-GUARD-02 / BR-AUDIT-01 / BR-AUDIT-03

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROPOSAL_STATUSES, type ProposalStatus } from '../../../src/lib/domain/types'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  createInMemoryAuditLogRepository,
  type AuditLogRepository,
} from '../../../src/server/audit/repository'
import {
  submit,
  SubmitStateError,
  SubmitValidationError,
  type SubmitDeps,
  type SubmitInput,
  type SubmitResult,
} from '../../../src/server/functions/submit'
import {
  createInMemoryPolicyAgreementRepository,
  makePolicyAgreement,
  PolicyAgreementConflictError,
  type PolicyAgreement,
  type PolicyAgreementCreateInput,
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

const PROPOSAL_ID = 'proposal-draft-private'
const POLICY_VERSION = 'mvp-initial'

const VALID_INPUT: SubmitInput = {
  visibility: 'internal',
  ethics_check_personal_info: true,
  ethics_check_no_libel: true,
  ethics_check_publicity_acknowledged: true,
  policy_agreement_consent: true,
  expected_version: 0,
}

function makeOwnedDraft(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'draft', visibility: 'private' },
    {
      id: PROPOSAL_ID,
      title: 'draft-title',
      body: 'draft-body',
      version: 0,
      ...overrides,
    },
  )
}

interface DepsBundle {
  readonly deps: SubmitDeps
  readonly proposals: ProposalRepository
  readonly policyAgreements: PolicyAgreementRepository
  readonly audit: AuditLogRepository
}

function makeDeps(
  proposalsInitial: ReadonlyArray<Proposal>,
  agreementsInitial: ReadonlyArray<PolicyAgreement> = [],
): DepsBundle {
  const proposals = createInMemoryProposalRepository(proposalsInitial)
  const policyAgreements = createInMemoryPolicyAgreementRepository(agreementsInitial)
  const audit = createInMemoryAuditLogRepository()
  const deps: SubmitDeps = {
    proposals,
    policyAgreements,
    audit,
    getCurrentPolicyVersion: () => POLICY_VERSION,
  }
  return { deps, proposals, policyAgreements, audit }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-002 / API-002 / TEST-015: submit happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-002 / TEST-015: owner submits own draft → status=submitted, version+1, PolicyAgreement created, AuditLog appended', async () => {
    const initial = makeOwnedDraft({ version: 0 })
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const result = await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('submitted')
    expect(result.version).toBe(initial.version + 1)
    expect(result.submitted_at).toBe(Date.now())
    expect(typeof result.policy_agreement_id).toBe('string')
    expect(result.policy_agreement_id.length).toBeGreaterThan(0)

    // proposals: status / submitted_at / current_policy_agreement_id / version が更新
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe('submitted')
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.submitted_at).toBe(Date.now())
    expect(stored?.current_policy_agreement_id).toBe(result.policy_agreement_id)
    // 不変フィールドは維持
    expect(stored?.id).toBe(initial.id)
    expect(stored?.author_id).toBe(initial.author_id)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.body).toBe(initial.body)
    expect(stored?.created_at).toBe(initial.created_at)

    // PolicyAgreement: 1 件生成、proposal_id / user_id / policy_version が一致
    const pa = await policyAgreements.findByProposalId(PROPOSAL_ID)
    expect(pa).not.toBeNull()
    expect(pa?.id).toBe(result.policy_agreement_id)
    expect(pa?.user_id).toBe(ownerViewer.user_id)
    expect(pa?.proposal_id).toBe(PROPOSAL_ID)
    expect(pa?.policy_version).toBe(POLICY_VERSION)

    // AuditLog: 1 件 append、必須フィールドが揃っている
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    const entry = logs[0]
    expect(entry?.action).toBe('submit')
    expect(entry?.actor_id).toBe(ownerViewer.user_id)
    expect(entry?.actor_role).toBe('user')
    expect(entry?.target_proposal_id).toBe(PROPOSAL_ID)
    expect(entry?.before_status).toBe('draft')
    expect(entry?.after_status).toBe('submitted')
    expect(entry?.before_visibility).toBeNull()
    expect(entry?.after_visibility).toBeNull()
    expect(entry?.reason).toBeNull()
    expect(entry?.policy_agreement_id).toBe(result.policy_agreement_id)
  })

  it('API-002 / TEST-015: actor_role joins multiple roles with comma (DB-004 m-02)', async () => {
    const multiRoleViewer: Viewer = {
      user_id: ownerViewer.user_id,
      roles: ['user', 'reviewer'],
    }
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])

    await submit(multiRoleViewer, PROPOSAL_ID, VALID_INPUT, deps)

    const logs = await audit.list()
    expect(logs[0]?.actor_role).toBe('user,reviewer')
  })
})

// ---------------------------------------------------------------------------
// 2. PolicyAgreement: 既存あり（再到達時の防御）
// ---------------------------------------------------------------------------

describe('BR-GUARD-02 / DB-005 / API-002 / TEST-015: existing PolicyAgreement is reused', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('BR-GUARD-02 / TEST-015: when PolicyAgreement already exists for proposal, reuse it (no new INSERT)', async () => {
    const initial = makeOwnedDraft()
    const existingPa = makePolicyAgreement(
      { user_id: ownerViewer.user_id, proposal_id: PROPOSAL_ID },
      { id: 'pa-existing-1' },
    )
    const { deps, audit, policyAgreements } = makeDeps([initial], [existingPa])

    // create を spy して呼ばれていないことを確認
    const createSpy = vi.spyOn(policyAgreements, 'create')

    const result = await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(createSpy).not.toHaveBeenCalled()
    expect(result.policy_agreement_id).toBe(existingPa.id)

    // AuditLog の policy_agreement_id は既存 id を指す
    const logs = await audit.list()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.policy_agreement_id).toBe(existingPa.id)
  })
})

// ---------------------------------------------------------------------------
// 3. 倫理ガード 3 種（BR-GUARD-01）
// ---------------------------------------------------------------------------

describe('BR-GUARD-01 / API-002 / TEST-015: ethics guard checkboxes', () => {
  type EthicsField =
    | 'ethics_check_personal_info'
    | 'ethics_check_no_libel'
    | 'ethics_check_publicity_acknowledged'

  const ETHICS_FIELDS: ReadonlyArray<EthicsField> = [
    'ethics_check_personal_info',
    'ethics_check_no_libel',
    'ethics_check_publicity_acknowledged',
  ]

  for (const field of ETHICS_FIELDS) {
    it(`BR-GUARD-01 / TEST-015: ${field}=false → SubmitValidationError(field=${field}), no AuditLog`, async () => {
      const initial = makeOwnedDraft()
      const { deps, audit, proposals, policyAgreements } = makeDeps([initial])

      const bad: SubmitInput = { ...VALID_INPUT, [field]: false }
      let thrown: unknown
      try {
        await submit(ownerViewer, PROPOSAL_ID, bad, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(SubmitValidationError)
      if (thrown instanceof SubmitValidationError) {
        expect(thrown.field).toBe(field)
        expect(thrown.httpStatus).toBe(400)
        expect(thrown.errorCode).toBe('VALIDATION_ERROR')
      }

      // 副作用なし: proposals 変更なし / PolicyAgreement なし / AuditLog なし
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe('draft')
      expect(stored?.version).toBe(initial.version)
      expect(await policyAgreements.findByProposalId(PROPOSAL_ID)).toBeNull()
      expect(await audit.list()).toHaveLength(0)
    })
  }

  it('BR-GUARD-01 / TEST-015: all three ethics checks true → success', async () => {
    const initial = makeOwnedDraft()
    const { deps } = makeDeps([initial])
    const result = await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('submitted')
  })

  it('BR-GUARD-01 / TEST-015: ethics_check_personal_info as truthy non-true (1) → SubmitValidationError', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])
    const bad = {
      ...VALID_INPUT,
      ethics_check_personal_info: 1,
    } as unknown as SubmitInput
    await expect(submit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'SubmitValidationError',
      field: 'ethics_check_personal_info',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. policy_agreement_consent
// ---------------------------------------------------------------------------

describe('BR-GUARD-02 / API-002 / TEST-015: policy agreement consent', () => {
  it('BR-GUARD-02 / TEST-015: consent=false → SubmitValidationError, no PolicyAgreement, no AuditLog', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit, policyAgreements } = makeDeps([initial])

    const bad: SubmitInput = { ...VALID_INPUT, policy_agreement_consent: false }
    await expect(submit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      name: 'SubmitValidationError',
      field: 'policy_agreement_consent',
      httpStatus: 400,
      errorCode: 'VALIDATION_ERROR',
    })

    expect(await policyAgreements.findByProposalId(PROPOSAL_ID)).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. visibility / expected_version 検証
// ---------------------------------------------------------------------------

describe('API-002 / DB-003 / TEST-015: schema validation', () => {
  it('API-002 / TEST-015: visibility invalid enum → SubmitValidationError(field=visibility)', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])
    const bad = { ...VALID_INPUT, visibility: 'secret' } as unknown as SubmitInput
    await expect(submit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'visibility',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: expected_version negative → SubmitValidationError(field=expected_version)', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])
    await expect(
      submit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, expected_version: -1 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: expected_version non-integer → SubmitValidationError(field=expected_version)', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])
    await expect(
      submit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, expected_version: 1.5 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: expected_version not a number → SubmitValidationError(field=expected_version)', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])
    const bad = { ...VALID_INPUT, expected_version: 'zero' } as unknown as SubmitInput
    await expect(submit(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'expected_version',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 6. 認可: 401 / 404
// ---------------------------------------------------------------------------

describe('API-002 / NFR-003 / BR-AUTHZ-03 / TEST-015: authorization', () => {
  it('API-002 / TEST-015: guest (viewer === null) → AuthorizationError(401, not_authenticated), no AuditLog', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit, proposals, policyAgreements } = makeDeps([initial])

    let thrown: unknown
    try {
      await submit(null, PROPOSAL_ID, VALID_INPUT, deps)
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
    expect(stored?.status).toBe('draft')
    expect(stored?.version).toBe(initial.version)
    expect(await policyAgreements.findByProposalId(PROPOSAL_ID)).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: other user submits owner\'s draft → 404 not_owner_resource, no AuditLog', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await submit(otherUserViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.reason).toBe('not_owner_resource')
    }

    expect((await proposals.findById(PROPOSAL_ID))?.status).toBe('draft')
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: nonexistent proposal id (authenticated) → 404 not_owner_resource, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await submit(ownerViewer, 'missing-id', VALID_INPUT, deps)
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

  it('API-002 / TEST-015: nonexistent proposal id (guest) → 401 not_authenticated, no AuditLog', async () => {
    const { deps, audit } = makeDeps([])

    let thrown: unknown
    try {
      await submit(null, 'missing-id', VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(401)
      expect(thrown.reason).toBe('not_authenticated')
    }
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: reviewer cannot submit someone else\'s draft → 404 not_owner_resource', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])

    await expect(submit(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      reason: 'not_owner_resource',
      httpStatus: 404,
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: admin cannot submit someone else\'s draft (owner-only) → 404 not_owner_resource', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])

    await expect(submit(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      reason: 'not_owner_resource',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('API-002 / TEST-015: auditor cannot submit someone else\'s draft → 404 not_owner_resource', async () => {
    const initial = makeOwnedDraft()
    const { deps, audit } = makeDeps([initial])

    await expect(submit(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'AuthorizationError',
      reason: 'not_owner_resource',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 7. status != draft (DB-003 不変条件 1 / API-002 §バリデーション規約 step 6)
// ---------------------------------------------------------------------------

describe('API-002 / DB-003 / TEST-015: state guard (only draft is submittable)', () => {
  const NON_DRAFT_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'draft'> => s !== 'draft',
  )

  for (const status of NON_DRAFT_STATUSES) {
    it(`DB-003 / TEST-015: status='${status}' → SubmitStateError(reason=status_not_draft), no AuditLog`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'private' },
        { id: PROPOSAL_ID, version: 0 },
      )
      const { deps, audit, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(SubmitStateError)
      if (thrown instanceof SubmitStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.reason).toBe('status_not_draft')
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
// 8. title / body 空 (DB-003 §不変条件 / BR-PROPOSAL-02)
// ---------------------------------------------------------------------------

describe('BR-PROPOSAL-02 / DB-003 / TEST-015: existing title/body must not be empty', () => {
  it('BR-PROPOSAL-02 / TEST-015: existing.title is empty string → SubmitStateError(reason=title_or_body_empty)', async () => {
    const initial = makeOwnedDraft({ title: '' })
    const { deps, audit, policyAgreements } = makeDeps([initial])

    await expect(submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'SubmitStateError',
      reason: 'title_or_body_empty',
      httpStatus: 422,
      errorCode: 'BUSINESS_RULE_VIOLATION',
    })
    expect(await policyAgreements.findByProposalId(PROPOSAL_ID)).toBeNull()
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PROPOSAL-02 / TEST-015: existing.title is whitespace-only → SubmitStateError(reason=title_or_body_empty)', async () => {
    const initial = makeOwnedDraft({ title: '   \t\n' })
    const { deps, audit } = makeDeps([initial])

    await expect(submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'SubmitStateError',
      reason: 'title_or_body_empty',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PROPOSAL-02 / TEST-015: existing.body is empty string → SubmitStateError(reason=title_or_body_empty)', async () => {
    const initial = makeOwnedDraft({ body: '' })
    const { deps, audit } = makeDeps([initial])

    await expect(submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'SubmitStateError',
      reason: 'title_or_body_empty',
    })
    expect(await audit.list()).toHaveLength(0)
  })

  it('BR-PROPOSAL-02 / TEST-015: existing.body is whitespace-only → SubmitStateError(reason=title_or_body_empty)', async () => {
    const initial = makeOwnedDraft({ body: '\n\n   ' })
    const { deps, audit } = makeDeps([initial])

    await expect(submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toMatchObject({
      name: 'SubmitStateError',
      reason: 'title_or_body_empty',
    })
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 9. 楽観ロック失敗 (BR-REVIEW-02)
// ---------------------------------------------------------------------------

describe('API-002 / BR-REVIEW-02 / TEST-015: optimistic lock', () => {
  it('API-002 / TEST-015: expected_version mismatch → ProposalLockError, no AuditLog, no PolicyAgreement persisted to proposal', async () => {
    const initial = makeOwnedDraft({ version: 5 })
    const { deps, audit, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await submit(
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

    // proposals は更新されていない
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('draft')
    expect(stored?.version).toBe(5)
    expect(stored?.current_policy_agreement_id).toBeNull()

    // AuditLog は append されていない（書き込み順序: lock 失敗時は append しない）
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 10. PolicyAgreement UNIQUE 違反（フェイルセーフ）
// ---------------------------------------------------------------------------

describe('API-002 / DB-005 / TEST-015: policy agreement unique violation (fail-safe)', () => {
  it('API-002 / TEST-015: PolicyAgreementConflictError → SubmitStateError(reason=policy_agreement_unique_violation), no AuditLog', async () => {
    const initial = makeOwnedDraft()

    // findByProposalId は null を返すが create は ConflictError を throw する
    // 偽装 repository（findBy と create の間に他経路で INSERT された状況をシミュレート）。
    const conflictingPolicyAgreements: PolicyAgreementRepository = {
      async findByProposalId() {
        return null
      },
      async create(_input: PolicyAgreementCreateInput) {
        throw new PolicyAgreementConflictError(PROPOSAL_ID)
      },
      async findLatestByUser() {
        return null
      },
    }

    const proposals = createInMemoryProposalRepository([initial])
    const audit = createInMemoryAuditLogRepository()
    const deps: SubmitDeps = {
      proposals,
      policyAgreements: conflictingPolicyAgreements,
      audit,
      getCurrentPolicyVersion: () => POLICY_VERSION,
    }

    let thrown: unknown
    try {
      await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(SubmitStateError)
    if (thrown instanceof SubmitStateError) {
      expect(thrown.reason).toBe('policy_agreement_unique_violation')
      expect(thrown.httpStatus).toBe(422)
      expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
    }

    // proposals 更新なし、AuditLog なし
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.status).toBe('draft')
    expect(await audit.list()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 11. 書き込み順序検証（API-002 §書き込み順序）
// ---------------------------------------------------------------------------

describe('API-002 / TEST-015: write ordering', () => {
  it('API-002 / TEST-015: spy invocation order is findById → findByProposalId → policyAgreements.create → proposals.updateWithLock → audit.append', async () => {
    const initial = makeOwnedDraft()
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const findByIdSpy = vi.spyOn(proposals, 'findById')
    const findByProposalIdSpy = vi.spyOn(policyAgreements, 'findByProposalId')
    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 各 spy が 1 回呼ばれる（happy path）
    expect(findByIdSpy).toHaveBeenCalledTimes(1)
    expect(findByProposalIdSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(updateWithLockSpy).toHaveBeenCalledTimes(1)
    expect(appendSpy).toHaveBeenCalledTimes(1)

    const findByIdOrder = findByIdSpy.mock.invocationCallOrder[0]
    const findByProposalIdOrder = findByProposalIdSpy.mock.invocationCallOrder[0]
    const createOrder = createSpy.mock.invocationCallOrder[0]
    const updateOrder = updateWithLockSpy.mock.invocationCallOrder[0]
    const appendOrder = appendSpy.mock.invocationCallOrder[0]

    // すべて取得できているか
    expect(findByIdOrder).toBeDefined()
    expect(findByProposalIdOrder).toBeDefined()
    expect(createOrder).toBeDefined()
    expect(updateOrder).toBeDefined()
    expect(appendOrder).toBeDefined()

    if (
      findByIdOrder !== undefined
      && findByProposalIdOrder !== undefined
      && createOrder !== undefined
      && updateOrder !== undefined
      && appendOrder !== undefined
    ) {
      expect(findByIdOrder).toBeLessThan(findByProposalIdOrder)
      expect(findByProposalIdOrder).toBeLessThan(createOrder)
      expect(createOrder).toBeLessThan(updateOrder)
      expect(updateOrder).toBeLessThan(appendOrder)
    }
  })

  it('API-002 / TEST-015: when validation fails, none of the write paths is called (BR-AUDIT-03)', async () => {
    const initial = makeOwnedDraft()
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      submit(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, ethics_check_no_libel: false },
        deps,
      ),
    ).rejects.toBeInstanceOf(SubmitValidationError)

    expect(createSpy).not.toHaveBeenCalled()
    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-002 / TEST-015: when authorize fails, none of the write paths is called (BR-AUDIT-03)', async () => {
    const initial = makeOwnedDraft()
    const { deps, proposals, policyAgreements, audit } = makeDeps([initial])

    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      submit(otherUserViewer, PROPOSAL_ID, VALID_INPUT, deps),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(createSpy).not.toHaveBeenCalled()
    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-002 / TEST-015: when status guard fails, no PolicyAgreement create / no proposals update / no AuditLog (BR-AUDIT-03)', async () => {
    const proposal = makeProposal(
      { author_id: ownerViewer.user_id, status: 'submitted', visibility: 'private' },
      { id: PROPOSAL_ID, version: 1 },
    )
    const { deps, proposals, policyAgreements, audit } = makeDeps([proposal])

    const createSpy = vi.spyOn(policyAgreements, 'create')
    const updateWithLockSpy = vi.spyOn(proposals, 'updateWithLock')
    const appendSpy = vi.spyOn(audit, 'append')

    await expect(submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)).rejects.toBeInstanceOf(
      SubmitStateError,
    )

    expect(createSpy).not.toHaveBeenCalled()
    expect(updateWithLockSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('API-002 / TEST-015: when optimistic lock fails, AuditLog is NOT appended (BR-AUDIT-03)', async () => {
    const initial = makeOwnedDraft({ version: 5 })
    const { deps, audit } = makeDeps([initial])

    const appendSpy = vi.spyOn(audit, 'append')

    await expect(
      submit(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, expected_version: 4 }, deps),
    ).rejects.toBeInstanceOf(ProposalLockError)

    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 12. 副作用: console / logger 不呼び出し
// ---------------------------------------------------------------------------

describe('NFR-005 / API-002 / TEST-015: no console / logger side effects', () => {
  it('NFR-005 / TEST-015: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makeOwnedDraft()
      const { deps } = makeDeps([initial])
      await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-015: injected logger is never called by submit itself', async () => {
    const initial = makeOwnedDraft()
    const proposals = createInMemoryProposalRepository([initial])
    const policyAgreements = createInMemoryPolicyAgreementRepository()
    const audit = createInMemoryAuditLogRepository()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, {
      proposals,
      policyAgreements,
      audit,
      getCurrentPolicyVersion: () => POLICY_VERSION,
      logger,
    })
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 13. 戻り値の型を「狭い」リテラル型として固定する
// ---------------------------------------------------------------------------

describe('API-002 / TEST-015: result type narrowing', () => {
  it('API-002 / TEST-015: result.status is the literal "submitted"', async () => {
    const initial = makeOwnedDraft()
    const { deps } = makeDeps([initial])

    const result: SubmitResult = await submit(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    // 型レベルチェック: 'submitted' リテラル以外を割り当てると TS2322 が出る。
    const statusLiteral: 'submitted' = result.status
    expect(statusLiteral).toBe('submitted')
    expect(typeof result.version).toBe('number')
    expect(typeof result.submitted_at).toBe('number')
    expect(typeof result.policy_agreement_id).toBe('string')
  })
})
