// TEST-014 — updateDraft server function
// REQ-002 / REQ-010 / REQ-015 / NFR-003 / NFR-006 / NFR-007 / API-023 / DB-003 /
// UC-002 / UC-013 / BR-PROPOSAL-01 / BR-AUTHZ-03 / BR-REVIEW-02
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROPOSAL_STATUSES, type ProposalStatus } from '../../../src/lib/domain/types'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  updateDraft,
  UpdateDraftStateError,
  UpdateDraftValidationError,
  type UpdateDraftDeps,
  type UpdateDraftInput,
  type UpdateDraftResult,
} from '../../../src/server/functions/update-draft'
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

function makeOwnedDraft(overrides: Partial<Proposal> = {}): Proposal {
  return makeProposal(
    { author_id: ownerViewer.user_id, status: 'draft', visibility: 'private' },
    { id: PROPOSAL_ID, title: 'old-title', body: 'old-body', version: 2, ...overrides },
  )
}

function makeDeps(
  initial: ReadonlyArray<Proposal>,
): { deps: UpdateDraftDeps; proposals: ProposalRepository } {
  const proposals = createInMemoryProposalRepository(initial)
  return { deps: { proposals }, proposals }
}

const VALID_INPUT: UpdateDraftInput = {
  title: 'new-title',
  body: 'new-body',
  visibility: 'internal',
  expected_version: 2,
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-002 / API-023 / TEST-014: updateDraft happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-002 / TEST-014: owner updates own draft → status=draft, version+1, fields applied', async () => {
    const initial = makeOwnedDraft()
    const { deps, proposals } = makeDeps([initial])

    const result = await updateDraft(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)

    expect(result.proposal_id).toBe(PROPOSAL_ID)
    expect(result.status).toBe('draft')
    expect(result.version).toBe(initial.version + 1)
    expect(result.updated_at).toBe(Date.now())

    // Repository に部分更新が反映されている
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored).not.toBeNull()
    expect(stored?.title).toBe('new-title')
    expect(stored?.body).toBe('new-body')
    expect(stored?.visibility).toBe('internal')
    expect(stored?.status).toBe('draft')
    expect(stored?.version).toBe(initial.version + 1)
    expect(stored?.author_id).toBe(ownerViewer.user_id)
    // 不変フィールドは維持
    expect(stored?.id).toBe(initial.id)
    expect(stored?.created_at).toBe(initial.created_at)
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.current_policy_agreement_id).toBeNull()
    expect(stored?.submitted_at).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. 認可: 401 / 404
// ---------------------------------------------------------------------------

describe('API-023 / NFR-003 / BR-AUTHZ-03 / TEST-014: authorization', () => {
  it('API-023 / TEST-014: guest (viewer === null) → AuthorizationError(401, not_authenticated)', async () => {
    const initial = makeOwnedDraft()
    const { deps, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await updateDraft(null, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(401)
      expect(thrown.errorCode).toBe('UNAUTHENTICATED')
      expect(thrown.reason).toBe('not_authenticated')
    }

    // 副作用なし（書き換わっていない）
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.version).toBe(initial.version)
  })

  it('API-023 / TEST-014: other user updates owner\'s draft → AuthorizationError(404, not_owner_resource)', async () => {
    const initial = makeOwnedDraft()
    const { deps, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await updateDraft(otherUserViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.errorCode).toBe('NOT_FOUND')
      expect(thrown.reason).toBe('not_owner_resource')
    }

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.title).toBe(initial.title)
    expect(stored?.version).toBe(initial.version)
  })

  it('API-023 / TEST-014: nonexistent proposal id (authenticated) → AuthorizationError(404, not_owner_resource)', async () => {
    const { deps } = makeDeps([])

    let thrown: unknown
    try {
      await updateDraft(ownerViewer, 'missing-id', VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.errorCode).toBe('NOT_FOUND')
      expect(thrown.reason).toBe('not_owner_resource')
    }
  })

  it('API-023 / TEST-014: nonexistent proposal id (guest) → AuthorizationError(401, not_authenticated)', async () => {
    const { deps } = makeDeps([])

    let thrown: unknown
    try {
      await updateDraft(null, 'missing-id', VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(401)
      expect(thrown.reason).toBe('not_authenticated')
    }
  })

  it('API-023 / TEST-014: reviewer cannot update someone else\'s draft → 404 not_owner_resource', async () => {
    const initial = makeOwnedDraft()
    const { deps } = makeDeps([initial])

    let thrown: unknown
    try {
      await updateDraft(reviewerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.reason).toBe('not_owner_resource')
    }
  })

  it('API-023 / TEST-014: admin cannot update someone else\'s draft (owner-only) → 404 not_owner_resource', async () => {
    const initial = makeOwnedDraft()
    const { deps } = makeDeps([initial])

    let thrown: unknown
    try {
      await updateDraft(adminViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.reason).toBe('not_owner_resource')
    }
  })

  it('API-023 / TEST-014: auditor cannot update someone else\'s draft → 404 not_owner_resource', async () => {
    const initial = makeOwnedDraft()
    const { deps } = makeDeps([initial])

    let thrown: unknown
    try {
      await updateDraft(auditorViewer, PROPOSAL_ID, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(404)
      expect(thrown.reason).toBe('not_owner_resource')
    }
  })
})

// ---------------------------------------------------------------------------
// 3. 楽観ロック: 409
// ---------------------------------------------------------------------------

describe('API-023 / BR-REVIEW-02 / TEST-014: optimistic lock', () => {
  it('API-023 / TEST-014: expected_version mismatch → ProposalLockError', async () => {
    const initial = makeOwnedDraft({ version: 5 })
    const { deps, proposals } = makeDeps([initial])

    let thrown: unknown
    try {
      await updateDraft(
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

    // 競合時は書き換わっていない
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.version).toBe(5)
    expect(stored?.title).toBe(initial.title)
  })
})

// ---------------------------------------------------------------------------
// 4. status != 'draft' で更新試行: 422 BUSINESS_RULE_VIOLATION
// ---------------------------------------------------------------------------

describe('API-023 / DB-003 / TEST-014: state guard (only draft is editable)', () => {
  const NON_DRAFT_STATUSES: ReadonlyArray<ProposalStatus> = PROPOSAL_STATUSES.filter(
    (s): s is Exclude<ProposalStatus, 'draft'> => s !== 'draft',
  )

  for (const status of NON_DRAFT_STATUSES) {
    it(`DB-003 / TEST-014: status='${status}' → UpdateDraftStateError(422, currentStatus='${status}')`, async () => {
      const proposal = makeProposal(
        { author_id: ownerViewer.user_id, status, visibility: 'private' },
        { id: PROPOSAL_ID, version: 2 },
      )
      const { deps, proposals } = makeDeps([proposal])

      let thrown: unknown
      try {
        await updateDraft(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
      } catch (e) {
        thrown = e
      }

      expect(thrown).toBeInstanceOf(UpdateDraftStateError)
      if (thrown instanceof UpdateDraftStateError) {
        expect(thrown.httpStatus).toBe(422)
        expect(thrown.errorCode).toBe('BUSINESS_RULE_VIOLATION')
        expect(thrown.currentStatus).toBe(status)
      }

      // 書き換わっていない
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.status).toBe(status)
      expect(stored?.version).toBe(2)
    })
  }
})

// ---------------------------------------------------------------------------
// 5. 入力検証: 400 VALIDATION_ERROR
// ---------------------------------------------------------------------------

describe('API-023 / DB-003 / TEST-014: validation', () => {
  it('API-023 / TEST-014: title empty → UpdateDraftValidationError(field=title)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, title: '' }, deps),
    ).rejects.toMatchObject({
      name: 'UpdateDraftValidationError',
      field: 'title',
      httpStatus: 400,
      errorCode: 'VALIDATION_ERROR',
    })
  })

  it('API-023 / TEST-014: title whitespace-only → UpdateDraftValidationError(field=title)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, title: '   \t  ' }, deps),
    ).rejects.toBeInstanceOf(UpdateDraftValidationError)
  })

  it('DB-003 / TEST-014: title 201 chars → UpdateDraftValidationError(field=title)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    const tooLong = 'a'.repeat(201)
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, title: tooLong }, deps),
    ).rejects.toMatchObject({ field: 'title' })
  })

  it('DB-003 / TEST-014: title 200 chars (boundary) → success', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    const max = 'a'.repeat(200)
    const result = await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, title: max },
      deps,
    )
    expect(result.status).toBe('draft')
  })

  it('API-023 / TEST-014: body empty → UpdateDraftValidationError(field=body)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, body: '' }, deps),
    ).rejects.toMatchObject({ field: 'body' })
  })

  it('API-023 / TEST-014: body whitespace-only → UpdateDraftValidationError(field=body)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, body: '\n\n   ' }, deps),
    ).rejects.toMatchObject({ field: 'body' })
  })

  it('DB-003 / TEST-014: body 10001 chars → UpdateDraftValidationError(field=body)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    const tooLong = 'b'.repeat(10_001)
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, body: tooLong }, deps),
    ).rejects.toMatchObject({ field: 'body' })
  })

  it('DB-003 / TEST-014: body 10000 chars (boundary) → success', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    const max = 'b'.repeat(10_000)
    const result = await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      { ...VALID_INPUT, body: max },
      deps,
    )
    expect(result.status).toBe('draft')
  })

  it('API-023 / TEST-014: visibility invalid enum → UpdateDraftValidationError(field=visibility)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    const bad = {
      ...VALID_INPUT,
      visibility: 'secret',
    } as unknown as UpdateDraftInput
    await expect(updateDraft(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'visibility',
    })
  })

  it('API-023 / TEST-014: expected_version negative → UpdateDraftValidationError(field=expected_version)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    await expect(
      updateDraft(ownerViewer, PROPOSAL_ID, { ...VALID_INPUT, expected_version: -1 }, deps),
    ).rejects.toMatchObject({ field: 'expected_version' })
  })

  it('API-023 / TEST-014: expected_version non-integer → UpdateDraftValidationError(field=expected_version)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    await expect(
      updateDraft(
        ownerViewer,
        PROPOSAL_ID,
        { ...VALID_INPUT, expected_version: 1.5 },
        deps,
      ),
    ).rejects.toMatchObject({ field: 'expected_version' })
  })

  it('API-023 / TEST-014: expected_version not a number → UpdateDraftValidationError(field=expected_version)', async () => {
    const { deps } = makeDeps([makeOwnedDraft()])
    const bad = {
      ...VALID_INPUT,
      expected_version: 'two',
    } as unknown as UpdateDraftInput
    await expect(updateDraft(ownerViewer, PROPOSAL_ID, bad, deps)).rejects.toMatchObject({
      field: 'expected_version',
    })
  })
})

// ---------------------------------------------------------------------------
// 6. 部分更新（指定フィールドだけが書き換わる）
// ---------------------------------------------------------------------------

describe('API-023 / TEST-014: partial update', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('API-023 / TEST-014: only title patched → body / visibility unchanged', async () => {
    const initial = makeOwnedDraft({ title: 'old-t', body: 'old-b', visibility: 'private' })
    const { deps, proposals } = makeDeps([initial])

    const result = await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      { title: 'new-t', expected_version: initial.version },
      deps,
    )

    expect(result.version).toBe(initial.version + 1)
    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.title).toBe('new-t')
    expect(stored?.body).toBe('old-b')
    expect(stored?.visibility).toBe('private')
  })

  it('API-023 / TEST-014: only body patched → title / visibility unchanged', async () => {
    const initial = makeOwnedDraft({ title: 'old-t', body: 'old-b', visibility: 'private' })
    const { deps, proposals } = makeDeps([initial])

    await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      { body: 'new-b', expected_version: initial.version },
      deps,
    )

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.title).toBe('old-t')
    expect(stored?.body).toBe('new-b')
    expect(stored?.visibility).toBe('private')
  })

  it('API-023 / TEST-014: only visibility patched → title / body unchanged', async () => {
    const initial = makeOwnedDraft({ title: 'old-t', body: 'old-b', visibility: 'private' })
    const { deps, proposals } = makeDeps([initial])

    await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      { visibility: 'public', expected_version: initial.version },
      deps,
    )

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.title).toBe('old-t')
    expect(stored?.body).toBe('old-b')
    expect(stored?.visibility).toBe('public')
  })

  it('API-023 / TEST-014: no fields specified (only expected_version) → no-op update with version+1, updated_at refreshed', async () => {
    const initial = makeOwnedDraft({ title: 'old-t', body: 'old-b', visibility: 'private' })
    const { deps, proposals } = makeDeps([initial])

    const result = await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      { expected_version: initial.version },
      deps,
    )

    expect(result.version).toBe(initial.version + 1)
    expect(result.updated_at).toBe(Date.now())

    const stored = await proposals.findById(PROPOSAL_ID)
    expect(stored?.title).toBe('old-t')
    expect(stored?.body).toBe('old-b')
    expect(stored?.visibility).toBe('private')
    expect(stored?.version).toBe(initial.version + 1)
  })

  it('API-023 / TEST-014: each visibility (private / internal / public) accepted', async () => {
    for (const visibility of ['private', 'internal', 'public'] as const) {
      const initial = makeOwnedDraft()
      const { deps, proposals } = makeDeps([initial])
      await updateDraft(
        ownerViewer,
        PROPOSAL_ID,
        { visibility, expected_version: initial.version },
        deps,
      )
      const stored = await proposals.findById(PROPOSAL_ID)
      expect(stored?.visibility).toBe(visibility)
    }
  })
})

// ---------------------------------------------------------------------------
// 7. AuditLog 不在（型レベル + runtime）
// ---------------------------------------------------------------------------

describe('BR-PROPOSAL-01 / API-023 / TEST-014: AuditLog is NOT touched', () => {
  it('API-023 / TEST-014: UpdateDraftDeps does not accept audit field (compile-time)', async () => {
    const initial = makeOwnedDraft()
    const proposals = createInMemoryProposalRepository([initial])

    // UpdateDraftDeps に audit プロパティは存在しない。下記は型エラーになることを
    // ts-expect-error directive で確認する（コメントを消すと TS2353 が出る）。
    const deps: UpdateDraftDeps = {
      proposals,
      // @ts-expect-error UpdateDraftDeps must not accept audit
      audit: { append: () => Promise.resolve() },
    }

    const result = await updateDraft(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
    expect(result.status).toBe('draft')
  })

  it('API-023 / TEST-014: succeeds without any AuditLog dependency injected', async () => {
    const initial = makeOwnedDraft()
    const proposals = createInMemoryProposalRepository([initial])
    const result = await updateDraft(ownerViewer, PROPOSAL_ID, VALID_INPUT, { proposals })
    expect(result.status).toBe('draft')
  })
})

// ---------------------------------------------------------------------------
// 8. 副作用: console / logger 不呼び出し
// ---------------------------------------------------------------------------

describe('NFR-005 / API-023 / TEST-014: no console / logger side effects', () => {
  it('NFR-005 / TEST-014: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const initial = makeOwnedDraft()
      const { deps } = makeDeps([initial])
      await updateDraft(ownerViewer, PROPOSAL_ID, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-014: injected logger is never called by updateDraft itself', async () => {
    const initial = makeOwnedDraft()
    const proposals = createInMemoryProposalRepository([initial])
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await updateDraft(ownerViewer, PROPOSAL_ID, VALID_INPUT, { proposals, logger })
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 9. 戻り値の型を「狭い」リテラル型として固定する（コンパイル時保証）
// ---------------------------------------------------------------------------

describe('API-023 / TEST-014: result type narrowing', () => {
  it('API-023 / TEST-014: result.status is the literal "draft"', async () => {
    const initial = makeOwnedDraft()
    const { deps } = makeDeps([initial])

    const result: UpdateDraftResult = await updateDraft(
      ownerViewer,
      PROPOSAL_ID,
      VALID_INPUT,
      deps,
    )

    // 型レベルチェック: 'draft' リテラル以外を割り当てると TS2322 が出る。
    const statusLiteral: 'draft' = result.status
    expect(statusLiteral).toBe('draft')
    expect(typeof result.version).toBe('number')
    expect(typeof result.updated_at).toBe('number')
  })
})
