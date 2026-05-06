// SCR-004 / API-018 / API-002 / BR-GUARD-02 — PolicyAgreement 同意 UI
//
// 役割:
//   - API-018 (`getPolicyDocument`) が返した `PolicyDocument` の本文を表示し、
//     利用者の同意状態（`policy_agreement_consent`）を controlled で扱う。
//   - 同意の検証は API-002 が server-side で再評価する（`BR-GUARD-02` / NFR-003）。
//     UI 側のチェックボックスは UX 補助。
//
// XSS 配慮:
//   - `content_markdown` は plain text として `whitespace-pre-wrap` で表示する。
//     MVP ではフル markdown レンダリングを行わない（API-018 §レスポンス §`content_markdown` の
//     注記、`dangerouslySetInnerHTML` 禁止）。本書も将来 markdown レンダラ採用時に差し替え。
import type { ChangeEvent } from 'react'

import type { PolicyDocument } from '#/server/loaders/get-policy-document'
import { cn } from '#/lib/utils'

export function PolicyConsent({
  policy,
  consent,
  onConsentChange,
  disabled,
  className,
}: {
  policy: PolicyDocument
  consent: boolean
  onConsentChange: (next: boolean) => void
  disabled?: boolean
  className?: string
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onConsentChange(e.target.checked)
  }

  return (
    <section
      data-testid="policy-consent"
      className={cn('space-y-3 rounded-md border border-input p-4', className)}
    >
      <header>
        <h2 data-testid="policy-consent-title" className="text-base font-semibold">
          {policy.title}
        </h2>
        <p
          data-testid="policy-consent-version"
          className="mt-1 text-xs text-muted-foreground"
        >
          バージョン: {policy.policy_version}
        </p>
      </header>
      <div
        data-testid="policy-consent-content"
        className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-input bg-muted/40 p-3 text-sm leading-relaxed"
      >
        {policy.content_markdown}
      </div>
      <label
        className="flex items-start gap-2 text-sm"
        data-testid="policy-consent-checkbox-label"
      >
        <input
          type="checkbox"
          data-testid="policy-consent-checkbox"
          name="policy_agreement_consent"
          checked={consent}
          onChange={handleChange}
          disabled={disabled === true}
          className="mt-1"
        />
        <span>上記のポリシーに同意します</span>
      </label>
    </section>
  )
}
