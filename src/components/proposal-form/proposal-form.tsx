// SCR-004 / API-002 / API-018 / API-022 / API-023 / UC-002 / UC-016 — 投稿フォーム本体
//
// 役割:
//   - 新規 (mode='new') / 編集 (mode='edit') の両モードを 1 コンポーネントで提供する。
//   - title / body / visibility / 倫理ガード 3 種 / PolicyAgreement 同意 を controlled state で管理し、
//     「下書き保存」「提出」の 2 操作を server function 直呼びで実行する。
//   - 検証は **すべて server function 側に委ねる**（NFR-003）。本コンポーネントの disabled は UX 補助。
//
// MVP の妥協（task-breakdown.md TASK-037 §実装指針）:
//   - TanStack Start の form action / mutation 統合は Phase 5 で wiring 確定（TASK-053 等）。
//     本フォームでは `actions` プロップ経由で server function を直接受け取り、テストでは
//     spy 注入する形にする。route 側は createDraft / updateDraft / submit を直 import する。
//   - 認証 (viewer) はサーバ側で確定する。クライアント側では本人 / ロールを判定しない（BR-AUTHZ-03）。
//   - ProposalForm は viewer を受け取らない（form が role を判定しないため）。
//
// 状態遷移（SCR-004 §状態遷移）:
//   editing → savingDraft → editing : 「下書き保存」押下後、Toast 相当のメッセージで戻る
//   editing → submitting → submittedSuccess : 「提出」押下後、onSubmitted コールバックで戻り先 URL を伝える
//   いずれも 4xx/5xx は banner エラー表示 + editing に戻る。AlertDialog はテスト容易性のため
//   MVP では window.confirm 風の単純な確認フローではなく、確認は呼び出し側に委ねず本コンポーネント
//   内で「確認モード」の inline 表示として提供する。
import { useState } from 'react'
import type { FormEvent } from 'react'

import { VISIBILITIES, type Visibility } from '#/lib/domain/types'
import type { PolicyDocument } from '#/server/loaders/get-policy-document'
import type {
  CreateDraftInput,
  CreateDraftResult,
} from '#/server/functions/create-draft'
import type {
  SubmitInput,
  SubmitResult,
} from '#/server/functions/submit'
import type {
  UpdateDraftInput,
  UpdateDraftResult,
} from '#/server/functions/update-draft'
import { cn } from '#/lib/utils'

// shadcn/ui の Button は `@/lib/utils` への import alias を持っており、vitest 側の
// path 解決が `#/` のみのため直接使うと test 起動が失敗する。本フォームは
// Button のスタイル機能を limited 範囲（default / outline）でしか使わないため、
// 同等のクラス文字列を inline で持つ薄いラッパで代替する（Phase 5 の TASK で
// `@/` を `#/` に統一するときに `Button` 直 import に戻す）。
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2'
const BUTTON_DEFAULT = 'bg-primary text-primary-foreground hover:bg-primary/90'
const BUTTON_OUTLINE =
  'border border-input bg-background hover:bg-accent hover:text-accent-foreground'

import {
  EthicsCheckboxes,
  type EthicsCheckState,
} from './ethics-checkboxes'
import { PolicyConsent } from './policy-consent'

export type ProposalFormMode = 'new' | 'edit'

/**
 * ProposalForm が呼び出す mutation 群（依存注入）。
 *
 * route 層では server function (`createDraft` / `updateDraft` / `submit`) を直接 import し、
 * 必要な依存（repositories / audit / etc）をバインドした関数として渡す。
 * テストでは vitest の `vi.fn()` で spy を注入する。
 */
export interface ProposalFormActions {
  /** API-022. 新規時かつ proposalId 未確保のときに呼ばれる。 */
  readonly createDraft: (input: CreateDraftInput) => Promise<CreateDraftResult>
  /** API-023. 編集モード or 新規→保存後の再保存時に呼ばれる。 */
  readonly updateDraft: (
    proposalId: string,
    input: UpdateDraftInput,
  ) => Promise<UpdateDraftResult>
  /** API-002. 「提出する」確定時に呼ばれる。 */
  readonly submit: (proposalId: string, input: SubmitInput) => Promise<SubmitResult>
}

/**
 * 編集モード時に loader が事前に取得した既存 draft の値（fillState 用）。
 */
export interface ProposalFormInitialDraft {
  readonly proposal_id: string
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly version: number
}

export interface ProposalFormProps {
  readonly mode: ProposalFormMode
  readonly policy: PolicyDocument
  readonly actions: ProposalFormActions
  readonly initialDraft?: ProposalFormInitialDraft
  /** 提出成功後に route 層が呼ぶ後処理（例: SCR-006 へ navigate）。 */
  readonly onSubmitted?: (result: SubmitResult) => void
  /** 下書き保存成功後の任意コールバック（route 側 toast 等）。 */
  readonly onDraftSaved?: (
    result: CreateDraftResult | UpdateDraftResult,
  ) => void
  readonly className?: string
}

/**
 * フォーム送信中の処理種別。同時実行を抑止するためのロックキー。
 */
type Pending = 'idle' | 'saving-draft' | 'submitting'

/**
 * Field-level エラー（API-002 / API-022 / API-023 のいずれもバリデーションは
 * 失敗時に `field` 属性付きで throw する設計）。
 *
 * `null` キーは「全体エラー（401/404/422/500/CONFLICT 等）」を意味する。
 */
interface ErrorState {
  readonly fieldErrors: Readonly<Record<string, string>>
  readonly globalError: string | null
}

const EMPTY_ERRORS: ErrorState = { fieldErrors: {}, globalError: null }

/**
 * `Visibility` 値かどうかを判定する type guard。<select> から取り出す文字列を絞り込む。
 */
function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as ReadonlyArray<string>).includes(value)
}

/**
 * 例外を ErrorState に正規化する。
 *
 * - `CreateDraftValidationError` / `UpdateDraftValidationError` /
 *   `SubmitValidationError` は `field` プロパティを持つ（duck typing で抽出）。
 * - `AuthorizationError` (httpStatus=401/404) は globalError に集約。
 * - `SubmitStateError`（422）は globalError に集約。
 * - `ProposalLockError`（409）は globalError「他のタブで編集されました…」。
 *
 * 例外型を `instanceof` で判定するとモジュール境界を増やすため、
 * `name` / `field` / `httpStatus` の存在確認で柔らかく分岐する（テスト容易性も上がる）。
 */
function toErrorState(e: unknown): ErrorState {
  if (e === null || typeof e !== 'object') {
    return {
      fieldErrors: {},
      globalError: 'エラーが発生しました。時間をおいて再度お試しください。',
    }
  }

  const obj = e as { name?: unknown; field?: unknown; httpStatus?: unknown; message?: unknown }
  const name = typeof obj.name === 'string' ? obj.name : ''
  const message = typeof obj.message === 'string' ? obj.message : ''

  // バリデーション系（400）。field を含めば fieldErrors に振り分ける。
  if (
    name === 'CreateDraftValidationError' ||
    name === 'UpdateDraftValidationError' ||
    name === 'SubmitValidationError'
  ) {
    if (typeof obj.field === 'string' && obj.field.length > 0) {
      return {
        fieldErrors: { [obj.field]: message || '入力内容を確認してください' },
        globalError: null,
      }
    }
  }

  // 認可（401 / 404）: 暫定統一に従い「ログインが必要です / 見つかりません」を表示。
  if (name === 'AuthorizationError') {
    if (obj.httpStatus === 401) {
      return {
        fieldErrors: {},
        globalError: 'ログインが必要です。再度ログインしてください。',
      }
    }
    return {
      fieldErrors: {},
      globalError: '対象の下書きが見つかりません。',
    }
  }

  // 楽観ロック（409）
  if (name === 'ProposalLockError') {
    return {
      fieldErrors: {},
      globalError:
        '他のタブで編集された可能性があります。最新の状態を読み込み直してください。',
    }
  }

  // 業務ルール違反（422）
  if (name === 'SubmitStateError' || name === 'UpdateDraftStateError') {
    return {
      fieldErrors: {},
      globalError: 'この提案は提出できません（既に提出済みなどの可能性があります）。',
    }
  }

  return {
    fieldErrors: {},
    globalError: 'エラーが発生しました。時間をおいて再度お試しください。',
  }
}

export function ProposalForm({
  mode,
  policy,
  actions,
  initialDraft,
  onSubmitted,
  onDraftSaved,
  className,
}: ProposalFormProps) {
  const [title, setTitle] = useState<string>(initialDraft?.title ?? '')
  const [body, setBody] = useState<string>(initialDraft?.body ?? '')
  const [visibility, setVisibility] = useState<Visibility>(
    initialDraft?.visibility ?? 'internal',
  )
  const [ethics, setEthics] = useState<EthicsCheckState>({
    ethics_check_personal_info: false,
    ethics_check_no_libel: false,
    ethics_check_publicity_acknowledged: false,
  })
  const [consent, setConsent] = useState<boolean>(false)
  const [proposalId, setProposalId] = useState<string | null>(
    initialDraft?.proposal_id ?? null,
  )
  const [version, setVersion] = useState<number>(initialDraft?.version ?? 0)
  const [pending, setPending] = useState<Pending>('idle')
  const [errors, setErrors] = useState<ErrorState>(EMPTY_ERRORS)
  const [confirming, setConfirming] = useState<boolean>(false)
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null)

  const ethicsAllChecked =
    ethics.ethics_check_personal_info &&
    ethics.ethics_check_no_libel &&
    ethics.ethics_check_publicity_acknowledged

  // 「提出」ボタンの UX 補助 disabled。server-side が再検証するため、ここで通っても
  // false の場合は API-002 が 400 を返す（NFR-003）。
  const submitDisabledByUx =
    !ethicsAllChecked ||
    !consent ||
    title.trim().length === 0 ||
    body.trim().length === 0 ||
    pending !== 'idle'

  async function handleSaveDraft(e?: FormEvent) {
    e?.preventDefault()
    if (pending !== 'idle') return
    setPending('saving-draft')
    setErrors(EMPTY_ERRORS)
    setDraftSavedMessage(null)
    try {
      if (proposalId === null) {
        // 新規: createDraft (API-022) を呼んで proposal_id を確保する。
        const result = await actions.createDraft({ title, body, visibility })
        setProposalId(result.proposal_id)
        setVersion(result.version)
        setDraftSavedMessage('下書きを保存しました')
        onDraftSaved?.(result)
      } else {
        // 既存: updateDraft (API-023) を expected_version 付きで呼ぶ。
        const result = await actions.updateDraft(proposalId, {
          title,
          body,
          visibility,
          expected_version: version,
        })
        setVersion(result.version)
        setDraftSavedMessage('下書きを保存しました')
        onDraftSaved?.(result)
      }
    } catch (err) {
      setErrors(toErrorState(err))
    } finally {
      setPending('idle')
    }
  }

  function openConfirm(e?: FormEvent) {
    e?.preventDefault()
    if (submitDisabledByUx) return
    setErrors(EMPTY_ERRORS)
    setDraftSavedMessage(null)
    setConfirming(true)
  }

  async function handleSubmitConfirmed() {
    if (pending !== 'idle') return
    setPending('submitting')
    setErrors(EMPTY_ERRORS)
    try {
      // 新規モードで未だ proposal_id が無ければ、まず createDraft で確保する。
      // SCR-004 §UI フロー: 「下書き保存」を経由せず直接「提出」に進んだケースの救済。
      let pid = proposalId
      let v = version
      if (pid === null) {
        const created = await actions.createDraft({ title, body, visibility })
        pid = created.proposal_id
        v = created.version
        setProposalId(pid)
        setVersion(v)
      } else {
        // 既存 / 既保存: 最新の本文・visibility を draft に同期させてから submit する。
        // server-side が submit 時に title / body の空・長さを再検証するため、
        // 直前の updateDraft で値の整合を確実にする（SCR-004 §UI フロー §UC-002 主シナリオ）。
        const updated = await actions.updateDraft(pid, {
          title,
          body,
          visibility,
          expected_version: v,
        })
        v = updated.version
        setVersion(v)
      }

      const result = await actions.submit(pid, {
        visibility,
        ethics_check_personal_info: ethics.ethics_check_personal_info,
        ethics_check_no_libel: ethics.ethics_check_no_libel,
        ethics_check_publicity_acknowledged:
          ethics.ethics_check_publicity_acknowledged,
        policy_agreement_consent: consent,
        expected_version: v,
      })
      setVersion(result.version)
      setConfirming(false)
      onSubmitted?.(result)
    } catch (err) {
      setErrors(toErrorState(err))
      setConfirming(false)
    } finally {
      setPending('idle')
    }
  }

  function handleSubmitCanceled() {
    setConfirming(false)
  }

  const titleError = errors.fieldErrors['title']
  const bodyError = errors.fieldErrors['body']
  const visibilityError = errors.fieldErrors['visibility']
  const ethicsPersonalInfoError = errors.fieldErrors['ethics_check_personal_info']
  const ethicsNoLibelError = errors.fieldErrors['ethics_check_no_libel']
  const ethicsPublicityError = errors.fieldErrors['ethics_check_publicity_acknowledged']
  const consentError = errors.fieldErrors['policy_agreement_consent']

  return (
    <form
      data-testid="proposal-form"
      data-mode={mode}
      onSubmit={openConfirm}
      className={cn('space-y-6', className)}
    >
      {errors.globalError !== null ? (
        <div
          data-testid="proposal-form-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errors.globalError}
        </div>
      ) : null}

      {draftSavedMessage !== null ? (
        <div
          data-testid="proposal-form-draft-saved"
          role="status"
          className="rounded-md border border-input bg-muted/40 p-3 text-sm"
        >
          {draftSavedMessage}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">タイトル</span>
        <input
          type="text"
          data-testid="proposal-form-title"
          name="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
          }}
          disabled={pending !== 'idle'}
          maxLength={200}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {titleError !== undefined ? (
          <span
            data-testid="proposal-form-title-error"
            className="text-xs text-destructive"
          >
            {titleError}
          </span>
        ) : null}
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">本文</span>
        <textarea
          data-testid="proposal-form-body"
          name="body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
          }}
          disabled={pending !== 'idle'}
          maxLength={10_000}
          rows={10}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {bodyError !== undefined ? (
          <span
            data-testid="proposal-form-body-error"
            className="text-xs text-destructive"
          >
            {bodyError}
          </span>
        ) : null}
      </label>

      <fieldset
        data-testid="proposal-form-visibility"
        className="space-y-2 rounded-md border border-input p-4"
      >
        <legend className="px-1 text-sm font-medium">公開範囲</legend>
        {VISIBILITIES.map((v) => (
          <label
            key={v}
            className="flex items-center gap-2 text-sm"
            data-testid={`proposal-form-visibility-${v}-label`}
          >
            <input
              type="radio"
              name="visibility"
              value={v}
              data-testid={`proposal-form-visibility-${v}`}
              checked={visibility === v}
              onChange={(e) => {
                if (isVisibility(e.target.value)) {
                  setVisibility(e.target.value)
                }
              }}
              disabled={pending !== 'idle'}
            />
            <span>{visibilityLabel(v)}</span>
          </label>
        ))}
        {visibilityError !== undefined ? (
          <span
            data-testid="proposal-form-visibility-error"
            className="text-xs text-destructive"
          >
            {visibilityError}
          </span>
        ) : null}
      </fieldset>

      <EthicsCheckboxes
        value={ethics}
        onChange={setEthics}
        disabled={pending !== 'idle'}
      />
      {ethicsPersonalInfoError !== undefined ? (
        <span
          data-testid="proposal-form-ethics-personal-info-error"
          className="text-xs text-destructive"
        >
          {ethicsPersonalInfoError}
        </span>
      ) : null}
      {ethicsNoLibelError !== undefined ? (
        <span
          data-testid="proposal-form-ethics-no-libel-error"
          className="text-xs text-destructive"
        >
          {ethicsNoLibelError}
        </span>
      ) : null}
      {ethicsPublicityError !== undefined ? (
        <span
          data-testid="proposal-form-ethics-publicity-error"
          className="text-xs text-destructive"
        >
          {ethicsPublicityError}
        </span>
      ) : null}

      <PolicyConsent
        policy={policy}
        consent={consent}
        onConsentChange={setConsent}
        disabled={pending !== 'idle'}
      />
      {consentError !== undefined ? (
        <span
          data-testid="proposal-form-consent-error"
          className="text-xs text-destructive"
        >
          {consentError}
        </span>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="proposal-form-save-draft"
          disabled={pending !== 'idle'}
          onClick={() => {
            void handleSaveDraft()
          }}
          className={cn(BUTTON_BASE, BUTTON_OUTLINE)}
        >
          下書き保存
        </button>
        <button
          type="submit"
          data-testid="proposal-form-submit"
          disabled={submitDisabledByUx}
          className={cn(BUTTON_BASE, BUTTON_DEFAULT)}
        >
          提出する
        </button>
      </div>

      {confirming ? (
        <div
          data-testid="proposal-form-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proposal-form-confirm-title"
          className="rounded-md border border-input bg-background p-4 shadow"
        >
          <p
            id="proposal-form-confirm-title"
            className="text-sm font-medium"
          >
            提出すると編集できなくなります。よろしいですか？
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="proposal-form-confirm-cancel"
              onClick={handleSubmitCanceled}
              disabled={pending === 'submitting'}
              className={cn(BUTTON_BASE, BUTTON_OUTLINE)}
            >
              キャンセル
            </button>
            <button
              type="button"
              data-testid="proposal-form-confirm-submit"
              onClick={() => {
                void handleSubmitConfirmed()
              }}
              disabled={pending === 'submitting'}
              className={cn(BUTTON_BASE, BUTTON_DEFAULT)}
            >
              提出する
            </button>
          </div>
        </div>
      ) : null}
    </form>
  )
}

function visibilityLabel(v: Visibility): string {
  if (v === 'public') return '公開（誰でも閲覧可能）'
  if (v === 'internal') return '組織内（ログイン済ユーザに公開）'
  return '非公開（自分のみ）'
}
