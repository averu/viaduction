// TEST-030 — getAuditLog loader (API-017 / REQ-012 / NFR-005 / UC-015 / DB-004)
//
// 検証観点:
//   1. guest（viewer === null）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   2. user 単独 → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   3. reviewer 単独 → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   4. auditor → 200、reason 本文を含む全フィールドを取得
//   5. admin → 200、同
//   6. 不在 auditLogId → AuthorizationError(reason='not_owner_resource', httpStatus=404)
//      （auditor / admin / guest の各 viewer 経路で正しく振り分けられる）
//   7. reason 本体の返却（非 null / null / 4000 文字 / 空文字 / whitespace-only）
//   8. 副作用なし: console.* なし、authorize 1 回 / audit.findById 1 回 / 他は呼ばない
//
// API-017 §"ログへの reason 出力禁止" に従い、本 loader は logger / console を呼ばない。
// 検査 8 で console / 不要な repo メソッドが呼ばれていないことを担保する。
//
// 参照: docs/20-detail-design/apis/API-017.md（§概要 §認可 §レスポンス §エラーコード
//         §"ログへの reason 出力禁止"）、
//       docs/02-requirements/03-non-functional-requirements.md NFR-005、
//       src/server/auth/authorize.ts (action='get.auditLog')、
//       src/server/audit/repository.ts (AuditLogRepository.findById)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authorizeModule from '../../../src/server/auth/authorize'
import { AuthorizationError } from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  createInMemoryAuditLogRepository,
  makeAuditLog,
  type AuditLog,
  type AuditLogRepository,
} from '../../../src/server/audit/repository'
import {
  getAuditLog,
  type AuditLogDetail,
} from '../../../src/server/loaders/get-audit-log'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userViewer: Viewer = { user_id: 'user-1', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }

/** 既知の id（makeAuditLog のデフォルト命名 `audit-${action}-${target_proposal_id}`）。 */
const KNOWN_APPROVE_ID = 'audit-approve-p-alpha'
const KNOWN_PUBLISH_ID = 'audit-publish-p-alpha'
const UNKNOWN_ID = 'audit-does-not-exist'

/**
 * 詳細 loader 用の最小 fixture セット。
 *
 * - approve（reason 必須、reviewer-x が author p-alpha を承認）
 * - publish（reason=null、admin-x）
 *   → reason 本体の有無を切り替えて検証できる。
 */
function makeFixtureAuditLogs(): ReadonlyArray<AuditLog> {
  return [
    makeAuditLog({
      actor_id: 'reviewer-x',
      target_proposal_id: 'p-alpha',
      action: 'approve',
    }),
    makeAuditLog({
      actor_id: 'admin-x',
      target_proposal_id: 'p-alpha',
      action: 'publish',
    }),
  ]
}

// ---------------------------------------------------------------------------
// 副作用 spy（authorize の呼び出し / console / repository の各メソッド）
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleInfoSpy: ReturnType<typeof vi.spyOn>
let authorizeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  authorizeSpy = vi.spyOn(authorizeModule, 'authorize')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNoConsoleSideEffects(): void {
  expect(consoleLogSpy).not.toHaveBeenCalled()
  expect(consoleWarnSpy).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  expect(consoleInfoSpy).not.toHaveBeenCalled()
}

/**
 * AuditLogRepository を spy 付きで作る。`findById` / `list` / `listByTarget` /
 * `append` の呼び出し回数を検査する。
 */
function makeSpiedRepo(initial: ReadonlyArray<AuditLog>): {
  repo: AuditLogRepository
  findByIdSpy: ReturnType<typeof vi.fn>
  listSpy: ReturnType<typeof vi.fn>
  listByTargetSpy: ReturnType<typeof vi.fn>
  appendSpy: ReturnType<typeof vi.fn>
} {
  const inner = createInMemoryAuditLogRepository(initial)
  const findByIdSpy = vi.fn(inner.findById.bind(inner))
  const listSpy = vi.fn(inner.list.bind(inner))
  const listByTargetSpy = vi.fn(inner.listByTarget.bind(inner))
  const appendSpy = vi.fn(inner.append.bind(inner))
  const repo: AuditLogRepository = {
    findById: findByIdSpy,
    list: listSpy,
    listByTarget: listByTargetSpy,
    append: appendSpy,
  }
  return { repo, findByIdSpy, listSpy, listByTargetSpy, appendSpy }
}

// ---------------------------------------------------------------------------
// 1. guest → 401 AuthorizationError
// ---------------------------------------------------------------------------

describe('REQ-012 / API-017 / TEST-030: guest viewer (null) is rejected with 401', () => {
  it('REQ-012 / TEST-030: throws AuthorizationError for null viewer', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await expect(
      getAuditLog(null, KNOWN_APPROVE_ID, { audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('REQ-012 / TEST-030: AuthorizationError carries reason=not_authenticated / httpStatus=401', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    let caught: unknown
    try {
      await getAuditLog(null, KNOWN_APPROVE_ID, { audit })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AuthorizationError)
    const err = caught as AuthorizationError
    expect(err.reason).toBe('not_authenticated')
    expect(err.httpStatus).toBe(401)
    expect(err.errorCode).toBe('UNAUTHENTICATED')
  })

  it('NFR-003 / TEST-030: guest path does not access repository (no DB read on 401)', async () => {
    const { repo, findByIdSpy, listSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeFixtureAuditLogs(),
    )

    await expect(
      getAuditLog(null, KNOWN_APPROVE_ID, { audit: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. user / reviewer → 404 insufficient_role
// ---------------------------------------------------------------------------

describe('REQ-012 / API-017 / TEST-030: user / reviewer are rejected with 404 insufficient_role', () => {
  it.each([
    ['user', userViewer],
    ['reviewer', reviewerViewer],
  ] as const)(
    'REQ-012 / TEST-030: %s is rejected with reason=insufficient_role / httpStatus=404',
    async (_label, viewer) => {
      const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

      let caught: unknown
      try {
        await getAuditLog(viewer, KNOWN_APPROVE_ID, { audit })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(AuthorizationError)
      const err = caught as AuthorizationError
      expect(err.reason).toBe('insufficient_role')
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    },
  )

  it('NFR-003 / TEST-030: user / reviewer path does not access repository (no DB read on 404)', async () => {
    const { repo, findByIdSpy, listSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeFixtureAuditLogs(),
    )

    await expect(
      getAuditLog(userViewer, KNOWN_APPROVE_ID, { audit: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    await expect(
      getAuditLog(reviewerViewer, KNOWN_APPROVE_ID, { audit: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. auditor / admin → 200、全フィールド + reason 本体を取得
// ---------------------------------------------------------------------------

describe('REQ-012 / API-017 / TEST-030: auditor / admin can fetch a single audit log with reason body', () => {
  it.each([
    ['auditor', auditorViewer],
    ['admin', adminViewer],
  ] as const)(
    'REQ-012 / TEST-030: %s receives all documented fields including reason body',
    async (_label, viewer) => {
      const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

      const result = await getAuditLog(viewer, KNOWN_APPROVE_ID, { audit })

      // API-017 §レスポンス §スキーマ の全フィールドを検査
      expect(result.audit_log_id).toBe(KNOWN_APPROVE_ID)
      expect(result.actor_id).toBe('reviewer-x')
      expect(result.actor_role).toBe('reviewer')
      expect(result.action).toBe('approve')
      expect(result.target_proposal_id).toBe('p-alpha')
      expect(result.before_status).toBe('in_review')
      expect(result.after_status).toBe('approved')
      // MVP では常に null（DB-004 §不変条件 3）
      expect(result.before_visibility).toBeNull()
      expect(result.after_visibility).toBeNull()
      // 詳細 API は reason 本体を返す（API-017 §レスポンス §スキーマ）
      expect(result.reason).toBe('tested-reason')
      expect(result.policy_agreement_id).toBeNull()
      expect(typeof result.created_at).toBe('number')
    },
  )

  it('API-017 / TEST-030: detail carries the documented schema fields with correct types', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    const result = await getAuditLog(auditorViewer, KNOWN_PUBLISH_ID, { audit })

    expect(typeof result.audit_log_id).toBe('string')
    expect(typeof result.actor_id).toBe('string')
    expect(typeof result.actor_role).toBe('string')
    expect(typeof result.action).toBe('string')
    expect(typeof result.target_proposal_id).toBe('string')
    expect(typeof result.before_status === 'string' || result.before_status === null).toBe(true)
    expect(typeof result.after_status === 'string' || result.after_status === null).toBe(true)
    expect(result.before_visibility).toBeNull()
    expect(result.after_visibility).toBeNull()
    expect(result.reason === null || typeof result.reason === 'string').toBe(true)
    expect(
      result.policy_agreement_id === null || typeof result.policy_agreement_id === 'string',
    ).toBe(true)
    expect(typeof result.created_at).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// 4. 不在 auditLogId → 404 not_owner_resource
// ---------------------------------------------------------------------------

describe('API-017 / TEST-030: unknown auditLogId is hidden behind a 404 not_owner_resource', () => {
  it.each([
    ['auditor', auditorViewer],
    ['admin', adminViewer],
  ] as const)(
    'REQ-012 / TEST-030: %s requesting unknown id is rejected with 404 not_owner_resource',
    async (_label, viewer) => {
      const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

      let caught: unknown
      try {
        await getAuditLog(viewer, UNKNOWN_ID, { audit })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(AuthorizationError)
      const err = caught as AuthorizationError
      expect(err.reason).toBe('not_owner_resource')
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    },
  )

  it('REQ-012 / TEST-030: empty repository + auditor → 404 not_owner_resource', async () => {
    const audit = createInMemoryAuditLogRepository([])

    let caught: unknown
    try {
      await getAuditLog(auditorViewer, KNOWN_APPROVE_ID, { audit })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AuthorizationError)
    const err = caught as AuthorizationError
    expect(err.reason).toBe('not_owner_resource')
    expect(err.httpStatus).toBe(404)
  })

  it('REQ-012 / TEST-030: guest precedes the existence check (401, not 404)', async () => {
    // guest は repository アクセス前に 401 で弾かれる（authorize 層の責務）。
    // 不在 id を渡しても 401 が優先される（NFR-003 / 隠蔽方針）。
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    let caught: unknown
    try {
      await getAuditLog(null, UNKNOWN_ID, { audit })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AuthorizationError)
    const err = caught as AuthorizationError
    expect(err.reason).toBe('not_authenticated')
    expect(err.httpStatus).toBe(401)
  })

  it('REQ-012 / TEST-030: user/reviewer precede the existence check (insufficient_role, not not_owner_resource)', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    for (const viewer of [userViewer, reviewerViewer]) {
      let caught: unknown
      try {
        await getAuditLog(viewer, UNKNOWN_ID, { audit })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(AuthorizationError)
      const err = caught as AuthorizationError
      expect(err.reason).toBe('insufficient_role')
      expect(err.httpStatus).toBe(404)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. reason 本体の返却（API-017 §レスポンス §スキーマ）
// ---------------------------------------------------------------------------

describe('API-017 / TEST-030: reason body is returned verbatim (detail API differs from list API)', () => {
  it('API-017 / TEST-030: reason="本文に個人情報が含まれている" is returned as-is', async () => {
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'reviewer-x',
          target_proposal_id: 'p-alpha',
          action: 'return',
        },
        { reason: '本文に個人情報が含まれている' },
      ),
    ])

    const result = await getAuditLog(adminViewer, 'audit-return-p-alpha', { audit })

    expect(result.reason).toBe('本文に個人情報が含まれている')
  })

  it('API-017 / TEST-030: reason=null (publish action) is returned as null', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    const result = await getAuditLog(auditorViewer, KNOWN_PUBLISH_ID, { audit })

    expect(result.reason).toBeNull()
  })

  it('API-017 / TEST-030: reason at the 4000-char limit is returned verbatim', async () => {
    // DB-004 §reason 最大長 4,000 文字（境界値）。
    const longReason = 'あ'.repeat(4000)
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'reviewer-x',
          target_proposal_id: 'p-alpha',
          action: 'reject',
        },
        { reason: longReason },
      ),
    ])

    const result = await getAuditLog(adminViewer, 'audit-reject-p-alpha', { audit })

    expect(result.reason).toBe(longReason)
    expect(result.reason?.length).toBe(4000)
  })

  it('API-017 / TEST-030: detail.reason is exposed as a string property (Object.keys check)', async () => {
    // 一覧 API-016 (AuditLogSummary) は構造的に reason を持たないが、詳細 API は持つ。
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    const result = await getAuditLog(auditorViewer, KNOWN_APPROVE_ID, { audit })

    expect(Object.keys(result)).toContain('reason')
    expect(result).toHaveProperty('reason')
  })

  it('API-017 / TEST-030: JSON.stringify of detail contains reason (allowed for response body, NOT for logger)', async () => {
    // API-017 §"ログへの reason 出力禁止" は logger 側の規定。
    // API レスポンスへの包含は許容され、JSON.stringify(result) が reason を含むことは正しい挙動。
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'reviewer-x',
          target_proposal_id: 'p-alpha',
          action: 'approve',
        },
        { reason: 'reason-body-INTENTIONALLY-IN-RESPONSE' },
      ),
    ])

    const result = await getAuditLog(adminViewer, KNOWN_APPROVE_ID, { audit })
    const serialized = JSON.stringify(result)

    expect(serialized).toContain('reason-body-INTENTIONALLY-IN-RESPONSE')
    expect(serialized).toContain('"reason"')
  })
})

// ---------------------------------------------------------------------------
// 6. 副作用なし: console / 多重 authorize / 不要な repository 呼び出し
// ---------------------------------------------------------------------------

describe('NFR-003 / NFR-005 / API-017 / TEST-030: no unexpected side effects (logger / console / extra repo calls)', () => {
  it('NFR-005 / TEST-030: no console output for happy path (auditor)', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await getAuditLog(auditorViewer, KNOWN_APPROVE_ID, { audit })

    expectNoConsoleSideEffects()
  })

  it('NFR-005 / TEST-030: no console output for happy path (admin)', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await getAuditLog(adminViewer, KNOWN_APPROVE_ID, { audit })

    expectNoConsoleSideEffects()
  })

  it('NFR-005 / TEST-030: no console output for 401 path', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await expect(
      getAuditLog(null, KNOWN_APPROVE_ID, { audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expectNoConsoleSideEffects()
  })

  it('NFR-005 / TEST-030: no console output for 404 insufficient_role path', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await expect(
      getAuditLog(userViewer, KNOWN_APPROVE_ID, { audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    await expect(
      getAuditLog(reviewerViewer, KNOWN_APPROVE_ID, { audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expectNoConsoleSideEffects()
  })

  it('NFR-005 / TEST-030: no console output for 404 not_owner_resource path', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await expect(
      getAuditLog(auditorViewer, UNKNOWN_ID, { audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expectNoConsoleSideEffects()
  })

  it('NFR-005 / TEST-030: no console output even when reason body is non-empty', async () => {
    // reason 本体が反応経路で console に流れていないことを担保する
    // （API-017 §"ログへの reason 出力禁止"）。
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'reviewer-x',
          target_proposal_id: 'p-alpha',
          action: 'approve',
        },
        { reason: 'sensitive-reason-MUST-NOT-LEAK-TO-LOGGER' },
      ),
    ])

    await getAuditLog(auditorViewer, KNOWN_APPROVE_ID, { audit })

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-030: authorize() is called exactly once per invocation', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await getAuditLog(auditorViewer, KNOWN_APPROVE_ID, { audit })

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(auditorViewer, 'get.auditLog')
  })

  it('NFR-003 / TEST-030: authorize() is called exactly once even when it throws (no retry)', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    await expect(
      getAuditLog(null, KNOWN_APPROVE_ID, { audit }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(null, 'get.auditLog')
  })

  it('NFR-003 / TEST-030: only audit.findById is called (other repository methods are not touched)', async () => {
    const { repo, findByIdSpy, listSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeFixtureAuditLogs(),
    )

    await getAuditLog(adminViewer, KNOWN_APPROVE_ID, { audit: repo })

    expect(findByIdSpy).toHaveBeenCalledTimes(1)
    expect(findByIdSpy).toHaveBeenCalledWith(KNOWN_APPROVE_ID)
    expect(listSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('NFR-003 / TEST-030: findById is called once even when it returns null (no retry)', async () => {
    const { repo, findByIdSpy, listSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeFixtureAuditLogs(),
    )

    await expect(
      getAuditLog(auditorViewer, UNKNOWN_ID, { audit: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(findByIdSpy).toHaveBeenCalledTimes(1)
    expect(findByIdSpy).toHaveBeenCalledWith(UNKNOWN_ID)
    expect(listSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('NFR-003 / TEST-030: auditLogId is passed verbatim to findById (no normalization)', async () => {
    const { repo, findByIdSpy } = makeSpiedRepo(makeFixtureAuditLogs())

    // 実装内で trim / lowercase 等の正規化を行っていないことを保証
    const inputId = '  audit-with-spaces-and-MIXED-case  '
    await expect(
      getAuditLog(auditorViewer, inputId, { audit: repo }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    expect(findByIdSpy).toHaveBeenCalledTimes(1)
    expect(findByIdSpy).toHaveBeenCalledWith(inputId)
  })
})

// ---------------------------------------------------------------------------
// 7. 型検査: AuditLogDetail の構造保証（コンパイル時 + ランタイム）
// ---------------------------------------------------------------------------

describe('API-017 / TEST-030: AuditLogDetail shape contract', () => {
  it('API-017 / TEST-030: result has exactly the documented keys', async () => {
    const audit = createInMemoryAuditLogRepository(makeFixtureAuditLogs())

    const result: AuditLogDetail = await getAuditLog(adminViewer, KNOWN_APPROVE_ID, { audit })

    const expectedKeys = [
      'audit_log_id',
      'actor_id',
      'actor_role',
      'action',
      'target_proposal_id',
      'before_status',
      'after_status',
      'before_visibility',
      'after_visibility',
      'reason',
      'policy_agreement_id',
      'created_at',
    ].sort()
    expect(Object.keys(result).sort()).toEqual(expectedKeys)
  })
})
