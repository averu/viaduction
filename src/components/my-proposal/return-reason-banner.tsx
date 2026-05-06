// SCR-006 / API-013 / UC-009 — 差し戻し理由カード
//
// 役割:
//   - status='returned' のときに直近の `action='return'` AuditLog エントリ（reason /
//     returned_at / audit_log_id）を強調表示する presentational component。
//   - SCR-006 §画面項目「差し戻し理由カード」: `Alert variant=warning` 相当のスタイル、
//     `aria-labelledby="return-reason-heading"` を付与（§アクセシビリティ）。
//   - `last_return_reason` が null の場合は何も描画しない（SCR-006 §画面項目「`last_return_reason`
//     が NULL の場合は表示しない」、防御的: AuditLog 未整合時の不整合バリエーション）。
//
// 認可・データ整形は loader / route 側で完結している。本コンポーネントは渡された
// LastReturnReason をそのまま描画する（NFR-003 と整合: UI は role/visibility を判定しない）。
//
// 改行は本文と同じく `whitespace-pre-wrap` で保持する（差し戻し理由は複数行になり得る）。
// React テキストノードとして埋め込むため、ブラウザの自動 escape が効く（XSS 対策）。

import type { LastReturnReason } from '#/server/loaders/get-my-proposal'
import { cn } from '#/lib/utils'

export function ReturnReasonBanner({
  reason,
  className,
}: {
  reason: LastReturnReason | null
  className?: string
}) {
  if (reason === null) {
    return null
  }

  return (
    <aside
      data-testid="return-reason-banner"
      role="region"
      aria-labelledby="return-reason-heading"
      className={cn(
        'rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900',
        className,
      )}
    >
      <h2
        id="return-reason-heading"
        className="text-base font-semibold"
      >
        差し戻し理由
      </h2>
      <p
        data-testid="return-reason-banner-reason"
        className="mt-2 whitespace-pre-wrap break-words text-sm"
      >
        {reason.reason}
      </p>
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-amber-800">
        <dt>差し戻し日時</dt>
        <dd>
          <time
            data-testid="return-reason-banner-returned-at"
            dateTime={new Date(reason.returned_at).toISOString()}
          >
            {formatReturnedAt(reason.returned_at)}
          </time>
        </dd>
        <dt>監査ログ ID</dt>
        <dd
          data-testid="return-reason-banner-audit-log-id"
          className="break-all font-mono"
        >
          {reason.audit_log_id}
        </dd>
      </dl>
    </aside>
  )
}

function formatReturnedAt(epochMs: number): string {
  // SCR-006 §画面項目「メタ情報」: Unix epoch millis を「YYYY-MM-DD HH:mm」整形。
  // SSR / CSR で安定した出力を得るため、明示的に Asia/Tokyo を指定する
  // （proposal-detail / my-proposal-list と同方針）。
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
