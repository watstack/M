// Utility functions tested by supabase.test.js and sanitize.test.js.
// Note: sweepstake.html inlines these helpers directly; this file is not loaded
// by any page but exists so the test suite can exercise the implementations in isolation.

let supabase = null;
if (typeof window !== 'undefined' && window.supabase) {
  supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function sanitizeNickname(raw) {
  const clean = raw.replace(/[<>&"]/g, '').trim().slice(0, 20);
  if (clean.length < 2) return null;
  if (!/^[\w\s\-'.]+$/u.test(clean)) return null;
  return clean;
}

function totalSlots(participants) {
  return participants.reduce((sum, p) => sum + p.team_slots, 0);
}

// ─── Session persistence ───────────────────────────────────────────────────────

function saveSession(code, participantId) {
  localStorage.setItem(`wc26_${code}`, participantId);
}

function loadSession(code) {
  return localStorage.getItem(`wc26_${code}`);
}

function clearSession(code) {
  localStorage.removeItem(`wc26_${code}`);
}

// ─── Participant helpers ───────────────────────────────────────────────────────

async function joinTournament(tournamentId, nickname, avatarType, teamSlots) {
  const sanitized = sanitizeNickname(nickname);
  if (!sanitized) throw new Error('Invalid nickname');
  const { data, error } = await supabase
    .from('participants')
    .insert({ tournament_id: tournamentId, nickname: sanitized, avatar_type: avatarType, team_slots: teamSlots })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('That nickname is already taken in this sweepstake!');
    throw error;
  }
  return data;
}
