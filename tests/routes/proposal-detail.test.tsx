// @vitest-environment jsdom
//
// TEST-036 — SCR-003 公開投稿詳細（route `/proposals/$id`）
// REQ-005 / REQ-008 / REQ-010 / API-011 / UC-011 / SCR-003
//
// 範囲:
//   - ProposalDetail (presentational): タイトル / visibility バッジ / published_at /
//     本文（改行保持）が描画されることを確認
//   - loadPublishedDetail (loader 本体): getPublished の結果と AuthorizationError を
//     LoaderResult の判別共用体に正規化することを確認
//       - 'ok'           : public published を guest が取得
//       - 'unauthorized' : guest が internal / private を要求 (401)
//       - 'not_found'    : 不在 / withdrawn / 認可違反 (404)
//   - 副作用検査: loader / コンポーネント描画中に console.* が呼ばれないこと
//
// route 全体（createFileRoute の loader 経由 SSR）の統合検証は TanStack Start の
// test util がまだ整っていないため本 TEST では行わない。route コンポーネントの
// state 別 UI は ProposalDetailPage を直接 export していないため、loader 戻り値の
// 状態網羅で代替する（loader ロジックがコア責務、コンポーネントは薄い分岐のみ）。
// 統合経路は TASK-053 (wrangler dev で SSR 確認) と TASK-047 / TASK-048 (E2E) で扱う。

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProposalDetail } from '../../src/components/proposal-detail/proposal-detail'
import {
  loadPublishedDetail,
  type LoaderResult,
} from '../../src/routes/proposals/$id'
import type { Viewer } from '../../src/server/auth/session'
import type { PublishedProposalDetail } from '../../src/server/loaders/get-published'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
} from '../../src/server/repositories/proposals'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// 1. ProposalDetail (presentational)
// ---------------------------------------------------------------------------
describe('REQ-008 / TEST-036: ProposalDetail の表示', () => {
  function detailFixture(
    overrides: Partial<PublishedProposalDetail> = {},
  ): PublishedProposalDetail {
    return {
      proposal_id: 'p-1',
      title: '○○交差点の歩道整備に関する提案',
      body: '提案本文の 1 行目\n2 行目です',
      visibility: 'public',
      author_id: 'u-1',
      status: 'published',
      published_at: Date.UTC(2026, 4, 1, 0, 0, 0), // 2026-05-01 09:00 JST
      updated_at: Date.UTC(2026, 4, 1, 0, 0, 0),
      version: 0,
      ...overrides,
    }
  }

  it('public な PublishedProposalDetail を渡すと title / visibility / 日付 / 本文を描画する', () => {
    const proposal = detailFixture()
    render(<ProposalDetail proposal={proposal} />)

    const article = screen.getByTestId('proposal-detail')
    // タイトル
    expect(within(article).getByRole('heading', { level: 1 }).textContent).toBe(
      '○○交差点の歩道整備に関する提案',
    )
    // visibility バッジ
    expect(within(article).getByTestId('visibility-badge-public').textContent).toBe('公開')
    // 公開日（<time datetime>）
    const time = within(article).getByTestId('proposal-detail-published-at')
    expect(time.getAttribute('datetime')).toBe(new Date(proposal.published_at).toISOString())
    expect(time.textContent ?? '').toMatch(/2026/)
    // 本文
    expect(within(article).getByTestId('proposal-detail-body').textContent).toContain(
      '提案本文の 1 行目',
    )
  })

  it('internal の場合も visibility バッジが「組織内」で描画される', () => {
    render(<ProposalDetail proposal={detailFixture({ visibility: 'internal' })} />)
    const article = screen.getByTestId('proposal-detail')
    expect(within(article).getByTestId('visibility-badge-internal').textContent).toBe(
      '組織内',
    )
  })

  it('private（admin / 投稿者本人到達時）でも visibility バッジが「非公開」で描画される', () => {
    render(<ProposalDetail proposal={detailFixture({ visibility: 'private' })} />)
    const article = screen.getByTestId('proposal-detail')
    expect(within(article).getByTestId('visibility-badge-private').textContent).toBe(
      '非公開',
    )
  })

  it('本文の改行は whitespace-pre-wrap で保持される（DOM テキストに改行が残る）', () => {
    const proposal = detailFixture({
      body: '1 行目\n2 行目\n3 行目',
    })
    render(<ProposalDetail proposal={proposal} />)
    const body = screen.getByTestId('proposal-detail-body')
    // テキストノードとして改行が保持されていることを確認（pre-wrap で視覚化される）。
    expect(body.textContent).toBe('1 行目\n2 行目\n3 行目')
    // CSS クラスでも whitespace-pre-wrap を持つ。
    expect(body.className).toMatch(/whitespace-pre-wrap/)
  })
})

// ---------------------------------------------------------------------------
// 2. loadPublishedDetail (loader 本体): getPublished -> LoaderResult mapping
// ---------------------------------------------------------------------------
describe('REQ-005 / REQ-008 / TEST-036: loadPublishedDetail の状態 mapping', () => {
  function seed(): ReadonlyArray<Proposal> {
    return [
      makeProposal({
        author_id: 'u-1',
        status: 'published',
        visibility: 'public',
        id: 'p-public',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'published',
        visibility: 'internal',
        id: 'p-internal',
      }),
      makeProposal({
        author_id: 'u-2',
        status: 'published',
        visibility: 'private',
        id: 'p-private-other',
      }),
      // 取り下げ済（API-011 §認可拒否 / REQ-005 AC: 404 で隠蔽）
      makeProposal({
        author_id: 'u-1',
        status: 'withdrawn',
        visibility: 'public',
        id: 'p-withdrawn',
      }),
      // draft（API-011 は published のみ対象 → 404）
      makeProposal({
        author_id: 'u-1',
        status: 'draft',
        visibility: 'public',
        id: 'p-draft',
      }),
    ]
  }

  it('guest + public published → state="ok" で PublishedProposalDetail を返す', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const result: LoaderResult = await loadPublishedDetail(null, 'p-public', {
      proposals: repo,
    })
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.proposal.proposal_id).toBe('p-public')
    expect(result.proposal.visibility).toBe('public')
    expect(result.proposal.status).toBe('published')
  })

  it('guest + internal published → state="unauthorized"（401）', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const result = await loadPublishedDetail(null, 'p-internal', { proposals: repo })
    expect(result.state).toBe('unauthorized')
  })

  it('guest + private published → state="unauthorized"（401, 認証要求が先）', async () => {
    // private は guest からは 401（認証要求）が先。authorize の評価順に整合する。
    const repo = createInMemoryProposalRepository(seed())
    const result = await loadPublishedDetail(null, 'p-private-other', { proposals: repo })
    expect(result.state).toBe('unauthorized')
  })

  it('user(他人) + private published → state="not_found"（404 隠蔽）', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const viewer: Viewer = { user_id: 'u-other', roles: ['user'] }
    const result = await loadPublishedDetail(viewer, 'p-private-other', {
      proposals: repo,
    })
    expect(result.state).toBe('not_found')
  })

  it('user(本人) + private published → state="ok"', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const viewer: Viewer = { user_id: 'u-2', roles: ['user'] }
    const result = await loadPublishedDetail(viewer, 'p-private-other', {
      proposals: repo,
    })
    expect(result.state).toBe('ok')
  })

  it('admin + private published → state="ok"（admin は全 visibility で 200）', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const viewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
    const result = await loadPublishedDetail(viewer, 'p-private-other', {
      proposals: repo,
    })
    expect(result.state).toBe('ok')
  })

  it('不在 proposal → state="not_found"', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const result = await loadPublishedDetail(null, 'does-not-exist', {
      proposals: repo,
    })
    expect(result.state).toBe('not_found')
  })

  it('withdrawn な proposal → state="not_found"（REQ-005 AC: 公開撤回時は 404 隠蔽）', async () => {
    const repo = createInMemoryProposalRepository(seed())
    // 投稿者本人 (admin) であっても、withdrawn は loader 段階で 404 に集約される
    // （API-011 §認可拒否時の挙動: withdrawn は visibility に関係なく 404）。
    const adminViewer: Viewer = { user_id: 'admin-1', roles: ['admin'] }
    const result = await loadPublishedDetail(adminViewer, 'p-withdrawn', {
      proposals: repo,
    })
    expect(result.state).toBe('not_found')
  })

  it('非 published（draft）→ state="not_found"', async () => {
    const repo = createInMemoryProposalRepository(seed())
    // 投稿者本人でも、API-011 は published のみ対象なので 404
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const result = await loadPublishedDetail(viewer, 'p-draft', { proposals: repo })
    expect(result.state).toBe('not_found')
  })
})

// ---------------------------------------------------------------------------
// 3. 副作用検査: loader / コンポーネントが console を呼ばない
// ---------------------------------------------------------------------------
describe('NFR-003 / TEST-036: 副作用検査', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loadPublishedDetail / ProposalDetail のいずれも console.* を呼ばない', async () => {
    const repo = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'u-1',
        status: 'published',
        visibility: 'public',
        id: 'p-x',
      }),
    ])
    const result = await loadPublishedDetail(null, 'p-x', { proposals: repo })
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    render(<ProposalDetail proposal={result.proposal} />)

    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
    expect(vi.mocked(console.info)).not.toHaveBeenCalled()
    expect(vi.mocked(console.debug)).not.toHaveBeenCalled()
  })
})
