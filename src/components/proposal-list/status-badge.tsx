// SCR-005 §画面項目 — ステータスバッジ（提案ライフサイクル表示）
//
// MyProposalList カード内に配置する読み取り専用の小コンポーネント。
// 全 8 status (draft / submitted / in_review / approved / returned /
// rejected / published / withdrawn) を日本語ラベル + 色味で表示する。
//
// 不変条件:
//   - 8 status 全てに対して LABEL / TONE が定義されていること（Record により
//     TypeScript レベルで網羅性を強制）。
//   - 色のみで識別させない（バッジテキストでも識別可能、SCR-005 §アクセシビリティ）。
//   - `aria-label="ステータス: ..."` を付与する（SCR-005 §アクセシビリティ）。
//
// 色味は SCR-005 §画面項目の暫定マッピングに準拠。色数値は Tailwind の
// 既定パレットに合わせて選んだ近似色（teal は emerald-200/900 で代替）。
import type { ProposalStatus } from '#/lib/domain/types'
import { cn } from '#/lib/utils'

const LABEL: Record<ProposalStatus, string> = {
  draft: '下書き',
  submitted: '提出済',
  in_review: 'レビュー中',
  approved: '承認済',
  returned: '差し戻し',
  rejected: '却下',
  published: '公開中',
  withdrawn: '取下げ',
}

const TONE: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-800',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  returned: 'bg-orange-100 text-orange-800',
  rejected: 'bg-red-100 text-red-800',
  published: 'bg-emerald-200 text-emerald-900',
  withdrawn: 'bg-zinc-200 text-zinc-700',
}

export function StatusBadge({
  status,
  className,
}: {
  status: ProposalStatus
  className?: string
}) {
  return (
    <span
      data-testid={`status-badge-${status}`}
      aria-label={`ステータス: ${LABEL[status]}`}
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        TONE[status],
        className,
      )}
    >
      {LABEL[status]}
    </span>
  )
}
