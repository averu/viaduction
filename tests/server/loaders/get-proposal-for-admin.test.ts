// TEST-034 — getProposalForAdmin loader (API-021 / REQ-004 / REQ-005 / REQ-010 / UC-007 / UC-008 / UC-013 / DB-003 / DB-004)
//
// 検証観点（指示書準拠 + API-021 §レスポンス §audit_log_history との整合）:
//   1. guest（viewer === null）→ 401 not_authenticated
//   2. user / reviewer / auditor → 404 insufficient_role
//   3. admin × 全 8 status (draft / submitted / in_review / approved / returned / rejected /
//      published / withdrawn) → 200（withdrawn 含む経緯確認可、REQ-005 / API-021）
//   4. admin × 全 3 visibility (public / internal / private) → 200（admin 専権で全 visibility 可）
//   5. 不在 proposalId: viewer === null → 401 not_authenticated / admin → 404 insufficient_role
//   6. AuditLog 履歴:
//      - 0 件 → []
//      - 複数件（≦ 10）→ created_at ASC で全件
//      - N=10 を超える → 末尾（最新）10 件のみ
//      - 全 8 action（submit / start_review / approve / return / reject / publish /
//        withdraw / resubmit）が含まれる（admin は全 action 閲覧可）
//      - reason_present: reason 本文の有無のみ（reason 本体は API-021 §audit_log_history で
//        API-017 経由とされ本 API では返さない、NFR-005 PII 配慮）
//   7. read-only: 全パスで AuditLogRepository.append を呼ばない
//   8. 副作用: console.* なし、findById は常に 1 回、listByTarget は admin happy path で 1 回
//      （不在 / 認可拒否時は 0 回、最適化）
//
// 参照: docs/20-detail-design/apis/API-021.md（§認可 §レスポンス §audit_log_history）、
//       docs/02-requirements/02-functional-requirements.md REQ-004 / REQ-005 / REQ-010、
//       src/server/auth/authorize.ts (action='admin.viewProposal')、
//       src/server/audit/repository.ts (AuditLogRepository.listByTarget / makeAuditLog)、
//       src/server/repositories/proposals.ts (makeProposal)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROPOSAL_STATUSES, VISIBILITIES, type ProposalStatus } from '#/lib/domain/types'
import {
  createInMemoryAuditLogRepository,
  makeAuditLog,
  type AuditAction,
  type AuditLog,
  type AuditLogAppendInput,
  type AuditLogRepository,
} from '#/server/audit/repository'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import { getProposalForAdmin } from '#/server/loaders/get-proposal-for-admin'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
  type ProposalRepository,
} from '#/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const AUTHOR_ID = 'user-author'
const REVIEWER_ID = 'reviewer-1'
const ADMIN_ID = 'admin-1'
const AUDITOR_ID = 'auditor-1'
const OTHER_USER_ID = 'user-other'

const userViewer: Viewer = { user_id: OTHER_USER_ID, roles: ['user'] }
const reviewerViewer: Viewer = { user_id: REVIEWER_ID, roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: ADMIN_ID, roles: ['admin'] }
const auditorViewer: Viewer = { user_id: AUDITOR_ID, roles: ['auditor'] }

const ALL_AUDIT_ACTIONS: ReadonlyArray<AuditAction> = [
  'submit',
  'start_review',
  'approve',
  'return',
  'reject',
  'publish',
  'withdraw',
  'resubmit',
]

// ---------------------------------------------------------------------------
// console spy（副作用検査用）
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleInfoSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNoConsole(): void {
  expect(consoleLogSpy).not.toHaveBeenCalled()
  expect(consoleWarnSpy).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  expect(consoleInfoSpy).not.toHaveBeenCalled()
}

// ---------------------------------------------------------------------------
// 観測用ラッパ: 各 repository の呼び出し回数を数え、append 呼び出しを spy する
// ---------------------------------------------------------------------------

interface CountingDeps {
  proposals: ProposalRepository
  audit: AuditLogRepository
  findByIdCalls: () => number
  listByTargetCalls: () => number
  appendCalls: () => ReadonlyArray<AuditLogAppendInput>
}

function makeCountingDeps(args: {
  proposals: ReadonlyArray<Proposal>
  audit: ReadonlyArray<AuditLog>
}): CountingDeps {
  const innerProposals = createInMemoryProposalRepository(args.proposals)
  const innerAudit = createInMemoryAuditLogRepository(args.audit)

  let findByIdCount = 0
  let listByTargetCount = 0
  const appendInputs: AuditLogAppendInput[] = []

  const proposals: ProposalRepository = {
    insert: innerProposals.insert.bind(innerProposals),
    async findById(id) {
      findByIdCount += 1
      return innerProposals.findById(id)
    },
    listPublic: innerProposals.listPublic.bind(innerProposals),
    listByAuthor: innerProposals.listByAuthor.bind(innerProposals),
    listForReview: innerProposals.listForReview.bind(innerProposals),
    listAll: innerProposals.listAll.bind(innerProposals),
    updateWithLock: innerProposals.updateWithLock.bind(innerProposals),
  }

  const audit: AuditLogRepository = {
    async append(input) {
      // read-only loader でこのパスに到達したら検査で失敗させる。
      // ただしテスト fixture のセットアップで append したい場合は
      // createInMemoryAuditLogRepository の initial で渡しているため、
      // 本 spy は loader 経路のみを観測する。
      appendInputs.push(input)
      return innerAudit.append(input)
    },
    findById: innerAudit.findById.bind(innerAudit),
    list: innerAudit.list.bind(innerAudit),
    async listByTarget(targetProposalId) {
      listByTargetCount += 1
      return innerAudit.listByTarget(targetProposalId)
    },
  }

  return {
    proposals,
    audit,
    findByIdCalls: () => findByIdCount,
    listByTargetCalls: () => listByTargetCount,
    appendCalls: () => appendInputs,
  }
}

// ---------------------------------------------------------------------------
// 1. guest → 401 not_authenticated
// ---------------------------------------------------------------------------

describe('REQ-015 / API-021 / TEST-034: guest returns 401', () => {
  it('REQ-015 / TEST-034: guest viewer × existing proposal returns 401 not_authenticated', async () => {
    const id = 'guest-target'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'submitted',
      visibility: 'internal',
      id,
    })
    const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

    try {
      await getProposalForAdmin(null, id, deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
      expect(err.errorCode).toBe('UNAUTHENTICATED')
    }
    // 認可拒否時は AuditLog を読まない。
    expect(deps.listByTargetCalls()).toBe(0)
    expect(deps.appendCalls()).toHaveLength(0)
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 2. user / reviewer / auditor → 404 insufficient_role
// ---------------------------------------------------------------------------

describe('REQ-010 / API-021 / TEST-034: non-admin returns 404 insufficient_role', () => {
  it.each([
    ['user', userViewer],
    ['reviewer', reviewerViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-010 / TEST-034: %s × existing proposal returns 404 insufficient_role',
    async (label, viewer) => {
      const id = `forbidden-${label}`
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status: 'submitted',
        visibility: 'public',
        id,
      })
      const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

      try {
        await getProposalForAdmin(viewer, id, deps)
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('insufficient_role')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
      // 認可拒否時は listByTarget を呼ばない（ショートサーキット）。
      expect(deps.listByTargetCalls()).toBe(0)
      expect(deps.appendCalls()).toHaveLength(0)
      expectNoConsole()
    },
  )
})

// ---------------------------------------------------------------------------
// 3. admin × 全 8 status → 200（withdrawn 含む）
// ---------------------------------------------------------------------------

describe('REQ-005 / API-021 / TEST-034: admin returns 200 for all 8 statuses', () => {
  it.each(PROPOSAL_STATUSES.map((s) => [s] as const))(
    'REQ-005 / TEST-034: admin × status=%s returns 200',
    async (status) => {
      const id = `admin-status-${status}`
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status,
        visibility: 'internal',
        id,
      })
      const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

      const result = await getProposalForAdmin(adminViewer, id, deps)

      expect(result.id).toBe(id)
      expect(result.author_id).toBe(AUTHOR_ID)
      expect(result.status).toBe(status)
      expect(typeof result.body).toBe('string')
      expect(result.body.length).toBeGreaterThan(0)
      expect(result.audit_log_history).toEqual([])
      expect(deps.appendCalls()).toHaveLength(0)
      expectNoConsole()
    },
  )

  it('REQ-005 / TEST-034: admin × status=withdrawn returns 200 (not 404, vs API-013)', async () => {
    // API-013 (get-my-proposal) では withdrawn は 404 隠蔽だが、API-021 admin は経緯確認のため 200 を返す。
    const id = 'admin-withdrawn-explicit'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'withdrawn',
      visibility: 'public',
      id,
    })
    const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    expect(result.status).toBe('withdrawn')
    expect(result.withdrawn_at).not.toBeNull()
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 4. admin × 全 3 visibility → 200
// ---------------------------------------------------------------------------

describe('REQ-010 / API-021 / TEST-034: admin returns 200 for all 3 visibilities', () => {
  it.each(VISIBILITIES.map((v) => [v] as const))(
    'REQ-010 / TEST-034: admin × visibility=%s × status=submitted returns 200',
    async (visibility) => {
      const id = `admin-visibility-${visibility}`
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status: 'submitted',
        visibility,
        id,
      })
      const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

      const result = await getProposalForAdmin(adminViewer, id, deps)
      expect(result.id).toBe(id)
      expect(result.visibility).toBe(visibility)
      expect(result.status).toBe('submitted')
      expectNoConsole()
    },
  )
})

// ---------------------------------------------------------------------------
// 5. 不在 proposalId
// ---------------------------------------------------------------------------

describe('API-021 / TEST-034: missing proposalId', () => {
  it('API-021 / TEST-034: missing × guest returns 401 not_authenticated', async () => {
    const deps = makeCountingDeps({ proposals: [], audit: [] })

    try {
      await getProposalForAdmin(null, 'does-not-exist', deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
      expect(err.errorCode).toBe('UNAUTHENTICATED')
    }
    // 不在のため AuditLog 参照は発生しない（最適化）。
    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.listByTargetCalls()).toBe(0)
    expect(deps.appendCalls()).toHaveLength(0)
    expectNoConsole()
  })

  it('API-021 / TEST-034: missing × admin returns 404 insufficient_role', async () => {
    const deps = makeCountingDeps({ proposals: [], audit: [] })

    try {
      await getProposalForAdmin(adminViewer, 'does-not-exist', deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('insufficient_role')
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    }
    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.listByTargetCalls()).toBe(0)
    expect(deps.appendCalls()).toHaveLength(0)
    expectNoConsole()
  })

  it('API-021 / TEST-034: missing × non-admin (user) returns 404 insufficient_role', async () => {
    const deps = makeCountingDeps({ proposals: [], audit: [] })

    try {
      await getProposalForAdmin(userViewer, 'does-not-exist', deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('insufficient_role')
      expect(err.httpStatus).toBe(404)
    }
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 6. AuditLog 履歴
// ---------------------------------------------------------------------------

describe('API-021 / TEST-034: audit_log_history projection', () => {
  it('API-021 / TEST-034: 0 entries returns []', async () => {
    const id = 'history-empty'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'submitted',
      visibility: 'public',
      id,
    })
    const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    expect(result.audit_log_history).toEqual([])
    expect(deps.listByTargetCalls()).toBe(1)
    expectNoConsole()
  })

  it('API-021 / TEST-034: multiple entries (≦ N=10) are returned in created_at ASC', async () => {
    const id = 'history-asc'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'in_review',
      visibility: 'internal',
      id,
    })
    // 意図的に append 順序と created_at 逆相関にしておき、ASC ソートが効くか検証する。
    const submitLog = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' },
      { id: 'al-1-submit', created_at: 1_000_000 },
    )
    const startReviewLog = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'start_review' },
      { id: 'al-2-start', created_at: 2_000_000, reason: 'taking this' },
    )
    const returnLog = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'al-3-return', created_at: 3_000_000, reason: 'please revise' },
    )
    // initial seed 順序は逆順で渡すが listByTarget で created_at ASC に並ぶ想定。
    const deps = makeCountingDeps({
      proposals: [proposal],
      audit: [returnLog, submitLog, startReviewLog],
    })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    const ids = result.audit_log_history.map((e) => e.id)
    expect(ids).toEqual(['al-1-submit', 'al-2-start', 'al-3-return'])

    const createdAts = result.audit_log_history.map((e) => e.created_at)
    expect(createdAts).toEqual([1_000_000, 2_000_000, 3_000_000])

    // reason_present 検証: submit は reason_required 外で false、start_review / return は true
    const presents = result.audit_log_history.map((e) => e.reason_present)
    expect(presents).toEqual([false, true, true])
    expectNoConsole()
  })

  it('API-021 / TEST-034: more than N=10 entries are truncated to the latest 10 (ASC)', async () => {
    const id = 'history-truncate'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'in_review',
      visibility: 'public',
      id,
    })
    // 15 件の submit エントリを seed（status は不問、AuditLogRepository の append は status 整合のみ要求）
    const totalEntries = 15
    const seedEntries: AuditLog[] = []
    for (let i = 0; i < totalEntries; i += 1) {
      seedEntries.push(
        makeAuditLog(
          { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' },
          { id: `al-${String(i).padStart(2, '0')}`, created_at: 1_000 + i },
        ),
      )
    }
    const deps = makeCountingDeps({ proposals: [proposal], audit: seedEntries })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    expect(result.audit_log_history).toHaveLength(10)
    // 末尾 10 件 = id="al-05" ... "al-14"（最新側）
    const ids = result.audit_log_history.map((e) => e.id)
    expect(ids).toEqual([
      'al-05',
      'al-06',
      'al-07',
      'al-08',
      'al-09',
      'al-10',
      'al-11',
      'al-12',
      'al-13',
      'al-14',
    ])
    // ASC 並び（最も古い 'al-00'〜'al-04' は除外、最新 'al-14' が末尾）
    const createdAts = result.audit_log_history.map((e) => e.created_at)
    expect(createdAts).toEqual([1_005, 1_006, 1_007, 1_008, 1_009, 1_010, 1_011, 1_012, 1_013, 1_014])
    expectNoConsole()
  })

  it('API-021 / TEST-034: includes all 8 actions (admin can see every action type)', async () => {
    // admin は API-015 と異なり action フィルタを掛けないため、全 8 action がそのまま返る。
    const id = 'history-all-actions'
    // 全 8 action を含む 8 件 ≦ N=10 なので末尾 10 件抜粋でも全件残る。
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'withdrawn',
      visibility: 'public',
      id,
    })
    const seedEntries: ReadonlyArray<AuditLog> = ALL_AUDIT_ACTIONS.map((action, idx) =>
      makeAuditLog(
        { actor_id: AUTHOR_ID, target_proposal_id: id, action },
        { id: `al-${action}`, created_at: 1_000 + idx },
      ),
    )
    const deps = makeCountingDeps({ proposals: [proposal], audit: seedEntries })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    expect(result.audit_log_history).toHaveLength(8)
    const actions = result.audit_log_history.map((e) => e.action)
    expect(actions).toEqual([
      'submit',
      'start_review',
      'approve',
      'return',
      'reject',
      'publish',
      'withdraw',
      'resubmit',
    ])
    // 全 8 action が漏れなく含まれることを明示確認
    for (const action of ALL_AUDIT_ACTIONS) {
      expect(actions).toContain(action)
    }
    expectNoConsole()
  })

  it('API-021 / TEST-034: reason_present reflects only presence, never reason body (NFR-005)', async () => {
    // API-021 §audit_log_history で reason 本体は API-017 経由とされ、本 API では返さない。
    // AdminAuditLogHistoryItem に `reason` フィールドが存在しないことを構造的に検証する。
    const id = 'history-reason-redaction'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'returned',
      visibility: 'internal',
      id,
    })
    const submitLog = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' },
      { id: 'al-submit', created_at: 1_000, reason: null },
    )
    const returnLog = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'al-return', created_at: 2_000, reason: 'PII-sensitive content here' },
    )
    const deps = makeCountingDeps({
      proposals: [proposal],
      audit: [submitLog, returnLog],
    })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    expect(result.audit_log_history).toHaveLength(2)
    // reason_present のみ露出、reason 本文はキー自体が無いことを確認
    const submitItem = result.audit_log_history[0]
    const returnItem = result.audit_log_history[1]
    if (submitItem === undefined || returnItem === undefined) {
      throw new Error('expected 2 history items')
    }
    expect(submitItem.reason_present).toBe(false)
    expect(returnItem.reason_present).toBe(true)
    // reason フィールドはレスポンススキーマに存在しない（NFR-005 配慮）
    expect('reason' in submitItem).toBe(false)
    expect('reason' in returnItem).toBe(false)
    // JSON 直列化しても reason 本文が漏れないことを念のため検証
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('PII-sensitive content here')
    expectNoConsole()
  })

  it('API-021 / TEST-034: non-target_proposal_id audit logs are excluded by listByTarget', async () => {
    const id = 'history-target-isolation'
    const otherId = 'other-proposal'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'submitted',
      visibility: 'public',
      id,
    })
    const targetSubmit = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' },
      { id: 'al-target', created_at: 1_000 },
    )
    const otherSubmit = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: otherId, action: 'submit' },
      { id: 'al-other', created_at: 2_000 },
    )

    const deps = makeCountingDeps({
      proposals: [proposal],
      audit: [targetSubmit, otherSubmit],
    })

    const result = await getProposalForAdmin(adminViewer, id, deps)
    expect(result.audit_log_history).toHaveLength(1)
    const item = result.audit_log_history[0]
    if (item === undefined) {
      throw new Error('expected 1 history item')
    }
    expect(item.id).toBe('al-target')
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 7. read-only: AuditLogRepository.append が呼ばれない
// ---------------------------------------------------------------------------

describe('API-021 / TEST-034: read-only — audit.append is never called', () => {
  it('API-021 / TEST-034: admin happy path does not write AuditLog', async () => {
    const id = 'readonly-happy'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'submitted',
      visibility: 'internal',
      id,
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      audit: [
        makeAuditLog({ actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' }),
      ],
    })

    await getProposalForAdmin(adminViewer, id, deps)
    expect(deps.appendCalls()).toHaveLength(0)
    expectNoConsole()
  })

  it.each([
    ['guest', null],
    ['user', userViewer],
    ['reviewer', reviewerViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'API-021 / TEST-034: denied path (%s) does not write AuditLog',
    async (_label, viewer) => {
      const id = 'readonly-denied'
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status: 'submitted',
        visibility: 'public',
        id,
      })
      const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

      try {
        await getProposalForAdmin(viewer, id, deps)
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
      }
      expect(deps.appendCalls()).toHaveLength(0)
      expectNoConsole()
    },
  )

  it('API-021 / TEST-034: missing × admin does not write AuditLog', async () => {
    const deps = makeCountingDeps({ proposals: [], audit: [] })

    try {
      await getProposalForAdmin(adminViewer, 'does-not-exist', deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
    }
    expect(deps.appendCalls()).toHaveLength(0)
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 8. 副作用 / 呼び出し回数
// ---------------------------------------------------------------------------

describe('API-021 / TEST-034: side effects and repository call counts', () => {
  it('API-021 / TEST-034: happy path calls findById and listByTarget once each', async () => {
    const id = 'side-effects-happy'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'in_review',
      visibility: 'internal',
      id,
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      audit: [
        makeAuditLog({ actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' }),
      ],
    })

    await getProposalForAdmin(adminViewer, id, deps)

    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.listByTargetCalls()).toBe(1)
    expect(deps.appendCalls()).toHaveLength(0)
    expectNoConsole()
  })

  it('API-021 / TEST-034: authorize denial short-circuits before audit reads', async () => {
    const id = 'side-effects-auth-blocked'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'submitted',
      visibility: 'public',
      id,
    })
    const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

    try {
      await getProposalForAdmin(reviewerViewer, id, deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
    }

    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.listByTargetCalls()).toBe(0)
    expectNoConsole()
  })

  it.each(PROPOSAL_STATUSES.map((s) => [s] as const))(
    'API-021 / TEST-034: admin × status=%s does not produce console output',
    async (status: ProposalStatus) => {
      const id = `no-console-${status}`
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status,
        visibility: 'private',
        id,
      })
      const deps = makeCountingDeps({ proposals: [proposal], audit: [] })

      await getProposalForAdmin(adminViewer, id, deps)
      expectNoConsole()
    },
  )
})
