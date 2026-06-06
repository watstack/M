import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const handler = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'football.js'));

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    setHeader() { return this; },
  };
  return res;
}

beforeEach(() => {
  process.env.FOOTBALL_API_TOKEN = 'test-token';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ teams: [] }),
  }));
});

afterEach(() => {
  delete process.env.FOOTBALL_API_TOKEN;
  vi.unstubAllGlobals();
});

describe('api/football.js path allow-list', () => {
  it('returns 400 when path param is missing', async () => {
    const res = makeRes();
    await handler({ query: {} }, res);
    expect(res._status).toBe(400);
  });

  it('returns 403 for non-WC competition (Premier League)', async () => {
    const res = makeRes();
    await handler({ query: { path: 'competitions/PL/teams' } }, res);
    expect(res._status).toBe(403);
  });

  it('returns 403 for admin-style path', async () => {
    const res = makeRes();
    await handler({ query: { path: 'admin/users' } }, res);
    expect(res._status).toBe(403);
  });

  it('returns 400 for empty path string (treated as missing)', async () => {
    const res = makeRes();
    await handler({ query: { path: '' } }, res);
    expect(res._status).toBe(400);
  });

  it('allows competitions/WC/teams', async () => {
    const res = makeRes();
    await handler({ query: { path: 'competitions/WC/teams' } }, res);
    expect(res._status).toBe(200);
  });

  it('allows competitions/WC/matches', async () => {
    const res = makeRes();
    await handler({ query: { path: 'competitions/WC/matches' } }, res);
    expect(res._status).toBe(200);
  });

  it('allows competitions/WC/standings', async () => {
    const res = makeRes();
    await handler({ query: { path: 'competitions/WC/standings' } }, res);
    expect(res._status).toBe(200);
  });

  it('allows competitions/WC/matches with query string (stage filter)', async () => {
    const res = makeRes();
    await handler({ query: { path: 'competitions/WC/matches?stage=GROUP_STAGE' } }, res);
    expect(res._status).toBe(200);
  });

  it('allows lowercase wc', async () => {
    const res = makeRes();
    await handler({ query: { path: 'competitions/wc/teams' } }, res);
    expect(res._status).toBe(200);
  });

  it('returns 500 when FOOTBALL_API_TOKEN env var is absent', async () => {
    delete process.env.FOOTBALL_API_TOKEN;
    const res = makeRes();
    await handler({ query: { path: 'competitions/WC/teams' } }, res);
    expect(res._status).toBe(500);
  });

  it('returns 502 when upstream fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const res = makeRes();
    await handler({ query: { path: 'competitions/WC/teams' } }, res);
    expect(res._status).toBe(502);
  });
});
