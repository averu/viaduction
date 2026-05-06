// SCR-002 / API-010 / UC-011 — 公開投稿一覧の表示コンポーネント
//
// 役割:
//   - listPublished (API-010) loader が返した PublishedProposalSummary[] を
//     プレーンに描画する presentational component。
//   - 認可判定や visibility のフィルタは loader 側で完結している（BR-AUTHZ-03）。
//     本コンポーネントは role を一切判定せず、渡された配列をそのまま表示する。
//
// SCR-002 §画面項目 §UI §ナビゲーション に対応:
//   - タイトル、visibility バッジ、published_at の日付表示。
//   - 0 件時は空状態テキスト「公開された提案はまだありません」。
//   - カードクリックで /proposals/{id} (SCR-003) へ遷移。
//
// 詳細遷移は素の <a href> を使う。TanStack Router の <Link> は型レベルで
// route tree から path を解決するため、`/proposals/$id` route が未作成
// （TASK-036 で生成）の現時点では型エラーになる。route tree が揃った段階で
// <Link> に置き換える。SSR / 公開バイパスの主目的（SCR-002 §目的）は
// <a> でも満たせる。
import type { PublishedProposalSummary } from '#/server/loaders/list-published'
import { cn } from '#/lib/utils'

import { VisibilityBadge } from './visibility-badge'

export function ProposalList({
  items,
  className,
}: {
  items: ReadonlyArray<PublishedProposalSummary>
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p className={cn('text-muted-foreground', className)} data-testid="proposal-list-empty">
        公開された提案はまだありません。
      </p>
    )
  }

  return (
    <ul className={cn('divide-y', className)} data-testid="proposal-list">
      {items.map((p) => (
        <li key={p.proposal_id} className="py-4">
          <article>
            <a
              href={`/proposals/${encodeURIComponent(p.proposal_id)}`}
              className="text-lg font-medium hover:underline"
            >
              <h2>{p.title}</h2>
            </a>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <VisibilityBadge visibility={p.visibility} />
              <time dateTime={new Date(p.published_at).toISOString()}>
                {formatPublishedAt(p.published_at)}
              </time>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}

function formatPublishedAt(epochMs: number): string {
  // SCR-002 §画面項目: 「YYYY-MM-DD HH:mm」整形（ja-JP ロケール）。
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
