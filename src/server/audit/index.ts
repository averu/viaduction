// AuditLog 永続化（append-only）。
// BD-ARCH §技術選定 / NFR-004 / BR-AUDIT-02: export 関数は append / find / list / get のみ。
// `update*` / `delete*` 命名は禁止（アプリ層強制 + 将来データ層強制）。
// 主な構成（後続 TASK で追加）:
//   - repository.ts : append / find / list / get の実装
export {}
