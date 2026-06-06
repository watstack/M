import { describe, it, expect, beforeEach } from 'vitest';
import { loadFiles, makeSupabaseMock, makeStorageMock } from './helpers/vmLoader.js';

function makeCtx(sbMock) {
  return loadFiles(['js/supabase.js'], {
    window: { supabase: { createClient: () => sbMock } },
    crypto: { randomUUID: () => 'fixed-uuid-1234' },
    localStorage: makeStorageMock(),
  });
}

describe('joinTournament', () => {
  let sbMock;
  let ctx;

  beforeEach(() => {
    sbMock = makeSupabaseMock();
    ctx = makeCtx(sbMock);
  });

  it('resolves with participant data on success', async () => {
    sbMock._setResult({ id: 'p-1', nickname: 'Alice', team_slots: 2 });

    const result = await ctx.joinTournament('t-id', 'Alice', 1, 2);

    expect(result).toEqual({ id: 'p-1', nickname: 'Alice', team_slots: 2 });
  });

  it('rejects with friendly message on duplicate nickname (23505)', async () => {
    sbMock._setResult(null, { code: '23505' });

    await expect(ctx.joinTournament('t-id', 'Alice', 1, 2))
      .rejects.toThrow('That nickname is already taken');
  });

  it('rejects with "Invalid nickname" before hitting Supabase for XSS input', async () => {
    // sanitizeNickname strips the tags → empty string → null → throws before DB call
    await expect(ctx.joinTournament('t-id', '<script>alert(1)</script>', 1, 2))
      .rejects.toThrow('Invalid nickname');
  });

  it('rejects with raw error for other Supabase errors', async () => {
    const dbError = { code: '500', message: 'internal error' };
    sbMock._setResult(null, dbError);

    await expect(ctx.joinTournament('t-id', 'Alice', 1, 2))
      .rejects.toMatchObject(dbError);
  });
});

describe('session persistence', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeCtx(makeSupabaseMock());
  });

  it('saveSession / loadSession round-trips participant ID', () => {
    ctx.saveSession('ABC123', 'participant-uuid');
    expect(ctx.loadSession('ABC123')).toBe('participant-uuid');
  });

  it('loadSession returns null for unknown code', () => {
    expect(ctx.loadSession('XXXXXX')).toBeNull();
  });

  it('clearSession removes the stored session', () => {
    ctx.saveSession('ABC123', 'participant-uuid');
    ctx.clearSession('ABC123');
    expect(ctx.loadSession('ABC123')).toBeNull();
  });

  it('sessions for different codes are isolated', () => {
    ctx.saveSession('CODE01', 'uuid-a');
    ctx.saveSession('CODE02', 'uuid-b');
    expect(ctx.loadSession('CODE01')).toBe('uuid-a');
    expect(ctx.loadSession('CODE02')).toBe('uuid-b');
  });
});
