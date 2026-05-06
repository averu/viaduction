// SCR-005 / API-012 / UC-010 — 自分の投稿一覧（route `/me/proposals`）
//
// 役割:
//   - listMyProposals (API-012) loader を呼び、結果を MyProposalList に渡す。
//   - AuthorizationError(401) を 2 状態（'ok' / 'unauthorized'）の判別共用体に
//     正規化し、route コンポーネント側で UI を出し分ける（SCR-005 §状態遷移）。
//
// 認可方針（SCR-005 §権限による表示分岐 / API-012 §認可）:
//   - 401 UNAUTHENTICATED: guest が `/me/proposals` を要求
//     → 「ログインが必要です」表示（MVP は文言誘導のみ。SCR-007 へのリダイレクト
//       連携は TASK-040 完了後に組み込む）。
//   - 200 OK: MyProposalList で全 8 ステータス横断表示（status フィルタ未実装）。
//
// 公開バイパスは無い（API-012 §認可: 認証必須）。MVP では viewer = null（guest）
// 固定で動かし、guest 経路の UI を確定させる。SSR session middleware 経由の
// viewer 解決は後続 TASK（TASK-053 wrangler / route 接続）の責務であり、
// ここでは context 経由で受け取る形には組まない。
//
// 依存注入: createInMemoryProposalRepository を loader 内で直接呼ぶ。
// 将来 D1 移行 / Workers バインディング経由の repository 注入に切り替える際は
// route の context 経由で差し替えるが、本 TASK の範囲外（src/routes/index.tsx と同方針）。
import { createFileRoute } from '@tanstack/react-router'

import { MyProposalList } from '#/components/proposal-list'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import {
  listMyProposals,
  type MyProposalSummary,
} from '#/server/loaders/list-my-proposals'
import {
  createInMemoryProposalRepository,
  type ProposalRepository,
} from '#/server/repositories/proposals'

/**
 * loader が返す状態の判別共用体。
 *
 * SCR-005 §状態遷移の `success` / `empty` / `unauthorized` のうち、
 * `success` と `empty` は items.length で表現できるため 'ok' に統合する。
 * 4xx (400 / 5xx) 系は本 loader 内では発生しないため扱わない（status クエリ
 * 未実装、`UNAUTHENTICATED` のみ AuthorizationError として上がる）。
 */
export type LoaderResult =
  | { state: 'ok'; proposals: ReadonlyArray<MyProposalSummary> }
  | { state: 'unauthorized' }

export interface LoadMyProposalsDeps {
  readonly proposals: ProposalRepository
}

/**
 * `listMyProposals` を呼び、AuthorizationError(401) を LoaderResult に正規化する。
 *
 * 別関数として export する理由は src/routes/proposals/$id.tsx の
 * loadPublishedDetail と同じ:
 *   - createFileRoute の loader を直接 vitest から呼ぶのは TanStack Router の
 *     context を擬似する必要があり煩雑。loader の本体ロジック（認可拒否の
 *     mapping）は route 構造に依存しないので、ここに切り出してユニットテストで
 *     状態 mapping を直接検証できるようにする（TEST-038）。
 *   - listMyProposals は guest（viewer === null）に対し
 *     AuthorizationError(reason='not_authenticated', httpStatus=401) のみを
 *     throw する（list-my-proposals.ts §不変条件）。本関数は httpStatus を
 *     見て LoaderResult.state へ翻訳するのみ。
 *
 * 想定外の例外（Error 等）はそのまま再 throw して上位の error boundary に委ねる。
 */
export async function loadMyProposals(
  viewer: Viewer | null,
  deps: LoadMyProposalsDeps,
): Promise<LoaderResult> {
  try {
    const proposals = await listMyProposals(viewer, { proposals: deps.proposals })
    return { state: 'ok', proposals }
  } catch (e) {
    if (e instanceof AuthorizationError && e.httpStatus === 401) {
      return { state: 'unauthorized' }
    }
    throw e
  }
}

export const Route = createFileRoute('/me/proposals')({
  loader: async () => {
    // MVP: viewer = null（guest）固定。
    // session 解決は TASK-053 で route context 経由に切り替える。
    const viewer: Viewer | null = null
    return await loadMyProposals(viewer, {
      proposals: createInMemoryProposalRepository(),
    })
  },
  component: MyProposalsPage,
})

function MyProposalsPage() {
  const data = Route.useLoaderData()

  if (data.state === 'unauthorized') {
    // SCR-005 §エラー・空状態 / §権限による表示分岐: guest は 401。
    // MVP では SCR-007 (login) ルートが未生成のため、明示的なメッセージのみ表示する
    // （src/routes/proposals/$id.tsx の unauthorized UI と同じ方針）。
    // 自動リダイレクト / Toast 連携は SCR-007 実装 TASK と合わせて組み込む。
    return (
      <main
        data-testid="my-proposals-unauthorized"
        className="mx-auto max-w-3xl px-6 py-16"
      >
        <h1 className="text-3xl font-bold tracking-tight">ログインが必要です</h1>
        <p className="mt-4 text-muted-foreground">
          自分の投稿一覧を表示するにはログインしてください。
        </p>
        <p className="mt-8">
          <a href="/" className="underline">
            公開投稿一覧に戻る
          </a>
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">自分の投稿</h1>
      <p className="mt-4 text-muted-foreground">
        あなたが起票した提案を全ステータス横断で表示しています。
      </p>
      <MyProposalList items={data.proposals} className="mt-8" />
    </main>
  )
}
