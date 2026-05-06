// TEST-023 — listPublished loader (API-010 / REQ-008 / UC-011 / DB-003)
//
// 検証観点:
//   1. viewer === null（guest）→ visibility='public' のみ
//   2. viewer.roles に user / reviewer / admin / auditor 何が入っていても
//      visibility IN ('public', 'internal') を返す
//   3. 公開バイパス: cookie なし（viewer null）でも throw せず 200 相当の配列を返す
//   4. `withdrawn` は loader からは除外される
//      （ProposalRepository.listPublic が status='published' のみ返すことを通じて）
//   5. 並び順: repository の published_at DESC を維持する
//   6. 副作用なし: console.* / authorize() が呼ばれない
//
// 参照: docs/20-detail-design/apis/API-010.md（§認可 §レスポンス §フィルタ）、
//       docs/02-requirements/02-functional-requirements.md REQ-008、
//       src/server/repositories/proposals.ts (makeProposal / listPublic)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authorizeModule from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'
import {
  listPublished,
  type PublishedProposalSummary,
} from '../../../src/server/loaders/list-published'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
} from '../../../src/server/repositories/proposals'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userViewer: Viewer = { user_id: 'user-1', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'reviewer-1', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'auditor-1', roles: ['auditor'] }

/**
 * 全 status × 全 visibility = 24 件 + published × 3 visibility 用の追加 1 件で
 * 「published_at が異なる public が複数ある」状況を作って並び順検証も兼ねる。
 *
 * factory は status ごとに STATUS_OFFSET（published=6_000）を updated_at に加える
 * ため、`published-public` の published_at は base + 300 となる。これに第 2 の
 * 公開済 public を別 id で追加する。
 */
function makeFixtureSet(): ReadonlyArray<Proposal> {
  const base: Proposal[] = []
  for (const visibility of ['private', 'internal', 'public'] as const) {
    for (const status of [
      'draft',
      'submitted',
      'in_review',
      'approved',
      'returned',
      'rejected',
      'published',
      'withdrawn',
    ] as const) {
      base.push(makeProposal({ author_id: 'author-1', status, visibility }))
    }
  }
  // 並び順検証用の追加 published × public（より新しい published_at を持つ）
  base.push(
    makeProposal(
      { author_id: 'author-2', status: 'published', visibility: 'public', id: 'newer-public' },
      { published_at: 1_900_000_000_000 },
    ),
  )
  return base
}

function makeRepoFromFixtures() {
  const fixtures = makeFixtureSet()
  return createInMemoryProposalRepository(fixtures)
}

// ---------------------------------------------------------------------------
// 副作用 spy
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

function expectNoSideEffects(): void {
  expect(authorizeSpy).not.toHaveBeenCalled()
  expect(consoleLogSpy).not.toHaveBeenCalled()
  expect(consoleWarnSpy).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  expect(consoleInfoSpy).not.toHaveBeenCalled()
}

// ---------------------------------------------------------------------------
// 1. viewer === null（guest）→ visibility='public' のみ
// ---------------------------------------------------------------------------

describe('REQ-008 / API-010 / TEST-023: guest viewer (null) returns visibility=public only', () => {
  it('REQ-008 / TEST-023: guest sees only public published proposals (internal / private excluded)', async () => {
    const proposals = makeRepoFromFixtures()

    const result = await listPublished(null, { proposals })

    // public published は 2 件（factory の `published-public` と追加の `newer-public`）
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.visibility === 'public')).toBe(true)

    // private / internal が混入していないこと
    expect(result.some((r) => r.visibility === ('private' as never))).toBe(false)
    expect(result.some((r) => r.visibility === 'internal')).toBe(false)
  })

  it('REQ-008 / TEST-023: guest viewer never throws even without cookie (public bypass)', async () => {
    const proposals = makeRepoFromFixtures()
    await expect(listPublished(null, { proposals })).resolves.toBeDefined()
  })

  it('NFR-003 / TEST-023: guest path does not invoke authorize() (public bypass)', async () => {
    const proposals = makeRepoFromFixtures()
    await listPublished(null, { proposals })
    expectNoSideEffects()
  })
})

// ---------------------------------------------------------------------------
// 2. 認証済 viewer → public + internal
// ---------------------------------------------------------------------------

describe('REQ-008 / API-010 / TEST-023: authenticated viewers see public + internal', () => {
  it.each([
    ['user', userViewer],
    ['reviewer', reviewerViewer],
    ['admin', adminViewer],
    ['auditor', auditorViewer],
  ] as const)(
    'REQ-008 / TEST-023: %s sees published public + internal (private / non-published excluded)',
    async (_label, viewer) => {
      const proposals = makeRepoFromFixtures()

      const result = await listPublished(viewer, { proposals })

      // public published 2 件 + internal published 1 件 = 3 件
      expect(result).toHaveLength(3)

      const visibilitySet = new Set(result.map((r) => r.visibility))
      expect(visibilitySet.has('public')).toBe(true)
      expect(visibilitySet.has('internal')).toBe(true)
      expect(visibilitySet.has('private' as never)).toBe(false)

      // すべて status='published'（loader の戻り値には status を含めないため、
      // 副条件として「withdrawn 由来の id が出ない」ことで間接的に検証する）
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-withdrawn-'))).toBe(true)
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-draft-'))).toBe(true)
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-submitted-'))).toBe(true)
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-in_review-'))).toBe(true)
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-approved-'))).toBe(true)
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-returned-'))).toBe(true)
      expect(result.every((r) => !r.proposal_id.startsWith('proposal-rejected-'))).toBe(true)
    },
  )

  it('NFR-003 / TEST-023: authenticated path does not invoke authorize() (public bypass)', async () => {
    const proposals = makeRepoFromFixtures()
    await listPublished(userViewer, { proposals })
    expectNoSideEffects()
  })
})

// ---------------------------------------------------------------------------
// 3. withdrawn は除外
// ---------------------------------------------------------------------------

describe('REQ-005 / REQ-008 / TEST-023: withdrawn proposals are excluded', () => {
  it('REQ-008 / TEST-023: withdrawn × public is excluded for guest', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: 'a', status: 'withdrawn', visibility: 'public' }),
    ])

    const result = await listPublished(null, { proposals })

    expect(result).toEqual([])
  })

  it('REQ-008 / TEST-023: withdrawn × internal is excluded for authenticated viewers', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: 'a', status: 'withdrawn', visibility: 'internal' }),
      makeProposal({ author_id: 'a', status: 'withdrawn', visibility: 'public' }),
    ])

    const result = await listPublished(userViewer, { proposals })

    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. 空結果
// ---------------------------------------------------------------------------

describe('API-010 / TEST-023: empty result when no published proposals exist', () => {
  it('TEST-023: returns [] when repository has no published rows (guest)', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({ author_id: 'a', status: 'draft', visibility: 'public' }),
      makeProposal({ author_id: 'a', status: 'submitted', visibility: 'public' }),
    ])

    const result = await listPublished(null, { proposals })

    expect(result).toEqual([])
  })

  it('TEST-023: returns [] when repository has no published rows (authenticated)', async () => {
    const proposals = createInMemoryProposalRepository([])

    const result = await listPublished(userViewer, { proposals })

    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5. 並び順（published_at DESC を維持）
// ---------------------------------------------------------------------------

describe('API-010 / TEST-023: ordering preserves repository.listPublic published_at DESC', () => {
  it('API-010 / TEST-023: items are ordered by published_at DESC', async () => {
    const proposals = makeRepoFromFixtures()

    const result = await listPublished(userViewer, { proposals })

    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1] as PublishedProposalSummary
      const curr = result[i] as PublishedProposalSummary
      expect(prev.published_at).toBeGreaterThanOrEqual(curr.published_at)
    }

    // 先頭は最新の `newer-public`（published_at = 1_900_000_000_000）
    const head = result[0] as PublishedProposalSummary
    expect(head.proposal_id).toBe('newer-public')
  })
})

// ---------------------------------------------------------------------------
// 6. レスポンスのスキーマ整合（API-010 §レスポンス §スキーマ）
// ---------------------------------------------------------------------------

describe('API-010 / TEST-023: response shape matches API-010 schema', () => {
  it('API-010 / TEST-023: each item has proposal_id, title, visibility, author_id, published_at, updated_at (no body)', async () => {
    const proposals = makeRepoFromFixtures()

    const result = await listPublished(userViewer, { proposals })
    expect(result.length).toBeGreaterThan(0)

    for (const item of result) {
      expect(typeof item.proposal_id).toBe('string')
      expect(typeof item.title).toBe('string')
      expect(['public', 'internal']).toContain(item.visibility)
      expect(typeof item.author_id).toBe('string')
      expect(typeof item.published_at).toBe('number')
      expect(typeof item.updated_at).toBe('number')
      // API-010 L106: body は本一覧 API では返さない
      expect(item).not.toHaveProperty('body')
      expect(item).not.toHaveProperty('body_excerpt')
    }
  })
})
