// SCR-003 / API-011 / UC-011 — 公開投稿詳細（route `/proposals/$id`）
//
// 役割:
//   - getPublished (API-011) loader を呼び、結果を ProposalDetail に渡す。
//   - AuthorizationError を 3 状態（'ok' / 'not_found' / 'unauthorized'）の判別共用体に
//     正規化し、route コンポーネント側で UI を出し分ける（SCR-003 §状態遷移）。
//
// 認可・隠蔽方針（SCR-003 §権限による表示分岐 / API-011 §認可マトリクス）:
//   - 401 UNAUTHENTICATED: guest が `internal` / `private` を要求 → 「ログインが必要です」表示
//   - 404 NOT_FOUND: 不在 / `withdrawn` / 認可違反（user 他人の private 等）
//     → 「投稿が見つかりません」表示。withdrawn は本文を露出させない（REQ-005 AC）。
//   - 200 OK: ProposalDetail で本文表示
//
// 公開バイパス（API-011 §認可・SCR-003 §目的）:
//   public 投稿は guest でも 200。MVP では viewer = null（guest）固定で動かす。
//   SSR session middleware 経由の viewer 解決は後続 TASK（TASK-053 wrangler /
//   route 接続）の責務であり、ここでは context 経由で受け取る形には組まない。
//
// 依存注入: createInMemoryProposalRepository を loader 内で直接呼ぶ。
// 将来 D1 移行 / Workers バインディング経由の repository 注入に切り替える際は
// route の context 経由で差し替えるが、本 TASK の範囲外（src/routes/index.tsx と同方針）。
import { createFileRoute } from '@tanstack/react-router'

import { ProposalDetail } from '#/components/proposal-detail'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import {
  getPublished,
  type PublishedProposalDetail,
} from '#/server/loaders/get-published'
import {
  createInMemoryProposalRepository,
  type ProposalRepository,
} from '#/server/repositories/proposals'

/**
 * loader が返す状態の判別共用体。
 *
 * SCR-003 §状態遷移の `success` / `unauthorized` / `notFound` に対応する。
 * 400 / 5xx は本 loader 内では発生しないため扱わない（呼び出し側の error boundary 任せ）。
 */
export type LoaderResult =
  | { state: 'ok'; proposal: PublishedProposalDetail }
  | { state: 'not_found' }
  | { state: 'unauthorized' }

export interface LoadPublishedDetailDeps {
  readonly proposals: ProposalRepository
}

/**
 * `getPublished` を呼び、AuthorizationError(401/404) を LoaderResult に正規化する。
 *
 * 別関数として export する理由:
 *   - createFileRoute の loader を直接 vitest から呼ぶのは TanStack Router の context
 *     を擬似する必要があり煩雑。loader の本体ロジック（認可拒否のマッピング）は
 *     route 構造に依存しないので、ここに切り出してユニットテストで状態 mapping を
 *     直接検証できるようにする（TEST-036）。
 *   - withdrawn / 不在 / authorize の denial 全てが getPublished 内で
 *     AuthorizationError(404) または AuthorizationError(401) に集約済み
 *     (TASK-024)。本関数は httpStatus を見て LoaderResult.state へ翻訳するのみ。
 *
 * 想定外の例外（Error 等）はそのまま再 throw して上位の error boundary に委ねる。
 */
export async function loadPublishedDetail(
  viewer: Viewer | null,
  proposalId: string,
  deps: LoadPublishedDetailDeps,
): Promise<LoaderResult> {
  try {
    const proposal = await getPublished(viewer, proposalId, {
      proposals: deps.proposals,
    })
    return { state: 'ok', proposal }
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (e.httpStatus === 401) {
        return { state: 'unauthorized' }
      }
      // httpStatus === 404: not_owner_resource / insufficient_role / not_owner を
      // すべて「見つかりません」に集約（API-011 §認可拒否時の挙動 / REQ-005 AC）。
      return { state: 'not_found' }
    }
    throw e
  }
}

export const Route = createFileRoute('/proposals/$id')({
  loader: async ({ params }) => {
    // MVP: viewer = null（guest）固定。
    // session 解決は TASK-053 で route context 経由に切り替える。
    const viewer: Viewer | null = null
    return await loadPublishedDetail(viewer, params.id, {
      proposals: createInMemoryProposalRepository(),
    })
  },
  component: ProposalDetailPage,
})

function ProposalDetailPage() {
  const data = Route.useLoaderData()

  if (data.state === 'unauthorized') {
    // SCR-003 §エラー・空状態: guest が internal/private を要求した 401。
    // MVP では SCR-007 (login) ルートが未生成のため、明示的なメッセージのみ表示する。
    // 自動リダイレクト / Toast 連携は SCR-007 実装 TASK と合わせて組み込む。
    return (
      <main
        data-testid="proposal-detail-unauthorized"
        className="mx-auto max-w-3xl px-6 py-16"
      >
        <h1 className="text-3xl font-bold tracking-tight">ログインが必要です</h1>
        <p className="mt-4 text-muted-foreground">
          この投稿を閲覧するにはログインしてください。
        </p>
        <p className="mt-8">
          <a href="/" className="underline">
            公開投稿一覧に戻る
          </a>
        </p>
      </main>
    )
  }

  if (data.state === 'not_found') {
    // SCR-003 §エラー・空状態: 不在 / withdrawn / 認可違反を 404 で統一表示。
    // withdrawn の場合も本文は表示しない（REQ-005 AC「公開撤回時は 404 隠蔽」）。
    return (
      <main
        data-testid="proposal-detail-not-found"
        className="mx-auto max-w-3xl px-6 py-16"
      >
        <h1 className="text-3xl font-bold tracking-tight">投稿が見つかりません</h1>
        <p className="mt-4 text-muted-foreground">
          この投稿は公開されていないか、取り下げられた可能性があります。
        </p>
        <p className="mt-8">
          <a href="/" className="underline">
            公開投稿一覧に戻る
          </a>
        </p>
      </main>
    )
  }

  return <ProposalDetail proposal={data.proposal} />
}
