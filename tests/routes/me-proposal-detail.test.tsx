// @vitest-environment jsdom
//
// TEST-039 — SCR-006 自分の投稿詳細（route `/me/proposals/$id`）
// REQ-005 / REQ-006 / REQ-007 / REQ-010 / REQ-015 / NFR-003 / API-013 / API-009 /
// UC-009 / UC-010 / SCR-006
//
// 範囲:
//   - ReturnReasonBanner: reason / returned_at / audit_log_id を表示。
//     `last_return_reason` が null（防御的）→ 何も描画しない。
//   - MyProposalDetail (presentational + status 別 UI):
//     - 各 status (draft / submitted / in_review / approved / returned / rejected /
//       published) で title / status badge / visibility badge / 本文 / メタ情報が描画される。
//     - status='returned' のみ ReturnReasonBanner が表示される。
//     - status='returned' のみ ResubmitForm が表示される。
//   - ResubmitForm:
//     - reason 入力 + 「再提出する」押下で onSubmit が呼ばれる（reason / expected_version /
//       title / body / visibility がそのまま渡る）。
//     - reason が 4,001 文字（境界 +1）→ submit が disabled、強制 click 後も onSubmit が
//       呼ばれず inline エラーが出る。
//   - loadMyProposalDetail (loader 本体):
//     - guest → state='unauthorized'（401 not_authenticated）
//     - 他人の投稿 → state='not_found'（404 not_owner_resource）
//     - withdrawn 自身分 → state='not_found'（REQ-005 AC）
//     - 不在 proposal_id → state='not_found'（認証済 viewer + 不在）
//     - 本人 + draft/submitted/approved/returned/rejected/published → state='ok'
//   - 副作用検査: loader / コンポーネント描画中に console.* が呼ばれないこと。
//
// route 全体（createFileRoute の loader 経由 SSR）の統合検証は TanStack Start の
// test util がまだ整っていないため本 TEST では行わない。state 別 UI は
// MyProposalDetailPage を直接 export していないため、loader 戻り値の状態網羅で
// 代替する（loader ロジックがコア責務、route コンポーネントは薄い分岐のみ）。
// 統合経路は TASK-053 (wrangler dev で SSR 確認) と E2E TASK で扱う。

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MyProposalDetail,
  ResubmitForm,
  ReturnReasonBanner,
  type MyProposalDetailActions,
} from '../../src/components/my-proposal'
import {
  loadMyProposalDetail,
  type LoaderResult,
} from '../../src/routes/me/proposals.$id'
import type { Viewer } from '../../src/server/auth/session'
import {
  createInMemoryAuditLogRepository,
  makeAuditLog,
  type AuditLog,
} from '../../src/server/audit/repository'
import type {
  ResubmitInput,
  ResubmitResult,
} from '../../src/server/functions/resubmit'
import type {
  LastReturnReason,
  MyProposalDetail as MyProposalDetailData,
} from '../../src/server/loaders/get-my-proposal'
import {
  createInMemoryProposalRepository,
  makeProposal,
  type Proposal,
} from '../../src/server/repositories/proposals'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// fixtures / helpers
// ---------------------------------------------------------------------------

const FIXED_TIMESTAMP = Date.UTC(2026, 4, 1, 0, 0, 0) // 2026-05-01 09:00 JST

function makeLastReturnReason(
  overrides: Partial<LastReturnReason> = {},
): LastReturnReason {
  return {
    reason: '個人情報を含む可能性があるため要修正',
    returned_at: FIXED_TIMESTAMP,
    audit_log_id: 'audit-return-001',
    ...overrides,
  }
}

function makeDetail(
  overrides: Partial<MyProposalDetailData> = {},
): MyProposalDetailData {
  // 7 status (withdrawn 以外) を網羅できるよう、デフォルトは draft + private で組む。
  return {
    proposal_id: 'p-1',
    title: 'タイトル例',
    body: '本文 1 行目\n2 行目',
    visibility: 'private',
    status: 'draft',
    author_id: 'u-1',
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP + 1_000,
    submitted_at: null,
    approved_at: null,
    published_at: null,
    withdrawn_at: null,
    version: 0,
    current_policy_agreement_id: null,
    last_return_reason: null,
    ...overrides,
  }
}

interface ActionsBundle {
  readonly actions: MyProposalDetailActions
  readonly resubmit: ReturnType<
    typeof vi.fn<(proposalId: string, input: ResubmitInput) => Promise<ResubmitResult>>
  >
}

function makeActions(): ActionsBundle {
  const resubmit = vi.fn(
    async (proposalId: string, input: ResubmitInput): Promise<ResubmitResult> => ({
      proposal_id: proposalId,
      status: 'submitted',
      version: input.expected_version + 1,
      submitted_at: FIXED_TIMESTAMP + 10_000,
      policy_agreement_id: 'pa-1',
      audit_log_id: 'audit-resubmit-001',
    }),
  )
  return { actions: { resubmit }, resubmit }
}

// ---------------------------------------------------------------------------
// 1. ReturnReasonBanner — 単体描画
// ---------------------------------------------------------------------------
describe('REQ-006 / TEST-039: ReturnReasonBanner', () => {
  it('reason / returned_at / audit_log_id を表示する', () => {
    const reason = makeLastReturnReason()
    render(<ReturnReasonBanner reason={reason} />)

    const banner = screen.getByTestId('return-reason-banner')
    expect(within(banner).getByTestId('return-reason-banner-reason').textContent).toBe(
      reason.reason,
    )
    const time = within(banner).getByTestId('return-reason-banner-returned-at')
    expect(time.getAttribute('datetime')).toBe(
      new Date(reason.returned_at).toISOString(),
    )
    expect(time.textContent ?? '').toMatch(/2026/)
    expect(
      within(banner).getByTestId('return-reason-banner-audit-log-id').textContent,
    ).toBe(reason.audit_log_id)
    // aria-labelledby の指定（SCR-006 §アクセシビリティ）
    expect(banner.getAttribute('aria-labelledby')).toBe('return-reason-heading')
  })

  it('last_return_reason が null（防御的）→ 何も描画しない', () => {
    const { container } = render(<ReturnReasonBanner reason={null} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('return-reason-banner')).toBeNull()
  })

  it('reason の改行は whitespace-pre-wrap で保持される', () => {
    render(
      <ReturnReasonBanner
        reason={makeLastReturnReason({
          reason: '1 行目\n2 行目\n3 行目',
        })}
      />,
    )
    const text = screen.getByTestId('return-reason-banner-reason')
    expect(text.textContent).toBe('1 行目\n2 行目\n3 行目')
    expect(text.className).toMatch(/whitespace-pre-wrap/)
  })
})

// ---------------------------------------------------------------------------
// 2. MyProposalDetail — status 別の表示分岐
// ---------------------------------------------------------------------------
describe('REQ-006 / REQ-007 / TEST-039: MyProposalDetail の表示', () => {
  // SCR-006: returned 以外の 6 status で本文 + メタ情報が描画され、ReturnReasonBanner /
  // ResubmitForm は描画されないこと。
  const NON_RETURNED_STATUSES = [
    'draft',
    'submitted',
    'in_review',
    'approved',
    'rejected',
    'published',
  ] as const

  for (const status of NON_RETURNED_STATUSES) {
    it(`${status} → タイトル / status / visibility / 本文を描画し、banner / form を出さない`, () => {
      const proposal = makeDetail({ status })
      const { actions } = makeActions()
      render(<MyProposalDetail proposal={proposal} actions={actions} />)

      const article = screen.getByTestId('my-proposal-detail')
      expect(article.getAttribute('data-status')).toBe(status)
      expect(within(article).getByRole('heading', { level: 1 }).textContent).toBe(
        'タイトル例',
      )
      expect(within(article).getByTestId(`status-badge-${status}`)).toBeTruthy()
      expect(within(article).getByTestId('visibility-badge-private')).toBeTruthy()
      expect(within(article).getByTestId('my-proposal-detail-body').textContent).toContain(
        '本文 1 行目',
      )
      // returned 以外なので banner / form は出ない
      expect(screen.queryByTestId('return-reason-banner')).toBeNull()
      expect(screen.queryByTestId('resubmit-form')).toBeNull()
    })
  }

  it('returned → ReturnReasonBanner と ResubmitForm を表示する', () => {
    const proposal = makeDetail({
      status: 'returned',
      version: 3,
      submitted_at: FIXED_TIMESTAMP + 5_000,
      last_return_reason: makeLastReturnReason(),
    })
    const { actions } = makeActions()
    render(<MyProposalDetail proposal={proposal} actions={actions} />)

    const article = screen.getByTestId('my-proposal-detail')
    expect(article.getAttribute('data-status')).toBe('returned')
    // ReturnReasonBanner
    expect(screen.getByTestId('return-reason-banner')).toBeTruthy()
    // ResubmitForm
    const form = screen.getByTestId('resubmit-form')
    expect(form.getAttribute('data-proposal-id')).toBe('p-1')
  })

  it('returned + last_return_reason=null → banner は出ないが ResubmitForm は出る', () => {
    // SCR-006 §エラー・空状態: 不整合（status=returned だが last_return_reason=null）の
    // 場合、再編集自体は可能（ResubmitForm 表示）、banner は防御的に非表示。
    const proposal = makeDetail({
      status: 'returned',
      version: 3,
      last_return_reason: null,
    })
    const { actions } = makeActions()
    render(<MyProposalDetail proposal={proposal} actions={actions} />)

    expect(screen.queryByTestId('return-reason-banner')).toBeNull()
    expect(screen.getByTestId('resubmit-form')).toBeTruthy()
  })

  it('メタ情報: NULL のタイムスタンプは「—」、非 NULL は <time datetime>', () => {
    const proposal = makeDetail({
      status: 'published',
      submitted_at: FIXED_TIMESTAMP + 1_000,
      published_at: FIXED_TIMESTAMP + 2_000,
      withdrawn_at: null,
      approved_at: FIXED_TIMESTAMP + 1_500,
    })
    const { actions } = makeActions()
    render(<MyProposalDetail proposal={proposal} actions={actions} />)

    const submitted = screen.getByTestId('my-proposal-detail-meta-submitted-at')
    expect(submitted.querySelector('time')).not.toBeNull()
    const published = screen.getByTestId('my-proposal-detail-meta-published-at')
    expect(published.querySelector('time')).not.toBeNull()
    const withdrawn = screen.getByTestId('my-proposal-detail-meta-withdrawn-at')
    expect(withdrawn.textContent).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// 3. ResubmitForm — mutation 連携
// ---------------------------------------------------------------------------
describe('REQ-006 / API-009 / TEST-039: ResubmitForm の mutation 連携', () => {
  it('reason 入力 + 「再提出する」押下で onSubmit が呼ばれる', async () => {
    const onSubmit = vi.fn(
      async (_input: {
        reason?: string
        expected_version: number
        title: string
        body: string
        visibility: 'private' | 'internal' | 'public'
      }): Promise<ResubmitResult> => ({
        proposal_id: 'p-x',
        status: 'submitted',
        version: 4,
        submitted_at: FIXED_TIMESTAMP + 10_000,
        policy_agreement_id: 'pa-1',
        audit_log_id: 'audit-resubmit-001',
      }),
    )
    const onSubmitted = vi.fn()

    render(
      <ResubmitForm
        proposalId="p-x"
        expectedVersion={3}
        title="t"
        body="b"
        visibility="internal"
        onSubmit={onSubmit}
        onSubmitted={onSubmitted}
      />,
    )

    fireEvent.change(screen.getByTestId('resubmit-form-reason'), {
      target: { value: '差し戻しを反映しました' },
    })
    fireEvent.click(screen.getByTestId('resubmit-form-submit'))

    // Promise の解決を待つ（vi.waitFor の代わりに microtask flush を 1 回回す）。
    await Promise.resolve()
    await Promise.resolve()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      reason: '差し戻しを反映しました',
      expected_version: 3,
      title: 't',
      body: 'b',
      visibility: 'internal',
    })
    expect(onSubmitted).toHaveBeenCalledTimes(1)
  })

  it('reason 空白のみ → onSubmit には reason: undefined で渡す（API-009 m-03 正規化と整合）', async () => {
    const onSubmit = vi.fn(
      async (_input: {
        reason?: string
      }): Promise<ResubmitResult> => ({
        proposal_id: 'p-x',
        status: 'submitted',
        version: 4,
        submitted_at: FIXED_TIMESTAMP + 10_000,
        policy_agreement_id: 'pa-1',
        audit_log_id: 'audit-resubmit-001',
      }),
    )

    render(
      <ResubmitForm
        proposalId="p-x"
        expectedVersion={3}
        title="t"
        body="b"
        visibility="internal"
        onSubmit={onSubmit as never}
      />,
    )

    fireEvent.change(screen.getByTestId('resubmit-form-reason'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByTestId('resubmit-form-submit'))
    await Promise.resolve()
    await Promise.resolve()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const call = onSubmit.mock.calls[0]?.[0] as { reason?: unknown }
    expect(call.reason).toBeUndefined()
  })

  it('reason が 4,001 文字 → submit が disabled になり onSubmit は呼ばれない', () => {
    const onSubmit = vi.fn(async (): Promise<ResubmitResult> => {
      throw new Error('should not be called')
    })

    render(
      <ResubmitForm
        proposalId="p-x"
        expectedVersion={3}
        title="t"
        body="b"
        visibility="internal"
        onSubmit={onSubmit as never}
      />,
    )

    const textarea = screen.getByTestId('resubmit-form-reason') as HTMLTextAreaElement
    // textarea には maxLength=REASON_MAX_LENGTH+1 が付いているため 4,001 文字は受理される
    // が、コンポーネント側で reasonTooLong=true と判定して disabled にする。
    const longReason = 'a'.repeat(4_001)
    fireEvent.change(textarea, { target: { value: longReason } })
    expect(textarea.value.length).toBe(4_001)

    const submitBtn = screen.getByTestId('resubmit-form-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    fireEvent.click(submitBtn)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('onSubmit が AuthorizationError(404) を throw → globalError が表示される', async () => {
    class FakeAuthorizationError extends Error {
      readonly httpStatus = 404
      readonly errorCode = 'NOT_FOUND'
      constructor() {
        super('authorization denied')
        this.name = 'AuthorizationError'
      }
    }
    const onSubmit = vi.fn(async (): Promise<ResubmitResult> => {
      throw new FakeAuthorizationError()
    })

    render(
      <ResubmitForm
        proposalId="p-x"
        expectedVersion={3}
        title="t"
        body="b"
        visibility="internal"
        onSubmit={onSubmit as never}
      />,
    )

    fireEvent.change(screen.getByTestId('resubmit-form-reason'), {
      target: { value: '理由' },
    })
    fireEvent.click(screen.getByTestId('resubmit-form-submit'))

    // 非同期 catch → setState の反映を待つため、findBy を使う
    // （@testing-library/react が内部で MutationObserver で待機する）。
    const banner = await screen.findByTestId('resubmit-form-error')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(banner.textContent ?? '').toMatch(/見つかりません/)
  })
})

// ---------------------------------------------------------------------------
// 4. loadMyProposalDetail — getMyProposal -> LoaderResult mapping
// ---------------------------------------------------------------------------
describe('REQ-005 / REQ-007 / TEST-039: loadMyProposalDetail の状態 mapping', () => {
  function seedProposals(): ReadonlyArray<Proposal> {
    // u-1 の全 8 status × visibility=private で組む（withdrawn は loader 側 404 集約の検証用）。
    const out: Proposal[] = [
      makeProposal({ author_id: 'u-1', status: 'draft', visibility: 'private', id: 'mine-draft' }),
      makeProposal({
        author_id: 'u-1',
        status: 'submitted',
        visibility: 'private',
        id: 'mine-submitted',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'in_review',
        visibility: 'private',
        id: 'mine-in_review',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'approved',
        visibility: 'private',
        id: 'mine-approved',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'returned',
        visibility: 'private',
        id: 'mine-returned',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'rejected',
        visibility: 'private',
        id: 'mine-rejected',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'published',
        visibility: 'public',
        id: 'mine-published',
      }),
      makeProposal({
        author_id: 'u-1',
        status: 'withdrawn',
        visibility: 'public',
        id: 'mine-withdrawn',
      }),
      // 他人の投稿（404 検証用）
      makeProposal({
        author_id: 'u-other',
        status: 'published',
        visibility: 'public',
        id: 'other-published',
      }),
    ]
    return out
  }

  function seedAudit(): ReadonlyArray<AuditLog> {
    // mine-returned に対する return エントリを 1 件入れて last_return_reason を整合させる。
    return [
      makeAuditLog({
        actor_id: 'reviewer-1',
        target_proposal_id: 'mine-returned',
        action: 'return',
      }),
    ]
  }

  it('viewer = null（guest）→ state="unauthorized"（401）', async () => {
    const proposals = createInMemoryProposalRepository(seedProposals())
    const audit = createInMemoryAuditLogRepository(seedAudit())
    const result: LoaderResult = await loadMyProposalDetail(null, 'mine-draft', {
      proposals,
      audit,
    })
    expect(result.state).toBe('unauthorized')
  })

  it('他人の投稿 → state="not_found"（404 not_owner_resource）', async () => {
    const proposals = createInMemoryProposalRepository(seedProposals())
    const audit = createInMemoryAuditLogRepository(seedAudit())
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const result = await loadMyProposalDetail(viewer, 'other-published', {
      proposals,
      audit,
    })
    expect(result.state).toBe('not_found')
  })

  it('withdrawn 自身分 → state="not_found"（REQ-005 AC: 公開撤回時は 404 隠蔽）', async () => {
    const proposals = createInMemoryProposalRepository(seedProposals())
    const audit = createInMemoryAuditLogRepository(seedAudit())
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const result = await loadMyProposalDetail(viewer, 'mine-withdrawn', {
      proposals,
      audit,
    })
    expect(result.state).toBe('not_found')
  })

  it('不在 proposal_id（認証済 viewer） → state="not_found"', async () => {
    const proposals = createInMemoryProposalRepository(seedProposals())
    const audit = createInMemoryAuditLogRepository(seedAudit())
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const result = await loadMyProposalDetail(viewer, 'does-not-exist', {
      proposals,
      audit,
    })
    expect(result.state).toBe('not_found')
  })

  it('不在 proposal_id（guest）→ state="unauthorized"（認証要求が先）', async () => {
    const proposals = createInMemoryProposalRepository(seedProposals())
    const audit = createInMemoryAuditLogRepository(seedAudit())
    const result = await loadMyProposalDetail(null, 'does-not-exist', {
      proposals,
      audit,
    })
    expect(result.state).toBe('unauthorized')
  })

  it.each([
    'draft',
    'submitted',
    'in_review',
    'approved',
    'returned',
    'rejected',
    'published',
  ] as const)('本人 + status=%s → state="ok"', async (status) => {
    const proposals = createInMemoryProposalRepository(seedProposals())
    const audit = createInMemoryAuditLogRepository(seedAudit())
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const result = await loadMyProposalDetail(viewer, `mine-${status}`, {
      proposals,
      audit,
    })
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.proposal.proposal_id).toBe(`mine-${status}`)
    expect(result.proposal.status).toBe(status)
    if (status === 'returned') {
      expect(result.proposal.last_return_reason).not.toBeNull()
    } else {
      expect(result.proposal.last_return_reason).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 5. 副作用検査: loader / コンポーネントが console を呼ばない
// ---------------------------------------------------------------------------
describe('NFR-003 / TEST-039: 副作用検査', () => {
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

  it('loadMyProposalDetail / MyProposalDetail / ReturnReasonBanner / ResubmitForm のいずれも console.* を呼ばない', async () => {
    const proposals = createInMemoryProposalRepository([
      makeProposal({
        author_id: 'u-1',
        status: 'returned',
        visibility: 'private',
        id: 'mine-returned',
      }),
    ])
    const audit = createInMemoryAuditLogRepository([
      makeAuditLog({
        actor_id: 'reviewer-1',
        target_proposal_id: 'mine-returned',
        action: 'return',
      }),
    ])

    // unauthorized 経路
    const guestResult = await loadMyProposalDetail(null, 'mine-returned', {
      proposals,
      audit,
    })
    expect(guestResult.state).toBe('unauthorized')

    // ok 経路
    const viewer: Viewer = { user_id: 'u-1', roles: ['user'] }
    const okResult = await loadMyProposalDetail(viewer, 'mine-returned', {
      proposals,
      audit,
    })
    expect(okResult.state).toBe('ok')
    if (okResult.state !== 'ok') return

    const { actions, resubmit } = makeActions()
    render(<MyProposalDetail proposal={okResult.proposal} actions={actions} />)
    render(<ReturnReasonBanner reason={makeLastReturnReason()} />)
    render(
      <ResubmitForm
        proposalId="p-x"
        expectedVersion={0}
        title="t"
        body="b"
        visibility="private"
        onSubmit={(input) => actions.resubmit('p-x', input)}
      />,
    )
    // resubmit spy は呼ばれていない（描画のみ）
    expect(resubmit).not.toHaveBeenCalled()

    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
    expect(vi.mocked(console.info)).not.toHaveBeenCalled()
    expect(vi.mocked(console.debug)).not.toHaveBeenCalled()
  })
})
