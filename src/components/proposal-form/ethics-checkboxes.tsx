// SCR-004 / API-002 / UC-016 / BR-GUARD-01 — 倫理ガード 3 種チェックボックス
//
// 役割:
//   - SCR-004 §画面項目「倫理ガード 1〜3」の 3 つの checkbox を controlled で提示する。
//   - submit 時は API-002 が server-side で再検証する（`BR-GUARD-01` / NFR-003）。
//     本コンポーネントの disabled / aria 属性は **UX 補助** に過ぎないことを前提とする。
//
// shadcn/ui の Checkbox 依存を増やさないため、ネイティブ <input type="checkbox"> を
// label 付きで使う（依存追加禁止 / 規約）。
import type { ChangeEvent } from 'react'

import { cn } from '#/lib/utils'

/**
 * SCR-004 §画面項目: 倫理ガード 3 種それぞれの API-002 ボディ送信時のキー。
 * `EthicsCheckKey` は API-002 の `SubmitInput` のうち boolean 3 種と 1:1 で対応する。
 */
export type EthicsCheckKey =
  | 'ethics_check_personal_info'
  | 'ethics_check_no_libel'
  | 'ethics_check_publicity_acknowledged'

export interface EthicsCheckState {
  readonly ethics_check_personal_info: boolean
  readonly ethics_check_no_libel: boolean
  readonly ethics_check_publicity_acknowledged: boolean
}

interface FieldDef {
  readonly key: EthicsCheckKey
  readonly label: string
  readonly testId: string
}

const FIELDS: ReadonlyArray<FieldDef> = [
  {
    key: 'ethics_check_personal_info',
    label: '個人情報を含めないことを確認しました',
    testId: 'ethics-check-personal-info',
  },
  {
    key: 'ethics_check_no_libel',
    label: '第三者の誹謗中傷でないことを確認しました',
    testId: 'ethics-check-no-libel',
  },
  {
    key: 'ethics_check_publicity_acknowledged',
    label: '公開される可能性を理解し同意しました',
    testId: 'ethics-check-publicity-acknowledged',
  },
]

export function EthicsCheckboxes({
  value,
  onChange,
  disabled,
  className,
}: {
  value: EthicsCheckState
  onChange: (next: EthicsCheckState) => void
  disabled?: boolean
  className?: string
}) {
  function handleChange(key: EthicsCheckKey) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, [key]: e.target.checked })
    }
  }

  return (
    <fieldset
      data-testid="ethics-checkboxes"
      className={cn('space-y-2 rounded-md border border-input p-4', className)}
    >
      <legend className="px-1 text-sm font-medium">
        倫理ガード（提出時に必須）
      </legend>
      {FIELDS.map((f) => (
        <label
          key={f.key}
          className="flex items-start gap-2 text-sm"
          data-testid={`${f.testId}-label`}
        >
          <input
            type="checkbox"
            data-testid={f.testId}
            name={f.key}
            checked={value[f.key]}
            onChange={handleChange(f.key)}
            disabled={disabled === true}
            className="mt-1"
          />
          <span>{f.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
