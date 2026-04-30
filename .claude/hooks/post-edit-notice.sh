#!/usr/bin/env bash
# PostToolUse フック: docs/ 配下が編集されたときにトレーサビリティ再チェックを促す。
# stdin から JSON を受け取り、対象パスが docs/ 配下なら標準エラーに通知する。

set -euo pipefail

input="$(cat)"

# tool_input.file_path を抽出 (jq があれば使い、無ければ grep でフォールバック)
if command -v jq >/dev/null 2>&1; then
  path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"
else
  path="$(printf '%s' "$input" | grep -oE '"file_path"\s*:\s*"[^"]*"' | head -1 | sed -E 's/.*"file_path"\s*:\s*"([^"]*)".*/\1/')"
fi

if [[ -z "${path}" ]]; then
  exit 0
fi

case "${path}" in
  *docs/00-discovery/*|*docs/01-requirement-refinement/*|*docs/02-requirements/*|*docs/10-basic-design/*|*docs/20-detail-design/*|*docs/30-implementation-plan/*|*docs/40-verification/*)
    cat >&2 <<'EOM'
[viaduction] 要件・設計ドキュメントが更新されました。
  → 完了前に `/trace-check` または `npx tsx scripts/validate-traceability.ts` を実行してトレーサビリティを再確認してください。
  → 要件 (REQ/RC) の status を変更した場合は、Acceptance Criteria と Open Questions の整合も再確認してください。
EOM
    ;;
esac

exit 0
