// 構造化ログのホワイトリストラッパ。
// BD-ARCH §技術選定 / NFR-005 / NFR-007: 許可フィールドのみを構造化 JSON で出力し、
// PII を構造的に出さない。`src/server/` 配下で生 console API を使わない（CI grep で 0 件強制）。
// 主な構成（後続 TASK で追加）:
//   - logger.ts : info / warn / error などのホワイトリスト型付き API
export {}
