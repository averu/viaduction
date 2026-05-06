// SCR-002 §画面項目 — visibility バッジ（公開範囲表示）
//
// ProposalList カード内に配置する読み取り専用の小コンポーネント。
// public / internal / private の 3 値全てを表示できるが、API-010 経由で
// 流れてくるのは guest=public、認証済=public/internal のみ（private は
// 一覧 API の段階で除外される、API-010 §M-7）。private を渡しても表示は
// 落ちない（防御的に label を持つ）が、UI 上で表に出ることはない想定。
import type { Visibility } from '#/lib/domain/types'
import { cn } from '#/lib/utils'

const LABEL: Record<Visibility, string> = {
  public: '公開',
  internal: '組織内',
  private: '非公開',
}

export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: Visibility
  className?: string
}) {
  return (
    <span
      data-testid={`visibility-badge-${visibility}`}
      aria-label={`公開範囲: ${LABEL[visibility]}`}
      className={cn(
        'inline-flex items-center rounded border border-input bg-background px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {LABEL[visibility]}
    </span>
  )
}
