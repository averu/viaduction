// TEST-008 — CSRF / Origin 検証ミドルウェア
// NFR-006 / API-002 / API-003 / API-004 / API-005 / API-006 / API-007 / API-008
// API-009 / API-019 / API-020 / API-022 / API-023
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CsrfError,
  csrfCheckFromRequest,
  verifyCsrf,
  type CsrfCheckInput,
} from '../../../src/server/middleware/csrf'
import {
  createLogger,
  type LogLevel,
  type LogSink,
} from '../../../src/server/observability/logger'

interface CapturedRecord {
  level: LogLevel
  json: string
  parsed: Record<string, unknown>
}

function makeStubLogger(): {
  logger: ReturnType<typeof createLogger>
  records: CapturedRecord[]
} {
  const records: CapturedRecord[] = []
  const sink: LogSink = {
    emit(level, json) {
      records.push({
        level,
        json,
        parsed: JSON.parse(json) as Record<string, unknown>,
      })
    },
  }
  return { logger: createLogger(sink), records }
}

const SAME_HOST = 'app.example.com'
const SAME_ORIGIN = `https://${SAME_HOST}`
const OTHER_ORIGIN = 'https://attacker.example.org'

function baseInput(overrides: Partial<CsrfCheckInput> = {}): CsrfCheckInput {
  return {
    origin: SAME_ORIGIN,
    secFetchSite: 'same-origin',
    host: SAME_HOST,
    requestId: 'req-csrf-1',
    route: '/api/proposals/:id/submit',
    method: 'POST',
    ...overrides,
  }
}

describe('NFR-006 / TEST-008: Sec-Fetch-Site による高速判定', () => {
  it('Sec-Fetch-Site=same-origin: 通過し logger を呼ばない', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'same-origin' }), { logger }),
    ).not.toThrow()
    expect(records).toHaveLength(0)
  })

  it('Sec-Fetch-Site=cross-site: CsrfError を throw し warn を 1 行記録', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'cross-site' }), { logger }),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.level).toBe('warn')
    expect(record.parsed['403_reason']).toBe('cross_site')
    expect(record.parsed.error_code).toBe('CSRF_DENIED')
    expect(record.parsed.request_id).toBe('req-csrf-1')
    expect(record.parsed.route).toBe('/api/proposals/:id/submit')
    expect(record.parsed.method).toBe('POST')
  })

  it('Sec-Fetch-Site=cross-origin: CsrfError を throw', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'cross-origin' }), { logger }),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
    const record = records[0]
    expect(record?.parsed['403_reason']).toBe('cross_site')
  })

  it('Sec-Fetch-Site=none: CsrfError を throw（直接 URL アクセス相当）', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'none' }), { logger }),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
  })

  it('Sec-Fetch-Site=same-site: CsrfError を throw（同一サイト別オリジンも厳密に拒否）', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'same-site' }), { logger }),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
  })

  it('Sec-Fetch-Site が想定外文字列: Origin fallback を経ず拒否', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({
          secFetchSite: 'bogus-value',
          origin: SAME_ORIGIN,
          host: SAME_HOST,
        }),
        { logger },
      ),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
  })
})

describe('NFR-006 / TEST-008: Sec-Fetch-Site 欠落時の Origin fallback', () => {
  it('欠落 + Origin/Host 一致: 通過し logger を呼ばない', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({ secFetchSite: null, origin: SAME_ORIGIN, host: SAME_HOST }),
        { logger },
      ),
    ).not.toThrow()
    expect(records).toHaveLength(0)
  })

  it('欠落 + Origin/Host 不一致: CsrfError を throw', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({ secFetchSite: null, origin: OTHER_ORIGIN, host: SAME_HOST }),
        { logger },
      ),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
    expect(records[0]?.parsed['403_reason']).toBe('cross_site')
  })

  it('欠落 + Origin 欠落: CsrfError を throw', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({ secFetchSite: null, origin: null, host: SAME_HOST }),
        { logger },
      ),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
  })

  it('欠落 + Host 欠落: CsrfError を throw', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({ secFetchSite: null, origin: SAME_ORIGIN, host: null }),
        { logger },
      ),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
  })

  it('欠落 + Origin がパース不能: CsrfError を throw', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({
          secFetchSite: null,
          origin: 'not-a-valid-origin-string',
          host: SAME_HOST,
        }),
        { logger },
      ),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
  })

  it('欠落 + Origin に port 付き: Host も同 port なら通過', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(
        baseInput({
          secFetchSite: null,
          origin: 'http://localhost:5173',
          host: 'localhost:5173',
        }),
        { logger },
      ),
    ).not.toThrow()
    expect(records).toHaveLength(0)
  })
})

describe('NFR-006 / TEST-008: csrfCheckFromRequest アダプタ', () => {
  it('Headers から origin / sec-fetch-site / host を抽出して通過', () => {
    const { logger, records } = makeStubLogger()
    const req = new Request(`${SAME_ORIGIN}/v1/proposals/abc/submit`, {
      method: 'POST',
      headers: {
        Origin: SAME_ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
        Host: SAME_HOST,
      },
    })
    expect(() =>
      csrfCheckFromRequest(req, { logger, requestId: 'req-1', route: '/v1/proposals/:id/submit' }),
    ).not.toThrow()
    expect(records).toHaveLength(0)
  })

  it('cross-site の Request: CsrfError を throw し warn を記録', () => {
    const { logger, records } = makeStubLogger()
    const req = new Request(`${SAME_ORIGIN}/v1/proposals/abc/submit`, {
      method: 'POST',
      headers: {
        Origin: OTHER_ORIGIN,
        'Sec-Fetch-Site': 'cross-site',
        Host: SAME_HOST,
      },
    })
    expect(() =>
      csrfCheckFromRequest(req, {
        logger,
        requestId: 'req-2',
        route: '/v1/proposals/:id/submit',
      }),
    ).toThrow(CsrfError)
    expect(records).toHaveLength(1)
    const record = records[0]
    expect(record?.parsed['403_reason']).toBe('cross_site')
    expect(record?.parsed.method).toBe('POST')
    expect(record?.parsed.request_id).toBe('req-2')
    expect(record?.parsed.route).toBe('/v1/proposals/:id/submit')
  })

  it('Sec-Fetch-Site 欠落の Request: Origin fallback で通過', () => {
    const { logger, records } = makeStubLogger()
    const req = new Request(`${SAME_ORIGIN}/v1/proposals/abc/submit`, {
      method: 'POST',
      headers: {
        Origin: SAME_ORIGIN,
        Host: SAME_HOST,
      },
    })
    expect(() => csrfCheckFromRequest(req, { logger })).not.toThrow()
    expect(records).toHaveLength(0)
  })
})

describe('NFR-006 / TEST-008: CsrfError の構造', () => {
  it('instanceof Error / CsrfError', () => {
    const err = new CsrfError()
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(CsrfError)
  })

  it('httpStatus=403 / errorCode=CSRF_DENIED / reason=cross_site', () => {
    const err = new CsrfError()
    expect(err.httpStatus).toBe(403)
    expect(err.errorCode).toBe('CSRF_DENIED')
    expect(err.reason).toBe('cross_site')
    expect(err.name).toBe('CsrfError')
  })

  it('default message に PII / Origin の生 URL を含めない', () => {
    const err = new CsrfError()
    expect(err.message).not.toContain(SAME_ORIGIN)
    expect(err.message).not.toContain(OTHER_ORIGIN)
    expect(err.message).not.toContain('@')
    expect(err.message).not.toMatch(/https?:\/\//)
  })

  it('throw された CsrfError は verifyCsrf の呼び出し側で識別できる', () => {
    const { logger } = makeStubLogger()
    let captured: unknown = null
    try {
      verifyCsrf(baseInput({ secFetchSite: 'cross-site' }), { logger })
    } catch (e) {
      captured = e
    }
    expect(captured).toBeInstanceOf(CsrfError)
    if (captured instanceof CsrfError) {
      expect(captured.httpStatus).toBe(403)
      expect(captured.errorCode).toBe('CSRF_DENIED')
      expect(captured.reason).toBe('cross_site')
    }
  })
})

describe('NFR-006 / TEST-008: 副作用ガード', () => {
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ]
    if (typeof globalThis.fetch === 'function') {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('fetch must not be called from csrf middleware')
      })
    }
  })

  afterEach(() => {
    for (const s of consoleSpies) s.mockRestore()
    fetchSpy?.mockRestore()
    consoleSpies = []
    fetchSpy = null
  })

  it('拒否時に fetch / console を直接呼ばない（logger 経由のみ）', () => {
    const { logger, records } = makeStubLogger()
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'cross-site' }), { logger }),
    ).toThrow(CsrfError)

    // logger は stub sink へのみ emit され、console.* は呼ばれない
    for (const s of consoleSpies) {
      expect(s).not.toHaveBeenCalled()
    }
    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled()
    }
    expect(records).toHaveLength(1)
  })

  it('成功時は logger も含めて何も呼ばない', () => {
    const { logger, records } = makeStubLogger()
    expect(() => verifyCsrf(baseInput(), { logger })).not.toThrow()
    expect(records).toHaveLength(0)
    for (const s of consoleSpies) {
      expect(s).not.toHaveBeenCalled()
    }
  })
})

describe('NFR-006 / TEST-008: logger オプションのデフォルト挙動', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('options.logger 未指定: default logger 経由で console.warn が 1 回呼ばれる', () => {
    expect(() =>
      verifyCsrf(baseInput({ secFetchSite: 'cross-site' })),
    ).toThrow(CsrfError)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    const arg = consoleWarnSpy.mock.calls[0]?.[0]
    expect(typeof arg).toBe('string')
    if (typeof arg === 'string') {
      const parsed = JSON.parse(arg) as Record<string, unknown>
      expect(parsed['403_reason']).toBe('cross_site')
      expect(parsed.error_code).toBe('CSRF_DENIED')
    }
  })
})
