// TEST-028 — getReviewProposal loader (API-015 / REQ-003 / REQ-009 / REQ-010 / REQ-011 / UC-003〜006 / DB-003 / DB-004 / DB-005)
//
// 検証観点（指示書準拠 + API-015 設計差分の追加）:
//   1. guest（viewer === null）→ 401 not_authenticated
//   2. user → 404 insufficient_role
//   3. auditor → 404 insufficient_role
//   4. reviewer × (public / internal) × (submitted / in_review) → 200 + audit_log_history
//   5. admin × 全 visibility × (submitted / in_review) → 200
//   6. reviewer + private → 404 insufficient_role（Q-016 暫定）
//   7. 不在 proposalId: viewer === null → 401 / reviewer → 404
//   8. status 範囲外（API-015 設計追加分）:
//      - status='submitted' / 'in_review' 以外（draft/approved/returned/rejected/published/withdrawn）
//        は reviewer / admin でも 404 not_owner_resource に集約（status_not_reviewable 隠蔽）
//      - guest + status 範囲外 → 401（認証要求が優先）
//   9. AuditLog 履歴:
//      - 0 件 → []
//      - 複数件 → created_at ASC
//      - reason が null / 文字列 / 空文字（空文字は append-time validation で弾かれるため initial seed のみ）
//      - action フィルタ: submit / return / resubmit のみ含み、start_review / approve / reject /
//        publish / withdraw は除外（API-015 §audit_log_history m-10 整理）
//  10. policy_version 解決: PolicyAgreementRepository.findByProposalId から取得
//      - 通常ケース: `mvp-initial` を反映
//      - current_policy_agreement_id が null（防御）→ 空文字
//  11. 副作用: console.* なし、findById / listByTarget / findByProposalId が各 1 回ずつ
//
// 参照: docs/20-detail-design/apis/API-015.md（§レスポンス §audit_log_history §認可拒否時の挙動）、
//       docs/02-requirements/02-functional-requirements.md REQ-003 / REQ-009 / REQ-010 / REQ-011、
//       src/server/auth/authorize.ts (action='get.reviewProposal')、
//       src/server/audit/repository.ts (AuditLogRepository.listByTarget / makeAuditLog)、
//       src/server/repositories/policy-agreements.ts (makePolicyAgreement)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInMemoryAuditLogRepository,
  makeAuditLog,
  type AuditAction,
  type AuditLog,
  type AuditLogRepository,
} from '#/server/audit/repository'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import { getReviewProposal } from '#/server/loaders/get-review-proposal'
import {
  createInMemoryPolicyAgreementRepository,
  makePolicyAgreement,
  type PolicyAgreement,
  type PolicyAgreementRepository,
} from '#/server/repositories/policy-agreements'
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

const NON_REVIEWABLE_STATUSES = [
  'draft',
  'approved',
  'returned',
  'rejected',
  'published',
  'withdrawn',
] as const

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
// 観測用ラッパ: 各 repository の呼び出し回数を数える
// ---------------------------------------------------------------------------

interface CountingDeps {
  proposals: ProposalRepository
  policyAgreements: PolicyAgreementRepository
  audit: AuditLogRepository
  findByIdCalls: () => number
  findByProposalIdCalls: () => number
  listByTargetCalls: () => number
}

function makeCountingDeps(args: {
  proposals: ReadonlyArray<Proposal>
  policyAgreements: ReadonlyArray<PolicyAgreement>
  audit: ReadonlyArray<AuditLog>
}): CountingDeps {
  const innerProposals = createInMemoryProposalRepository(args.proposals)
  const innerPolicy = createInMemoryPolicyAgreementRepository(args.policyAgreements)
  const innerAudit = createInMemoryAuditLogRepository(args.audit)

  let findByIdCount = 0
  let findByProposalIdCount = 0
  let listByTargetCount = 0

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

  const policyAgreements: PolicyAgreementRepository = {
    create: innerPolicy.create.bind(innerPolicy),
    async findByProposalId(proposalId) {
      findByProposalIdCount += 1
      return innerPolicy.findByProposalId(proposalId)
    },
    findLatestByUser: innerPolicy.findLatestByUser.bind(innerPolicy),
  }

  const audit: AuditLogRepository = {
    append: innerAudit.append.bind(innerAudit),
    findById: innerAudit.findById.bind(innerAudit),
    list: innerAudit.list.bind(innerAudit),
    async listByTarget(targetProposalId) {
      listByTargetCount += 1
      return innerAudit.listByTarget(targetProposalId)
    },
  }

  return {
    proposals,
    policyAgreements,
    audit,
    findByIdCalls: () => findByIdCount,
    findByProposalIdCalls: () => findByProposalIdCount,
    listByTargetCalls: () => listByTargetCount,
  }
}

/** 共通: submitted / in_review の proposal を 1 件 + 対応する PolicyAgreement を作る。 */
function makeReviewableSetup(args: {
  id: string
  status: 'submitted' | 'in_review'
  visibility: 'private' | 'internal' | 'public'
}): { proposal: Proposal; agreement: PolicyAgreement } {
  const proposal = makeProposal({
    author_id: AUTHOR_ID,
    status: args.status,
    visibility: args.visibility,
    id: args.id,
  })
  const agreement = makePolicyAgreement(
    { user_id: AUTHOR_ID, proposal_id: args.id },
    {
      id: `pa-${args.id}`,
      policy_version: 'mvp-initial',
    },
  )
  return { proposal, agreement }
}

// ---------------------------------------------------------------------------
// 1. guest → 401 not_authenticated
// ---------------------------------------------------------------------------

describe('REQ-015 / API-015 / TEST-028: guest returns 401', () => {
  it('REQ-015 / TEST-028: guest viewer × existing reviewable proposal returns 401 not_authenticated', async () => {
    const id = 'guest-target'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'submitted',
      visibility: 'internal',
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: [],
    })

    try {
      await getReviewProposal(null, id, deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
      expect(err.errorCode).toBe('UNAUTHENTICATED')
    }
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 2. user → 404 insufficient_role
// 3. auditor → 404 insufficient_role
// ---------------------------------------------------------------------------

describe('REQ-015 / API-015 / TEST-028: user / auditor return 404 insufficient_role', () => {
  it.each([
    ['user', userViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-015 / TEST-028: %s × reviewable proposal returns 404 insufficient_role',
    async (_label, viewer) => {
      const id = `forbidden-${_label}`
      const { proposal, agreement } = makeReviewableSetup({
        id,
        status: 'submitted',
        visibility: 'internal',
      })
      const deps = makeCountingDeps({
        proposals: [proposal],
        policyAgreements: [agreement],
        audit: [],
      })

      try {
        await getReviewProposal(viewer, id, deps)
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('insufficient_role')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
      expectNoConsole()
    },
  )
})

// ---------------------------------------------------------------------------
// 4. reviewer × (public / internal) × (submitted / in_review) → 200
// ---------------------------------------------------------------------------

describe('REQ-009 / API-015 / TEST-028: reviewer happy path returns 200', () => {
  it.each([
    ['public', 'submitted'],
    ['public', 'in_review'],
    ['internal', 'submitted'],
    ['internal', 'in_review'],
  ] as const)(
    'REQ-009 / TEST-028: reviewer × visibility=%s × status=%s returns 200 with body and history',
    async (visibility, status) => {
      const id = `reviewer-${visibility}-${status}`
      const { proposal, agreement } = makeReviewableSetup({ id, status, visibility })
      // submit エントリ 1 件を入れる（履歴の存在確認用）。
      const submitLog = makeAuditLog({
        actor_id: AUTHOR_ID,
        target_proposal_id: id,
        action: 'submit',
      })
      const deps = makeCountingDeps({
        proposals: [proposal],
        policyAgreements: [agreement],
        audit: [submitLog],
      })

      const result = await getReviewProposal(reviewerViewer, id, deps)

      expect(result.proposal_id).toBe(id)
      expect(result.author_id).toBe(AUTHOR_ID)
      expect(result.visibility).toBe(visibility)
      expect(result.status).toBe(status)
      expect(typeof result.body).toBe('string')
      expect(result.body.length).toBeGreaterThan(0)
      expect(result.policy_version).toBe('mvp-initial')
      const history = result.audit_log_history
      expect(history).toHaveLength(1)
      expect(history[0]?.action).toBe('submit')
      expect(history[0]?.audit_log_id).toBe(submitLog.id)
      expectNoConsole()
    },
  )
})

// ---------------------------------------------------------------------------
// 5. admin × 全 visibility × (submitted / in_review) → 200
// ---------------------------------------------------------------------------

describe('REQ-010 / API-015 / TEST-028: admin returns 200 for all visibilities', () => {
  it.each([
    ['private', 'submitted'],
    ['private', 'in_review'],
    ['internal', 'submitted'],
    ['internal', 'in_review'],
    ['public', 'submitted'],
    ['public', 'in_review'],
  ] as const)(
    'REQ-010 / TEST-028: admin × visibility=%s × status=%s returns 200',
    async (visibility, status) => {
      const id = `admin-${visibility}-${status}`
      const { proposal, agreement } = makeReviewableSetup({ id, status, visibility })
      const deps = makeCountingDeps({
        proposals: [proposal],
        policyAgreements: [agreement],
        audit: [],
      })

      const result = await getReviewProposal(adminViewer, id, deps)

      expect(result.proposal_id).toBe(id)
      expect(result.visibility).toBe(visibility)
      expect(result.status).toBe(status)
      expect(result.audit_log_history).toEqual([])
      expectNoConsole()
    },
  )
})

// ---------------------------------------------------------------------------
// 6. reviewer + private → 404 insufficient_role（Q-016 暫定）
// ---------------------------------------------------------------------------

describe('REQ-009 / API-015 / TEST-028: reviewer + private blocked (Q-016)', () => {
  it.each([['submitted'], ['in_review']] as const)(
    'REQ-009 / TEST-028: reviewer × private × status=%s returns 404 insufficient_role',
    async (status) => {
      const id = `reviewer-private-${status}`
      const { proposal, agreement } = makeReviewableSetup({
        id,
        status,
        visibility: 'private',
      })
      const deps = makeCountingDeps({
        proposals: [proposal],
        policyAgreements: [agreement],
        audit: [],
      })

      try {
        await getReviewProposal(reviewerViewer, id, deps)
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('insufficient_role')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
      expectNoConsole()
    },
  )
})

// ---------------------------------------------------------------------------
// 7. 不在 proposalId
// ---------------------------------------------------------------------------

describe('API-015 / TEST-028: missing proposalId', () => {
  it('API-015 / TEST-028: missing × guest returns 401 not_authenticated', async () => {
    const deps = makeCountingDeps({
      proposals: [],
      policyAgreements: [],
      audit: [],
    })

    try {
      await getReviewProposal(null, 'does-not-exist', deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
      expect(err.errorCode).toBe('UNAUTHENTICATED')
    }
    // 不在のため AuditLog / PolicyAgreement の参照は発生しない（最適化）。
    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.findByProposalIdCalls()).toBe(0)
    expect(deps.listByTargetCalls()).toBe(0)
    expectNoConsole()
  })

  it('API-015 / TEST-028: missing × reviewer returns 404 not_owner_resource', async () => {
    const deps = makeCountingDeps({
      proposals: [],
      policyAgreements: [],
      audit: [],
    })

    try {
      await getReviewProposal(reviewerViewer, 'does-not-exist', deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_owner_resource')
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    }
    expect(deps.findByProposalIdCalls()).toBe(0)
    expect(deps.listByTargetCalls()).toBe(0)
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 8. status 範囲外（API-015 §認可拒否時の挙動 status_not_reviewable）
// ---------------------------------------------------------------------------

describe('API-015 / TEST-028: non-reviewable status returns 404', () => {
  it.each(NON_REVIEWABLE_STATUSES)(
    'API-015 / TEST-028: status=%s × reviewer returns 404 not_owner_resource (status_not_reviewable)',
    async (status) => {
      const id = `nonreviewable-${status}`
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status,
        visibility: 'internal',
        id,
      })
      const deps = makeCountingDeps({
        proposals: [proposal],
        policyAgreements: [],
        audit: [],
      })

      try {
        await getReviewProposal(reviewerViewer, id, deps)
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_owner_resource')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
      expectNoConsole()
    },
  )

  it.each(NON_REVIEWABLE_STATUSES)(
    'API-015 / TEST-028: status=%s × admin returns 404 not_owner_resource',
    async (status) => {
      const id = `admin-nonreviewable-${status}`
      const proposal = makeProposal({
        author_id: AUTHOR_ID,
        status,
        visibility: 'public',
        id,
      })
      const deps = makeCountingDeps({
        proposals: [proposal],
        policyAgreements: [],
        audit: [],
      })

      try {
        await getReviewProposal(adminViewer, id, deps)
        throw new Error('expected AuthorizationError')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_owner_resource')
        expect(err.httpStatus).toBe(404)
        expect(err.errorCode).toBe('NOT_FOUND')
      }
      expectNoConsole()
    },
  )

  it('API-015 / TEST-028: status=draft × guest returns 401 not_authenticated', async () => {
    const id = 'guest-draft'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'draft',
      visibility: 'internal',
      id,
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [],
      audit: [],
    })

    try {
      await getReviewProposal(null, id, deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
      const err = e as AuthorizationError
      expect(err.reason).toBe('not_authenticated')
      expect(err.httpStatus).toBe(401)
    }
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 9. AuditLog 履歴
// ---------------------------------------------------------------------------

describe('API-015 / TEST-028: audit_log_history projection', () => {
  it('API-015 / TEST-028: 0 entries returns []', async () => {
    const id = 'history-empty'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'submitted',
      visibility: 'internal',
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: [],
    })

    const result = await getReviewProposal(reviewerViewer, id, deps)
    expect(result.audit_log_history).toEqual([])
    expectNoConsole()
  })

  it('API-015 / TEST-028: multiple entries are sorted created_at ASC', async () => {
    const id = 'history-asc'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'submitted',
      visibility: 'public',
    })
    // 意図的に append 順序と created_at 逆相関にしておき、ASC ソートが効くか検証する。
    const submitLog = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' },
      { id: 'al-1-submit', created_at: 1_000_000 },
    )
    const returnLog = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'al-2-return', created_at: 2_000_000, reason: 'please revise' },
    )
    const resubmitLog = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'resubmit' },
      { id: 'al-3-resubmit', created_at: 3_000_000 },
    )
    // initial seed 順序は逆順で渡すが listByTarget で created_at ASC に並ぶ想定。
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: [resubmitLog, submitLog, returnLog],
    })

    const result = await getReviewProposal(reviewerViewer, id, deps)
    const ids = result.audit_log_history.map((e) => e.audit_log_id)
    expect(ids).toEqual(['al-1-submit', 'al-2-return', 'al-3-resubmit'])

    const createdAts = result.audit_log_history.map((e) => e.created_at)
    expect(createdAts).toEqual([1_000_000, 2_000_000, 3_000_000])
    expectNoConsole()
  })

  it('API-015 / TEST-028: reason null and string are both passed through', async () => {
    const id = 'history-reason-mix'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'in_review',
      visibility: 'internal',
    })
    const submitLog = makeAuditLog(
      { actor_id: AUTHOR_ID, target_proposal_id: id, action: 'submit' },
      { id: 'al-submit', created_at: 1_000, reason: null },
    )
    const returnLog = makeAuditLog(
      { actor_id: REVIEWER_ID, target_proposal_id: id, action: 'return' },
      { id: 'al-return', created_at: 2_000, reason: 'please revise wording' },
    )
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: [submitLog, returnLog],
    })

    const result = await getReviewProposal(reviewerViewer, id, deps)
    const history = result.audit_log_history
    expect(history).toHaveLength(2)
    expect(history[0]?.reason).toBeNull()
    expect(history[1]?.reason).toBe('please revise wording')
    expectNoConsole()
  })

  it('API-015 / TEST-028: filters out non-display actions (start_review / approve / reject / publish / withdraw)', async () => {
    // 全 8 action のエントリを seed したうえで、submit / return / resubmit のみが返ることを確認する。
    // ただし本 API は submitted / in_review のみ受理するため、proposal は in_review にしておき、
    // AuditLog エントリは履歴抜粋として「過去にあったもの」として全種を seed する
    // （AuditLog のシード時 validation は status 遷移整合のみ要求し、proposal の現在 status との整合は問わない）。
    const id = 'history-action-filter'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'in_review',
      visibility: 'public',
    })
    const allActions: ReadonlyArray<AuditAction> = [
      'submit',
      'start_review',
      'approve',
      'return',
      'reject',
      'publish',
      'withdraw',
      'resubmit',
    ]
    const seedEntries: ReadonlyArray<AuditLog> = allActions.map((action, idx) =>
      makeAuditLog(
        { actor_id: AUTHOR_ID, target_proposal_id: id, action },
        { id: `al-${action}`, created_at: 1_000 + idx },
      ),
    )

    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: seedEntries,
    })

    const result = await getReviewProposal(reviewerViewer, id, deps)
    const actions = result.audit_log_history.map((e) => e.action)
    expect(actions).toEqual(['submit', 'return', 'resubmit'])
    // start_review / approve / reject / publish / withdraw が含まれていないことを明示確認
    expect(actions).not.toContain('start_review')
    expect(actions).not.toContain('approve')
    expect(actions).not.toContain('reject')
    expect(actions).not.toContain('publish')
    expect(actions).not.toContain('withdraw')
    expectNoConsole()
  })

  it('API-015 / TEST-028: non-target_proposal_id audit logs are excluded by listByTarget', async () => {
    const id = 'history-target-isolation'
    const otherId = 'other-proposal'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'submitted',
      visibility: 'internal',
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
      policyAgreements: [agreement],
      audit: [targetSubmit, otherSubmit],
    })

    const result = await getReviewProposal(reviewerViewer, id, deps)
    const history = result.audit_log_history
    expect(history).toHaveLength(1)
    expect(history[0]?.audit_log_id).toBe('al-target')
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 10. policy_version 解決
// ---------------------------------------------------------------------------

describe('API-015 / TEST-028: policy_version resolution', () => {
  it('API-015 / TEST-028: policy_version is sourced from PolicyAgreementRepository.findByProposalId', async () => {
    const id = 'policy-version-target'
    const { proposal } = makeReviewableSetup({
      id,
      status: 'submitted',
      visibility: 'internal',
    })
    const customAgreement = makePolicyAgreement(
      { user_id: AUTHOR_ID, proposal_id: id },
      { id: `pa-${id}`, policy_version: 'mvp-initial' },
    )
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [customAgreement],
      audit: [],
    })

    const result = await getReviewProposal(adminViewer, id, deps)
    expect(result.policy_version).toBe('mvp-initial')
    expect(result.current_policy_agreement_id).toBe(`pa-${id}`)
    expectNoConsole()
  })

  it('API-015 / TEST-028: missing PolicyAgreement falls back to empty string (defensive)', async () => {
    // 本来 submitted 以降は policy_agreement 必須だが、防御的フォールバックの検証。
    // proposal.current_policy_agreement_id を null に上書きして、findByProposalId が呼ばれない経路を確認する。
    const id = 'policy-version-null'
    const proposal = makeProposal(
      {
        author_id: AUTHOR_ID,
        status: 'submitted',
        visibility: 'public',
        id,
      },
      { current_policy_agreement_id: null },
    )
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [],
      audit: [],
    })

    const result = await getReviewProposal(reviewerViewer, id, deps)
    expect(result.policy_version).toBe('')
    expect(result.current_policy_agreement_id).toBeNull()
    // current_policy_agreement_id が null の場合は findByProposalId を呼ばない最適化が効くことを確認。
    expect(deps.findByProposalIdCalls()).toBe(0)
    expectNoConsole()
  })
})

// ---------------------------------------------------------------------------
// 11. 副作用 / 呼び出し回数
// ---------------------------------------------------------------------------

describe('API-015 / TEST-028: side effects and repository call counts', () => {
  it('API-015 / TEST-028: happy path calls findById / findByProposalId / listByTarget once each', async () => {
    const id = 'side-effects-happy'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'in_review',
      visibility: 'internal',
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: [
        makeAuditLog({
          actor_id: AUTHOR_ID,
          target_proposal_id: id,
          action: 'submit',
        }),
      ],
    })

    await getReviewProposal(reviewerViewer, id, deps)

    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.findByProposalIdCalls()).toBe(1)
    expect(deps.listByTargetCalls()).toBe(1)
    expectNoConsole()
  })

  it('API-015 / TEST-028: status range filter short-circuits before audit / policy reads', async () => {
    const id = 'side-effects-status-blocked'
    const proposal = makeProposal({
      author_id: AUTHOR_ID,
      status: 'approved',
      visibility: 'internal',
      id,
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [],
      audit: [],
    })

    try {
      await getReviewProposal(reviewerViewer, id, deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
    }

    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.findByProposalIdCalls()).toBe(0)
    expect(deps.listByTargetCalls()).toBe(0)
    expectNoConsole()
  })

  it('API-015 / TEST-028: authorize denial short-circuits before audit / policy reads', async () => {
    const id = 'side-effects-auth-blocked'
    const { proposal, agreement } = makeReviewableSetup({
      id,
      status: 'submitted',
      visibility: 'internal',
    })
    const deps = makeCountingDeps({
      proposals: [proposal],
      policyAgreements: [agreement],
      audit: [],
    })

    try {
      await getReviewProposal(userViewer, id, deps)
      throw new Error('expected AuthorizationError')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError)
    }

    expect(deps.findByIdCalls()).toBe(1)
    expect(deps.findByProposalIdCalls()).toBe(0)
    expect(deps.listByTargetCalls()).toBe(0)
    expectNoConsole()
  })
})
