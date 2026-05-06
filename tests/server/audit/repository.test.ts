// TEST-010 — AuditLogRepository（append-only 強制 + factory）
// REQ-011 / REQ-012 / NFR-004 / BR-AUDIT-01 / BR-AUDIT-02 / BR-AUDIT-03 / DB-004
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIT_ACTIONS,
  AuditLogValidationError,
  REASON_REQUIRED_ACTIONS,
  createInMemoryAuditLogRepository,
  makeAuditLog,
  type AuditAction,
  type AuditLog,
  type AuditLogAppendInput,
  type AuditLogRepository,
} from '../../../src/server/audit/repository'
import * as repoModule from '../../../src/server/audit/repository'

const REPO_TS_PATH = fileURLToPath(
  new URL('../../../src/server/audit/repository.ts', import.meta.url),
)

const ACTOR = 'user-1'
const TARGET = 'proposal-1'

function baseInput(overrides: Partial<AuditLogAppendInput> = {}): AuditLogAppendInput {
  return {
    actor_id: ACTOR,
    actor_role: 'admin',
    action: 'publish',
    target_proposal_id: TARGET,
    before_status: 'approved',
    after_status: 'published',
    reason: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. append: 成功・id 採番・created_at
// ---------------------------------------------------------------------------
describe('REQ-011 / TEST-010: append', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-011 / TEST-010: append auto-generates id (UUID v4 形式) and sets created_at = Date.now()', async () => {
    const repo = createInMemoryAuditLogRepository()
    const entry = await repo.append(baseInput())
    expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(entry.created_at).toBe(new Date('2026-05-05T00:00:00.000Z').getTime())
  })

  it('REQ-011 / TEST-010: append requires all BR-AUDIT-01 fields and persists them verbatim', async () => {
    const repo = createInMemoryAuditLogRepository()
    const entry = await repo.append({
      actor_id: 'user-42',
      actor_role: 'reviewer,admin',
      action: 'approve',
      target_proposal_id: 'proposal-99',
      before_status: 'in_review',
      after_status: 'approved',
      reason: 'all good',
      policy_agreement_id: null,
    })
    expect(entry.actor_id).toBe('user-42')
    expect(entry.actor_role).toBe('reviewer,admin')
    expect(entry.action).toBe('approve')
    expect(entry.target_proposal_id).toBe('proposal-99')
    expect(entry.before_status).toBe('in_review')
    expect(entry.after_status).toBe('approved')
    expect(entry.reason).toBe('all good')
    expect(entry.before_visibility).toBeNull()
    expect(entry.after_visibility).toBeNull()
    expect(entry.policy_agreement_id).toBeNull()
  })

  it('REQ-011 / TEST-010: appended entry is observable via list()', async () => {
    const repo = createInMemoryAuditLogRepository()
    const entry = await repo.append(baseInput())
    const all = await repo.list()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe(entry.id)
  })

  it('REQ-011 / TEST-010: appended entry is observable via findById()', async () => {
    const repo = createInMemoryAuditLogRepository()
    const entry = await repo.append(baseInput())
    expect(await repo.findById(entry.id)).toEqual(entry)
  })

  it('REQ-011 / TEST-010: append accepts policy_agreement_id when provided (submit / resubmit)', async () => {
    const repo = createInMemoryAuditLogRepository()
    const entry = await repo.append({
      actor_id: ACTOR,
      actor_role: 'user',
      action: 'submit',
      target_proposal_id: TARGET,
      before_status: 'draft',
      after_status: 'submitted',
      reason: null,
      policy_agreement_id: 'pa-7',
    })
    expect(entry.policy_agreement_id).toBe('pa-7')
  })

  it('REQ-011 / TEST-010: append defaults before/after_visibility and policy_agreement_id to null when omitted', async () => {
    const repo = createInMemoryAuditLogRepository()
    const entry = await repo.append(baseInput())
    expect(entry.before_visibility).toBeNull()
    expect(entry.after_visibility).toBeNull()
    expect(entry.policy_agreement_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. append: validation
// ---------------------------------------------------------------------------
describe('BR-AUDIT-01 / TEST-010: append validation', () => {
  it.each(REASON_REQUIRED_ACTIONS)(
    'BR-REVIEW-01 / TEST-010: rejects null reason for action=%s',
    async (action) => {
      const repo = createInMemoryAuditLogRepository()
      await expect(
        repo.append(buildForReasonRequired(action, null)),
      ).rejects.toBeInstanceOf(AuditLogValidationError)
    },
  )

  it.each(REASON_REQUIRED_ACTIONS)(
    'BR-REVIEW-01 / TEST-010: rejects whitespace-only reason for action=%s',
    async (action) => {
      const repo = createInMemoryAuditLogRepository()
      await expect(
        repo.append(buildForReasonRequired(action, '   ')),
      ).rejects.toBeInstanceOf(AuditLogValidationError)
    },
  )

  it.each(REASON_REQUIRED_ACTIONS)(
    'BR-REVIEW-01 / TEST-010: accepts non-empty reason for action=%s',
    async (action) => {
      const repo = createInMemoryAuditLogRepository()
      const entry = await repo.append(buildForReasonRequired(action, 'reasoned'))
      expect(entry.reason).toBe('reasoned')
    },
  )

  it.each(['submit', 'publish', 'resubmit'] as const)(
    'Q-019 暫定 / TEST-010: accepts null reason for reason-optional action=%s',
    async (action) => {
      const repo = createInMemoryAuditLogRepository()
      const transition = TRANSITION[action]
      const entry = await repo.append({
        actor_id: ACTOR,
        actor_role: 'user',
        action,
        target_proposal_id: TARGET,
        before_status: transition.before,
        after_status: transition.after,
        reason: null,
      })
      expect(entry.reason).toBeNull()
    },
  )

  it('DB-004 §3 / TEST-010: rejects null before_status for status-transitioning action', async () => {
    const repo = createInMemoryAuditLogRepository()
    await expect(
      repo.append(baseInput({ before_status: null })),
    ).rejects.toBeInstanceOf(AuditLogValidationError)
  })

  it('DB-004 §3 / TEST-010: rejects null after_status for status-transitioning action', async () => {
    const repo = createInMemoryAuditLogRepository()
    await expect(
      repo.append(baseInput({ after_status: null })),
    ).rejects.toBeInstanceOf(AuditLogValidationError)
  })

  it('DB-004 §3 / TEST-010: rejects non-null before_visibility (MVP)', async () => {
    const repo = createInMemoryAuditLogRepository()
    await expect(
      repo.append(baseInput({ before_visibility: 'private' })),
    ).rejects.toBeInstanceOf(AuditLogValidationError)
  })

  it('DB-004 §3 / TEST-010: rejects non-null after_visibility (MVP)', async () => {
    const repo = createInMemoryAuditLogRepository()
    await expect(
      repo.append(baseInput({ after_visibility: 'public' })),
    ).rejects.toBeInstanceOf(AuditLogValidationError)
  })

  it('DB-004 §reason / TEST-010: rejects reason longer than 4000 chars', async () => {
    const repo = createInMemoryAuditLogRepository()
    const longReason = 'x'.repeat(4001)
    await expect(
      repo.append(buildForReasonRequired('approve', longReason)),
    ).rejects.toBeInstanceOf(AuditLogValidationError)
  })

  it('DB-004 §reason / TEST-010: accepts reason exactly 4000 chars', async () => {
    const repo = createInMemoryAuditLogRepository()
    const reason = 'x'.repeat(4000)
    const entry = await repo.append(buildForReasonRequired('approve', reason))
    expect(entry.reason?.length).toBe(4000)
  })

  it('DB-004 / TEST-010: AuditLogValidationError is instance of Error and has stable name', async () => {
    const repo = createInMemoryAuditLogRepository()
    try {
      await repo.append(baseInput({ action: 'approve', reason: null }))
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(AuditLogValidationError)
      expect((err as AuditLogValidationError).name).toBe('AuditLogValidationError')
      expect((err as AuditLogValidationError).field).toBe('reason')
      expect((err as AuditLogValidationError).action).toBe('approve')
      // PII（reason 本文 / actor_id）が含まれていないこと
      expect((err as AuditLogValidationError).message).not.toContain(ACTOR)
    }
  })

  it('NFR-004 / TEST-010: failed validation does not append any entry', async () => {
    const repo = createInMemoryAuditLogRepository()
    await expect(
      repo.append(baseInput({ action: 'approve', reason: null })),
    ).rejects.toBeInstanceOf(AuditLogValidationError)
    const all = await repo.list()
    expect(all).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3. append-only 構造的検証
// ---------------------------------------------------------------------------
describe('NFR-004 / BR-AUDIT-02 / TEST-010: append-only structural enforcement', () => {
  it('NFR-004 / TEST-010: repository instance has only the 4 allowed methods', () => {
    const repo = createInMemoryAuditLogRepository()
    const keys = Object.keys(repo).sort()
    expect(keys).toEqual(['append', 'findById', 'list', 'listByTarget'])
  })

  it('NFR-004 / TEST-010: source file does not export update/delete/etc-prefixed functions', () => {
    const src = readFileSync(REPO_TS_PATH, 'utf-8')
    expect(src).not.toMatch(
      /^export\s+(async\s+)?function\s+(update|patch|delete|remove|clear|reset|truncate|replace|overwrite|set)/m,
    )
  })

  it('NFR-004 / TEST-010: source file does not re-export forbidden names via export braces', () => {
    const src = readFileSync(REPO_TS_PATH, 'utf-8')
    expect(src).not.toMatch(
      /export\s*\{[^}]*\b(update|patch|delete|remove|clear|reset|truncate|replace|overwrite)\w*[^}]*\}/,
    )
  })

  it('NFR-004 / TEST-010: module exports do not contain update/delete-style symbols', () => {
    const exportNames = Object.keys(repoModule)
    for (const name of exportNames) {
      expect(name).not.toMatch(/^(update|patch|delete|remove|clear|reset|truncate|replace|overwrite)/)
    }
  })

  it('NFR-004 / TEST-010: list() returns a defensive copy (mutating the result must not affect repo)', async () => {
    const repo = createInMemoryAuditLogRepository()
    await repo.append(baseInput())
    const snapshot1 = await repo.list()
    expect(snapshot1).toHaveLength(1)
    // 戻り値は普通の配列でも内部 state とは別オブジェクトであるべき
    ;(snapshot1 as AuditLog[]).length = 0
    const snapshot2 = await repo.list()
    expect(snapshot2).toHaveLength(1)
  })

  it('NFR-004 / TEST-010: listByTarget() returns a defensive copy', async () => {
    const repo = createInMemoryAuditLogRepository()
    await repo.append(baseInput())
    const snapshot1 = await repo.listByTarget(TARGET)
    expect(snapshot1).toHaveLength(1)
    ;(snapshot1 as AuditLog[]).length = 0
    const snapshot2 = await repo.listByTarget(TARGET)
    expect(snapshot2).toHaveLength(1)
  })

  it('NFR-004 / TEST-010: read methods do not mutate internal state (id stable across reads)', async () => {
    const repo = createInMemoryAuditLogRepository()
    const e1 = await repo.append(baseInput())
    const before = await repo.list()
    await repo.list()
    await repo.findById(e1.id)
    await repo.listByTarget(TARGET)
    const after = await repo.list()
    expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id))
  })
})

// ---------------------------------------------------------------------------
// 4. list filter
// ---------------------------------------------------------------------------
describe('REQ-012 / TEST-010: list filter', () => {
  it('REQ-012 / TEST-010: no filter returns all entries in created_at DESC', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const all = await repo.list()
    expect(all.map((e) => e.id)).toEqual(['audit-3', 'audit-2', 'audit-1'])
  })

  it('REQ-012 / TEST-010: actor_id filter', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ actor_id: 'user-A' })
    expect(filtered.map((e) => e.id)).toEqual(['audit-2', 'audit-1'])
  })

  it('REQ-012 / TEST-010: action filter', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ action: 'approve' })
    expect(filtered.map((e) => e.id)).toEqual(['audit-2'])
  })

  it('REQ-012 / TEST-010: target_proposal_id filter', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ target_proposal_id: 'p-X' })
    expect(filtered.map((e) => e.id)).toEqual(['audit-3', 'audit-1'])
  })

  it('REQ-012 / TEST-010: from filter (>=)', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ from: 200 })
    expect(filtered.map((e) => e.id)).toEqual(['audit-3', 'audit-2'])
  })

  it('REQ-012 / TEST-010: to filter is exclusive (<)', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ to: 300 })
    expect(filtered.map((e) => e.id)).toEqual(['audit-2', 'audit-1'])
  })

  it('REQ-012 / TEST-010: combined filters (AND)', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ actor_id: 'user-A', action: 'submit' })
    expect(filtered.map((e) => e.id)).toEqual(['audit-1'])
  })

  it('REQ-012 / TEST-010: empty result when nothing matches', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.list({ actor_id: 'nope' })
    expect(filtered).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5. listByTarget
// ---------------------------------------------------------------------------
describe('API-015 / TEST-010: listByTarget', () => {
  it('API-015 / TEST-010: returns entries for target_proposal_id in created_at ASC', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.listByTarget('p-X')
    expect(filtered.map((e) => e.id)).toEqual(['audit-1', 'audit-3'])
    expect(filtered.map((e) => e.created_at)).toEqual([100, 300])
  })

  it('API-015 / TEST-010: returns empty array when target has no entries', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const filtered = await repo.listByTarget('nonexistent')
    expect(filtered).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 6. findById
// ---------------------------------------------------------------------------
describe('API-017 / TEST-010: findById', () => {
  it('API-017 / TEST-010: returns the entry when present', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const entry = await repo.findById('audit-2')
    expect(entry?.id).toBe('audit-2')
    expect(entry?.action).toBe('approve')
  })

  it('API-017 / TEST-010: returns null when absent', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    expect(await repo.findById('nonexistent')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. factory: action 別 status 整合
// ---------------------------------------------------------------------------
describe('DB-004 §3 / TEST-010: makeAuditLog factory', () => {
  const expected: Record<AuditAction, { before: string; after: string }> = {
    submit: { before: 'draft', after: 'submitted' },
    start_review: { before: 'submitted', after: 'in_review' },
    approve: { before: 'in_review', after: 'approved' },
    return: { before: 'in_review', after: 'returned' },
    reject: { before: 'in_review', after: 'rejected' },
    publish: { before: 'approved', after: 'published' },
    withdraw: { before: 'published', after: 'withdrawn' },
    resubmit: { before: 'returned', after: 'submitted' },
  }

  it.each(AUDIT_ACTIONS)('DB-004 §3 / TEST-010: factory yields valid status pair for %s', (action) => {
    const e = makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action })
    expect(e.before_status).toBe(expected[action].before)
    expect(e.after_status).toBe(expected[action].after)
  })

  it('DB-004 §2 / TEST-010: factory fills reason for reason-required actions and leaves null otherwise', () => {
    for (const action of AUDIT_ACTIONS) {
      const e = makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action })
      if ((REASON_REQUIRED_ACTIONS as ReadonlyArray<AuditAction>).includes(action)) {
        expect(e.reason).toBe('tested-reason')
      } else {
        expect(e.reason).toBeNull()
      }
    }
  })

  it('DB-004 §6 / TEST-010: factory sets policy_agreement_id only for submit/resubmit', () => {
    for (const action of AUDIT_ACTIONS) {
      const e = makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action })
      if (action === 'submit' || action === 'resubmit') {
        expect(e.policy_agreement_id).toBe('pa-1')
      } else {
        expect(e.policy_agreement_id).toBeNull()
      }
    }
  })

  it('DB-004 §3 / TEST-010: factory keeps before/after_visibility null (MVP)', () => {
    for (const action of AUDIT_ACTIONS) {
      const e = makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action })
      expect(e.before_visibility).toBeNull()
      expect(e.after_visibility).toBeNull()
    }
  })

  it('DB-004 §4 / TEST-010: factory assigns role consistent with action', () => {
    expect(makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action: 'submit' }).actor_role).toBe('user')
    expect(makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action: 'resubmit' }).actor_role).toBe('user')
    expect(makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action: 'start_review' }).actor_role).toBe(
      'reviewer',
    )
    expect(makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action: 'approve' }).actor_role).toBe(
      'reviewer',
    )
    expect(makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action: 'publish' }).actor_role).toBe('admin')
    expect(makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action: 'withdraw' }).actor_role).toBe('admin')
  })

  it('TEST-010: factory output passes through append validation', async () => {
    const repo = createInMemoryAuditLogRepository()
    for (const action of AUDIT_ACTIONS) {
      const fixture = makeAuditLog({ actor_id: ACTOR, target_proposal_id: TARGET, action })
      const saved = await repo.append({
        actor_id: fixture.actor_id,
        actor_role: fixture.actor_role,
        action: fixture.action,
        target_proposal_id: fixture.target_proposal_id,
        before_status: fixture.before_status,
        after_status: fixture.after_status,
        reason: fixture.reason,
        policy_agreement_id: fixture.policy_agreement_id,
      })
      expect(saved.action).toBe(action)
    }
  })

  it('TEST-010: factory accepts overrides', () => {
    const e = makeAuditLog(
      { actor_id: ACTOR, target_proposal_id: TARGET, action: 'submit' },
      { reason: 'kept', actor_role: 'user,admin' },
    )
    expect(e.reason).toBe('kept')
    expect(e.actor_role).toBe('user,admin')
  })
})

// ---------------------------------------------------------------------------
// 8. seed (initial) も append-only 検証を通す
// ---------------------------------------------------------------------------
describe('TEST-010: seeding via initial', () => {
  it('TEST-010: initial entries are observable in createdAt DESC', async () => {
    const repo = createInMemoryAuditLogRepository(seedThree())
    const all = await repo.list()
    expect(all).toHaveLength(3)
  })

  it('TEST-010: initial rejects duplicate ids', () => {
    const dup: AuditLog = makeAuditLog(
      { actor_id: ACTOR, target_proposal_id: TARGET, action: 'submit' },
      { id: 'audit-1' },
    )
    const dup2: AuditLog = makeAuditLog(
      { actor_id: ACTOR, target_proposal_id: TARGET, action: 'submit' },
      { id: 'audit-1', target_proposal_id: 'p-other' },
    )
    expect(() => createInMemoryAuditLogRepository([dup, dup2])).toThrow(AuditLogValidationError)
  })

  it('TEST-010: initial rejects entries that violate validation rules', () => {
    const bad: AuditLog = {
      id: 'audit-bad',
      actor_id: ACTOR,
      actor_role: 'reviewer',
      action: 'approve',
      target_proposal_id: TARGET,
      before_status: 'in_review',
      after_status: 'approved',
      before_visibility: null,
      after_visibility: null,
      reason: null, // approve は reason 必須
      policy_agreement_id: null,
      created_at: 100,
    }
    expect(() => createInMemoryAuditLogRepository([bad])).toThrow(AuditLogValidationError)
  })
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const TRANSITION = {
  submit: { before: 'draft', after: 'submitted' },
  start_review: { before: 'submitted', after: 'in_review' },
  approve: { before: 'in_review', after: 'approved' },
  return: { before: 'in_review', after: 'returned' },
  reject: { before: 'in_review', after: 'rejected' },
  publish: { before: 'approved', after: 'published' },
  withdraw: { before: 'published', after: 'withdrawn' },
  resubmit: { before: 'returned', after: 'submitted' },
} as const

function buildForReasonRequired(
  action: (typeof REASON_REQUIRED_ACTIONS)[number],
  reason: string | null,
): AuditLogAppendInput {
  const t = TRANSITION[action]
  return {
    actor_id: ACTOR,
    actor_role: 'reviewer',
    action,
    target_proposal_id: TARGET,
    before_status: t.before,
    after_status: t.after,
    reason,
  }
}

/**
 * テスト用シード:
 *   audit-1: user-A / submit / target=p-X / created_at=100
 *   audit-2: user-A / approve / target=p-Y / created_at=200
 *   audit-3: user-B / submit / target=p-X / created_at=300
 */
function seedThree(): ReadonlyArray<AuditLog> {
  return [
    makeAuditLog(
      { actor_id: 'user-A', target_proposal_id: 'p-X', action: 'submit' },
      { id: 'audit-1', created_at: 100 },
    ),
    makeAuditLog(
      { actor_id: 'user-A', target_proposal_id: 'p-Y', action: 'approve' },
      { id: 'audit-2', created_at: 200 },
    ),
    makeAuditLog(
      { actor_id: 'user-B', target_proposal_id: 'p-X', action: 'submit' },
      { id: 'audit-3', created_at: 300 },
    ),
  ]
}

// 利用しているけど未使用 import 検出を回避するためのダミー参照
void ({} as AuditLogRepository)
