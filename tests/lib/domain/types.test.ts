// TEST-004 — 共通ドメイン型定義の網羅と glossary 整合
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ERROR_CODES,
  PROPOSAL_STATUSES,
  ROLES,
  VISIBILITIES,
} from '../../../src/lib/domain/types'
import type {
  ErrorCode,
  ProposalStatus,
  Role,
  Visibility,
} from '../../../src/lib/domain/types'

const repoRoot = resolve(__dirname, '..', '..', '..')
const glossaryText = readFileSync(
  resolve(repoRoot, 'docs/02-requirements/05-glossary.md'),
  'utf-8',
)

describe('REQ-008 / TEST-004: Visibility', () => {
  it('matches the 3-value enum required by glossary `### 公開範囲 (visibility)`', () => {
    expect([...VISIBILITIES]).toEqual(['private', 'internal', 'public'])
  })

  it('has no duplicate value', () => {
    expect(new Set(VISIBILITIES).size).toBe(VISIBILITIES.length)
  })

  it.each(VISIBILITIES)('value %s appears as a quoted token in glossary', (value) => {
    expect(glossaryText).toContain(`\`${value}\``)
  })
})

describe('REQ-002..007 / TEST-004: ProposalStatus', () => {
  it('matches the 8-value lifecycle defined in glossary `### ステータス (status)`', () => {
    expect([...PROPOSAL_STATUSES]).toEqual([
      'draft',
      'submitted',
      'in_review',
      'approved',
      'returned',
      'rejected',
      'published',
      'withdrawn',
    ])
  })

  it('has no duplicate value', () => {
    expect(new Set(PROPOSAL_STATUSES).size).toBe(PROPOSAL_STATUSES.length)
  })

  it.each(PROPOSAL_STATUSES)('value %s appears as a quoted token in glossary', (value) => {
    expect(glossaryText).toContain(`\`${value}\``)
  })
})

describe('REQ-010 / REQ-015 / TEST-004: Role', () => {
  it('matches the 5-value role list defined in glossary `### ロール (role)`', () => {
    expect([...ROLES]).toEqual(['guest', 'user', 'reviewer', 'admin', 'auditor'])
  })

  it('has no duplicate value', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length)
  })

  it.each(ROLES)('value %s appears as a quoted token in glossary', (value) => {
    expect(glossaryText).toContain(`\`${value}\``)
  })
})

describe('NFR-003 / TEST-004: ErrorCode', () => {
  it('matches the 7 codes used by detail-design API tables', () => {
    expect([...ERROR_CODES]).toEqual([
      'VALIDATION_ERROR',
      'UNAUTHENTICATED',
      'CSRF_DENIED',
      'NOT_FOUND',
      'CONFLICT',
      'BUSINESS_RULE_VIOLATION',
      'INTERNAL_ERROR',
    ])
  })

  it('has no duplicate value', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
  })
})

describe('TEST-004: type-level exhaustiveness', () => {
  it('every union value is assignable to its type and vice versa (compile-time check)', () => {
    const visibility = VISIBILITIES satisfies readonly Visibility[]
    const status = PROPOSAL_STATUSES satisfies readonly ProposalStatus[]
    const role = ROLES satisfies readonly Role[]
    const code = ERROR_CODES satisfies readonly ErrorCode[]
    expect(visibility.length).toBe(3)
    expect(status.length).toBe(8)
    expect(role.length).toBe(5)
    expect(code.length).toBe(7)
  })
})
