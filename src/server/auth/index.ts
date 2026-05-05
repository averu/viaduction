// 認可ヘルパー / セッション解決の単一エントリポイント。
// BD-ARCH §技術選定 / NFR-003: 本ディレクトリ以外でロール判定を書かない（CI grep で 0 件強制）。
// 主な構成（後続 TASK で追加）:
//   - authorize.ts : authorize(viewer, action, resource) の単一 export
//   - session.ts   : cookie からの viewer 解決（許可リスト照合）
export {}
