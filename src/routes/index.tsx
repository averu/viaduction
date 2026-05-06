// SCR-002 / API-010 / UC-011 — 公開投稿一覧（トップページ）
//
// route `/` のエントリ。listPublished (API-010) loader を呼び、結果を
// ProposalList に渡して描画する。
//
// 公開バイパス: cookie 不在でも 200 を返す（API-010 §認可、SCR-002 §目的）。
// MVP では viewer = null（guest）固定。SSR session middleware 経由の
// viewer 解決は後続 TASK（TASK-053 wrangler / route 接続）の責務。
// 認証 cookie 経由の viewer 解決は TASK-040 完了後に組み込まれる。
//
// 依存注入: createInMemoryProposalRepository を loader 内で直接呼ぶ。
// 将来 D1 移行 / Workers バインディング経由の repository 注入に切り替える際は
// loader 引数の context 経由で差し替えるが、本 TASK の範囲外。
import { createFileRoute } from '@tanstack/react-router'

import { ProposalList } from '#/components/proposal-list'
import { listPublished } from '#/server/loaders/list-published'
import { createInMemoryProposalRepository } from '#/server/repositories/proposals'

export const Route = createFileRoute('/')({
  loader: async () => {
    const proposals = await listPublished(null, {
      proposals: createInMemoryProposalRepository(),
    })
    return { proposals }
  },
  component: HomePage,
})

function HomePage() {
  const { proposals } = Route.useLoaderData()
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">公開投稿一覧</h1>
      <p className="mt-4 text-muted-foreground">
        市民から寄せられた提案・申請のうち、公開されているものを表示しています。
      </p>
      <ProposalList items={proposals} className="mt-8" />
    </main>
  )
}
