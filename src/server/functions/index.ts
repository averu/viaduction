// TanStack Start の server function（mutation 系）。
// BD-ARCH §構成図: ブラウザからの form submit / fetch を受けて
// authorize → repository 操作 → AuditLog 記録の順に実行する mutation の入口。
// 主な構成（後続 TASK で追加）:
//   - create-draft.ts / submit.ts / approve.ts / return.ts / reject.ts /
//     publish.ts / withdraw.ts / claim.ts など Proposal ライフサイクルの mutation
export {}
