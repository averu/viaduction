// TEST-006 — 認可ヘルパー単一エントリポイント
// NFR-003 / BR-AUTHZ-03 / API-002, API-003, API-004, API-005, API-006, API-007, API-008,
// API-009, API-011, API-012, API-013, API-014, API-015, API-016, API-017,
// API-021, API-022, API-023
import { describe, expect, it, vi } from 'vitest'
import {
  authorize,
  AuthorizationError,
  PUBLIC_BYPASS_ACTIONS,
  type Action,
  type ProposalResource,
} from '../../../src/server/auth/authorize'
import type { Viewer } from '../../../src/server/auth/session'

const ALL_ACTIONS: ReadonlyArray<Action> = [
  'proposal.create',
  'proposal.update',
  'proposal.submit',
  'proposal.resubmit',
  'review.start',
  'review.approve',
  'review.return',
  'review.reject',
  'admin.publish',
  'admin.withdraw',
  'admin.viewProposal',
  'list.myProposals',
  'get.myProposal',
  'list.reviewInbox',
  'get.reviewProposal',
  'get.publishedProposal',
  'list.auditLogs',
  'get.auditLog',
] as const

const userViewer: Viewer = { user_id: 'U1', roles: ['user'] }
const otherUser: Viewer = { user_id: 'U2', roles: ['user'] }
const reviewerViewer: Viewer = { user_id: 'R1', roles: ['reviewer'] }
const adminViewer: Viewer = { user_id: 'A1', roles: ['admin'] }
const auditorViewer: Viewer = { user_id: 'AU1', roles: ['auditor'] }
const userReviewerViewer: Viewer = { user_id: 'UR1', roles: ['user', 'reviewer'] }
const userAdminViewer: Viewer = { user_id: 'UA1', roles: ['user', 'admin'] }

const ownProposalPublic: ProposalResource = {
  kind: 'proposal',
  author_id: 'U1',
  visibility: 'public',
  status: 'published',
}
const ownProposalPrivate: ProposalResource = {
  kind: 'proposal',
  author_id: 'U1',
  visibility: 'private',
  status: 'published',
}
const otherProposalPublic: ProposalResource = {
  kind: 'proposal',
  author_id: 'U2',
  visibility: 'public',
  status: 'published',
}
const otherProposalPrivate: ProposalResource = {
  kind: 'proposal',
  author_id: 'U2',
  visibility: 'private',
  status: 'published',
}
const otherProposalInternal: ProposalResource = {
  kind: 'proposal',
  author_id: 'U2',
  visibility: 'internal',
  status: 'published',
}

describe('NFR-003 / TEST-006: AuthorizationError shape', () => {
  it('not_authenticated maps to HTTP 401 / UNAUTHENTICATED', () => {
    const err = new AuthorizationError('not_authenticated')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AuthorizationError)
    expect(err.name).toBe('AuthorizationError')
    expect(err.reason).toBe('not_authenticated')
    expect(err.httpStatus).toBe(401)
    expect(err.errorCode).toBe('UNAUTHENTICATED')
  })

  it.each(['insufficient_role', 'not_owner', 'not_owner_resource'] as const)(
    '%s maps to HTTP 404 / NOT_FOUND',
    (reason) => {
      const err = new AuthorizationError(reason)
      expect(err.reason).toBe(reason)
      expect(err.httpStatus).toBe(404)
      expect(err.errorCode).toBe('NOT_FOUND')
    },
  )

  it('error message contains the reason for debugging (not user-facing)', () => {
    const err = new AuthorizationError('not_owner_resource')
    expect(err.message).toContain('not_owner_resource')
  })
})

describe('NFR-003 / TEST-006: viewer === null (cookie なし) は authenticated 系すべて 401', () => {
  // get.publishedProposal は guest 経路があるため別テストで扱う。
  const requiresAuth = ALL_ACTIONS.filter((a) => a !== 'get.publishedProposal')

  it.each(requiresAuth)(
    '%s denies guest with not_authenticated 401',
    (action) => {
      const resource: ProposalResource = {
        kind: 'proposal',
        author_id: 'U1',
        visibility: 'public',
      }
      try {
        authorize(null, action, resource)
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(AuthorizationError)
        const err = e as AuthorizationError
        expect(err.reason).toBe('not_authenticated')
        expect(err.httpStatus).toBe(401)
      }
    },
  )
})

describe('API-022 / TEST-006: proposal.create', () => {
  it('user / reviewer / admin / auditor は認証済なら誰でも作成可', () => {
    expect(() => authorize(userViewer, 'proposal.create')).not.toThrow()
    expect(() => authorize(reviewerViewer, 'proposal.create')).not.toThrow()
    expect(() => authorize(adminViewer, 'proposal.create')).not.toThrow()
    expect(() => authorize(auditorViewer, 'proposal.create')).not.toThrow()
  })

  it('guest は 401', () => {
    expect(() => authorize(null, 'proposal.create')).toThrow(AuthorizationError)
  })
})

describe('API-023 / TEST-006: proposal.update (owner 一致が必須)', () => {
  it('owner なら成功', () => {
    expect(() =>
      authorize(userViewer, 'proposal.update', ownProposalPublic),
    ).not.toThrow()
  })

  it('他人の draft なら 404 not_owner_resource', () => {
    try {
      authorize(userViewer, 'proposal.update', otherProposalPublic)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_owner_resource')
      expect((e as AuthorizationError).httpStatus).toBe(404)
    }
  })

  it('resource を渡し忘れた場合は 404 not_owner', () => {
    try {
      authorize(userViewer, 'proposal.update')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_owner')
    }
  })
})

describe('API-002 / TEST-006: proposal.submit', () => {
  it('owner なら成功', () => {
    expect(() =>
      authorize(userViewer, 'proposal.submit', ownProposalPublic),
    ).not.toThrow()
  })

  it('他人の draft の submit は 404 not_owner_resource', () => {
    expect(() =>
      authorize(userViewer, 'proposal.submit', otherProposalPublic),
    ).toThrow(AuthorizationError)
  })
})

describe('API-009 / TEST-006: proposal.resubmit', () => {
  it('owner なら成功', () => {
    expect(() =>
      authorize(userViewer, 'proposal.resubmit', ownProposalPublic),
    ).not.toThrow()
  })

  it('reviewer が他人の returned 投稿を再提出 → 404 not_owner_resource', () => {
    try {
      authorize(reviewerViewer, 'proposal.resubmit', otherProposalPublic)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_owner_resource')
    }
  })

  it('admin でも他人の resubmit は不可（404）', () => {
    expect(() =>
      authorize(adminViewer, 'proposal.resubmit', otherProposalPublic),
    ).toThrow(AuthorizationError)
  })
})

describe('API-003 / TEST-006: review.start', () => {
  it('reviewer / admin は成功（public/internal）', () => {
    expect(() =>
      authorize(reviewerViewer, 'review.start', otherProposalInternal),
    ).not.toThrow()
    expect(() =>
      authorize(adminViewer, 'review.start', otherProposalInternal),
    ).not.toThrow()
  })

  it('user のみは 404 insufficient_role', () => {
    try {
      authorize(userViewer, 'review.start', otherProposalPublic)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
  })

  it('auditor のみは 404 insufficient_role', () => {
    expect(() =>
      authorize(auditorViewer, 'review.start', otherProposalPublic),
    ).toThrow(AuthorizationError)
  })

  it('Q-016 暫定: reviewer + private は 404 insufficient_role', () => {
    try {
      authorize(reviewerViewer, 'review.start', otherProposalPrivate)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
  })

  it('admin + private は許容（admin は全件アクセス）', () => {
    expect(() =>
      authorize(adminViewer, 'review.start', otherProposalPrivate),
    ).not.toThrow()
  })
})

describe('API-004 / API-005 / API-006 / TEST-006: review.approve / review.return / review.reject', () => {
  const reviewActions: ReadonlyArray<Action> = [
    'review.approve',
    'review.return',
    'review.reject',
  ]

  it.each(reviewActions)('reviewer は %s を実行可（assignee 一致は撤回 B-3）', (action) => {
    expect(() => authorize(reviewerViewer, action)).not.toThrow()
  })

  it.each(reviewActions)('admin は %s を実行可', (action) => {
    expect(() => authorize(adminViewer, action)).not.toThrow()
  })

  it.each(reviewActions)('user のみは %s で 404 insufficient_role', (action) => {
    try {
      authorize(userViewer, action)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
  })

  it.each(reviewActions)('auditor のみは %s で 404 insufficient_role', (action) => {
    expect(() => authorize(auditorViewer, action)).toThrow(AuthorizationError)
  })
})

describe('API-007 / API-008 / TEST-006: admin.publish / admin.withdraw（admin 専権）', () => {
  it('admin は publish / withdraw 可', () => {
    expect(() => authorize(adminViewer, 'admin.publish')).not.toThrow()
    expect(() => authorize(adminViewer, 'admin.withdraw')).not.toThrow()
  })

  it('reviewer のみは 404 insufficient_role（BR-PUBLISH-01）', () => {
    try {
      authorize(reviewerViewer, 'admin.publish')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
    expect(() => authorize(reviewerViewer, 'admin.withdraw')).toThrow(
      AuthorizationError,
    )
  })

  it('user / auditor は不可', () => {
    expect(() => authorize(userViewer, 'admin.publish')).toThrow()
    expect(() => authorize(auditorViewer, 'admin.publish')).toThrow()
  })

  it('user+admin の OR 合成は admin 扱い（成功）', () => {
    expect(() => authorize(userAdminViewer, 'admin.publish')).not.toThrow()
  })
})

describe('API-021 / TEST-006: admin.viewProposal', () => {
  it('admin は成功', () => {
    expect(() => authorize(adminViewer, 'admin.viewProposal')).not.toThrow()
  })

  it('reviewer / user / auditor は 404 insufficient_role', () => {
    expect(() => authorize(reviewerViewer, 'admin.viewProposal')).toThrow()
    expect(() => authorize(userViewer, 'admin.viewProposal')).toThrow()
    expect(() => authorize(auditorViewer, 'admin.viewProposal')).toThrow()
  })
})

describe('API-012 / TEST-006: list.myProposals', () => {
  it('認証済なら全 role 成功（自身の投稿フィルタは server-side）', () => {
    expect(() => authorize(userViewer, 'list.myProposals')).not.toThrow()
    expect(() => authorize(reviewerViewer, 'list.myProposals')).not.toThrow()
    expect(() => authorize(adminViewer, 'list.myProposals')).not.toThrow()
    expect(() => authorize(auditorViewer, 'list.myProposals')).not.toThrow()
  })

  it('guest は 401', () => {
    expect(() => authorize(null, 'list.myProposals')).toThrow(AuthorizationError)
  })
})

describe('API-013 / TEST-006: get.myProposal', () => {
  it('owner は成功', () => {
    expect(() =>
      authorize(userViewer, 'get.myProposal', ownProposalPublic),
    ).not.toThrow()
  })

  it('他人の投稿（user / reviewer / admin / auditor 問わず）は 404 not_owner_resource', () => {
    expect(() =>
      authorize(otherUser, 'get.myProposal', ownProposalPublic),
    ).toThrow(AuthorizationError)
    expect(() =>
      authorize(reviewerViewer, 'get.myProposal', ownProposalPublic),
    ).toThrow(AuthorizationError)
    expect(() =>
      authorize(adminViewer, 'get.myProposal', ownProposalPublic),
    ).toThrow(AuthorizationError)
    expect(() =>
      authorize(auditorViewer, 'get.myProposal', ownProposalPublic),
    ).toThrow(AuthorizationError)
  })
})

describe('API-014 / TEST-006: list.reviewInbox', () => {
  it('reviewer / admin は成功', () => {
    expect(() => authorize(reviewerViewer, 'list.reviewInbox')).not.toThrow()
    expect(() => authorize(adminViewer, 'list.reviewInbox')).not.toThrow()
  })

  it('user / auditor は 404 insufficient_role', () => {
    expect(() => authorize(userViewer, 'list.reviewInbox')).toThrow()
    expect(() => authorize(auditorViewer, 'list.reviewInbox')).toThrow()
  })
})

describe('API-015 / TEST-006: get.reviewProposal', () => {
  it('reviewer / admin は public/internal 投稿で成功', () => {
    expect(() =>
      authorize(reviewerViewer, 'get.reviewProposal', otherProposalPublic),
    ).not.toThrow()
    expect(() =>
      authorize(reviewerViewer, 'get.reviewProposal', otherProposalInternal),
    ).not.toThrow()
    expect(() =>
      authorize(adminViewer, 'get.reviewProposal', otherProposalPrivate),
    ).not.toThrow()
  })

  it('Q-016 暫定: reviewer + private は 404 insufficient_role', () => {
    try {
      authorize(reviewerViewer, 'get.reviewProposal', otherProposalPrivate)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
  })

  it('user / auditor は 404 insufficient_role', () => {
    expect(() =>
      authorize(userViewer, 'get.reviewProposal', otherProposalPublic),
    ).toThrow()
    expect(() =>
      authorize(auditorViewer, 'get.reviewProposal', otherProposalPublic),
    ).toThrow()
  })
})

describe('API-016 / API-017 / TEST-006: list.auditLogs / get.auditLog', () => {
  it('auditor / admin は成功', () => {
    expect(() => authorize(auditorViewer, 'list.auditLogs')).not.toThrow()
    expect(() => authorize(adminViewer, 'list.auditLogs')).not.toThrow()
    expect(() => authorize(auditorViewer, 'get.auditLog')).not.toThrow()
    expect(() => authorize(adminViewer, 'get.auditLog')).not.toThrow()
  })

  it('user / reviewer は 404 insufficient_role', () => {
    expect(() => authorize(userViewer, 'list.auditLogs')).toThrow()
    expect(() => authorize(reviewerViewer, 'list.auditLogs')).toThrow()
    expect(() => authorize(userViewer, 'get.auditLog')).toThrow()
    expect(() => authorize(reviewerViewer, 'get.auditLog')).toThrow()
  })
})

describe('API-011 / TEST-006: get.publishedProposal の visibility × viewer マトリクス', () => {
  // REQ-008 / API-011 のマトリクスをそのまま検証する。
  it('public + guest → OK', () => {
    expect(() =>
      authorize(null, 'get.publishedProposal', otherProposalPublic),
    ).not.toThrow()
  })

  it('public + user(他人) → OK', () => {
    expect(() =>
      authorize(otherUser, 'get.publishedProposal', ownProposalPublic),
    ).not.toThrow()
  })

  it('internal + guest → 401 not_authenticated', () => {
    try {
      authorize(null, 'get.publishedProposal', otherProposalInternal)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_authenticated')
      expect((e as AuthorizationError).httpStatus).toBe(401)
    }
  })

  it('internal + user(他人) → OK', () => {
    expect(() =>
      authorize(otherUser, 'get.publishedProposal', otherProposalInternal),
    ).not.toThrow()
  })

  it('internal + reviewer / admin / auditor → OK', () => {
    expect(() =>
      authorize(reviewerViewer, 'get.publishedProposal', otherProposalInternal),
    ).not.toThrow()
    expect(() =>
      authorize(adminViewer, 'get.publishedProposal', otherProposalInternal),
    ).not.toThrow()
    expect(() =>
      authorize(auditorViewer, 'get.publishedProposal', otherProposalInternal),
    ).not.toThrow()
  })

  it('private + guest → 401 not_authenticated', () => {
    try {
      authorize(null, 'get.publishedProposal', otherProposalPrivate)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_authenticated')
    }
  })

  it('private + user(他人) → 404 not_owner_resource', () => {
    try {
      authorize(otherUser, 'get.publishedProposal', ownProposalPrivate)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_owner_resource')
      expect((e as AuthorizationError).httpStatus).toBe(404)
    }
  })

  it('private + user(本人) → OK', () => {
    expect(() =>
      authorize(userViewer, 'get.publishedProposal', ownProposalPrivate),
    ).not.toThrow()
  })

  it('private + reviewer → 404 insufficient_role (Q-016 暫定)', () => {
    try {
      authorize(reviewerViewer, 'get.publishedProposal', otherProposalPrivate)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
  })

  it('private + admin → OK', () => {
    expect(() =>
      authorize(adminViewer, 'get.publishedProposal', otherProposalPrivate),
    ).not.toThrow()
  })

  it('private + auditor → 404 insufficient_role (Q-016 暫定)', () => {
    try {
      authorize(auditorViewer, 'get.publishedProposal', otherProposalPrivate)
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('insufficient_role')
    }
  })

  it('user+reviewer の OR 合成は private 投稿の owner なら OK', () => {
    expect(() =>
      authorize(userReviewerViewer, 'get.publishedProposal', {
        kind: 'proposal',
        author_id: 'UR1',
        visibility: 'private',
        status: 'published',
      }),
    ).not.toThrow()
  })

  it('resource 未指定（guest）→ 401', () => {
    expect(() => authorize(null, 'get.publishedProposal')).toThrow(
      AuthorizationError,
    )
  })

  it('resource 未指定（user）→ 404 not_owner', () => {
    try {
      authorize(userViewer, 'get.publishedProposal')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe('not_owner')
    }
  })
})

describe('NFR-003 / TEST-006: 副作用なし（拒否時に外部呼び出しが起きない）', () => {
  it('console.* / globalThis.fetch を呼ばない', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.reject(new Error('fetch should not be called')))

    // 拒否ケース
    expect(() => authorize(null, 'proposal.submit', ownProposalPublic)).toThrow()
    expect(() => authorize(userViewer, 'admin.publish')).toThrow()
    expect(() =>
      authorize(userViewer, 'proposal.update', otherProposalPublic),
    ).toThrow()
    // 成功ケース
    expect(() => authorize(adminViewer, 'admin.publish')).not.toThrow()

    expect(consoleSpy).not.toHaveBeenCalled()
    expect(consoleErrSpy).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
    consoleErrSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    fetchSpy.mockRestore()
  })
})

describe('BR-AUTHZ-03 / TEST-006: 公開バイパス API は authorize() の Action union に含まれない', () => {
  it('PUBLIC_BYPASS_ACTIONS は health / policy.get / auth.login / auth.logout の 4 件', () => {
    expect([...PUBLIC_BYPASS_ACTIONS]).toEqual([
      'health',
      'policy.get',
      'auth.login',
      'auth.logout',
    ])
  })

  it('Action union は 18 種で、PUBLIC_BYPASS_ACTIONS と重ならない', () => {
    expect(ALL_ACTIONS).toHaveLength(18)
    const overlap = ALL_ACTIONS.filter((a) =>
      (PUBLIC_BYPASS_ACTIONS as ReadonlyArray<string>).includes(a),
    )
    expect(overlap).toEqual([])
  })
})

describe('BR-AUTHZ-01 / TEST-006: マルチロール OR 合成', () => {
  it('user+reviewer は user の能力（自身の投稿提出）と reviewer の能力（review.start）を両方持つ', () => {
    expect(() =>
      authorize(userReviewerViewer, 'proposal.submit', {
        kind: 'proposal',
        author_id: 'UR1',
        visibility: 'public',
      }),
    ).not.toThrow()
    expect(() =>
      authorize(userReviewerViewer, 'review.start', otherProposalPublic),
    ).not.toThrow()
  })

  it('user+admin は admin 専権 (admin.publish) を実行可', () => {
    expect(() => authorize(userAdminViewer, 'admin.publish')).not.toThrow()
  })
})
