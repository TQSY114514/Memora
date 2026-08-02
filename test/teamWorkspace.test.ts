import { describe, it, expect } from 'vitest'
import {
  generateInviteCode,
  createSharedWorkspace,
  checkVisibility,
  canWrite,
  createComment,
  threadComments,
  getReplies
} from '../src/team/teamWorkspace'
import type {
  MemoryVisibility,
  WorkspaceMember,
  MemoryComment
} from '../src/team/teamWorkspace'

describe('teamWorkspace', () => {
  describe('generateInviteCode', () => {
    it('returns an 8-character string from the allowed charset', () => {
      const code = generateInviteCode()
      expect(code).toHaveLength(8)
      const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      for (const c of code) {
        expect(allowed).toContain(c)
      }
    })

    it('does not contain ambiguous characters (0/O/1/I)', () => {
      // run several times to be sure
      for (let i = 0; i < 20; i++) {
        const code = generateInviteCode()
        expect(code).not.toMatch(/[01OI]/)
      }
    })
  })

  describe('createSharedWorkspace', () => {
    it('returns correct structure with team_ prefix, 8-char inviteCode and single admin member', () => {
      const ws = createSharedWorkspace('My Team', 'team description', 'user1')
      expect(ws.id.startsWith('team_')).toBe(true)
      expect(ws.name).toBe('My Team')
      expect(ws.description).toBe('team description')
      expect(ws.createdBy).toBe('user1')
      expect(ws.inviteCode).toHaveLength(8)
      expect(ws.members).toHaveLength(1)
      expect(ws.members[0].id).toBe('user1')
      expect(ws.members[0].role).toBe('admin')
      expect(typeof ws.createdAt).toBe('string')
    })
  })

  describe('checkVisibility', () => {
    const make = (visibility: MemoryVisibility['visibility'], allowedMembers: string[]): MemoryVisibility => ({
      entryId: 'e1',
      entityType: 'knowledge',
      visibility,
      allowedMembers
    })

    it('private -> false', () => {
      expect(checkVisibility(make('private', []), 'user1')).toBe(false)
    })

    it('shared_read -> true', () => {
      expect(checkVisibility(make('shared_read', []), 'user1')).toBe(true)
    })

    it('shared_write -> true', () => {
      expect(checkVisibility(make('shared_write', []), 'user1')).toBe(true)
    })

    it('shared_admin + member in allowedMembers -> true', () => {
      expect(checkVisibility(make('shared_admin', ['user1']), 'user1')).toBe(true)
    })

    it('shared_admin + member not in allowedMembers -> false', () => {
      expect(checkVisibility(make('shared_admin', ['user2']), 'user1')).toBe(false)
    })
  })

  describe('canWrite', () => {
    const admin: WorkspaceMember = { id: 'u1', name: 'admin', role: 'admin', joinedAt: '2026-01-01T00:00:00.000Z' }
    const editor: WorkspaceMember = { id: 'u2', name: 'editor', role: 'editor', joinedAt: '2026-01-01T00:00:00.000Z' }
    const viewer: WorkspaceMember = { id: 'u3', name: 'viewer', role: 'viewer', joinedAt: '2026-01-01T00:00:00.000Z' }
    const make = (visibility: MemoryVisibility['visibility'], allowedMembers: string[]): MemoryVisibility => ({
      entryId: 'e1',
      entityType: 'knowledge',
      visibility,
      allowedMembers
    })

    it('admin -> true', () => {
      expect(canWrite(admin, make('private', []))).toBe(true)
      expect(canWrite(admin, make('shared_read', []))).toBe(true)
    })

    it('editor + shared_read -> false', () => {
      expect(canWrite(editor, make('shared_read', []))).toBe(false)
    })

    it('editor + shared_write -> true', () => {
      expect(canWrite(editor, make('shared_write', ['u2']))).toBe(true)
    })

    it('viewer + shared_write -> false', () => {
      // viewer 默认无写入权限；仅当显式出现在 allowedMembers 时才会被放行
      expect(canWrite(viewer, make('shared_write', []))).toBe(false)
    })
  })

  describe('createComment', () => {
    it('returns correct structure with comment_ prefix and resolved=false', () => {
      const c = createComment('e1', 'knowledge', 'author', 'hello world')
      expect(c.id.startsWith('comment_')).toBe(true)
      expect(c.entryId).toBe('e1')
      expect(c.entityType).toBe('knowledge')
      expect(c.author).toBe('author')
      expect(c.content).toBe('hello world')
      expect(c.replyTo).toBeNull()
      expect(c.resolved).toBe(false)
      expect(typeof c.createdAt).toBe('string')
    })

    it('passes replyTo when provided', () => {
      const c = createComment('e1', 'preference', 'author', 'reply', 'parent1')
      expect(c.replyTo).toBe('parent1')
    })
  })

  describe('threadComments', () => {
    it('returns only top-level comments (replyTo=null) sorted by createdAt ascending', () => {
      const comments: MemoryComment[] = [
        {
          id: 'c1',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'top1',
          createdAt: '2026-01-03T00:00:00.000Z',
          replyTo: null,
          resolved: false
        },
        {
          id: 'c2',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'reply-to-c1',
          createdAt: '2026-01-02T00:00:00.000Z',
          replyTo: 'c1',
          resolved: false
        },
        {
          id: 'c3',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'top2',
          createdAt: '2026-01-01T00:00:00.000Z',
          replyTo: null,
          resolved: false
        }
      ]
      const result = threadComments(comments)
      expect(result.map((c) => c.id)).toEqual(['c3', 'c1'])
    })

    it('returns empty array when all comments are replies', () => {
      const comments: MemoryComment[] = [
        {
          id: 'r1',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'reply',
          createdAt: '2026-01-01T00:00:00.000Z',
          replyTo: 'c1',
          resolved: false
        }
      ]
      expect(threadComments(comments)).toEqual([])
    })
  })

  describe('getReplies', () => {
    it('returns replies with replyTo=parentId sorted by createdAt ascending', () => {
      const comments: MemoryComment[] = [
        {
          id: 'c1',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'top',
          createdAt: '2026-01-01T00:00:00.000Z',
          replyTo: null,
          resolved: false
        },
        {
          id: 'r2',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'reply2',
          createdAt: '2026-01-03T00:00:00.000Z',
          replyTo: 'c1',
          resolved: false
        },
        {
          id: 'r1',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'reply1',
          createdAt: '2026-01-02T00:00:00.000Z',
          replyTo: 'c1',
          resolved: false
        },
        {
          id: 'r3',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'reply3-other-parent',
          createdAt: '2026-01-04T00:00:00.000Z',
          replyTo: 'c2',
          resolved: false
        }
      ]
      const result = getReplies(comments, 'c1')
      expect(result.map((c) => c.id)).toEqual(['r1', 'r2'])
    })

    it('returns empty array when no replies match', () => {
      const comments: MemoryComment[] = [
        {
          id: 'c1',
          entryId: 'e1',
          entityType: 'knowledge',
          author: 'a',
          content: 'top',
          createdAt: '2026-01-01T00:00:00.000Z',
          replyTo: null,
          resolved: false
        }
      ]
      expect(getReplies(comments, 'c1')).toEqual([])
    })
  })
})
