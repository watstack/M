// Supabase client + helper functions.
// CONFIG must be loaded before this script (js/config.js).

let supabase = null;
if (window.supabase) {
  supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// ─── Tournament helpers ────────────────────────────────────────────────────────

async function createTournament(name, teamsPerPerson) {
  const code = generateCode();
  const adminToken = crypto.randomUUID();
  const { data, error } = await supabase
    .from('tournaments')
    .insert({ code, admin_token: adminToken, name, teams_per_person: teamsPerPerson })
    .select()
    .single();
  if (error) throw error;
  return { ...data, admin_token: adminToken };
}

async function getTournamentByCode(code) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();
  if (error) throw error;
  return data;
}

async function startDraw(code, adminToken) {
  const { data, error } = await supabase.rpc('start_draw', {
    p_code: code,
    p_admin_token: adminToken,
  });
  if (error) throw error;
  return data;
}

async function completeDraw(code, adminToken) {
  const { data, error } = await supabase.rpc('complete_draw', {
    p_code: code,
    p_admin_token: adminToken,
  });
  if (error) throw error;
  return data;
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

async function getParticipants(tournamentId) {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function removeParticipant(code, adminToken, participantId) {
  const { data, error } = await supabase.rpc('remove_participant', {
    p_tournament_code: code,
    p_admin_token: adminToken,
    p_participant_id: participantId,
  });
  if (error) throw error;
  return data;
}

// ─── Allocation helpers ────────────────────────────────────────────────────────

async function insertAllocation(tournamentId, participantId, teamCode, teamName, drawOrder) {
  const { data, error } = await supabase
    .from('allocations')
    .insert({ tournament_id: tournamentId, participant_id: participantId, team_code: teamCode, team_name: teamName, draw_order: drawOrder })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getAllocations(tournamentId) {
  const { data, error } = await supabase
    .from('allocations')
    .select('*, participants(nickname, avatar_type)')
    .eq('tournament_id', tournamentId)
    .order('draw_order', { ascending: true });
  if (error) throw error;
  return data;
}

// ─── Realtime subscriptions ───────────────────────────────────────────────────

function subscribeToTournament(tournamentId, callbacks) {
  return supabase
    .channel(`tournament:${tournamentId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` },
      payload => callbacks.onTournamentUpdate?.(payload.new))
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'participants', filter: `tournament_id=eq.${tournamentId}` },
      payload => callbacks.onParticipantJoin?.(payload.new))
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'participants', filter: `tournament_id=eq.${tournamentId}` },
      payload => callbacks.onParticipantLeave?.(payload.old))
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'allocations', filter: `tournament_id=eq.${tournamentId}` },
      payload => callbacks.onAllocation?.(payload.new))
    .subscribe();
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function sanitizeNickname(raw) {
  // Strip HTML, trim, limit to 20 chars, allow letters/numbers/spaces/hyphens
  const clean = raw.replace(/[<>&"]/g, '').trim().slice(0, 20);
  if (clean.length < 2) return null;
  if (!/^[\w\s\-'.]+$/u.test(clean)) return null;
  return clean;
}

function totalSlots(participants) {
  return participants.reduce((sum, p) => sum + p.team_slots, 0);
}
