// TEST-029 — listAuditLogs loader (API-016 / REQ-011 / REQ-012 / NFR-005 / UC-015 / DB-004)
//
// 検証観点:
//   1. guest（viewer === null）→ AuthorizationError(reason='not_authenticated', httpStatus=401)
//   2. user 単独 → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   3. reviewer 単独 → AuthorizationError(reason='insufficient_role', httpStatus=404)
//   4. auditor → 200、全件 + フィルタ
//   5. admin → 200、全件 + フィルタ
//   6. フィルタ: actor_id / action / target_proposal_id / from / to / 複数 AND
//   7. reason 本文は API レスポンスに含まれない（reason_present のみ、Object.keys 検査）
//   8. 副作用なし: console.* なし、authorize 1 回 / audit.list 1 回
//
// 参照: docs/20-detail-design/apis/API-016.md（§認可 §フィルタ §レスポンス §reason_present）、
//       docs/02-requirements/03-non-functional-requirements.md NFR-005、
//       src/server/auth/authorize.ts (action='list.auditLogs')、
//       src/server/audit/repository.ts (AuditLogRepository.list)

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
  listAuditLogs,
  type AuditLogSummary,
} from '../../../src/server/loaders/list-audit-logs'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userViewer: Viewer = { user_id: 'user-1', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }

/**
 * 各 action × 異なる actor / target / 時刻のミックスを返す。
 *
 * - submit (reason=null, policy_agreement あり)
 * - start_review (reason 必須、reviewer)
 * - approve (reason 必須、reviewer)
 * - publish (reason=null, admin)
 * - withdraw (reason 必須、admin)
 *
 * created_at は makeAuditLog の FIXED_BASE_MS + ACTION_OFFSET でユニーク。
 */
function makeMixedAuditLogs(): ReadonlyArray<AuditLog> {
  return [
    makeAuditLog({
      actor_id: 'author-1',
      target_proposal_id: 'p-alpha',
      action: 'submit',
    }),
    makeAuditLog({
      actor_id: 'reviewer-x',
      target_proposal_id: 'p-alpha',
      action: 'start_review',
    }),
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
    makeAuditLog({
      actor_id: 'admin-x',
      target_proposal_id: 'p-beta',
      action: 'withdraw',
    }),
  ]
}

// ---------------------------------------------------------------------------
// 副作用 spy（authorize の呼び出し / console / repository.list 等）
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
 * AuditLogRepository を spy 付きで作る。`list` / `findById` / `listByTarget` /
 * `append` の呼び出し回数を検査する。
 */
function makeSpiedRepo(initial: ReadonlyArray<AuditLog>): {
  repo: AuditLogRepository
  listSpy: ReturnType<typeof vi.fn>
  findByIdSpy: ReturnType<typeof vi.fn>
  listByTargetSpy: ReturnType<typeof vi.fn>
  appendSpy: ReturnType<typeof vi.fn>
} {
  const inner = createInMemoryAuditLogRepository(initial)
  const listSpy = vi.fn(inner.list.bind(inner))
  const findByIdSpy = vi.fn(inner.findById.bind(inner))
  const listByTargetSpy = vi.fn(inner.listByTarget.bind(inner))
  const appendSpy = vi.fn(inner.append.bind(inner))
  const repo: AuditLogRepository = {
    list: listSpy,
    findById: findByIdSpy,
    listByTarget: listByTargetSpy,
    append: appendSpy,
  }
  return { repo, listSpy, findByIdSpy, listByTargetSpy, appendSpy }
}

// ---------------------------------------------------------------------------
// 1. guest → 401 AuthorizationError
// ---------------------------------------------------------------------------

describe('REQ-012 / API-016 / TEST-029: guest viewer (null) is rejected with 401', () => {
  it('REQ-012 / TEST-029: throws AuthorizationError for null viewer', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await expect(listAuditLogs(null, {}, { audit })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  it('REQ-012 / TEST-029: AuthorizationError carries reason=not_authenticated / httpStatus=401', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    let caught: unknown
    try {
      await listAuditLogs(null, {}, { audit })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AuthorizationError)
    const err = caught as AuthorizationError
    expect(err.reason).toBe('not_authenticated')
    expect(err.httpStatus).toBe(401)
    expect(err.errorCode).toBe('UNAUTHENTICATED')
  })

  it('NFR-003 / TEST-029: guest path does not access repository (no DB read on 401)', async () => {
    const { repo, listSpy, findByIdSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeMixedAuditLogs(),
    )

    await expect(listAuditLogs(null, {}, { audit: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(listSpy).not.toHaveBeenCalled()
    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. user / reviewer → 404 insufficient_role
// ---------------------------------------------------------------------------

describe('REQ-012 / API-016 / TEST-029: user / reviewer are rejected with 404 insufficient_role', () => {
  it.each([
    ['user', userViewer],
    ['reviewer', reviewerViewer],
  ] as const)(
    'REQ-012 / TEST-029: %s is rejected with reason=insufficient_role / httpStatus=404',
    async (_label, viewer) => {
      const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

      let caught: unknown
      try {
        await listAuditLogs(viewer, {}, { audit })
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

  it('NFR-003 / TEST-029: user / reviewer path does not access repository (no DB read on 404)', async () => {
    const { repo, listSpy, findByIdSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeMixedAuditLogs(),
    )

    await expect(listAuditLogs(userViewer, {}, { audit: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
    await expect(listAuditLogs(reviewerViewer, {}, { audit: repo })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(listSpy).not.toHaveBeenCalled()
    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. auditor / admin → 200、全件取得
// ---------------------------------------------------------------------------

describe('REQ-012 / API-016 / TEST-029: auditor / admin can list all audit logs', () => {
  it.each([
    ['auditor', auditorViewer],
    ['admin', adminViewer],
  ] as const)(
    'REQ-012 / TEST-029: %s sees all 5 entries with no filter',
    async (_label, viewer) => {
      const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

      const result = await listAuditLogs(viewer, {}, { audit })

      expect(result).toHaveLength(5)
    },
  )

  it('REQ-012 / TEST-029: empty repository returns []', async () => {
    const audit = createInMemoryAuditLogRepository([])

    const result = await listAuditLogs(auditorViewer, {}, { audit })

    expect(result).toEqual([])
  })

  it('REQ-012 / TEST-029: response sorted by created_at DESC (repository order preserved)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result.length).toBeGreaterThan(1)
    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1] as AuditLogSummary
      const curr = result[i] as AuditLogSummary
      expect(prev.created_at).toBeGreaterThanOrEqual(curr.created_at)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. フィルタ: actor_id / action / target_proposal_id / from / to / 複数 AND
// ---------------------------------------------------------------------------

describe('REQ-012 / API-016 / TEST-029: filters are applied (actor_id / action / target_proposal_id / from / to)', () => {
  it('REQ-012 / TEST-029: actor_id filter narrows to entries by that actor', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(
      auditorViewer,
      { actor_id: 'reviewer-x' },
      { audit },
    )

    expect(result).toHaveLength(2) // start_review + approve
    expect(result.every((e) => e.actor_id === 'reviewer-x')).toBe(true)
  })

  it('REQ-012 / TEST-029: action filter narrows to entries with that action', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(adminViewer, { action: 'approve' }, { audit })

    expect(result).toHaveLength(1)
    expect(result[0]?.action).toBe('approve')
  })

  it('REQ-012 / TEST-029: target_proposal_id filter narrows to entries on that proposal', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(
      auditorViewer,
      { target_proposal_id: 'p-beta' },
      { audit },
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.target_proposal_id).toBe('p-beta')
    expect(result[0]?.action).toBe('withdraw')
  })

  it('REQ-012 / TEST-029: from filter excludes entries with created_at < from', async () => {
    // makeAuditLog の FIXED_BASE_MS = 1_700_000_000_000
    // ACTION_OFFSET: submit=0 / start_review=1000 / approve=2000 / publish=5000 / withdraw=6000
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())
    const FROM = 1_700_000_002_000 // approve 以降のみ

    const result = await listAuditLogs(adminViewer, { from: FROM }, { audit })

    expect(result.every((e) => e.created_at >= FROM)).toBe(true)
    // approve / publish / withdraw の 3 件
    expect(result).toHaveLength(3)
    const actions = new Set(result.map((e) => e.action))
    expect(actions).toEqual(new Set(['approve', 'publish', 'withdraw']))
  })

  it('REQ-012 / TEST-029: to filter excludes entries with created_at >= to (exclusive upper bound)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())
    const TO = 1_700_000_002_000 // approve 以降を除外（submit / start_review のみ残る）

    const result = await listAuditLogs(adminViewer, { to: TO }, { audit })

    expect(result.every((e) => e.created_at < TO)).toBe(true)
    expect(result).toHaveLength(2)
    const actions = new Set(result.map((e) => e.action))
    expect(actions).toEqual(new Set(['submit', 'start_review']))
  })

  it('REQ-012 / TEST-029: from + to combined narrows to half-open range [from, to)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())
    // [start_review, publish) → start_review / approve のみ
    const FROM = 1_700_000_001_000
    const TO = 1_700_000_005_000

    const result = await listAuditLogs(adminViewer, { from: FROM, to: TO }, { audit })

    expect(result.every((e) => e.created_at >= FROM && e.created_at < TO)).toBe(true)
    expect(result).toHaveLength(2)
    const actions = new Set(result.map((e) => e.action))
    expect(actions).toEqual(new Set(['start_review', 'approve']))
  })

  it('REQ-012 / TEST-029: multiple filters combine with AND semantics', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(
      adminViewer,
      { actor_id: 'reviewer-x', action: 'approve', target_proposal_id: 'p-alpha' },
      { audit },
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.action).toBe('approve')
    expect(result[0]?.actor_id).toBe('reviewer-x')
    expect(result[0]?.target_proposal_id).toBe('p-alpha')
  })

  it('REQ-012 / TEST-029: filter that matches nothing returns []', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(
      auditorViewer,
      { actor_id: 'nobody-here' },
      { audit },
    )

    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5. NFR-005: reason 本文は API レスポンスに含まれない（reason_present のみ）
// ---------------------------------------------------------------------------

describe('NFR-005 / API-016 / TEST-029: reason body is never exposed; only reason_present is returned', () => {
  it('NFR-005 / TEST-029: entry with non-empty reason → reason_present=true', async () => {
    // makeAuditLog: reason 必須 action（start_review / approve 等）は 'tested-reason'
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog({
        actor_id: 'reviewer-x',
        target_proposal_id: 'p-1',
        action: 'approve',
      }),
    ])

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result).toHaveLength(1)
    expect(result[0]?.reason_present).toBe(true)
  })

  it('NFR-005 / TEST-029: entry with reason=null → reason_present=false', async () => {
    // submit / publish は reason 任意。makeAuditLog は reason=null をデフォルトで設定する。
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog({
        actor_id: 'admin-x',
        target_proposal_id: 'p-1',
        action: 'publish',
      }),
    ])

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result).toHaveLength(1)
    expect(result[0]?.reason_present).toBe(false)
  })

  it('NFR-005 / TEST-029: entry with whitespace-only reason → reason_present=false', async () => {
    // submit は reason 任意。'   ' (空白のみ) を上書きで渡す。
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'author-1',
          target_proposal_id: 'p-1',
          action: 'submit',
        },
        { reason: '   ' },
      ),
    ])

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result).toHaveLength(1)
    expect(result[0]?.reason_present).toBe(false)
  })

  it('NFR-005 / TEST-029: entry with tab/newline-only reason → reason_present=false', async () => {
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'author-1',
          target_proposal_id: 'p-1',
          action: 'submit',
        },
        { reason: '\t\n  \r\n' },
      ),
    ])

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result[0]?.reason_present).toBe(false)
  })

  it('NFR-005 / TEST-029: AuditLogSummary has NO `reason` property (Object.keys check)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result.length).toBeGreaterThan(0)
    for (const item of result) {
      // 構造的に reason プロパティが存在しないことを保証（NFR-005 PII 配慮）
      expect(Object.keys(item)).not.toContain('reason')
      expect(item).not.toHaveProperty('reason')
      // 念のため bracket access でも undefined を確認
      expect((item as unknown as Record<string, unknown>)['reason']).toBeUndefined()
    }
  })

  it('NFR-005 / TEST-029: JSON.stringify of result contains no reason text from repository', async () => {
    // repository には 'sensitive-reason-text' を含む reason を書き込む
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog(
        {
          actor_id: 'reviewer-x',
          target_proposal_id: 'p-1',
          action: 'approve',
        },
        { reason: 'sensitive-reason-text-MUST-NOT-LEAK' },
      ),
    ])

    const result = await listAuditLogs(adminViewer, {}, { audit })
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('sensitive-reason-text-MUST-NOT-LEAK')
    expect(serialized).not.toContain('"reason"')
    // reason_present は含まれる
    expect(serialized).toContain('reason_present')
    expect(serialized).toContain('"reason_present":true')
  })

  it('API-016 / TEST-029: each item carries the documented schema fields', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    const result = await listAuditLogs(adminViewer, {}, { audit })

    expect(result.length).toBeGreaterThan(0)
    for (const item of result) {
      expect(typeof item.audit_log_id).toBe('string')
      expect(typeof item.actor_id).toBe('string')
      expect(typeof item.actor_role).toBe('string')
      expect(typeof item.action).toBe('string')
      expect(typeof item.target_proposal_id).toBe('string')
      // before/after_status: ProposalStatus | null（MVP の全 action は status 遷移を伴う）
      expect(typeof item.before_status === 'string' || item.before_status === null).toBe(true)
      expect(typeof item.after_status === 'string' || item.after_status === null).toBe(true)
      // before/after_visibility: MVP では常に null
      expect(item.before_visibility).toBeNull()
      expect(item.after_visibility).toBeNull()
      // reason_present: boolean
      expect(typeof item.reason_present).toBe('boolean')
      // policy_agreement_id: string | null
      expect(
        item.policy_agreement_id === null
          || typeof item.policy_agreement_id === 'string',
      ).toBe(true)
      // created_at: number
      expect(typeof item.created_at).toBe('number')
    }
  })
})

// ---------------------------------------------------------------------------
// 6. 副作用なし: console / 多重 authorize / 不要な repository 呼び出し
// ---------------------------------------------------------------------------

describe('NFR-003 / API-016 / TEST-029: no unexpected side effects', () => {
  it('NFR-003 / TEST-029: no console output for happy path (auditor)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await listAuditLogs(auditorViewer, {}, { audit })

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-029: no console output for happy path (admin)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await listAuditLogs(adminViewer, {}, { audit })

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-029: no console output for 401 path', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await expect(listAuditLogs(null, {}, { audit })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-029: no console output for 404 path (user / reviewer)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await expect(listAuditLogs(userViewer, {}, { audit })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
    await expect(listAuditLogs(reviewerViewer, {}, { audit })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expectNoConsoleSideEffects()
  })

  it('NFR-003 / TEST-029: authorize() is called exactly once per invocation', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await listAuditLogs(auditorViewer, {}, { audit })

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(auditorViewer, 'list.auditLogs')
  })

  it('NFR-003 / TEST-029: authorize() is called exactly once even when it throws (no retry)', async () => {
    const audit = createInMemoryAuditLogRepository(makeMixedAuditLogs())

    await expect(listAuditLogs(null, {}, { audit })).rejects.toBeInstanceOf(
      AuthorizationError,
    )

    expect(authorizeSpy).toHaveBeenCalledTimes(1)
    expect(authorizeSpy).toHaveBeenCalledWith(null, 'list.auditLogs')
  })

  it('NFR-003 / TEST-029: only audit.list is called (other repository methods are not touched)', async () => {
    const { repo, listSpy, findByIdSpy, listByTargetSpy, appendSpy } = makeSpiedRepo(
      makeMixedAuditLogs(),
    )

    await listAuditLogs(adminViewer, { actor_id: 'admin-x' }, { audit: repo })

    expect(listSpy).toHaveBeenCalledTimes(1)
    // filter オブジェクトがそのまま渡されることを確認
    expect(listSpy).toHaveBeenCalledWith({ actor_id: 'admin-x' })
    expect(findByIdSpy).not.toHaveBeenCalled()
    expect(listByTargetSpy).not.toHaveBeenCalled()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('NFR-003 / TEST-029: empty filter object is passed through to repository', async () => {
    const { repo, listSpy } = makeSpiedRepo(makeMixedAuditLogs())

    await listAuditLogs(auditorViewer, {}, { audit: repo })

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledWith({})
  })
})
