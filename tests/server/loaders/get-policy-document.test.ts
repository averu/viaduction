// TEST-031 — getPolicyDocument loader (API-018 / REQ-013 / REQ-014 / DB-005)
//
// 検証観点:
//   1. kind='posting' → POSTING_POLICY のスキーマで返却（kind / policy_version / title /
//      content_markdown / last_modified_at）
//   2. kind='privacy' → PRIVACY_POLICY のスキーマで返却
//   3. kind が enum 外（'invalid' / 'admin' / 'unknown' / 大文字違い等）→ PolicyKindError
//      （httpStatus=404, errorCode='NOT_FOUND', invalidKind 保持）
//   4. 公開バイパス: viewer を引数に取らない / authorize モジュールを呼ばない
//   5. policy_version: デフォルトでは 'mvp-initial'、deps.getCurrentPolicyVersion を渡せば
//      その戻り値が採用される
//   6. 副作用なし: console.* が呼ばれない
//   7. DB-005 §不変条件 3 整合: デフォルト policy_version が 'mvp-initial' リテラル
//
// 参照: docs/20-detail-design/apis/API-018.md、
//       docs/02-requirements/02-functional-requirements.md REQ-013 / REQ-014、
//       docs/20-detail-design/db/DB-005.md（§不変条件 3）

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authorizeModule from '../../../src/server/auth/authorize'
import { POSTING_POLICY } from '../../../src/lib/policies/posting'
import { PRIVACY_POLICY } from '../../../src/lib/policies/privacy'
import {
  getPolicyDocument,
  PolicyKindError,
} from '../../../src/server/loaders/get-policy-document'

// ---------------------------------------------------------------------------
// 副作用 spy
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleInfoSpy: ReturnType<typeof vi.spyOn>
let authorizeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  authorizeSpy = vi.spyOn(authorizeModule, 'authorize')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNoSideEffects(): void {
  expect(authorizeSpy).not.toHaveBeenCalled()
  expect(consoleLogSpy).not.toHaveBeenCalled()
  expect(consoleWarnSpy).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  expect(consoleInfoSpy).not.toHaveBeenCalled()
}

// ---------------------------------------------------------------------------
// 1. kind='posting' → POSTING_POLICY を返す
// ---------------------------------------------------------------------------

describe("REQ-013 / REQ-014 / API-018 / TEST-031: kind='posting' returns POSTING_POLICY", () => {
  it("REQ-014 / TEST-031: posting kind returns POSTING_POLICY content (kind / policy_version / title / content_markdown / last_modified_at)", async () => {
    const result = await getPolicyDocument('posting')

    expect(result).toEqual({
      kind: POSTING_POLICY.kind,
      policy_version: POSTING_POLICY.policy_version,
      title: POSTING_POLICY.title,
      content_markdown: POSTING_POLICY.content_markdown,
      last_modified_at: POSTING_POLICY.last_modified_at,
    })
  })

  it('REQ-014 / TEST-031: posting kind sets kind literal to "posting"', async () => {
    const result = await getPolicyDocument('posting')
    expect(result.kind).toBe('posting')
  })

  it('REQ-014 / TEST-031: posting content_markdown is non-empty markdown', async () => {
    const result = await getPolicyDocument('posting')
    expect(typeof result.content_markdown).toBe('string')
    expect(result.content_markdown.length).toBeGreaterThan(0)
    // Markdown 記法の簡易確認（`# ` で始まる見出しが少なくとも 1 つ）
    expect(result.content_markdown).toMatch(/^#\s/m)
  })
})

// ---------------------------------------------------------------------------
// 2. kind='privacy' → PRIVACY_POLICY を返す
// ---------------------------------------------------------------------------

describe("REQ-014 / API-018 / TEST-031: kind='privacy' returns PRIVACY_POLICY", () => {
  it("REQ-014 / TEST-031: privacy kind returns PRIVACY_POLICY content (kind / policy_version / title / content_markdown / last_modified_at)", async () => {
    const result = await getPolicyDocument('privacy')

    expect(result).toEqual({
      kind: PRIVACY_POLICY.kind,
      policy_version: PRIVACY_POLICY.policy_version,
      title: PRIVACY_POLICY.title,
      content_markdown: PRIVACY_POLICY.content_markdown,
      last_modified_at: PRIVACY_POLICY.last_modified_at,
    })
  })

  it('REQ-014 / TEST-031: privacy kind sets kind literal to "privacy"', async () => {
    const result = await getPolicyDocument('privacy')
    expect(result.kind).toBe('privacy')
  })
})

// ---------------------------------------------------------------------------
// 3. kind が enum 外 → PolicyKindError
// ---------------------------------------------------------------------------

describe('API-018 / TEST-031: invalid kind throws PolicyKindError(404 / NOT_FOUND)', () => {
  it.each(['invalid', 'admin', 'unknown', 'POSTING', 'Privacy', '', ' posting ', 'posting/privacy'])(
    "API-018 / TEST-031: kind=%j throws PolicyKindError",
    async (kind) => {
      await expect(getPolicyDocument(kind)).rejects.toBeInstanceOf(PolicyKindError)
    },
  )

  it('API-018 / TEST-031: PolicyKindError carries httpStatus=404, errorCode=NOT_FOUND, invalidKind', async () => {
    let caught: unknown
    try {
      await getPolicyDocument('invalid')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PolicyKindError)
    const err = caught as PolicyKindError
    expect(err.httpStatus).toBe(404)
    expect(err.errorCode).toBe('NOT_FOUND')
    expect(err.invalidKind).toBe('invalid')
    expect(err.name).toBe('PolicyKindError')
  })

  it('API-018 / TEST-031: PolicyKindError preserves the raw invalid input verbatim', async () => {
    const weirdKind = 'POSTING'
    let caught: PolicyKindError | undefined
    try {
      await getPolicyDocument(weirdKind)
    } catch (error) {
      caught = error as PolicyKindError
    }
    expect(caught?.invalidKind).toBe(weirdKind)
  })
})

// ---------------------------------------------------------------------------
// 4. 公開バイパス: viewer 不要 / authorize 呼ばれない
// ---------------------------------------------------------------------------

describe('API-018 / NFR-003 / TEST-031: public bypass (no viewer, authorize never called)', () => {
  it('API-018 / TEST-031: posting path does not invoke authorize() (public bypass)', async () => {
    await getPolicyDocument('posting')
    expect(authorizeSpy).not.toHaveBeenCalled()
  })

  it('API-018 / TEST-031: privacy path does not invoke authorize() (public bypass)', async () => {
    await getPolicyDocument('privacy')
    expect(authorizeSpy).not.toHaveBeenCalled()
  })

  it('API-018 / TEST-031: invalid kind path does not invoke authorize() either', async () => {
    await expect(getPolicyDocument('invalid')).rejects.toBeInstanceOf(PolicyKindError)
    expect(authorizeSpy).not.toHaveBeenCalled()
  })

  it('API-018 / TEST-031: loader resolves with only kind argument (no viewer required)', async () => {
    // 公開バイパスのため Viewer を引数に取らない。第 1 引数 (kind) のみで完結することを
    // ランタイムで確認する（型レベルでは getPolicyDocument(kind: string, deps?) と定義）。
    await expect(getPolicyDocument('posting')).resolves.toBeDefined()
    await expect(getPolicyDocument('privacy')).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 5. policy_version: デフォルト + DI 上書き
// ---------------------------------------------------------------------------

describe('API-018 / DB-005 / TEST-031: policy_version default and DI override', () => {
  it("API-018 / DB-005 / TEST-031: default policy_version is 'mvp-initial' for posting", async () => {
    const result = await getPolicyDocument('posting')
    expect(result.policy_version).toBe('mvp-initial')
  })

  it("API-018 / DB-005 / TEST-031: default policy_version is 'mvp-initial' for privacy", async () => {
    const result = await getPolicyDocument('privacy')
    expect(result.policy_version).toBe('mvp-initial')
  })

  it('API-018 / TEST-031: getCurrentPolicyVersion DI overrides default policy_version', async () => {
    const result = await getPolicyDocument('posting', {
      getCurrentPolicyVersion: () => '2026-05-01',
    })
    expect(result.policy_version).toBe('2026-05-01')
  })

  it('API-018 / TEST-031: getCurrentPolicyVersion DI is invoked exactly once per call', async () => {
    const fn = vi.fn(() => 'v1.0.0')
    await getPolicyDocument('privacy', { getCurrentPolicyVersion: fn })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('API-018 / TEST-031: getCurrentPolicyVersion DI does not affect other fields', async () => {
    const result = await getPolicyDocument('posting', {
      getCurrentPolicyVersion: () => 'overridden',
    })
    expect(result.title).toBe(POSTING_POLICY.title)
    expect(result.content_markdown).toBe(POSTING_POLICY.content_markdown)
    expect(result.last_modified_at).toBe(POSTING_POLICY.last_modified_at)
  })
})

// ---------------------------------------------------------------------------
// 6. 副作用なし
// ---------------------------------------------------------------------------

describe('NFR-005 / NFR-007 / TEST-031: loader has no console side effects', () => {
  it('TEST-031: posting path does not call console.*', async () => {
    await getPolicyDocument('posting')
    expectNoSideEffects()
  })

  it('TEST-031: privacy path does not call console.*', async () => {
    await getPolicyDocument('privacy')
    expectNoSideEffects()
  })

  it('TEST-031: invalid kind path does not call console.*', async () => {
    await expect(getPolicyDocument('invalid')).rejects.toBeInstanceOf(PolicyKindError)
    expectNoSideEffects()
  })
})

// ---------------------------------------------------------------------------
// 7. DB-005 §不変条件 3 との整合
// ---------------------------------------------------------------------------

describe('DB-005 / REQ-013 / TEST-031: policy_version aligns with DB-005 invariant 3 (mvp-initial)', () => {
  it("DB-005 / TEST-031: posting source policy_version is the literal 'mvp-initial' (matches PolicyAgreement.policy_version)", () => {
    expect(POSTING_POLICY.policy_version).toBe('mvp-initial')
  })

  it("DB-005 / TEST-031: privacy source policy_version is the literal 'mvp-initial' (matches PolicyAgreement.policy_version)", () => {
    expect(PRIVACY_POLICY.policy_version).toBe('mvp-initial')
  })

  it('DB-005 / TEST-031: policy_version length stays within 64 chars (DB-005 column constraint)', () => {
    expect(POSTING_POLICY.policy_version.length).toBeLessThanOrEqual(64)
    expect(PRIVACY_POLICY.policy_version.length).toBeLessThanOrEqual(64)
  })
})
