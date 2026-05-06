// SCR-006 / API-013 / API-009 / UC-009 / UC-010 — 自分の投稿詳細（route `/me/proposals/$id`）
//
// 役割:
//   - getMyProposal (API-013) loader を呼び、結果を MyProposalDetail に渡す。
//   - AuthorizationError を 3 状態（'ok' / 'unauthorized' / 'not_found'）の判別共用体に
//     正規化し、route コンポーネント側で UI を出し分ける（SCR-006 §状態遷移）。
//   - status='returned' の場合は ReturnReasonBanner + ResubmitForm を表示し、API-009
//     resubmit を本ページから直接呼べるようにする（TASK-039 完了条件）。
//
// 認可・隠蔽方針（SCR-006 §権限による表示分岐 / API-013 §認可マトリクス）:
//   - 401 UNAUTHENTICATED: guest が `/me/proposals/$id` を要求 → 「ログインが必要です」表示
//     （MVP は文言誘導のみ。SCR-007 へのリダイレクト連携は TASK-040 完了後に組み込む）。
//   - 404 NOT_FOUND: 不在 / 他人の投稿 / `withdrawn` 自身分（REQ-005 AC、API-013 §認可拒否）
//     → 「投稿が見つかりません」表示。withdrawn は本文を露出させない（loader 側で 404 集約済）。
//   - 200 OK: MyProposalDetail で本文 + メタ情報 + status 別 UI（returned 時は banner + form）。
//
// 公開バイパスは無い（API-013 §認可: 認証必須）。MVP では viewer = null（guest）固定で
// 動かし、guest 経路の UI を確定させる。SSR session middleware 経由の viewer 解決は後続
// TASK（TASK-053 wrangler / route 接続）の責務であり、ここでは context 経由で受け取る形に
// は組まない（src/routes/me/proposals.tsx と同方針）。
//
// 依存注入: createInMemoryProposalRepository / createInMemoryAuditLogRepository /
//   createInMemoryPolicyAgreementRepository を loader / action 内で都度生成する
//   （src/routes/me/proposals.tsx / src/routes/proposals/new.tsx と同方針）。
//   将来 D1 移行 / Workers バインディング経由の repository 注入に切り替える際は
//   route の context 経由で差し替えるが、本 TASK の範囲外。
import { createFileRoute } from '@tanstack/react-router'

import {
  MyProposalDetail,
  type MyProposalDetailActions,
} from '#/components/my-proposal'
import { AuthorizationError } from '#/server/auth/authorize'
import type { Viewer } from '#/server/auth/session'
import { createInMemoryAuditLogRepository } from '#/server/audit/repository'
import { resubmit } from '#/server/functions/resubmit'
import {
  getMyProposal,
  type MyProposalDetail as MyProposalDetailData,
} from '#/server/loaders/get-my-proposal'
import { createInMemoryPolicyAgreementRepository } from '#/server/repositories/policy-agreements'
import {
  createInMemoryProposalRepository,
  type ProposalRepository,
} from '#/server/repositories/proposals'
import type { AuditLogRepository } from '#/server/audit/repository'

/**
 * loader が返す状態の判別共用体。
 *
 * SCR-006 §状態遷移の `success` / `unauthorized` / `notFound` に対応する。
 * 4xx (400 / 5xx) 系は本 loader 内では発生しないため扱わない（getMyProposal は
 * AuthorizationError(401/404) のみを throw する）。
 */
export type LoaderResult =
  | { state: 'ok'; proposal: MyProposalDetailData }
  | { state: 'unauthorized' }
  | { state: 'not_found' }

export interface LoadMyProposalDetailDeps {
  readonly proposals: ProposalRepository
  readonly audit: AuditLogRepository
}

/**
 * `getMyProposal` を呼び、AuthorizationError(401/404) を LoaderResult に正規化する。
 *
 * 別関数として export する理由は src/routes/proposals/$id.tsx の
 * loadPublishedDetail と同じ:
 *   - createFileRoute の loader を直接 vitest から呼ぶのは TanStack Router の
 *     context を擬似する必要があり煩雑。loader の本体ロジック（認可拒否の
 *     mapping）は route 構造に依存しないので、ここに切り出してユニットテストで
 *     状態 mapping を直接検証できるようにする（TEST-039）。
 *   - withdrawn / 不在 / 他人の投稿 / authorize の denial 全てが getMyProposal 内で
 *     AuthorizationError(404 not_owner_resource) または AuthorizationError(401
 *     not_authenticated) に集約済み（TASK-026）。本関数は httpStatus を見て
 *     LoaderResult.state へ翻訳するのみ。
 *
 * 想定外の例外（Error 等）はそのまま再 throw して上位の error boundary に委ねる。
 */
export async function loadMyProposalDetail(
  viewer: Viewer | null,
  proposalId: string,
  deps: LoadMyProposalDetailDeps,
): Promise<LoaderResult> {
  try {
    const proposal = await getMyProposal(viewer, proposalId, {
      proposals: deps.proposals,
      audit: deps.audit,
    })
    return { state: 'ok', proposal }
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (e.httpStatus === 401) {
        return { state: 'unauthorized' }
      }
      // httpStatus === 404: not_owner_resource（不在 / 他人 / 自身の withdrawn）を
      // すべて「見つかりません」に集約（API-013 §認可拒否時の挙動 / REQ-005 AC）。
      return { state: 'not_found' }
    }
    throw e
  }
}

export const Route = createFileRoute('/me/proposals/$id')({
  loader: async ({ params }) => {
    // MVP: viewer = null（guest）固定。
    // session 解決は TASK-053 で route context 経由に切り替える。
    const viewer: Viewer | null = null
    return await loadMyProposalDetail(viewer, params.id, {
      proposals: createInMemoryProposalRepository(),
      audit: createInMemoryAuditLogRepository(),
    })
  },
  component: MyProposalDetailPage,
})

function MyProposalDetailPage() {
  const data = Route.useLoaderData()

  if (data.state === 'unauthorized') {
    // SCR-006 §エラー・空状態 / §権限による表示分岐: guest は 401。
    // MVP では SCR-007 (login) ルートが未生成のため、明示的なメッセージのみ表示する
    // （src/routes/me/proposals.tsx の unauthorized UI と同じ方針）。
    return (
      <main
        data-testid="my-proposal-detail-unauthorized"
        className="mx-auto max-w-3xl px-6 py-16"
      >
        <h1 className="text-3xl font-bold tracking-tight">ログインが必要です</h1>
        <p className="mt-4 text-muted-foreground">
          自分の投稿詳細を表示するにはログインしてください。
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
    // SCR-006 §エラー・空状態: 不在 / 他人の投稿 / withdrawn 自身分を 404 で統一表示。
    // withdrawn は本文を露出させない（REQ-005 AC「公開撤回時は 404 隠蔽」、
    // API-013 §認可拒否時の挙動「withdrawn 自身分は 404」）。
    return (
      <main
        data-testid="my-proposal-detail-not-found"
        className="mx-auto max-w-3xl px-6 py-16"
      >
        <h1 className="text-3xl font-bold tracking-tight">投稿が見つかりません</h1>
        <p className="mt-4 text-muted-foreground">
          この投稿は存在しないか、取り下げられた可能性があります。
        </p>
        <p className="mt-8">
          <a href="/me/proposals" className="underline">
            自分の投稿一覧に戻る
          </a>
        </p>
      </main>
    )
  }

  const actions: MyProposalDetailActions = buildActions()

  return <MyProposalDetail proposal={data.proposal} actions={actions} />
}

/**
 * server function を依存注入済みの形で `MyProposalDetailActions` に詰める。
 *
 * MVP wiring（src/routes/proposals/new.tsx の buildActions と同方針）:
 *   - viewer = null（guest）固定。実機では TASK-040 / TASK-053 完了後に置き換え。
 *   - リポジトリは都度新規作成（永続性なし）。実機では context 経由で差し替え。
 *
 * テストでは ResubmitForm / MyProposalDetail に直接 spy 注入できるため、本関数の
 * テストは行わない（route 経由の SSR 統合は TASK-053 / E2E TASK の範囲）。
 */
function buildActions(): MyProposalDetailActions {
  // viewer は MVP では null 固定。本物の認証統合後に context から取得する想定。
  const viewer: Viewer | null = null
  const proposals = createInMemoryProposalRepository()
  const policyAgreements = createInMemoryPolicyAgreementRepository()
  const audit = createInMemoryAuditLogRepository()

  return {
    resubmit: (proposalId, input) =>
      resubmit(viewer, proposalId, input, {
        proposals,
        policyAgreements,
        audit,
      }),
  }
}
