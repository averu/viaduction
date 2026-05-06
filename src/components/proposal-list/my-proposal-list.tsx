// SCR-005 / API-012 / UC-010 — 自分の投稿一覧の表示コンポーネント
//
// 役割:
//   - listMyProposals (API-012) loader が返した MyProposalSummary[] を
//     プレーンに描画する presentational component。
//   - 認可（author_id == viewer.user_id）は loader 側で完結している
//     （API-012 §認可、BR-AUTHZ-03）。本コンポーネントは role / owner を
//     一切判定せず、渡された配列をそのまま表示する。
//
// SCR-005 §画面項目 §UI に対応:
//   - タイトル、status バッジ（全 8 値）、visibility バッジ、updated_at の表示。
//   - 0 件時は空状態テキスト「投稿はまだありません」（CTA 文言は SCR-005
//     §エラー・空状態の「最初の投稿を作成する」に合わせて表示）。
//   - カードクリックで /me/proposals/{id} (SCR-006) へ遷移。
//
// 詳細遷移は src/routes/index.tsx と同方針で素の <a href> を使う。
// /me/proposals/$id route は TASK-039 で生成されるため、route tree が
// 揃った段階で <Link> に置き換える。
//
// 並び順は loader 側（ProposalRepository.listByAuthor）の updated_at DESC を
// そのまま尊重する（再ソートしない、list-my-proposals.ts §不変条件）。
import type { MyProposalSummary } from '#/server/loaders/list-my-proposals'
import { cn } from '#/lib/utils'

import { StatusBadge } from './status-badge'
import { VisibilityBadge } from './visibility-badge'

export function MyProposalList({
  items,
  className,
}: {
  items: ReadonlyArray<MyProposalSummary>
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p
        className={cn('text-muted-foreground', className)}
        data-testid="my-proposal-list-empty"
      >
        投稿はまだありません。
      </p>
    )
  }

  return (
    <ul className={cn('divide-y', className)} data-testid="my-proposal-list">
      {items.map((p) => (
        <li key={p.proposal_id} className="py-4">
          <article>
            <a
              href={`/me/proposals/${encodeURIComponent(p.proposal_id)}`}
              className="text-lg font-medium hover:underline"
            >
              <h2>{p.title}</h2>
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={p.status} />
              <VisibilityBadge visibility={p.visibility} />
              <time dateTime={new Date(p.updated_at).toISOString()}>
                {formatUpdatedAt(p.updated_at)}
              </time>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}

function formatUpdatedAt(epochMs: number): string {
  // SCR-005 §画面項目: 「YYYY-MM-DD HH:mm」整形（ja-JP ロケール）。
  // SSR / CSR どちらでも安定した出力を得るため、明示的に Asia/Tokyo を指定する。
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
