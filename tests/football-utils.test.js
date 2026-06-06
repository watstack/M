import { describe, it, expect, vi } from 'vitest';
import { loadFiles, makeStorageMock } from './helpers/vmLoader.js';

// Each describe block gets a fresh context so sessionStorage state doesn't leak.

describe('matchStatusClass', () => {
  const ctx = loadFiles(['js/football.js'], {
    sessionStorage: makeStorageMock(),
    fetch: async () => { throw new Error('fetch not expected'); },
  });

  it.each([
    [{ status: 'IN_PLAY' }, 'live'],
    [{ status: 'PAUSED' }, 'live'],
    [{ status: 'FINISHED' }, 'finished'],
    [{ status: 'SCHEDULED' }, 'scheduled'],
    [{ status: 'TIMED' }, 'scheduled'],
    [{ status: 'POSTPONED' }, 'scheduled'],
  ])('match with status %o → %s', (match, expected) => {
    expect(ctx.matchStatusClass(match)).toBe(expected);
  });
});

describe('hasLiveMatch', () => {
  const ctx = loadFiles(['js/football.js'], {
    sessionStorage: makeStorageMock(),
    fetch: async () => { throw new Error('fetch not expected'); },
  });

  it('returns true when any match is IN_PLAY', () => {
    expect(ctx.hasLiveMatch({ matches: [{ status: 'IN_PLAY' }] })).toBe(true);
  });

  it('returns true when any match is PAUSED', () => {
    expect(ctx.hasLiveMatch({ matches: [{ status: 'PAUSED' }] })).toBe(true);
  });

  it('returns false when all matches are FINISHED', () => {
    expect(ctx.hasLiveMatch({ matches: [{ status: 'FINISHED' }] })).toBe(false);
  });

  it('returns false for empty matches array', () => {
    expect(ctx.hasLiveMatch({ matches: [] })).toBe(false);
  });

  it('returns false for missing matches key (null-safe)', () => {
    expect(ctx.hasLiveMatch({})).toBe(false);
    expect(ctx.hasLiveMatch(null)).toBe(false);
  });
});

describe('getScore', () => {
  const ctx = loadFiles(['js/football.js'], {
    sessionStorage: makeStorageMock(),
    fetch: async () => { throw new Error('fetch not expected'); },
  });

  it('returns nulls for SCHEDULED match', () => {
    expect(ctx.getScore({ status: 'SCHEDULED', score: { fullTime: { home: 2, away: 1 } } }))
      .toEqual({ home: null, away: null });
  });

  it('returns nulls for TIMED match', () => {
    expect(ctx.getScore({ status: 'TIMED', score: null }))
      .toEqual({ home: null, away: null });
  });

  it('returns fullTime score for FINISHED match', () => {
    expect(ctx.getScore({ status: 'FINISHED', score: { fullTime: { home: 3, away: 1 } } }))
      .toEqual({ home: 3, away: 1 });
  });

  it('falls back to halfTime if no fullTime', () => {
    expect(ctx.getScore({ status: 'FINISHED', score: { halfTime: { home: 1, away: 0 } } }))
      .toEqual({ home: 1, away: 0 });
  });
});

describe('normTeamCode', () => {
  const ctx = loadFiles(['js/football.js'], {
    sessionStorage: makeStorageMock(),
    fetch: async () => { throw new Error('fetch not expected'); },
  });

  it('maps GBR → ENG', () => {
    expect(ctx.normTeamCode('GBR')).toBe('ENG');
  });

  it('passes through unmapped codes unchanged', () => {
    expect(ctx.normTeamCode('ENG')).toBe('ENG');
    expect(ctx.normTeamCode('BRA')).toBe('BRA');
    expect(ctx.normTeamCode('XXX')).toBe('XXX');
  });

  it('handles undefined without throwing', () => {
    expect(() => ctx.normTeamCode(undefined)).not.toThrow();
  });
});

describe('footballFetch caching', () => {
  it('cache miss: calls fetch and stores result', async () => {
    const storage = makeStorageMock();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ status: 'FINISHED' }], teams: [], standings: [] }),
    });
    const ctx = loadFiles(['js/football.js'], { sessionStorage: storage, fetch: fetchMock });

    const result = await ctx.footballFetch('/competitions/WC/matches');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ matches: [{ status: 'FINISHED' }], teams: [], standings: [] });
    expect(storage.getItem('wc26_api_/competitions/WC/matches')).not.toBeNull();
  });

  it('cache hit: skips fetch when data is fresh (IDLE TTL)', async () => {
    const storage = makeStorageMock();
    const freshData = { matches: [], teams: [], standings: [] };
    storage.setItem(
      'wc26_api_/competitions/WC/matches',
      JSON.stringify({ ts: Date.now(), data: freshData }),
    );
    const fetchMock = vi.fn();
    const ctx = loadFiles(['js/football.js'], { sessionStorage: storage, fetch: fetchMock });

    const result = await ctx.footballFetch('/competitions/WC/matches');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual(freshData);
  });

  it('cache miss: refetches when IDLE cache is stale (> 5min)', async () => {
    const storage = makeStorageMock();
    const staleTs = Date.now() - 400_000; // 400s > 300s IDLE TTL
    storage.setItem(
      'wc26_api_/competitions/WC/matches',
      JSON.stringify({ ts: staleTs, data: { matches: [], teams: [], standings: [] } }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [], teams: [], standings: [] }),
    });
    const ctx = loadFiles(['js/football.js'], { sessionStorage: storage, fetch: fetchMock });

    await ctx.footballFetch('/competitions/WC/matches');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cache miss: refetches when LIVE cache is stale (> 60s with live match)', async () => {
    const storage = makeStorageMock();
    const staleTs = Date.now() - 70_000; // 70s > 60s LIVE TTL
    storage.setItem(
      'wc26_api_/competitions/WC/matches',
      JSON.stringify({ ts: staleTs, data: { matches: [{ status: 'IN_PLAY' }] } }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ status: 'IN_PLAY' }] }),
    });
    const ctx = loadFiles(['js/football.js'], { sessionStorage: storage, fetch: fetchMock });

    await ctx.footballFetch('/competitions/WC/matches');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on non-OK response', async () => {
    const storage = makeStorageMock();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const ctx = loadFiles(['js/football.js'], { sessionStorage: storage, fetch: fetchMock });

    await expect(ctx.footballFetch('/competitions/WC/matches'))
      .rejects.toThrow('Football API error: 429');
  });
});
