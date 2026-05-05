// BD-ARCH — 仮トップページ (TASK-002 SSR 疎通確認用)
// 本ページは TASK-035 (SCR-002 公開投稿一覧) で置き換える
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">viaduction</h1>
      <p className="mt-4 text-muted-foreground">
        提案レビューの設計駆動開発ハーネス。最初のページ。
      </p>
      <div className="mt-6 flex gap-2">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
      </div>
    </main>
  )
}
