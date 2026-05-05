// TEST-007 — ログホワイトリストラッパ
// NFR-005 / NFR-007
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consoleSink,
  createLogger,
  logger as defaultLogger,
  type LogFields,
  type LogLevel,
  type LogSink,
} from '../../../src/server/observability/logger'

interface CapturedRecord {
  level: LogLevel
  json: string
  parsed: Record<string, unknown>
}

function makeStubSink(): { sink: LogSink; records: CapturedRecord[] } {
  const records: CapturedRecord[] = []
  const sink: LogSink = {
    emit(level, json) {
      records.push({ level, json, parsed: JSON.parse(json) as Record<string, unknown> })
    },
  }
  return { sink, records }
}

describe('NFR-005 / NFR-007 / TEST-007: 必須フィールドの出力', () => {
  it('emits all 8 required fields plus timestamp', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({
      timestamp: '2026-05-05T00:00:00.000Z',
      request_id: 'req-1',
      route: '/api/proposals/:id/submit',
      method: 'POST',
      status: 200,
      latency_ms: 12,
      user_id_hash: 'a'.repeat(64),
      '403_reason': 'not_authenticated',
    })

    expect(records).toHaveLength(1)
    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.timestamp).toBe('2026-05-05T00:00:00.000Z')
    expect(record.parsed.request_id).toBe('req-1')
    expect(record.parsed.route).toBe('/api/proposals/:id/submit')
    expect(record.parsed.method).toBe('POST')
    expect(record.parsed.status).toBe(200)
    expect(record.parsed.latency_ms).toBe(12)
    expect(record.parsed.user_id_hash).toBe('a'.repeat(64))
    expect(record.parsed['403_reason']).toBe('not_authenticated')
  })

  it('auto-fills timestamp when not provided (ISO8601 prefix)', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ request_id: 'req-2' })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(typeof record.parsed.timestamp).toBe('string')
  })

  it('drops invalid timestamp string and replaces with auto value', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ timestamp: 'not-a-date', request_id: 'req-3' })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.timestamp).not.toBe('not-a-date')
    expect(record.parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('NFR-005 / TEST-007: PII drop（runtime sanitizer）', () => {
  it('silently drops unknown keys (e.g. `body`, `email`, `password`)', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    log.info({
      request_id: 'req-4',
      // 完了条件: 許可フィールド外を runtime でも除外する（型でも弾くが二重防御）
      body: '機密の投稿本文',
      title: '内部タイトル',
      email: 'user@example.com',
      password: 'p@ssw0rd',
      reason_text: '却下理由テキスト',
    } as unknown as LogFields)

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.body).toBeUndefined()
    expect(record.parsed.title).toBeUndefined()
    expect(record.parsed.email).toBeUndefined()
    expect(record.parsed.password).toBeUndefined()
    expect(record.parsed.reason_text).toBeUndefined()
    expect(record.parsed.request_id).toBe('req-4')
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('redacts email-like message to [REDACTED:pii]', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ message: 'contact foo@example.com for details' })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.message).toBe('[REDACTED:pii]')
  })

  it('redacts message that contains newline characters', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ message: 'line1\nline2' })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.message).toBe('[REDACTED:pii]')
  })

  it('redacts message longer than 200 characters', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ message: 'a'.repeat(201) })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.message).toBe('[REDACTED:pii]')
  })

  it('keeps short message without PII unchanged', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ message: 'submit ok' })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.message).toBe('submit ok')
  })
})

describe('NFR-007 / TEST-007: closed set 検査', () => {
  it('drops `403_reason` value outside the closed set', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({
      request_id: 'req-5',
      // closed set 外（型レベルでも弾かれるが runtime も二重防御で確認）
      '403_reason': 'unknown_reason' as never,
    })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed['403_reason']).toBeUndefined()
    expect(record.parsed.request_id).toBe('req-5')
  })

  it('accepts all 5 valid `403_reason` values (incl. cross_site for CSRF)', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)
    const valid = [
      'not_authenticated',
      'insufficient_role',
      'not_owner',
      'not_owner_resource',
      'cross_site',
    ] as const

    for (const reason of valid) {
      log.info({ '403_reason': reason })
    }

    expect(records).toHaveLength(valid.length)
    valid.forEach((reason, idx) => {
      const record = records[idx]
      expect(record).toBeDefined()
      if (!record) return
      expect(record.parsed['403_reason']).toBe(reason)
    })
  })

  it('drops `error_code` value outside the ErrorCode union', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.error({
      request_id: 'req-6',
      error_code: 'NOT_AN_ERROR_CODE' as never,
    })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.error_code).toBeUndefined()
  })

  it('drops `user_id_hash` that is not 64-char hex (e.g. raw email)', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ user_id_hash: 'user@example.com' })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.user_id_hash).toBeUndefined()
  })

  it('drops invalid HTTP method / out-of-range status / negative latency', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({
      method: 'CONNECT' as never,
      status: 999,
      latency_ms: -1,
    })

    const record = records[0]
    expect(record).toBeDefined()
    if (!record) return
    expect(record.parsed.method).toBeUndefined()
    expect(record.parsed.status).toBeUndefined()
    expect(record.parsed.latency_ms).toBeUndefined()
  })
})

describe('NFR-007 / TEST-007: level 引数の正確性', () => {
  it('passes correct level to sink for info / warn / error', () => {
    const { sink, records } = makeStubSink()
    const log = createLogger(sink)

    log.info({ request_id: 'r-info' })
    log.warn({ request_id: 'r-warn' })
    log.error({ request_id: 'r-error' })

    expect(records).toHaveLength(3)
    expect(records[0]?.level).toBe('info')
    expect(records[1]?.level).toBe('warn')
    expect(records[2]?.level).toBe('error')
  })
})

describe('NFR-005 / TEST-007: console 副作用', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('does not call console.* when stub sink is used (PII drop must not log warnings)', () => {
    const { sink } = makeStubSink()
    const log = createLogger(sink)

    log.info({
      message: 'foo@example.com',
      // unknown key を runtime drop
      reason_text: 'PII text',
    } as unknown as LogFields)

    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('consoleSink routes info -> console.log, warn -> console.warn, error -> console.error', () => {
    consoleSink.emit('info', '{"a":1}')
    consoleSink.emit('warn', '{"a":2}')
    consoleSink.emit('error', '{"a":3}')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(consoleLogSpy).toHaveBeenCalledWith('{"a":1}')
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy).toHaveBeenCalledWith('{"a":2}')
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('{"a":3}')
  })

  it('default logger uses consoleSink (info -> console.log)', () => {
    defaultLogger.info({ request_id: 'req-default' })

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const arg = consoleLogSpy.mock.calls[0]?.[0]
    expect(typeof arg).toBe('string')
    if (typeof arg === 'string') {
      const parsed = JSON.parse(arg) as Record<string, unknown>
      expect(parsed.request_id).toBe('req-default')
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})

describe('NFR-005 / TEST-007: 型エラーの確認（compile-time, 完了条件: 許可フィールド外を型で弾く）', () => {
  it('rejects unknown keys at the type level', () => {
    const { sink } = makeStubSink()
    const log = createLogger(sink)

    // @ts-expect-error 完了条件: 許可フィールド外（`body`）を渡すと型エラー
    log.info({ body: 'forbidden' })

    // @ts-expect-error 完了条件: 許可フィールド外（`email`）を渡すと型エラー
    log.info({ email: 'foo@example.com' })

    // @ts-expect-error 完了条件: `403_reason` の closed set 外（`unknown_reason`）は型エラー
    log.info({ '403_reason': 'unknown_reason' })

    // @ts-expect-error 完了条件: `error_code` の ErrorCode union 外は型エラー
    log.info({ error_code: 'NOT_AN_ERROR_CODE' })

    expect(true).toBe(true)
  })
})
