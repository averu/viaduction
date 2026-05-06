// TEST-013 — createDraft server function
// REQ-002 / NFR-003 / NFR-006 / API-022 / DB-003 / UC-002 / BR-PROPOSAL-01 / BR-AUTHZ-03
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  createDraft,
  CreateDraftValidationError,
  type CreateDraftDeps,
  type CreateDraftInput,
  type CreateDraftResult,
} from '../../../src/server/functions/create-draft'
import {
  createInMemoryProposalRepository,
  type ProposalRepository,
} from '../../../src/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userViewer: Viewer = { user_id: 'user-1', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

const VALID_INPUT: CreateDraftInput = {
  title: '公園のベンチを増やしたい',
  body: '本文です。',
  visibility: 'public',
}

function makeDeps(): { deps: CreateDraftDeps; proposals: ProposalRepository } {
  const proposals = createInMemoryProposalRepository()
  return { deps: { proposals }, proposals }
}

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe('REQ-002 / API-022 / TEST-013: createDraft happy path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-002 / TEST-013: returns CreateDraftResult with status=draft, version=0, author_id=viewer.user_id', async () => {
    const { deps, proposals } = makeDeps()

    const result = await createDraft(userViewer, VALID_INPUT, deps)

    expect(result.status).toBe('draft')
    expect(result.version).toBe(0)
    expect(result.author_id).toBe(userViewer.user_id)
    expect(typeof result.proposal_id).toBe('string')
    expect(result.proposal_id.length).toBeGreaterThan(0)
    expect(result.created_at).toBe(Date.now())
    expect(result.updated_at).toBe(Date.now())

    // Repository に永続化されている
    const stored = await proposals.findById(result.proposal_id)
    expect(stored).not.toBeNull()
    expect(stored?.author_id).toBe(userViewer.user_id)
    expect(stored?.title).toBe(VALID_INPUT.title)
    expect(stored?.body).toBe(VALID_INPUT.body)
    expect(stored?.visibility).toBe(VALID_INPUT.visibility)
    expect(stored?.status).toBe('draft')
    expect(stored?.version).toBe(0)
    expect(stored?.assignee_id).toBeNull()
    expect(stored?.current_policy_agreement_id).toBeNull()
    expect(stored?.submitted_at).toBeNull()
    expect(stored?.approved_at).toBeNull()
    expect(stored?.published_at).toBeNull()
    expect(stored?.withdrawn_at).toBeNull()
  })

  it('API-022 / TEST-013: accepts each visibility (private / internal / public)', async () => {
    for (const visibility of ['private', 'internal', 'public'] as const) {
      const { deps } = makeDeps()
      const result = await createDraft(
        userViewer,
        { ...VALID_INPUT, visibility },
        deps,
      )
      expect(result.status).toBe('draft')
    }
  })
})

// ---------------------------------------------------------------------------
// 2. author_id 強制（クライアント上書き不能）
// ---------------------------------------------------------------------------

describe('NFR-003 / API-022 / TEST-013: author_id is forced to viewer.user_id (server-side)', () => {
  it('NFR-003 / TEST-013: even if input has extra author_id-like field, stored author_id === viewer.user_id', async () => {
    const { deps, proposals } = makeDeps()

    // CreateDraftInput 型に author_id は無い。意図的にキャストして「クライアントが
    // author_id を送っても server が無視する」ことを確認する（spread 防止）。
    // unknown 経由のキャストで構造的拡張を行うため、any / @ts-ignore を使わない。
    const malicious = {
      ...VALID_INPUT,
      author_id: 'hacker-attempt',
    } as unknown as CreateDraftInput

    const result = await createDraft(userViewer, malicious, deps)

    expect(result.author_id).toBe(userViewer.user_id)
    expect(result.author_id).not.toBe('hacker-attempt')

    const stored = await proposals.findById(result.proposal_id)
    expect(stored?.author_id).toBe(userViewer.user_id)
  })

  it('NFR-003 / TEST-013: CreateDraftInput type does not allow author_id at compile time', () => {
    // 型レベルで author_id は CreateDraftInput に含まれない。下記は型エラーになる
    // ことを ts-expect-error directive で確認する（コメントを消すと TS2353 が出る）。
    const bad = {
      title: 't',
      body: 'b',
      visibility: 'public',
      // @ts-expect-error CreateDraftInput must not accept author_id
      author_id: 'attempt',
    } satisfies CreateDraftInput
    expect(bad.title).toBe('t')
  })
})

// ---------------------------------------------------------------------------
// 3. 認可: guest (viewer === null) は 401
// ---------------------------------------------------------------------------

describe('API-022 / TEST-013: authorization', () => {
  it('API-022 / TEST-013: guest (viewer === null) → AuthorizationError(401, not_authenticated)', async () => {
    const { deps, proposals } = makeDeps()
    let thrown: unknown
    try {
      await createDraft(null, VALID_INPUT, deps)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AuthorizationError)
    if (thrown instanceof AuthorizationError) {
      expect(thrown.httpStatus).toBe(401)
      expect(thrown.errorCode).toBe('UNAUTHENTICATED')
      expect(thrown.reason).toBe('not_authenticated')
    }
    // 副作用なし（永続化されていない）
    const all = await proposals.listAll()
    expect(all).toHaveLength(0)
  })

  // API-022 §認可: user 以上（reviewer / admin / auditor 含む、guest のみ 401）
  for (const viewer of [userViewer, reviewerViewer, adminViewer, auditorViewer]) {
    it(`API-022 / TEST-013: ${viewer.roles.join(',')} (authenticated) succeeds`, async () => {
      const { deps } = makeDeps()
      const result = await createDraft(viewer, VALID_INPUT, deps)
      expect(result.status).toBe('draft')
      expect(result.author_id).toBe(viewer.user_id)
    })
  }
})

// ---------------------------------------------------------------------------
// 4. 入力検証
// ---------------------------------------------------------------------------

describe('API-022 / DB-003 / TEST-013: validation', () => {
  it('API-022 / TEST-013: title empty string → CreateDraftValidationError(field=title)', async () => {
    const { deps } = makeDeps()
    await expect(
      createDraft(userViewer, { ...VALID_INPUT, title: '' }, deps),
    ).rejects.toMatchObject({
      name: 'CreateDraftValidationError',
      field: 'title',
      httpStatus: 400,
      errorCode: 'VALIDATION_ERROR',
    })
  })

  it('API-022 / TEST-013: title whitespace-only → CreateDraftValidationError(field=title)', async () => {
    const { deps } = makeDeps()
    await expect(
      createDraft(userViewer, { ...VALID_INPUT, title: '   \t  ' }, deps),
    ).rejects.toBeInstanceOf(CreateDraftValidationError)
  })

  it('DB-003 / TEST-013: title 201 chars → CreateDraftValidationError(field=title)', async () => {
    const { deps } = makeDeps()
    const tooLong = 'a'.repeat(201)
    await expect(
      createDraft(userViewer, { ...VALID_INPUT, title: tooLong }, deps),
    ).rejects.toMatchObject({ field: 'title' })
  })

  it('DB-003 / TEST-013: title 200 chars (boundary) → success', async () => {
    const { deps } = makeDeps()
    const max = 'a'.repeat(200)
    const result = await createDraft(userViewer, { ...VALID_INPUT, title: max }, deps)
    expect(result.status).toBe('draft')
  })

  it('API-022 / TEST-013: body empty → CreateDraftValidationError(field=body)', async () => {
    const { deps } = makeDeps()
    await expect(
      createDraft(userViewer, { ...VALID_INPUT, body: '' }, deps),
    ).rejects.toMatchObject({ field: 'body' })
  })

  it('API-022 / TEST-013: body whitespace-only → CreateDraftValidationError(field=body)', async () => {
    const { deps } = makeDeps()
    await expect(
      createDraft(userViewer, { ...VALID_INPUT, body: '\n\n  ' }, deps),
    ).rejects.toMatchObject({ field: 'body' })
  })

  it('DB-003 / TEST-013: body 10001 chars → CreateDraftValidationError(field=body)', async () => {
    const { deps } = makeDeps()
    const tooLong = 'b'.repeat(10_001)
    await expect(
      createDraft(userViewer, { ...VALID_INPUT, body: tooLong }, deps),
    ).rejects.toMatchObject({ field: 'body' })
  })

  it('DB-003 / TEST-013: body 10000 chars (boundary) → success', async () => {
    const { deps } = makeDeps()
    const max = 'b'.repeat(10_000)
    const result = await createDraft(userViewer, { ...VALID_INPUT, body: max }, deps)
    expect(result.status).toBe('draft')
  })

  it('API-022 / TEST-013: visibility invalid → CreateDraftValidationError(field=visibility)', async () => {
    const { deps } = makeDeps()
    const bad = {
      ...VALID_INPUT,
      visibility: 'secret',
    } as unknown as CreateDraftInput
    await expect(createDraft(userViewer, bad, deps)).rejects.toMatchObject({
      field: 'visibility',
    })
  })
})

// ---------------------------------------------------------------------------
// 5. AuditLog 不在（型レベル + runtime）
// ---------------------------------------------------------------------------

describe('BR-PROPOSAL-01 / API-022 / TEST-013: AuditLog is NOT touched', () => {
  it('API-022 / TEST-013: CreateDraftDeps does not accept audit field (compile-time)', async () => {
    const { proposals } = makeDeps()

    // CreateDraftDeps に audit プロパティは存在しない。下記は型エラーになることを
    // ts-expect-error directive で確認する（コメントを消すと TS2353 が出る）。
    const deps: CreateDraftDeps = {
      proposals,
      // @ts-expect-error CreateDraftDeps must not accept audit
      audit: { append: () => Promise.resolve() },
    }

    const result = await createDraft(userViewer, VALID_INPUT, deps)
    expect(result.status).toBe('draft')
  })

  it('API-022 / TEST-013: succeeds without any AuditLog dependency injected', async () => {
    // AuditLogRepository を一切渡さない最小依存で動く。
    const proposals = createInMemoryProposalRepository()
    const result = await createDraft(userViewer, VALID_INPUT, { proposals })
    expect(result.status).toBe('draft')
  })
})

// ---------------------------------------------------------------------------
// 6. 副作用（console / logger 不呼び出し）
// ---------------------------------------------------------------------------

describe('NFR-005 / API-022 / TEST-013: no console / logger side effects', () => {
  it('NFR-005 / TEST-013: no console.* calls during success path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    try {
      const { deps } = makeDeps()
      await createDraft(userViewer, VALID_INPUT, deps)
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

  it('NFR-005 / TEST-013: injected logger is never called by createDraft itself', async () => {
    const { proposals } = makeDeps()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    await createDraft(userViewer, VALID_INPUT, { proposals, logger })
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 7. 戻り値の型を「狭い」リテラル型として固定する（コンパイル時保証）
// ---------------------------------------------------------------------------

describe('API-022 / TEST-013: result type narrowing', () => {
  it('API-022 / TEST-013: result.status is the literal "draft", result.version is the literal 0', async () => {
    const { deps } = makeDeps()
    const result: CreateDraftResult = await createDraft(userViewer, VALID_INPUT, deps)

    // 型レベルチェック: 'draft' / 0 のリテラル以外を割り当てると TS2322 が出る。
    const statusLiteral: 'draft' = result.status
    const versionLiteral: 0 = result.version
    expect(statusLiteral).toBe('draft')
    expect(versionLiteral).toBe(0)
  })
})
