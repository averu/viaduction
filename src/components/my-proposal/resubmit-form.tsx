// SCR-006 / API-009 / UC-009 — 再提出フォーム
//
// 役割:
//   - status='returned' のときに本画面（SCR-006 自分の投稿詳細）から API-009 (resubmit)
//     を呼び出すための薄いフォーム。reason を任意入力で受け、`onSubmit` に
//     `expected_version` 付きで委譲する。
//   - SCR-006 §画面項目「再編集する」ボタン本来の主動線は `SCR-004` への遷移経由だが、
//     本 TASK (TASK-039) の完了条件「『再提出』ボタンで API-009 mutation を呼ぶ」を
//     最小限の UI で満たすために、本詳細画面に直接 mutation 連携を載せる MVP wiring。
//     `SCR-004` 経由のフロー（title / body 編集を伴う）は TASK-037 で確立済であり、
//     本フォームでは reason のみを入力させて元の title / body / visibility を維持する。
//   - `actions.resubmit` は route 側で server function (API-009 resubmit) に DI 注入する。
//     テストでは `vi.fn()` で spy 注入する（proposal-form と同方針）。
//
// バリデーション:
//   - reason: trim 前で 4,000 文字以下（DB-004 §reason 最大長 / API-009 §400）。
//     UX 補助として client-side で 4,001 文字以上を弾くが、最終検証は server function 側
//     `resubmit` の `validateInput` が担当（NFR-003: UI で role/visibility を判定しない、
//     検証も最終的には server で再実行）。
//   - reason は任意 (Q-019 暫定 / DB-004 §reason 表 resubmit=任意)。空文字 / 空白のみは
//     onSubmit に `reason: undefined` で渡す（server 側の m-03 正規化が null に変換）。
//
// 状態遷移:
//   editing → submitting → editing : mutation 完了後 editing に戻り、`onSubmitted` を呼ぶ。
//   失敗時は `globalError` をバナー表示し editing に戻る。
//   `pending` 中は二重送信を抑止（disabled）。
//
// 例外正規化:
//   - `ResubmitValidationError` (400, field='reason' / 'title' / 'body' / 'expected_version')
//     → field エラーは reason のみ拾い、それ以外は globalError に集約。
//   - `AuthorizationError` (401 / 404) → globalError「ログインが必要 / 見つかりません」。
//   - `ResubmitStateError` (422) → globalError「再提出できません」。
//   - `ProposalLockError` (409) → globalError「他のタブで…」。

import { useState } from 'react'
import type { FormEvent } from 'react'

import type {
  ResubmitInput,
  ResubmitResult,
} from '#/server/functions/resubmit'
import type { Visibility } from '#/lib/domain/types'
import { cn } from '#/lib/utils'

const REASON_MAX_LENGTH = 4_000

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2'
const BUTTON_DEFAULT = 'bg-primary text-primary-foreground hover:bg-primary/90'

/**
 * onSubmit に渡す入力。`expected_version` は親から注入された値を使う（CAS 用）。
 * `title` / `body` / `visibility` は本フォームでは編集させず、親から渡された現状値を
 * そのまま onSubmit に詰めて渡す責務（MVP wiring の最小実装、SCR-006 §UC-009）。
 */
export interface ResubmitFormSubmitInput {
  readonly reason?: string
  readonly expected_version: number
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
}

export interface ResubmitFormProps {
  readonly proposalId: string
  readonly expectedVersion: number
  readonly title: string
  readonly body: string
  readonly visibility: Visibility
  readonly onSubmit: (input: ResubmitFormSubmitInput) => Promise<ResubmitResult>
  /** 再提出成功後のコールバック（route 側で navigate 等を行う）。 */
  readonly onSubmitted?: (result: ResubmitResult) => void
  readonly className?: string
}

type Pending = 'idle' | 'submitting'

interface ErrorState {
  readonly fieldErrors: Readonly<Record<string, string>>
  readonly globalError: string | null
}

const EMPTY_ERRORS: ErrorState = { fieldErrors: {}, globalError: null }

/**
 * 例外を ErrorState に正規化する（proposal-form の toErrorState と同方針）。
 *
 * 例外型を `instanceof` で判定するとモジュール境界を増やすため、
 * `name` / `field` / `httpStatus` / `errorCode` の存在確認で柔らかく分岐する。
 */
function toErrorState(e: unknown): ErrorState {
  if (e === null || typeof e !== 'object') {
    return {
      fieldErrors: {},
      globalError: 'エラーが発生しました。時間をおいて再度お試しください。',
    }
  }

  const obj = e as {
    name?: unknown
    field?: unknown
    httpStatus?: unknown
    errorCode?: unknown
    message?: unknown
  }
  const name = typeof obj.name === 'string' ? obj.name : ''
  const message = typeof obj.message === 'string' ? obj.message : ''

  if (name === 'ResubmitValidationError') {
    if (typeof obj.field === 'string' && obj.field.length > 0) {
      // field='reason' は inline 表示、それ以外（title/body/expected_version）は
      // 本フォームでは編集させていないため globalError に集約する（呼び出し側のバグ）。
      if (obj.field === 'reason') {
        return {
          fieldErrors: { reason: message || '入力内容を確認してください' },
          globalError: null,
        }
      }
      return {
        fieldErrors: {},
        globalError: 'この投稿は再提出できません。詳細を再読み込みしてください。',
      }
    }
  }

  if (name === 'AuthorizationError') {
    if (obj.httpStatus === 401) {
      return {
        fieldErrors: {},
        globalError: 'ログインが必要です。再度ログインしてください。',
      }
    }
    return {
      fieldErrors: {},
      globalError: '対象の投稿が見つかりません。',
    }
  }

  if (name === 'ProposalLockError') {
    return {
      fieldErrors: {},
      globalError:
        '他のタブで編集された可能性があります。最新の状態を読み込み直してください。',
    }
  }

  if (name === 'ResubmitStateError') {
    return {
      fieldErrors: {},
      globalError:
        'この投稿は再提出できません（既に状態が変わっている可能性があります）。',
    }
  }

  return {
    fieldErrors: {},
    globalError: 'エラーが発生しました。時間をおいて再度お試しください。',
  }
}

export function ResubmitForm({
  proposalId,
  expectedVersion,
  title,
  body,
  visibility,
  onSubmit,
  onSubmitted,
  className,
}: ResubmitFormProps) {
  const [reason, setReason] = useState<string>('')
  const [pending, setPending] = useState<Pending>('idle')
  const [errors, setErrors] = useState<ErrorState>(EMPTY_ERRORS)

  // UX 補助: client-side で 4,001 文字以上を即時 disabled にする（最終検証は server）。
  const reasonTooLong = reason.length > REASON_MAX_LENGTH
  const submitDisabled = pending !== 'idle' || reasonTooLong

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (submitDisabled) {
      // UX 補助 disabled が外れていない状態で submit が来ることは無いはずだが、
      // 念のため reason 長さ違反を inline エラーで明示する。
      if (reasonTooLong) {
        setErrors({
          fieldErrors: {
            reason: `理由は ${String(REASON_MAX_LENGTH)} 文字以下で入力してください。`,
          },
          globalError: null,
        })
      }
      return
    }
    setPending('submitting')
    setErrors(EMPTY_ERRORS)
    try {
      // server-side の validateInput が空白 trim 後 0 文字を null 正規化するため、
      // 本フォームでは「空文字 / 空白のみ → undefined」「それ以外 → そのまま渡す」を採用する
      // （ResubmitInput の reason は optional、API-009 §ボディ「空 / 空白のみは null として扱う」）。
      const trimmed = reason.trim()
      const reasonForApi: string | undefined = trimmed.length > 0 ? reason : undefined

      const result = await onSubmit({
        reason: reasonForApi,
        expected_version: expectedVersion,
        title,
        body,
        visibility,
      })
      // 成功時は reason / pending を初期化して route 側 callback に委譲。
      setReason('')
      onSubmitted?.(result)
    } catch (err) {
      setErrors(toErrorState(err))
    } finally {
      setPending('idle')
    }
  }

  const reasonError = errors.fieldErrors['reason']

  return (
    <form
      data-testid="resubmit-form"
      data-proposal-id={proposalId}
      onSubmit={handleSubmit}
      className={cn('space-y-4 rounded-md border border-input bg-background p-4', className)}
    >
      <h2 className="text-base font-semibold">再提出</h2>
      <p className="text-sm text-muted-foreground">
        差し戻し内容を確認のうえ、必要に応じて理由を添えて再提出してください。
      </p>

      {errors.globalError !== null ? (
        <div
          data-testid="resubmit-form-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errors.globalError}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">理由（任意）</span>
        <textarea
          data-testid="resubmit-form-reason"
          name="reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
          }}
          disabled={pending !== 'idle'}
          maxLength={REASON_MAX_LENGTH + 1}
          rows={4}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {reasonError !== undefined ? (
          <span
            data-testid="resubmit-form-reason-error"
            className="text-xs text-destructive"
          >
            {reasonError}
          </span>
        ) : null}
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          data-testid="resubmit-form-submit"
          disabled={submitDisabled}
          className={cn(BUTTON_BASE, BUTTON_DEFAULT)}
        >
          再提出する
        </button>
      </div>
    </form>
  )
}

/**
 * onSubmit に直接渡す server function 入力の型（route 側で server function を
 * バインドする際の参照型として export する）。
 */
export type ResubmitFormAction = (input: ResubmitInput) => Promise<ResubmitResult>
