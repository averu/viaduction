// SCR-003 / API-011 / UC-011 — 公開投稿詳細の表示コンポーネント
//
// 役割:
//   - getPublished (API-011) loader が返した PublishedProposalDetail を描画する
//     presentational component。認可判定や status / visibility のフィルタは
//     loader 側で完結している（BR-AUTHZ-03 / NFR-003）。
//   - 本コンポーネントは role を一切判定せず、渡されたオブジェクトを表示する。
//
// SCR-003 §画面項目 §アクセシビリティ に対応:
//   - タイトル（<h1>）、visibility バッジ、published_at（<time datetime>）、本文（<article>）。
//   - 本文は plain text として `whitespace-pre-wrap` で改行を保持する
//     （SCR-003 §画面項目「本文」: markdown レンダリングは MVP 非対象、改行のみ保持）。
//   - body は React のテキストノードとして埋め込まれるため、ブラウザの自動 escape が
//     効く（XSS 対策、SCR-003 §画面項目「本文」）。dangerouslySetInnerHTML は使わない。
//
// 戻るリンクや SCR-007 への 401 リダイレクト等の状態別 UI は呼び出し側
// (route コンポーネント) の責務とし、本コンポーネントは「成功時の本文表示」に
// 限定する（state='ok' 専用、SCR-003 §状態遷移の `success` ノードに対応）。
import type { PublishedProposalDetail } from '#/server/loaders/get-published'
import { cn } from '#/lib/utils'

import { VisibilityBadge } from '#/components/proposal-list/visibility-badge'

export function ProposalDetail({
  proposal,
  className,
}: {
  proposal: PublishedProposalDetail
  className?: string
}) {
  return (
    <article
      data-testid="proposal-detail"
      className={cn('mx-auto max-w-3xl px-6 py-16', className)}
    >
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{proposal.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <VisibilityBadge visibility={proposal.visibility} />
          <time
            data-testid="proposal-detail-published-at"
            dateTime={new Date(proposal.published_at).toISOString()}
          >
            {formatPublishedAt(proposal.published_at)}
          </time>
        </div>
      </header>
      <section
        data-testid="proposal-detail-body"
        className="mt-8 whitespace-pre-wrap break-words text-base leading-relaxed"
      >
        {proposal.body}
      </section>
    </article>
  )
}

function formatPublishedAt(epochMs: number): string {
  // SCR-003 §画面項目「published_at」: Unix epoch millis を「YYYY-MM-DD HH:mm」整形。
  // SSR / CSR どちらでも安定した出力を得るため、明示的に Asia/Tokyo を指定する
  // （proposal-list/proposal-list.tsx と同方針）。
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
