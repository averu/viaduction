// SCR-006 / API-013 / API-009 / UC-009 / UC-010 — 自分の投稿詳細の表示コンポーネント
//
// 役割:
//   - getMyProposal (API-013) loader が返した MyProposalDetail を描画する presentational
//     component。認可（author_id == viewer.user_id）と withdrawn 隠蔽は loader 側で
//     完結している（NFR-003 / BR-AUTHZ-03）。
//   - 本コンポーネントは role を一切判定せず、渡されたオブジェクトを表示する。
//
// SCR-006 §画面項目 §状態遷移 §アクセシビリティ に対応:
//   - <h1> タイトル → status / visibility バッジ → メタ情報（5 タイムスタンプ）
//     → 差し戻し理由カード（status='returned' のみ）→ 本文 → アクション群（status='returned'
//     のみ ResubmitForm）。
//   - 本文は plain text として `whitespace-pre-wrap` で改行を保持する（React の自動 escape、
//     proposal-detail と同方針）。
//   - 差し戻し理由カードは ReturnReasonBanner（status='returned' のみ表示）。
//   - 再提出フォームは ResubmitForm（status='returned' のみ表示）。
//
// 状態別 UI:
//   - draft / submitted / in_review / approved / rejected / published: 本文 + メタ情報のみ。
//     SCR-006 §画面項目「編集」「削除」「公開ページを見る」ボタンは MVP では本コンポーネント
//     から省く（draft 編集導線は SCR-004 の new ルートを暫定使用、TASK-039 範囲外）。
//   - returned: ReturnReasonBanner + ResubmitForm。
//
// `actions.resubmit` は呼び出し側 (route) で server function (resubmit) に DI 注入する。
// テストでは vi.fn() で spy 注入する（proposal-form と同方針）。

import type {
  ResubmitInput,
  ResubmitResult,
} from '#/server/functions/resubmit'
import type { MyProposalDetail as MyProposalDetailData } from '#/server/loaders/get-my-proposal'
import { cn } from '#/lib/utils'

import { StatusBadge } from '#/components/proposal-list/status-badge'
import { VisibilityBadge } from '#/components/proposal-list/visibility-badge'

import { ReturnReasonBanner } from './return-reason-banner'
import { ResubmitForm } from './resubmit-form'

/**
 * MyProposalDetail が呼び出す mutation 群（依存注入）。
 *
 * route 層では server function (`resubmit`) を直接 import し、必要な依存
 * （repositories / audit / etc）をバインドした関数として渡す。
 * テストでは `vi.fn()` で spy を注入する（proposal-form と同方針）。
 */
export interface MyProposalDetailActions {
  /** API-009 resubmit. status='returned' のときに ResubmitForm が呼ぶ。 */
  readonly resubmit: (proposalId: string, input: ResubmitInput) => Promise<ResubmitResult>
}

export interface MyProposalDetailProps {
  readonly proposal: MyProposalDetailData
  readonly actions: MyProposalDetailActions
  readonly onResubmitted?: (result: ResubmitResult) => void
  readonly className?: string
}

export function MyProposalDetail({
  proposal,
  actions,
  onResubmitted,
  className,
}: MyProposalDetailProps) {
  const isReturned = proposal.status === 'returned'

  return (
    <article
      data-testid="my-proposal-detail"
      data-status={proposal.status}
      className={cn('mx-auto max-w-3xl px-6 py-16 space-y-8', className)}
    >
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{proposal.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={proposal.status} />
          <VisibilityBadge visibility={proposal.visibility} />
        </div>
      </header>

      <MetaList proposal={proposal} />

      {isReturned ? (
        <ReturnReasonBanner reason={proposal.last_return_reason} />
      ) : null}

      <section
        data-testid="my-proposal-detail-body"
        className="whitespace-pre-wrap break-words text-base leading-relaxed"
      >
        {proposal.body}
      </section>

      {isReturned ? (
        <ResubmitForm
          proposalId={proposal.proposal_id}
          expectedVersion={proposal.version}
          title={proposal.title}
          body={proposal.body}
          visibility={proposal.visibility}
          onSubmit={(input) => actions.resubmit(proposal.proposal_id, input)}
          onSubmitted={onResubmitted}
        />
      ) : null}
    </article>
  )
}

/**
 * SCR-006 §画面項目「メタ情報」: created_at / updated_at / submitted_at / published_at /
 * withdrawn_at を「YYYY-MM-DD HH:mm」整形で表示。NULL は「—」表示（API-013 で NULL を
 * 受領するライフサイクル時刻があるため）。
 *
 * `withdrawn_at` は loader 側で withdrawn を 404 に集約しているため到達しないが、
 * 型上は number | null なので念のため描画する（防御的）。
 */
function MetaList({ proposal }: { proposal: MyProposalDetailData }) {
  return (
    <dl
      data-testid="my-proposal-detail-meta"
      className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      <dt>作成日時</dt>
      <dd>
        <time
          data-testid="my-proposal-detail-meta-created-at"
          dateTime={new Date(proposal.created_at).toISOString()}
        >
          {formatDateTime(proposal.created_at)}
        </time>
      </dd>
      <dt>更新日時</dt>
      <dd>
        <time
          data-testid="my-proposal-detail-meta-updated-at"
          dateTime={new Date(proposal.updated_at).toISOString()}
        >
          {formatDateTime(proposal.updated_at)}
        </time>
      </dd>
      <dt>提出日時</dt>
      <dd data-testid="my-proposal-detail-meta-submitted-at">
        {renderOptionalDateTime(proposal.submitted_at)}
      </dd>
      <dt>公開日時</dt>
      <dd data-testid="my-proposal-detail-meta-published-at">
        {renderOptionalDateTime(proposal.published_at)}
      </dd>
      <dt>取下げ日時</dt>
      <dd data-testid="my-proposal-detail-meta-withdrawn-at">
        {renderOptionalDateTime(proposal.withdrawn_at)}
      </dd>
    </dl>
  )
}

function renderOptionalDateTime(epochMs: number | null) {
  if (epochMs === null) {
    return '—'
  }
  return (
    <time dateTime={new Date(epochMs).toISOString()}>{formatDateTime(epochMs)}</time>
  )
}

function formatDateTime(epochMs: number): string {
  // SCR-006 §画面項目「メタ情報」: Unix epoch millis を「YYYY-MM-DD HH:mm」整形。
  // SSR / CSR で安定した出力を得るため、明示的に Asia/Tokyo を指定する。
  const d = new Date(epochMs)
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
    hour12: false,
  })
  return fmt.format(d)
}
