// @vitest-environment jsdom
//
// TEST-037 — SCR-004 投稿フォーム（draft 編集 / 提出）
// REQ-002 / REQ-013 / REQ-014 / REQ-015 / NFR-003 / API-002 / API-018 /
// API-022 / API-023 / UC-002 / UC-016
//
// 範囲:
//   - ProposalForm（presentational + 状態管理）の振る舞いを spy 注入で検証する。
//   - レンダリング: title / body / visibility / 倫理ガード 3 種 / PolicyAgreement /
//     「下書き保存」「提出する」ボタンが描画される。
//   - 倫理ガード未確認 / 同意なし → 「提出する」ボタンが disabled（UX 補助、NFR-003 と整合）。
//   - createDraft 連携: 新規モードで「下書き保存」を押すと createDraft が呼ばれる。
//   - updateDraft 連携: 編集モードで「下書き保存」を押すと updateDraft が
//     既存 proposal_id + expected_version 付きで呼ばれる。
//   - submit 連携: 「提出する」確定で倫理ガード true + 同意 true + visibility +
//     expected_version 付きで submit が呼ばれる。
//   - 副作用: console.* を一切呼ばない（NFR-003）。
//
// route 全体（createFileRoute の loader / SSR レスポンス）の統合検証は
// TanStack Start の test util がまだ整っていないため本 TEST では行わない。
// 統合経路は TASK-053 (wrangler dev で SSR 200 確認) と TASK-047 (E2E) で扱う。

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProposalForm } from '../../src/components/proposal-form'
import type {
  ProposalFormActions,
  ProposalFormInitialDraft,
} from '../../src/components/proposal-form'
import type {
  CreateDraftInput,
  CreateDraftResult,
} from '../../src/server/functions/create-draft'
import type {
  SubmitInput,
  SubmitResult,
} from '../../src/server/functions/submit'
import type {
  UpdateDraftInput,
  UpdateDraftResult,
} from '../../src/server/functions/update-draft'
import type { PolicyDocument } from '../../src/server/loaders/get-policy-document'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// fixtures / helpers
// ---------------------------------------------------------------------------

const PROPOSAL_ID_NEW = 'p-new-001'
const PROPOSAL_ID_EXISTING = 'p-existing-001'

function makePolicy(overrides: Partial<PolicyDocument> = {}): PolicyDocument {
  return {
    kind: 'privacy',
    policy_version: 'mvp-initial',
    title: 'プライバシーポリシー',
    content_markdown: '# プライバシーポリシー\n\n本サービスの取り扱い…',
    last_modified_at: Date.UTC(2026, 4, 1, 0, 0, 0),
    ...overrides,
  }
}

interface ActionsBundle {
  readonly actions: ProposalFormActions
  readonly createDraft: ReturnType<
    typeof vi.fn<(input: CreateDraftInput) => Promise<CreateDraftResult>>
  >
  readonly updateDraft: ReturnType<
    typeof vi.fn<
      (proposalId: string, input: UpdateDraftInput) => Promise<UpdateDraftResult>
    >
  >
  readonly submit: ReturnType<
    typeof vi.fn<(proposalId: string, input: SubmitInput) => Promise<SubmitResult>>
  >
}

function makeActions(): ActionsBundle {
  const createDraft = vi.fn(
    async (_input: CreateDraftInput): Promise<CreateDraftResult> => ({
      proposal_id: PROPOSAL_ID_NEW,
      status: 'draft',
      version: 0,
      author_id: 'user-1',
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_000,
    }),
  )
  const updateDraft = vi.fn(
    async (proposalId: string, input: UpdateDraftInput): Promise<UpdateDraftResult> => ({
      proposal_id: proposalId,
      status: 'draft',
      version: input.expected_version + 1,
      updated_at: 1_700_000_000_000,
    }),
  )
  const submit = vi.fn(
    async (proposalId: string, input: SubmitInput): Promise<SubmitResult> => ({
      proposal_id: proposalId,
      status: 'submitted',
      version: input.expected_version + 1,
      submitted_at: 1_700_000_000_000,
      policy_agreement_id: 'pa-001',
    }),
  )
  const actions: ProposalFormActions = { createDraft, updateDraft, submit }
  return { actions, createDraft, updateDraft, submit }
}

function fillTitleAndBody(title: string, body: string) {
  fireEvent.change(screen.getByTestId('proposal-form-title'), {
    target: { value: title },
  })
  fireEvent.change(screen.getByTestId('proposal-form-body'), {
    target: { value: body },
  })
}

function checkAllEthicsAndConsent() {
  fireEvent.click(screen.getByTestId('ethics-check-personal-info'))
  fireEvent.click(screen.getByTestId('ethics-check-no-libel'))
  fireEvent.click(screen.getByTestId('ethics-check-publicity-acknowledged'))
  fireEvent.click(screen.getByTestId('policy-consent-checkbox'))
}

// ---------------------------------------------------------------------------
// 1. レンダリング: SCR-004 §画面項目
// ---------------------------------------------------------------------------
describe('REQ-002 / REQ-013 / TEST-037: ProposalForm のレンダリング', () => {
  it('SCR-004 §画面項目: title / body / visibility / 倫理ガード 3 種 / PolicyAgreement / ボタンが描画される', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={actions} />)

    // 入力 UI
    expect(screen.getByTestId('proposal-form-title')).toBeDefined()
    expect(screen.getByTestId('proposal-form-body')).toBeDefined()
    expect(screen.getByTestId('proposal-form-visibility-private')).toBeDefined()
    expect(screen.getByTestId('proposal-form-visibility-internal')).toBeDefined()
    expect(screen.getByTestId('proposal-form-visibility-public')).toBeDefined()

    // 倫理ガード 3 種
    expect(screen.getByTestId('ethics-check-personal-info')).toBeDefined()
    expect(screen.getByTestId('ethics-check-no-libel')).toBeDefined()
    expect(screen.getByTestId('ethics-check-publicity-acknowledged')).toBeDefined()

    // PolicyAgreement 文書本体（API-018 から取得した content_markdown）の表示
    const content = screen.getByTestId('policy-consent-content')
    expect(content.textContent ?? '').toContain('プライバシーポリシー')
    expect(screen.getByTestId('policy-consent-version').textContent).toContain(
      'mvp-initial',
    )
    expect(screen.getByTestId('policy-consent-checkbox')).toBeDefined()

    // ボタン
    expect(screen.getByTestId('proposal-form-save-draft')).toBeDefined()
    expect(screen.getByTestId('proposal-form-submit')).toBeDefined()
  })

  it('mode="new" 時は initialDraft 無しで title / body が空、visibility は internal が初期値', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={actions} />)

    expect(
      (screen.getByTestId('proposal-form-title') as HTMLInputElement).value,
    ).toBe('')
    expect(
      (screen.getByTestId('proposal-form-body') as HTMLTextAreaElement).value,
    ).toBe('')
    expect(
      (screen.getByTestId('proposal-form-visibility-internal') as HTMLInputElement)
        .checked,
    ).toBe(true)
  })

  it('mode="edit" 時は initialDraft の値が title / body / visibility に反映される', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    const initialDraft: ProposalFormInitialDraft = {
      proposal_id: PROPOSAL_ID_EXISTING,
      title: '既存タイトル',
      body: '既存本文',
      visibility: 'public',
      version: 3,
    }
    render(
      <ProposalForm
        mode="edit"
        policy={policy}
        actions={actions}
        initialDraft={initialDraft}
      />,
    )
    expect(
      (screen.getByTestId('proposal-form-title') as HTMLInputElement).value,
    ).toBe('既存タイトル')
    expect(
      (screen.getByTestId('proposal-form-body') as HTMLTextAreaElement).value,
    ).toBe('既存本文')
    expect(
      (screen.getByTestId('proposal-form-visibility-public') as HTMLInputElement)
        .checked,
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. UX 補助: 倫理ガード / 同意未確認時の disabled
// ---------------------------------------------------------------------------
describe('REQ-002 / UC-016 / TEST-037: 提出ボタンの UX 補助 disabled', () => {
  it('初期状態（倫理ガード未確認 / 同意なし / title / body 空）では提出ボタンが disabled', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={actions} />)

    const submitBtn = screen.getByTestId('proposal-form-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('title / body 入力済 + 倫理ガード 3 種 ON でも、PolicyAgreement 同意 OFF なら disabled', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={actions} />)

    fillTitleAndBody('タイトル', '本文')
    fireEvent.click(screen.getByTestId('ethics-check-personal-info'))
    fireEvent.click(screen.getByTestId('ethics-check-no-libel'))
    fireEvent.click(screen.getByTestId('ethics-check-publicity-acknowledged'))

    const submitBtn = screen.getByTestId('proposal-form-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('倫理ガード 1 つでも未確認なら、PolicyAgreement 同意 ON でも disabled', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={actions} />)

    fillTitleAndBody('タイトル', '本文')
    // 1 つ目だけ ON、2 つ目以降は未確認
    fireEvent.click(screen.getByTestId('ethics-check-personal-info'))
    fireEvent.click(screen.getByTestId('policy-consent-checkbox'))

    const submitBtn = screen.getByTestId('proposal-form-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('全項目を満たすと提出ボタンが有効になる', () => {
    const policy = makePolicy()
    const { actions } = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={actions} />)

    fillTitleAndBody('タイトル', '本文')
    checkAllEthicsAndConsent()

    const submitBtn = screen.getByTestId('proposal-form-submit') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. createDraft 連携（新規モードで下書き保存）
// ---------------------------------------------------------------------------
describe('API-022 / TEST-037: createDraft 連携', () => {
  it('mode="new" で「下書き保存」を押すと createDraft(input) が title / body / visibility 付きで呼ばれる', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('交差点の歩道整備', 'ベンチを増やしてほしい')
    // visibility を public に変更
    fireEvent.click(screen.getByTestId('proposal-form-visibility-public'))

    fireEvent.click(screen.getByTestId('proposal-form-save-draft'))

    // createDraft が 1 回だけ呼ばれること
    await vi.waitFor(() => {
      expect(bundle.createDraft).toHaveBeenCalledTimes(1)
    })
    expect(bundle.createDraft).toHaveBeenCalledWith({
      title: '交差点の歩道整備',
      body: 'ベンチを増やしてほしい',
      visibility: 'public',
    })
    // updateDraft / submit は呼ばれていないこと
    expect(bundle.updateDraft).toHaveBeenCalledTimes(0)
    expect(bundle.submit).toHaveBeenCalledTimes(0)

    // Toast 相当の保存メッセージが表示されること
    await vi.waitFor(() => {
      expect(screen.getByTestId('proposal-form-draft-saved').textContent).toContain(
        '下書きを保存しました',
      )
    })
  })

  it('保存後に再度「下書き保存」を押すと、2 回目以降は updateDraft が確保済みの proposal_id + expected_version で呼ばれる', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('タイトル', '本文')
    fireEvent.click(screen.getByTestId('proposal-form-save-draft'))
    await vi.waitFor(() => {
      expect(bundle.createDraft).toHaveBeenCalledTimes(1)
    })

    // 本文を編集してもう一度保存 → 既存 proposal_id を載せた updateDraft
    fireEvent.change(screen.getByTestId('proposal-form-body'), {
      target: { value: '本文（編集後）' },
    })
    fireEvent.click(screen.getByTestId('proposal-form-save-draft'))

    await vi.waitFor(() => {
      expect(bundle.updateDraft).toHaveBeenCalledTimes(1)
    })
    expect(bundle.updateDraft).toHaveBeenCalledWith(PROPOSAL_ID_NEW, {
      title: 'タイトル',
      body: '本文（編集後）',
      visibility: 'internal',
      // createDraft のスタブ戻り値 version=0 を expected_version として使う
      expected_version: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// 4. updateDraft 連携（編集モード）
// ---------------------------------------------------------------------------
describe('API-023 / TEST-037: updateDraft 連携', () => {
  it('mode="edit" で「下書き保存」を押すと updateDraft(initialDraft.proposal_id, ..., expected_version=initialDraft.version) が呼ばれる', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    const initialDraft: ProposalFormInitialDraft = {
      proposal_id: PROPOSAL_ID_EXISTING,
      title: '既存タイトル',
      body: '既存本文',
      visibility: 'internal',
      version: 5,
    }
    render(
      <ProposalForm
        mode="edit"
        policy={policy}
        actions={bundle.actions}
        initialDraft={initialDraft}
      />,
    )

    // 編集
    fireEvent.change(screen.getByTestId('proposal-form-title'), {
      target: { value: '更新後タイトル' },
    })
    fireEvent.click(screen.getByTestId('proposal-form-save-draft'))

    await vi.waitFor(() => {
      expect(bundle.updateDraft).toHaveBeenCalledTimes(1)
    })
    expect(bundle.updateDraft).toHaveBeenCalledWith(PROPOSAL_ID_EXISTING, {
      title: '更新後タイトル',
      body: '既存本文',
      visibility: 'internal',
      expected_version: 5,
    })
    expect(bundle.createDraft).toHaveBeenCalledTimes(0)
    expect(bundle.submit).toHaveBeenCalledTimes(0)
  })
})

// ---------------------------------------------------------------------------
// 5. submit 連携（提出フロー）
// ---------------------------------------------------------------------------
describe('API-002 / BR-GUARD-01 / BR-GUARD-02 / TEST-037: submit 連携', () => {
  it('「提出する」→ 確認 → 確定 で submit が倫理ガード true + 同意 true + visibility + expected_version 付きで呼ばれる', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    const initialDraft: ProposalFormInitialDraft = {
      proposal_id: PROPOSAL_ID_EXISTING,
      title: '既存タイトル',
      body: '既存本文',
      visibility: 'public',
      version: 2,
    }
    render(
      <ProposalForm
        mode="edit"
        policy={policy}
        actions={bundle.actions}
        initialDraft={initialDraft}
      />,
    )

    checkAllEthicsAndConsent()

    // 「提出する」押下 → 確認ダイアログ表示
    fireEvent.click(screen.getByTestId('proposal-form-submit'))
    expect(screen.getByTestId('proposal-form-confirm')).toBeDefined()

    // 確認ダイアログの「提出する」を押下
    fireEvent.click(screen.getByTestId('proposal-form-confirm-submit'))

    // 提出前に最新本文を draft に同期させるため updateDraft が 1 回呼ばれる（SCR-004 §UI フロー）
    await vi.waitFor(() => {
      expect(bundle.updateDraft).toHaveBeenCalledTimes(1)
    })
    expect(bundle.updateDraft).toHaveBeenCalledWith(PROPOSAL_ID_EXISTING, {
      title: '既存タイトル',
      body: '既存本文',
      visibility: 'public',
      expected_version: 2,
    })

    // submit が initialDraft.version + 1 (= updateDraft の戻り version) で呼ばれる
    await vi.waitFor(() => {
      expect(bundle.submit).toHaveBeenCalledTimes(1)
    })
    expect(bundle.submit).toHaveBeenCalledWith(PROPOSAL_ID_EXISTING, {
      visibility: 'public',
      ethics_check_personal_info: true,
      ethics_check_no_libel: true,
      ethics_check_publicity_acknowledged: true,
      policy_agreement_consent: true,
      expected_version: 3,
    })
    expect(bundle.createDraft).toHaveBeenCalledTimes(0)
  })

  it('mode="new" で createDraft 未済のまま「提出する」を押すと、createDraft → submit の順で呼ばれる', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('新規タイトル', '新規本文')
    checkAllEthicsAndConsent()
    fireEvent.click(screen.getByTestId('proposal-form-submit'))
    fireEvent.click(screen.getByTestId('proposal-form-confirm-submit'))

    await vi.waitFor(() => {
      expect(bundle.createDraft).toHaveBeenCalledTimes(1)
    })
    expect(bundle.createDraft).toHaveBeenCalledWith({
      title: '新規タイトル',
      body: '新規本文',
      visibility: 'internal',
    })

    await vi.waitFor(() => {
      expect(bundle.submit).toHaveBeenCalledTimes(1)
    })
    expect(bundle.submit).toHaveBeenCalledWith(PROPOSAL_ID_NEW, {
      visibility: 'internal',
      ethics_check_personal_info: true,
      ethics_check_no_libel: true,
      ethics_check_publicity_acknowledged: true,
      policy_agreement_consent: true,
      // createDraft のスタブ戻り値 version=0
      expected_version: 0,
    })
    // 新規 + 直接提出のときは updateDraft をスキップする（pid===null 経路）
    expect(bundle.updateDraft).toHaveBeenCalledTimes(0)
  })

  it('提出に成功すると onSubmitted コールバックに SubmitResult が渡される', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    const onSubmitted = vi.fn()
    const initialDraft: ProposalFormInitialDraft = {
      proposal_id: PROPOSAL_ID_EXISTING,
      title: 'タイトル',
      body: '本文',
      visibility: 'internal',
      version: 0,
    }
    render(
      <ProposalForm
        mode="edit"
        policy={policy}
        actions={bundle.actions}
        initialDraft={initialDraft}
        onSubmitted={onSubmitted}
      />,
    )

    checkAllEthicsAndConsent()
    fireEvent.click(screen.getByTestId('proposal-form-submit'))
    fireEvent.click(screen.getByTestId('proposal-form-confirm-submit'))

    await vi.waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1)
    })
    const arg = onSubmitted.mock.calls[0]?.[0] as SubmitResult
    expect(arg.proposal_id).toBe(PROPOSAL_ID_EXISTING)
    expect(arg.status).toBe('submitted')
  })

  it('確認ダイアログの「キャンセル」を押すと submit は呼ばれない', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('タイトル', '本文')
    checkAllEthicsAndConsent()
    fireEvent.click(screen.getByTestId('proposal-form-submit'))
    expect(screen.getByTestId('proposal-form-confirm')).toBeDefined()

    fireEvent.click(screen.getByTestId('proposal-form-confirm-cancel'))

    expect(bundle.submit).toHaveBeenCalledTimes(0)
    expect(bundle.createDraft).toHaveBeenCalledTimes(0)
    expect(bundle.updateDraft).toHaveBeenCalledTimes(0)
  })
})

// ---------------------------------------------------------------------------
// 6. エラー表示（バリデーション / 認可）
// ---------------------------------------------------------------------------
describe('NFR-003 / TEST-037: server-side エラーの UI 表示', () => {
  it('createDraft が VALIDATION_ERROR (field=title) を throw すると title フィールドにエラーが表示される', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    const validationError = Object.assign(new Error('title must be at most 200 characters'), {
      name: 'CreateDraftValidationError',
      field: 'title' as const,
      httpStatus: 400 as const,
      errorCode: 'VALIDATION_ERROR' as const,
    })
    bundle.createDraft.mockRejectedValueOnce(validationError)

    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('タイトル', '本文')
    fireEvent.click(screen.getByTestId('proposal-form-save-draft'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('proposal-form-title-error')).toBeDefined()
    })
    expect(
      screen.getByTestId('proposal-form-title-error').textContent ?? '',
    ).toContain('title')
  })

  it('createDraft が AuthorizationError(401) を throw すると globalError に「ログインが必要です」が表示される', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    const authError = Object.assign(new Error('not authenticated'), {
      name: 'AuthorizationError',
      httpStatus: 401 as const,
      reason: 'not_authenticated' as const,
    })
    bundle.createDraft.mockRejectedValueOnce(authError)

    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('タイトル', '本文')
    fireEvent.click(screen.getByTestId('proposal-form-save-draft'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('proposal-form-error')).toBeDefined()
    })
    expect(screen.getByTestId('proposal-form-error').textContent ?? '').toContain(
      'ログイン',
    )
  })
})

// ---------------------------------------------------------------------------
// 7. 副作用検査: console.* を一切呼ばない
// ---------------------------------------------------------------------------
describe('NFR-003 / TEST-037: 副作用検査', () => {
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

  it('レンダリング → 入力 → createDraft → submit までの流れで console.* を呼ばない', async () => {
    const policy = makePolicy()
    const bundle = makeActions()
    render(<ProposalForm mode="new" policy={policy} actions={bundle.actions} />)

    fillTitleAndBody('タイトル', '本文')
    checkAllEthicsAndConsent()
    fireEvent.click(screen.getByTestId('proposal-form-submit'))
    fireEvent.click(screen.getByTestId('proposal-form-confirm-submit'))

    await vi.waitFor(() => {
      expect(bundle.submit).toHaveBeenCalledTimes(1)
    })

    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
    expect(vi.mocked(console.warn)).not.toHaveBeenCalled()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
    expect(vi.mocked(console.info)).not.toHaveBeenCalled()
    expect(vi.mocked(console.debug)).not.toHaveBeenCalled()
  })
})
