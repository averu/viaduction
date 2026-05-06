// @vitest-environment jsdom
//
// TEST-038 — SCR-005 自分の投稿一覧（route `/me/proposals`）
// REQ-007 / REQ-010 / REQ-015 / API-012 / UC-010 / SCR-005
//
// 範囲:
//   - StatusBadge: 全 8 status (draft / submitted / in_review / approved /
//     returned / rejected / published / withdrawn) で日本語ラベル / aria-label /
//     data-testid を出す
//   - MyProposalList: 空配列で空状態テキスト、全 8 status を含む items で 8 行
//     描画 + 各 status badge が正しい
//   - loadMyProposals (loader 本体): listMyProposals の結果と AuthorizationError(401)
//     を LoaderResult の判別共用体に正規化することを確認
//       - 'unauthorized' : viewer = null (guest) → 401
//       - 'ok'           : 認証済 viewer → MyProposalSummary[] を返す
//   - 副作用検査: loader / コンポーネント描画中に console.* が呼ばれないこと
//
// route 全体（createFileRoute の loader 経由 SSR）の統合検証は TanStack Start の
// test util がまだ整っていないため本 TEST では行わない。state 別 UI は
// MyProposalsPage を直接 export していないため、loader 戻り値の状態網羅で
// 代替する（loader ロジックがコア責務、コンポーネントは薄い分岐のみ）。
// 統合経路は TASK-053 (wrangler dev で SSR 確認) と E2E TASK で扱う。

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MyProposalList } from '../../src/components/proposal-list/my-proposal-list'
import { StatusBadge } from '../../src/components/proposal-list/status-badge'
import { PROPOSAL_STATUSES, type ProposalStatus } from '../../src/lib/domain/types'
import { loadMyProposals, type LoaderResult } from '../../src/routes/me/proposals'
import type { Viewer } from '../../src/server/auth/session'
import type { MyProposalSummary } from '../../src/server/loaders/list-my-proposals'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
} from '../../src/server/repositories/proposals'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// 1. StatusBadge — 全 8 status
// ---------------------------------------------------------------------------
describe('REQ-007 / TEST-038: StatusBadge', () => {
  const EXPECTED_LABEL: Record<ProposalStatus, string> = {
    draft: '下書き',
    submitted: '提出済',
    in_review: 'レビュー中',
    approved: '承認済',
    returned: '差し戻し',
    rejected: '却下',
    published: '公開中',
    withdrawn: '取下げ',
  }

  it('PROPOSAL_STATUSES に対応する 8 値を網羅している', () => {
    // 退化保護: 8 status 全てが期待ラベルテーブルに含まれる
    expect(PROPOSAL_STATUSES.length).toBe(8)
    for (const s of PROPOSAL_STATUSES) {
      expect(EXPECTED_LABEL[s]).toBeTruthy()
    }
  })

  for (const status of PROPOSAL_STATUSES) {
    it(`${status} は「${EXPECTED_LABEL[status]}」ラベルを表示する`, () => {
      render(<StatusBadge status={status} />)
      const el = screen.getByTestId(`status-badge-${status}`)
      expect(el.textContent).toBe(EXPECTED_LABEL[status])
      expect(el.getAttribute('aria-label')).toBe(`ステータス: ${EXPECTED_LABEL[status]}`)
    })
  }
})

// ---------------------------------------------------------------------------
// 2. MyProposalList（空状態 / 全 8 status）
// ---------------------------------------------------------------------------
describe('REQ-007 / TEST-038: MyProposalList の表示', () => {
  it('items が空配列なら空状態テキストを表示する', () => {
    render(<MyProposalList items={[]} />)
    const empty = screen.getByTestId('my-proposal-list-empty')
    expect(empty.textContent).toContain('投稿はまだありません')
    expect(screen.queryByTestId('my-proposal-list')).toBeNull()
  })

  it('全 8 status を含む items を渡すと 8 行 + 各 status badge が正しく描画される', () => {
    const baseTs = Date.UTC(2026, 4, 1, 0, 0, 0)
    const items: ReadonlyArray<MyProposalSummary> = PROPOSAL_STATUSES.map((status, i) => ({
      proposal_id: `p-${status}`,
      title: `title-${status}`,
      status,
      visibility: 'public',
      // updated_at を status ごとに一意化（loader 側のソートをここで再現する必要は無いが、
      // 描画順は items の入力順を保つことを確認するため固有値にしておく）
      updated_at: baseTs + i * 1_000,
      submitted_at: null,
      published_at: null,
      withdrawn_at: null,
      version: 0,
    }))

    render(<MyProposalList items={items} />)

    const list = screen.getByTestId('my-proposal-list')
    const liNodes = list.querySelectorAll('li')
    expect(liNodes.length).toBe(8)

    for (const status of PROPOSAL_STATUSES) {
      const badge = within(list).getByTestId(`status-badge-${status}`)
      expect(badge).toBeTruthy()
      // 詳細遷移リンクは /me/proposals/{id} を指す
      const link = within(list).getByRole('link', { name: `title-${status}` })
      expect(link.getAttribute('href')).toBe(`/me/proposals/p-${status}`)
    }
  })

  it('1 件の場合、タイトル / status バッジ / visibility バッジ / updated_at が描画される', () => {
    const item: MyProposalSummary = {
      proposal_id: 'p-1',
      title: '自分の投稿サンプル',
      status: 'returned',
      visibility: 'internal',
      updated_at: Date.UTC(2026, 4, 1, 0, 0, 0),
      submitted_at: null,
      published_at: null,
      withdrawn_at: null,
      version: 1,
    }
    render(<MyProposalList items={[item]} />)

    const list = screen.getByTestId('my-proposal-list')
    const link = within(list).getByRole('link', { name: '自分の投稿サンプル' })
    expect(link.getAttribute('href')).toBe('/me/proposals/p-1')

    expect(within(list).getByTestId('status-badge-returned').textContent).toBe('差し戻し')
    expect(within(list).getByTestId('visibility-badge-internal').textContent).toBe('組織内')

    const time = list.querySelector('time')
    expect(time).not.toBeNull()
    expect(time?.getAttribute('datetime')).toBe(new Date(item.updated_at).toISOString())
    expect(time?.textContent ?? '').toMatch(/2026/)
  })
})

// ---------------------------------------------------------------------------
// 3. loadMyProposals — listMyProposals -> LoaderResult mapping
// ---------------------------------------------------------------------------
describe('REQ-007 / REQ-015 / TEST-038: loadMyProposals の状態 mapping', () => {
  function seed(): ReadonlyArray<Proposal> {
    // u-1 の全 8 status × 1 visibility = 8 件 + u-2 の他人投稿 1 件
    const out: Proposal[] = []
    for (const status of PROPOSAL_STATUSES) {
      out.push(
        makeProposal({
          author_id: 'u-1',
          status,
          visibility: 'public',
          id: `mine-${status}`,
        }),
      )
    }
    out.push(
      makeProposal({
        author_id: 'u-2',
        status: 'published',
        visibility: 'public',
        id: 'other-published',
      }),
    )
    return out
  }

  it('viewer = null（guest）→ state="unauthorized"（401）', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const result: LoaderResult = await loadMyProposals(null, { proposals: repo })
    expect(result.state).toBe('unauthorized')
  })

  it('認証済 viewer (u-1) → state="ok" + 全 8 status の自分投稿のみが返る', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const result = await loadMyProposals(viewer, { proposals: repo })
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return

    expect(result.proposals.length).toBe(8)
    // 他人投稿は含まれない（API-012 author_id == viewer.user_id 強制）
    for (const p of result.proposals) {
      expect(p.proposal_id.startsWith('mine-')).toBe(true)
    }
    // 全 8 status を網羅
    const statuses = new Set(result.proposals.map((p) => p.status))
    for (const s of PROPOSAL_STATUSES) {
      expect(statuses.has(s)).toBe(true)
    }
  })

  it('認証済 viewer (u-2) は自身が起票した 1 件のみ返る', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const viewer: Viewer = { user_id: 'u-2', roles: ['user'] }
    const result = await loadMyProposals(viewer, { proposals: repo })
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.proposals.length).toBe(1)
    expect(result.proposals[0]?.proposal_id).toBe('other-published')
  })

  it('reviewer 単独ロールのユーザは自身の投稿が無ければ空配列（SCR-005 §権限による表示分岐）', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const viewer: Viewer = { user_id: 'rev-1', roles: ['reviewer'] }
    const result = await loadMyProposals(viewer, { proposals: repo })
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.proposals.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4. 副作用検査: loader / コンポーネントが console を呼ばない
// ---------------------------------------------------------------------------
describe('NFR-003 / TEST-038: 副作用検査', () => {
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

  it('loadMyProposals / MyProposalList / StatusBadge のいずれも console.* を呼ばない', async () => {
    const repo = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'u-1',
        status: 'draft',
        visibility: 'public',
        id: 'mine-draft',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'published',
        visibility: 'public',
        id: 'mine-published',
      }),
    ])

    // unauthorized 経路
    const guestResult = await loadMyProposals(null, { proposals: repo })
    expect(guestResult.state).toBe('unauthorized')

    // ok 経路
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const okResult = await loadMyProposals(viewer, { proposals: repo })
    expect(okResult.state).toBe('ok')
    if (okResult.state !== 'ok') return

    render(<MyProposalList items={okResult.proposals} />)
    render(<StatusBadge status="returned" />)

    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
    expect(vi.mocked(console.info)).not.toHaveBeenCalled()
    expect(vi.mocked(console.debug)).not.toHaveBeenCalled()
  })
})
