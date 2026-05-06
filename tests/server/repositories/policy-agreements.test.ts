// TEST-011 — PolicyAgreementRepository（インメモリ実装 + factory）
// REQ-002 / REQ-013 / REQ-014 / DB-005 / BR-GUARD-02
// Q-018 暫定方針「再提出時は新規生成しない」と整合。proposal_id 単独 UNIQUE。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInMemoryPolicyAgreementRepository,
  makePolicyAgreement,
  PolicyAgreementConflictError,
  PolicyAgreementValidationError,
  type PolicyAgreement,
  type PolicyAgreementRepository,
} from '../../../src/server/repositories/policy-agreements'

const USER_A = 'user-author-1'
const USER_B = 'user-author-2'
const PROPOSAL_1 = 'proposal-1'
const PROPOSAL_2 = 'proposal-2'
const PROPOSAL_3 = 'proposal-3'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// 1. create 成功
// ---------------------------------------------------------------------------
describe('REQ-002 / TEST-011: create (success)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REQ-002 / TEST-011: create auto-generates id (UUID v4/v7 相当)', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    expect(created.id).toMatch(UUID_REGEX)
  })

  it('REQ-002 / TEST-011: create sets agreed_at = Date.now()', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    expect(created.agreed_at).toBe(new Date('2026-05-05T00:00:00.000Z').getTime())
  })

  it('REQ-002 / TEST-011: created row is observable via findByProposalId', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    const found = await repo.findByProposalId(PROPOSAL_1)
    expect(found).toEqual(created)
  })

  it('REQ-002 / TEST-011: create preserves user_id / proposal_id / policy_version verbatim', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    expect(created.user_id).toBe(USER_A)
    expect(created.proposal_id).toBe(PROPOSAL_1)
    expect(created.policy_version).toBe('mvp-initial')
  })
})

// ---------------------------------------------------------------------------
// 2. create 重複（proposal_id 単独 UNIQUE / DB-005 §不変条件 1）
// ---------------------------------------------------------------------------
describe('BR-GUARD-02 / TEST-011: create (conflict on proposal_id)', () => {
  // Q-018 暫定: 再提出時は INSERT しないため、同一 proposal_id の 2 回目 create は
  // フェイルセーフとして拒否される。Q-018 確定（再取得必須となった場合）で再評価する。
  it('BR-GUARD-02 / TEST-011: throws PolicyAgreementConflictError on duplicate proposal_id', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    await expect(
      repo.create({
        user_id: USER_A,
        proposal_id: PROPOSAL_1,
        policy_version: 'mvp-initial',
      }),
    ).rejects.toBeInstanceOf(PolicyAgreementConflictError)
  })

  it('BR-GUARD-02 / TEST-011: conflict carries proposalId attribute', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    await expect(
      repo.create({
        user_id: USER_B,
        proposal_id: PROPOSAL_1,
        policy_version: 'mvp-initial',
      }),
    ).rejects.toMatchObject({ proposalId: PROPOSAL_1 })
  })

  it('BR-GUARD-02 / TEST-011: different proposal_id is allowed for same user', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    const second = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_2,
      policy_version: 'mvp-initial',
    })
    expect(second.proposal_id).toBe(PROPOSAL_2)
  })
})

// ---------------------------------------------------------------------------
// 3. create バリデーション（PolicyAgreementValidationError）
// ---------------------------------------------------------------------------
describe('REQ-014 / TEST-011: create (validation)', () => {
  it('REQ-014 / TEST-011: rejects empty proposal_id', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await expect(
      repo.create({ user_id: USER_A, proposal_id: '', policy_version: 'mvp-initial' }),
    ).rejects.toBeInstanceOf(PolicyAgreementValidationError)
  })

  it('REQ-014 / TEST-011: rejects whitespace-only proposal_id', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await expect(
      repo.create({ user_id: USER_A, proposal_id: '   ', policy_version: 'mvp-initial' }),
    ).rejects.toMatchObject({ field: 'proposal_id' })
  })

  it('REQ-014 / TEST-011: rejects empty user_id', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await expect(
      repo.create({ user_id: '', proposal_id: PROPOSAL_1, policy_version: 'mvp-initial' }),
    ).rejects.toMatchObject({ field: 'user_id' })
  })

  it('REQ-014 / TEST-011: rejects whitespace-only user_id', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await expect(
      repo.create({ user_id: '\t  \n', proposal_id: PROPOSAL_1, policy_version: 'mvp-initial' }),
    ).rejects.toMatchObject({ field: 'user_id' })
  })

  it('REQ-014 / TEST-011: rejects empty policy_version', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await expect(
      repo.create({ user_id: USER_A, proposal_id: PROPOSAL_1, policy_version: '' }),
    ).rejects.toMatchObject({ field: 'policy_version' })
  })

  it('REQ-014 / TEST-011: rejects policy_version longer than 64 chars (DB-005 §カラム)', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const tooLong = 'a'.repeat(65)
    await expect(
      repo.create({ user_id: USER_A, proposal_id: PROPOSAL_1, policy_version: tooLong }),
    ).rejects.toMatchObject({ field: 'policy_version' })
  })

  it('REQ-014 / TEST-011: rejects policy_version with disallowed characters', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await expect(
      repo.create({ user_id: USER_A, proposal_id: PROPOSAL_1, policy_version: 'mvp initial' }),
    ).rejects.toMatchObject({ field: 'policy_version' })
    await expect(
      repo.create({
        user_id: USER_A,
        proposal_id: PROPOSAL_2,
        policy_version: 'mvp/initial',
      }),
    ).rejects.toMatchObject({ field: 'policy_version' })
  })

  it('REQ-014 / TEST-011: accepts mvp-initial (Q-008 暫定値)', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    expect(created.policy_version).toBe('mvp-initial')
  })

  it('REQ-014 / TEST-011: accepts SemVer-like and date-based policy_version', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const a = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: '1.0.0',
    })
    const b = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_2,
      policy_version: '2026-05-05',
    })
    const c = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_3,
      policy_version: 'v1_0_0-alpha',
    })
    expect(a.policy_version).toBe('1.0.0')
    expect(b.policy_version).toBe('2026-05-05')
    expect(c.policy_version).toBe('v1_0_0-alpha')
  })

  it('REQ-014 / TEST-011: accepts policy_version of exactly 64 chars', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const exactly64 = 'a'.repeat(64)
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: exactly64,
    })
    expect(created.policy_version).toBe(exactly64)
  })
})

// ---------------------------------------------------------------------------
// 4. findByProposalId
// ---------------------------------------------------------------------------
describe('API-002 / API-009 / TEST-011: findByProposalId', () => {
  it('API-002 / TEST-011: returns the row when present', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    const found = await repo.findByProposalId(PROPOSAL_1)
    expect(found).toEqual(created)
  })

  it('API-009 / TEST-011: returns null when absent', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const found = await repo.findByProposalId(PROPOSAL_1)
    expect(found).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. findLatestByUser
// ---------------------------------------------------------------------------
describe('DB-005 / TEST-011: findLatestByUser', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('DB-005 / TEST-011: returns the most recently agreed row for the user', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'))
    await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'))
    const latestForA = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_2,
      policy_version: 'mvp-initial',
    })
    vi.setSystemTime(new Date('2026-05-02T00:00:00.000Z'))
    await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_3,
      policy_version: 'mvp-initial',
    })

    const found = await repo.findLatestByUser(USER_A)
    expect(found).toEqual(latestForA)
  })

  it('DB-005 / TEST-011: ignores other users when picking latest', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'))
    const latestForA = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
    await repo.create({
      user_id: USER_B,
      proposal_id: PROPOSAL_2,
      policy_version: 'mvp-initial',
    })

    expect(await repo.findLatestByUser(USER_A)).toEqual(latestForA)
  })

  it('DB-005 / TEST-011: returns null when user has no agreement', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    expect(await repo.findLatestByUser(USER_A)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. append-only に近い構造（DB-005 §不変条件 2 / Repository export 制約）
// ---------------------------------------------------------------------------
describe('DB-005 / TEST-011: structural append-only enforcement', () => {
  it('DB-005 / TEST-011: repository instance only exposes create/findByProposalId/findLatestByUser', () => {
    const repo: PolicyAgreementRepository = createInMemoryPolicyAgreementRepository()
    const keys = Object.keys(repo).sort()
    expect(keys).toEqual(['create', 'findByProposalId', 'findLatestByUser'])
  })

  it('DB-005 / TEST-011: source file does not export update*/delete*/patch*/remove*/clear*/reset* symbols', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../src/server/repositories/policy-agreements.ts'),
      'utf8',
    )
    // import 文や型注釈での誤検知を避けるため、行頭が `export` で始まり、続く識別子が
    // 禁止プレフィクスにマッチするかだけを検査する。
    const banned = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(update|delete|patch|remove|clear|reset)/m
    expect(banned.test(source)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7. factory makePolicyAgreement
// ---------------------------------------------------------------------------
describe('TEST-011: makePolicyAgreement (factory)', () => {
  it('TEST-011: defaults policy_version to mvp-initial', () => {
    const row = makePolicyAgreement({ user_id: USER_A, proposal_id: PROPOSAL_1 })
    expect(row.policy_version).toBe('mvp-initial')
  })

  it('TEST-011: defaults agreed_at to fixed millis (1_700_000_000_000)', () => {
    const row = makePolicyAgreement({ user_id: USER_A, proposal_id: PROPOSAL_1 })
    expect(row.agreed_at).toBe(1_700_000_000_000)
  })

  it('TEST-011: assigns a UUID-shaped id by default', () => {
    const row = makePolicyAgreement({ user_id: USER_A, proposal_id: PROPOSAL_1 })
    expect(row.id).toMatch(UUID_REGEX)
  })

  it('TEST-011: overrides win over defaults', () => {
    const row = makePolicyAgreement(
      { user_id: USER_A, proposal_id: PROPOSAL_1 },
      { id: 'fixed-1', policy_version: '1.0.0', agreed_at: 42 },
    )
    expect(row).toEqual({
      id: 'fixed-1',
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: '1.0.0',
      agreed_at: 42,
    })
  })
})

// ---------------------------------------------------------------------------
// 8. 副作用ガード（防御コピー / read 系で内部 state を変えない）
// ---------------------------------------------------------------------------
describe('TEST-011: defensive copy', () => {
  it('TEST-011: mutating the returned row does not leak into repository', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    const created = await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    // 戻り値は防御コピーされているため、`as` で readonly を剥がして書き換えても
    // 内部 Map のレコードは影響を受けない。
    ;(created as { policy_version: string }).policy_version = 'tampered'

    const refetched = await repo.findByProposalId(PROPOSAL_1)
    expect(refetched?.policy_version).toBe('mvp-initial')
  })

  it('TEST-011: findByProposalId / findLatestByUser return independent copies', async () => {
    const repo = createInMemoryPolicyAgreementRepository()
    await repo.create({
      user_id: USER_A,
      proposal_id: PROPOSAL_1,
      policy_version: 'mvp-initial',
    })
    const a = await repo.findByProposalId(PROPOSAL_1)
    const b = await repo.findLatestByUser(USER_A)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('TEST-011: initial seed creates an isolated store (mutating input array does not leak)', async () => {
    const seed: PolicyAgreement[] = [
      makePolicyAgreement({ user_id: USER_A, proposal_id: PROPOSAL_1 }, { id: 'pa-1' }),
    ]
    const repo = createInMemoryPolicyAgreementRepository(seed)
    seed.length = 0
    const found = await repo.findByProposalId(PROPOSAL_1)
    expect(found?.id).toBe('pa-1')
  })
})

// ---------------------------------------------------------------------------
// 9. 例外の instanceof / 属性
// ---------------------------------------------------------------------------
describe('TEST-011: error classes', () => {
  it('TEST-011: PolicyAgreementConflictError is an Error with name and proposalId', () => {
    const err = new PolicyAgreementConflictError(PROPOSAL_1)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('PolicyAgreementConflictError')
    expect(err.proposalId).toBe(PROPOSAL_1)
    expect(err.message).toContain(PROPOSAL_1)
  })

  it('TEST-011: PolicyAgreementValidationError is an Error with field attribute', () => {
    const err = new PolicyAgreementValidationError('policy_version', 'too short')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('PolicyAgreementValidationError')
    expect(err.field).toBe('policy_version')
    expect(err.message).toContain('policy_version')
    expect(err.message).toContain('too short')
  })
})

// ---------------------------------------------------------------------------
// 10. initial seed の重複検査
// ---------------------------------------------------------------------------
describe('TEST-011: initial seed validation', () => {
  it('TEST-011: rejects seed with duplicate proposal_id', () => {
    const dup: PolicyAgreement[] = [
      makePolicyAgreement({ user_id: USER_A, proposal_id: PROPOSAL_1 }, { id: 'pa-1' }),
      makePolicyAgreement({ user_id: USER_B, proposal_id: PROPOSAL_1 }, { id: 'pa-2' }),
    ]
    expect(() => createInMemoryPolicyAgreementRepository(dup)).toThrow(
      PolicyAgreementConflictError,
    )
  })

  it('TEST-011: rejects seed with invalid policy_version', () => {
    const bad: PolicyAgreement[] = [
      makePolicyAgreement(
        { user_id: USER_A, proposal_id: PROPOSAL_1 },
        { policy_version: '' },
      ),
    ]
    expect(() => createInMemoryPolicyAgreementRepository(bad)).toThrow(
      PolicyAgreementValidationError,
    )
  })
})
