// Shared helper: the set of tournaments this device belongs to, read from the
// same localStorage keys the landing page uses (wc26_my_joined = joined as a
// participant, wc26_my_tournaments = created as admin). Deduped by code, newest
// first. Used by the overview tournament switcher.
function getMyTournaments() {
  const read = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || '[]'); }
    catch { return []; }
  };
  const admin = read('wc26_my_tournaments'); // [{ code, name, createdAt }]
  const joined = read('wc26_my_joined');     // [{ code, name, joinedAt }]

  const byCode = new Map();
  // Admin entries first, then joined; both ordered newest-first within their list.
  for (const t of [...admin, ...joined]) {
    if (!t || !t.code) continue;
    const code = String(t.code).toUpperCase();
    if (!byCode.has(code)) byCode.set(code, { code, name: t.name || code, ts: t.createdAt || t.joinedAt || 0 });
  }
  return [...byCode.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

if (typeof window !== 'undefined') window.getMyTournaments = getMyTournaments;

// ── Session token bundle ──────────────────────────────────────────────────────
// A user's identity on this app lives entirely in localStorage (no login): the
// membership lists (wc26_my_joined / wc26_my_tournaments — the latter holds admin
// tokens) plus a per-tournament participant id (wc26_<CODE>). When the app is
// installed, the new home-screen instance can start with empty/isolated storage
// (notably on iOS), so we carry every one of these "browser tokens" through the
// install/launch deep link and re-import them on the other side.

// Collect all identity tokens, skipping transient caches (football data, groups).
function collectSessionTokens() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('wc26_')) continue;
    if (k.startsWith('wc26_fbd_') || k === 'wc26_groups') continue;
    out[k] = localStorage.getItem(k);
  }
  return out;
}

// Compact, URL-safe (base64url, UTF-8 aware) encoding for the link hash.
function encodeSessionTokens(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeSessionTokens(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

// Merge a bundle into localStorage without clobbering newer local data: union
// the membership lists by code, and only set a participant id if none exists.
function importSessionTokens(bundle) {
  if (!bundle || typeof bundle !== 'object') return;
  const mergeList = (key, incoming) => {
    let existing = [];
    try { existing = JSON.parse(localStorage.getItem(key) || '[]'); } catch { existing = []; }
    const byCode = new Map();
    for (const t of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      if (t && t.code) {
        const c = String(t.code).toUpperCase();
        if (!byCode.has(c)) byCode.set(c, t);
      }
    }
    localStorage.setItem(key, JSON.stringify([...byCode.values()]));
  };
  for (const [k, v] of Object.entries(bundle)) {
    if (typeof v !== 'string') continue;
    if (k === 'wc26_my_joined' || k === 'wc26_my_tournaments') {
      let incoming = [];
      try { incoming = JSON.parse(v); } catch { incoming = []; }
      mergeList(k, incoming);
    } else if (localStorage.getItem(k) == null) {
      localStorage.setItem(k, v); // e.g. wc26_<CODE> participant id
    }
  }
}

// Build the install deep link: open the current tournament's overview, carrying
// every browser token in the hash so a fresh install arrives fully hydrated.
function buildInstallLink(currentCode) {
  const base = currentCode
    ? 'overview.html?code=' + encodeURIComponent(String(currentCode).toUpperCase())
    : 'overview.html';
  const tk = encodeSessionTokens(collectSessionTokens());
  return tk ? base + '#tk=' + tk : base;
}

if (typeof window !== 'undefined') {
  window.collectSessionTokens = collectSessionTokens;
  window.importSessionTokens  = importSessionTokens;
  window.decodeSessionTokens  = decodeSessionTokens;
  window.buildInstallLink     = buildInstallLink;
}
