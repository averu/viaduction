// @vitest-environment jsdom
//
// TEST-035 — SCR-002 公開投稿一覧（トップページ）
// REQ-008 / REQ-010 / API-010 / UC-011 / SCR-002
//
// 範囲:
//   - VisibilityBadge: public / internal / private で適切な日本語ラベル / data-testid を出す
//   - ProposalList: 空配列で空状態テキスト、複数件で全件をタイトル / バッジ / 日付付きで描画
//   - listPublished (API-010 loader) の結果を ProposalList に流せることを連動確認
//
// route 全体（createFileRoute の loader / SSR レスポンス）の統合検証は
// TanStack Start の test util がまだ整っていないため本 TEST では行わない。
// 統合経路は TASK-053 (wrangler dev で SSR 200 確認) と TASK-047 (E2E) で扱う。

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ProposalList } from '../../src/components/proposal-list/proposal-list'
import { VisibilityBadge } from '../../src/components/proposal-list/visibility-badge'
import { listPublished } from '../../src/server/loaders/list-published'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
} from '../../src/server/repositories/proposals'
import type { PublishedProposalSummary } from '../../src/server/loaders/list-published'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// 1. VisibilityBadge
// ---------------------------------------------------------------------------
describe('REQ-008 / TEST-035: VisibilityBadge', () => {
  it('public は「公開」ラベルを表示する', () => {
    render(<VisibilityBadge visibility="public" />)
    const el = screen.getByTestId('visibility-badge-public')
    expect(el.textContent).toBe('公開')
    expect(el.getAttribute('aria-label')).toBe('公開範囲: 公開')
  })

  it('internal は「組織内」ラベルを表示する', () => {
    render(<VisibilityBadge visibility="internal" />)
    const el = screen.getByTestId('visibility-badge-internal')
    expect(el.textContent).toBe('組織内')
    expect(el.getAttribute('aria-label')).toBe('公開範囲: 組織内')
  })

  it('private は「非公開」ラベルを表示する（一覧には現れない想定だが防御的に保持）', () => {
    render(<VisibilityBadge visibility="private" />)
    const el = screen.getByTestId('visibility-badge-private')
    expect(el.textContent).toBe('非公開')
    expect(el.getAttribute('aria-label')).toBe('公開範囲: 非公開')
  })
})

// ---------------------------------------------------------------------------
// 2. ProposalList（空状態 / 単数 / 複数）
// ---------------------------------------------------------------------------
describe('REQ-008 / TEST-035: ProposalList の表示', () => {
  it('items が空配列なら空状態テキストを表示する', async () => {
    render(<ProposalList items={[]} />)
    const empty = screen.getByTestId('proposal-list-empty')
    expect(empty.textContent).toContain('公開された提案はまだありません')
    expect(screen.queryByTestId('proposal-list')).toBeNull()
  })

  it('1 件の場合、タイトル / visibility バッジ / 日付を描画する', async () => {
    const item: PublishedProposalSummary = {
      proposal_id: 'p-1',
      title: '○○交差点の歩道整備に関する提案',
      visibility: 'public',
      author_id: 'u-1',
      published_at: Date.UTC(2026, 4, 1, 0, 0, 0), // 2026-05-01 09:00 JST
      updated_at: Date.UTC(2026, 4, 1, 0, 0, 0),
    }
    render(<ProposalList items={[item]} />)

    const list = screen.getByTestId('proposal-list')
    expect(list).toBeTruthy()

    // タイトル + 詳細リンク（SCR-003 へ）
    const link = within(list).getByRole('link', { name: '○○交差点の歩道整備に関する提案' })
    expect(link.getAttribute('href')).toBe('/proposals/p-1')

    // visibility バッジ
    expect(within(list).getByTestId('visibility-badge-public').textContent).toBe('公開')

    // 公開日（<time datetime>）
    const time = list.querySelector('time')
    expect(time).not.toBeNull()
    expect(time?.getAttribute('datetime')).toBe(new Date(item.published_at).toISOString())
    expect(time?.textContent ?? '').toMatch(/2026/)
  })

  it('複数件の場合、全件を順序通りに描画する', async () => {
    const items: ReadonlyArray<PublishedProposalSummary> = [
      {
        proposal_id: 'p-a',
        title: '提案 A',
        visibility: 'public',
        author_id: 'u-1',
        published_at: 1_746_360_000_000,
        updated_at: 1_746_360_000_000,
      },
      {
        proposal_id: 'p-b',
        title: '提案 B',
        visibility: 'internal',
        author_id: 'u-2',
        published_at: 1_746_270_000_000,
        updated_at: 1_746_270_000_000,
      },
    ]
    render(<ProposalList items={items} />)

    const list = screen.getByTestId('proposal-list')
    const liNodes = list.querySelectorAll('li')
    expect(liNodes.length).toBe(2)

    expect(within(list).getByRole('link', { name: '提案 A' }).getAttribute('href')).toBe(
      '/proposals/p-a',
    )
    expect(within(list).getByRole('link', { name: '提案 B' }).getAttribute('href')).toBe(
      '/proposals/p-b',
    )
    expect(within(list).getByTestId('visibility-badge-public')).toBeTruthy()
    expect(within(list).getByTestId('visibility-badge-internal')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. loader 連携（listPublished -> ProposalList）
// ---------------------------------------------------------------------------
describe('REQ-008 / TEST-035: listPublished (API-010) 連携', () => {
  function seed(): ReadonlyArray<Proposal> {
    return [
      // 公開: 表示される
      makeProposal({
        author_id: 'u-1',
        status: 'published',
        visibility: 'public',
        id: 'p-public',
      }),
      // internal: guest からは見えない
      makeProposal({
        author_id: 'u-2',
        status: 'published',
        visibility: 'internal',
        id: 'p-internal',
      }),
      // 下書き: 一覧には出ない
      makeProposal({
        author_id: 'u-1',
        status: 'draft',
        visibility: 'public',
        id: 'p-draft',
      }),
    ]
  }

  it('viewer=null（guest）の loader 結果を ProposalList に流すと public のみ表示される', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const proposals = await listPublished(null, { proposals: repo })

    render(<ProposalList items={proposals} />)

    const list = screen.getByTestId('proposal-list')
    const liNodes = list.querySelectorAll('li')
    expect(liNodes.length).toBe(1)
    expect(within(list).getByRole('link', { name: 'title-published' }).getAttribute('href')).toBe(
      '/proposals/p-public',
    )
    expect(within(list).getByTestId('visibility-badge-public')).toBeTruthy()
    expect(within(list).queryByTestId('visibility-badge-internal')).toBeNull()
  })

  it('認証済 viewer の loader 結果を流すと public + internal が表示される', async () => {
    const repo = createInMemoryProposalRepository(seed())
    const proposals = await listPublished(
      { user_id: 'u-1', roles: ['user'] },
      { proposals: repo },
    )

    render(<ProposalList items={proposals} />)

    const list = screen.getByTestId('proposal-list')
    expect(within(list).getByTestId('visibility-badge-public')).toBeTruthy()
    expect(within(list).getByTestId('visibility-badge-internal')).toBeTruthy()
  })

  it('repository が空なら ProposalList は空状態を表示する', async () => {
    const repo = createInMemoryProposalRepository()
    const proposals = await listPublished(null, { proposals: repo })

    render(<ProposalList items={proposals} />)
    const empty = screen.getByTestId('proposal-list-empty')
    expect(empty.textContent).toContain('公開された提案はまだありません')
  })
})
