// CSRF / Origin / Sec-Fetch-Site などの境界検証ミドルウェア。
// BD-ARCH §技術選定 / NFR-006: SameSite=Lax + Origin / Sec-Fetch-Site 検証で
// CSRF を遮断する（CSRF トークン併用は検討中）。
// 主な構成（後続 TASK で追加）:
//   - csrf.ts   : Origin / Sec-Fetch-Site 検証
//   - request.ts: request_id 採番などの共通前処理
export {}
