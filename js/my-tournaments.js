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
