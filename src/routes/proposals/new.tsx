// SCR-004 / API-002 / API-018 / API-022 / API-023 / UC-002 / UC-016 — 投稿フォーム route（新規）
//
// 役割:
//   - `getPolicyDocument('privacy')` (API-018) を loader で先に呼んで PolicyAgreement 表示用の
//     文書を取得し、ProposalForm に渡す。
//   - mutation 系（createDraft / updateDraft / submit）は client-side の onClick / onSubmit から
//     server function を直接 import して呼ぶ MVP wiring。Phase 5 の TanStack Start form action /
//     mutation 統合は別 TASK（TASK-053 等）で確定する（task-breakdown §TASK-037 §実装指針）。
//
// 認可・viewer 解決:
//   - createDraft / updateDraft / submit は内部で authorize() を通過する。MVP では viewer = null
//     で呼ぶと AuthorizationError(401) が返り、ProposalForm が globalError を出す。
//   - 実機での認証は TASK-040 (login) / TASK-053 (wrangler dev SSR) 完了後に組み込まれる。
//     本 TASK では viewer = null 固定でフォームの UI / 連携経路を提供する。
//
// 依存注入: createInMemoryProposalRepository / createInMemoryPolicyAgreementRepository /
//   createInMemoryAuditLogRepository を route 内で都度生成する（src/routes/index.tsx と同方針）。
//   実環境では context 経由で D1 / Workers バインディングに差し替えるが本 TASK の範囲外。
import { createFileRoute } from '@tanstack/react-router'

import { ProposalForm, type ProposalFormActions } from '#/components/proposal-form'
import type { Viewer } from '#/server/auth/session'
import { createInMemoryAuditLogRepository } from '#/server/audit/repository'
import { createDraft } from '#/server/functions/create-draft'
import { submit } from '#/server/functions/submit'
import { updateDraft } from '#/server/functions/update-draft'
import { getPolicyDocument } from '#/server/loaders/get-policy-document'
import { createInMemoryPolicyAgreementRepository } from '#/server/repositories/policy-agreements'
import { createInMemoryProposalRepository } from '#/server/repositories/proposals'

export const Route = createFileRoute('/proposals/new')({
  loader: async () => {
    // SCR-004 §画面項目「PolicyAgreement 同意」は API-018 経由で表示。
    // privacy ポリシーを採用（M-13 確定: PolicyAgreement の policy_version は server-side が
    // API-018 と同一ソースから取得するため、UI 側はどのポリシー文書を見せるかが選択軸）。
    const policy = await getPolicyDocument('privacy')
    return { policy }
  },
  component: ProposalNewPage,
})

function ProposalNewPage() {
  const { policy } = Route.useLoaderData()

  const actions: ProposalFormActions = buildActions()

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">新しい投稿</h1>
      <p className="mt-4 text-muted-foreground">
        タイトル・本文・公開範囲を入力し、倫理ガードと同意の上で提出してください。
      </p>
      <ProposalForm
        mode="new"
        policy={policy}
        actions={actions}
        className="mt-8"
      />
    </main>
  )
}

/**
 * server function を依存注入済みの形で `ProposalFormActions` に詰める。
 *
 * MVP wiring:
 *   - viewer = null（guest）固定。実機では TASK-040 / TASK-053 完了後に置き換え。
 *   - リポジトリは都度新規作成（永続性なし）。実機では context 経由で差し替え。
 *
 * route コンポーネント外の純関数として組み立てる理由:
 *   - render ごとに actions を再生成しない（useMemo は不要、関数自体は重くない）。
 *   - テストでは ProposalForm に直接 spy 注入できるため、本関数のテストは不要。
 */
function buildActions(): ProposalFormActions {
  // viewer は MVP では null 固定。本物の認証統合後に context から取得する想定。
  const viewer: Viewer | null = null
  const proposals = createInMemoryProposalRepository()
  const policyAgreements = createInMemoryPolicyAgreementRepository()
  const audit = createInMemoryAuditLogRepository()

  return {
    createDraft: (input) => createDraft(viewer, input, { proposals }),
    updateDraft: (proposalId, input) =>
      updateDraft(viewer, proposalId, input, { proposals }),
    submit: (proposalId, input) =>
      submit(viewer, proposalId, input, {
        proposals,
        policyAgreements,
        audit,
        getCurrentPolicyVersion: () => 'mvp-initial',
      }),
  }
}
