// Sweepstake page logic.
// Loaded after: config.js, vendor/supabase.js, flag-colors.js, avatars.js, football.js, draw.js

// ── Timeout helper ────────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  let timer;
  const race = Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        'Database is waking up — this can take up to 60 seconds on first load. ' +
        'Please wait a moment and try again.'
      )), ms);
    }),
  ]);
  return race.finally(() => clearTimeout(timer));
}

// ── Supabase client ───────────────────────────────────────────────────────────
let db = null;
try {
  if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && window.supabase) {
    db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.error('Supabase init failed:', e);
}

// ── Inlined Supabase helpers ──────────────────────────────────────────────────
async function getTournamentByCode(code) {
  const { data, error } = await db.from('tournaments').select('*').eq('code', code.toUpperCase()).single();
  if (error) throw error;
  return data;
}
async function startDraw(tournCode, adminToken) {
  const { data, error } = await db.rpc('start_draw', { p_code: tournCode, p_admin_token: adminToken });
  if (error) throw error;
  return data;
}
async function completeDraw(tournCode, adminToken) {
  const { data, error } = await db.rpc('complete_draw', { p_code: tournCode, p_admin_token: adminToken });
  if (error) throw error;
  return data;
}
function sanitizeNickname(raw) {
  const clean = raw.replace(/[<>&"]/g, '').trim().slice(0, 20);
  if (clean.length < 2) return null;
  if (!/^[\w\s\-'.]+$/u.test(clean)) return null;
  return clean;
}
async function joinTournament(tournamentId, nickname, avatarType, teamSlots) {
  const sanitized = sanitizeNickname(nickname);
  if (!sanitized) throw new Error('Invalid nickname');
  const { data, error } = await db.from('participants')
    .insert({ tournament_id: tournamentId, nickname: sanitized, avatar_type: avatarType, team_slots: teamSlots })
    .select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That nickname is already taken in this sweepstake!');
    throw error;
  }
  return data;
}
async function getParticipants(tournamentId) {
  const { data, error } = await db.from('participants').select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
async function removeParticipant(tournCode, adminToken, participantId) {
  const { data, error } = await db.rpc('remove_participant', { p_tournament_code: tournCode, p_admin_token: adminToken, p_participant_id: participantId });
  if (error) throw error;
  return data;
}
async function insertAllocation(tournamentId, participantId, teamCode, teamName, drawOrder) {
  const { data, error } = await db.from('allocations')
    .insert({ tournament_id: tournamentId, participant_id: participantId, team_code: teamCode, team_name: teamName, draw_order: drawOrder })
    .select().single();
  if (error) throw error;
  return data;
}
async function getAllocations(tournamentId) {
  const { data, error } = await db.from('allocations').select('*, participants(nickname, avatar_type)').eq('tournament_id', tournamentId).order('draw_order', { ascending: true });
  if (error) throw error;
  return data;
}
function subscribeToTournament(tournamentId, callbacks) {
  return db.channel(`tournament:${tournamentId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` }, payload => callbacks.onTournamentUpdate?.(payload.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `tournament_id=eq.${tournamentId}` }, payload => callbacks.onParticipantJoin?.(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'participants', filter: `tournament_id=eq.${tournamentId}` }, payload => callbacks.onParticipantLeave?.(payload.old))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'allocations', filter: `tournament_id=eq.${tournamentId}` }, payload => callbacks.onAllocation?.(payload.new))
    .subscribe();
}
function saveSession(c, participantId) { localStorage.setItem(`wc26_${c}`, participantId); }
function loadSession(c) { return localStorage.getItem(`wc26_${c}`); }
function clearSession(c) { localStorage.removeItem(`wc26_${c}`); }
function totalSlots(participants) { return participants.reduce((sum, p) => sum + p.team_slots, 0); }

// ── Globals ───────────────────────────────────────────────────────────────────
let tournament = null;
let myParticipantId = null;
let isAdmin = false;
let allParticipants = [];
let allAllocations  = [];
let allTeams        = [];
let drawRevealQueue          = [];
let drawRevealing            = false;
let drawDone                 = 0;
let drawCurrentParticipantId = null;

const code = new URLSearchParams(window.location.search).get('code') || '';
const pidParam = new URLSearchParams(window.location.search).get('pid') || '';
const adminToken = (() => {
  const h = window.location.hash;
  const m = h.match(/admin=([a-zA-Z0-9\-]+)/);
  return m ? m[1] : null;
})();

// ── Utilities ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

function setupCopy(btnId, text) {
  document.getElementById(btnId)?.addEventListener('click', function() {
    navigator.clipboard.writeText(text).then(() => {
      this.textContent = 'Copied!';
      this.classList.add('copied');
      setTimeout(() => { this.textContent = 'Copy'; this.classList.remove('copied'); }, 2000);
    });
  });
}

function teamFlagEmoji(tla) {
  const flags = {
    ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',GER:'🇩🇪',FRA:'🇫🇷',ESP:'🇪🇸',NED:'🇳🇱',POR:'🇵🇹',BEL:'🇧🇪',ITA:'🇮🇹',
    POL:'🇵🇱',SUI:'🇨🇭',CRO:'🇭🇷',DEN:'🇩🇰',AUT:'🇦🇹',SRB:'🇷🇸',TUR:'🇹🇷',SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    HUN:'🇭🇺',SVN:'🇸🇮',BRA:'🇧🇷',ARG:'🇦🇷',COL:'🇨🇴',URU:'🇺🇾',CHI:'🇨🇱',ECU:'🇪🇨',
    VEN:'🇻🇪',PAR:'🇵🇾',BOL:'🇧🇴',PER:'🇵🇪',MAR:'🇲🇦',SEN:'🇸🇳',CMR:'🇨🇲',NGA:'🇳🇬',
    GHA:'🇬🇭',EGY:'🇪🇬',CIV:'🇨🇮',TUN:'🇹🇳',RSA:'🇿🇦',COD:'🇨🇩',MLI:'🇲🇱',AGO:'🇦🇴',
    ZAM:'🇿🇲',ALG:'🇩🇿',BEN:'🇧🇯',MRT:'🇲🇷',COM:'🇰🇲',JPN:'🇯🇵',KOR:'🇰🇷',AUS:'🇦🇺',
    IRN:'🇮🇷',KSA:'🇸🇦',QAT:'🇶🇦',UZB:'🇺🇿',IRQ:'🇮🇶',JOR:'🇯🇴',UAE:'🇦🇪',OMA:'🇴🇲',
    BHR:'🇧🇭',KUW:'🇰🇼',CHN:'🇨🇳',TJK:'🇹🇯',KGZ:'🇰🇬',PAL:'🇵🇸',BAN:'🇧🇩',IND:'🇮🇳',
    THA:'🇹🇭',IDN:'🇮🇩',PHI:'🇵🇭',USA:'🇺🇸',MEX:'🇲🇽',CAN:'🇨🇦',HON:'🇭🇳',PAN:'🇵🇦',
    CRC:'🇨🇷',JAM:'🇯🇲',GUA:'🇬🇹',TRI:'🇹🇹',CUB:'🇨🇺',SLV:'🇸🇻',NCA:'🇳🇮',NZL:'🇳🇿',
    FIJ:'🇫🇯',PNG:'🇵🇬',
    CZE:'🇨🇿',BIH:'🇧🇦',SWE:'🇸🇪',NOR:'🇳🇴',HAI:'🇭🇹',CUW:'🇨🇼',CPV:'🇨🇻',
  };
  return flags[tla] || '🏳';
}

function switchTab(btn) {
  document.querySelectorAll('.bracket-nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bracket-tab').forEach(t => t.style.display = 'none');
  btn.classList.add('active');
  const map = { groups:'tabGroups', r32:'tabR32', r16:'tabR16', qf:'tabQf', sf:'tabSf', final:'tabFinal' };
  const el = document.getElementById(map[btn.dataset.tab]);
  if (el) el.style.display = 'block';
}

function buildAllocMap() {
  const map = {};
  for (const a of allAllocations) map[a.team_code] = a;
  return map;
}

function renderParticipantList(container, participants, showTeams = false) {
  const allocMap = showTeams ? buildAllocMap() : {};
  container.innerHTML = participants.map(p => {
    const av = renderAvatar(p.avatar_type, null, 36);
    const teams = showTeams
      ? allAllocations
          .filter(a => a.participant_id === p.id)
          .map(a => {
            const c = getFlagColors(a.team_code);
            return `<span class="team-pill" style="background:${c.primary};color:${c.secondary || '#fff'}">${teamFlagEmoji(a.team_code)} ${a.team_name}</span>`;
          }).join('')
      : `<span class="p-slots">${p.team_slots} team${p.team_slots > 1 ? 's' : ''}</span>`;
    const isMe = p.id === myParticipantId ? 'style="border-color:var(--gold)"' : '';
    return `<div class="participant-row" ${isMe}>
      ${av}
      <span class="p-name">${esc(p.nickname)}</span>
      <span class="p-teams">${teams}</span>
      ${isAdmin && p.id !== myParticipantId ? `<button class="btn-ghost" onclick="handleRemove('${p.id}')" style="font-size:0.75rem;padding:4px 8px">✕</button>` : ''}
    </div>`;
  }).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateSlotCounter(participants, teamsPerPerson) {
  const total = 48;
  const claimed = totalSlots(participants);
  const pct = Math.min(100, (claimed / total) * 100);
  const bar = document.getElementById('slotBar');
  const label = document.getElementById('slotLabel');
  if (bar) {
    bar.style.width = pct + '%';
    bar.classList.toggle('full', claimed >= total);
  }
  if (label) label.textContent = `${claimed} / ${total} teams claimed`;
  const cnt = document.getElementById('waitParticipantCount');
  if (cnt) cnt.textContent = `${participants.length} player${participants.length !== 1 ? 's' : ''}`;
}

// ── STATE 1: Join form ────────────────────────────────────────────────────────
function renderJoinState() {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  document.getElementById('stateJoin').classList.add('active');
  document.getElementById('joinTourneyName').textContent = tournament.name;

  const claimed = totalSlots(allParticipants);
  const remaining = 48 - claimed;
  document.getElementById('joinSlotsInfo').textContent =
    `${remaining} team${remaining !== 1 ? 's' : ''} remaining · max ${tournament.teams_per_person} per player`;

  const grid = document.getElementById('avatarGrid');
  let selectedAvatar = 1;
  grid.innerHTML = AVATARS.map(a =>
    `<div class="avatar-option${a.id === 1 ? ' selected' : ''}" data-av="${a.id}" onclick="selectAvatar(${a.id})">
      ${renderAvatar(a.id, null, 52)}
      <span class="avatar-option-label">${esc(a.label)}</span>
    </div>`
  ).join('');

  window.selectAvatar = function(id) {
    selectedAvatar = id;
    document.querySelectorAll('.avatar-option').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.av) === id);
    });
  };

  const sel = document.getElementById('slotsSelect');
  const max = Math.min(tournament.teams_per_person, 48 - claimed);
  sel.innerHTML = '';
  for (let i = 1; i <= max; i++) {
    sel.innerHTML += `<option value="${i}">${i} team${i > 1 ? 's' : ''}</option>`;
  }
  sel.value = Math.min(tournament.teams_per_person, max);
  document.getElementById('slotsHint').textContent =
    `Max ${tournament.teams_per_person} teams per player · ${48 - claimed} of 48 still unclaimed`;

  document.getElementById('joinBtn').addEventListener('click', async () => {
    const nickname = document.getElementById('nicknameInput').value;
    const slots = parseInt(sel.value, 10);
    const errEl = document.getElementById('nicknameError');
    errEl.classList.remove('show');

    const sanitized = sanitizeNickname(nickname);
    if (!sanitized) {
      errEl.textContent = 'Please enter a nickname (2–20 chars, letters/numbers/spaces).';
      errEl.classList.add('show');
      return;
    }

    const spinner = document.getElementById('joinSpinner');
    const btn = document.getElementById('joinBtn');
    btn.disabled = true; spinner.classList.add('show');

    try {
      const participant = await joinTournament(tournament.id, sanitized, selectedAvatar, slots);
      myParticipantId = participant.id;
      saveSession(code, myParticipantId);
      allParticipants.push(participant);
      showToast('Welcome, ' + sanitized + '! 🎉');
      transitionToWaiting();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
      btn.disabled = false; spinner.classList.remove('show');
    }
  });
}

// ── STATE 2: Waiting room ─────────────────────────────────────────────────────
function renderWaitingState() {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  document.getElementById('stateWaiting').classList.add('active');
  document.getElementById('waitTourneyName').textContent = tournament.name;

  const inviteUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/sweepstake.html?code=${code}`;
  document.getElementById('waitShareUrl').textContent = inviteUrl;
  setupCopy('waitCopyBtn', inviteUrl);

  if (isAdmin) {
    document.getElementById('startDrawBtn').style.display = 'inline-flex';
    document.getElementById('startDrawBtn').addEventListener('click', handleStartDraw);
  }

  refreshWaitingRoom();
}

function transitionToWaiting() {
  renderWaitingState();
}

function refreshWaitingRoom() {
  updateSlotCounter(allParticipants, tournament.teams_per_person);
  renderParticipantList(document.getElementById('waitParticipantList'), allParticipants);
  document.getElementById('waitingMsg').textContent =
    isAdmin
      ? 'When everyone\'s in, click "Start draw" to begin the live draw!'
      : 'The admin will start the draw when everyone\'s in. Sit tight!';
}

// ── Admin: reset / reopen draw ────────────────────────────────────────────────
async function handleReopen() {
  if (!confirm('This will reset the draw. Continue?')) return;
  try {
    await db.rpc('reopen_tournament', { p_code: code, p_admin_token: adminToken });
    window.location.reload();
  } catch (err) { showToast('Error: ' + err.message); }
}

// ── STATE 3: Draw animation ───────────────────────────────────────────────────
function renderDrawState() {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  document.getElementById('stateDraw').classList.add('active');

  drawRevealQueue          = [];
  drawRevealing            = false;
  drawDone                 = 0;
  drawCurrentParticipantId = null;

  document.getElementById('drawProgressNum').textContent = '0';
  document.getElementById('drawReelWrap').classList.remove('locked');
  document.getElementById('drawReelWrap').style.removeProperty('--reel-color');
  document.getElementById('drawReelWrap').style.removeProperty('--reel-glow');
  document.getElementById('drawReelFlag').textContent = '⚽';
  document.getElementById('drawReelName').textContent = 'STANDBY';
  document.getElementById('arenaCurrentLabel').textContent = 'Waiting for the draw to begin…';

  const grid = document.getElementById('arenaGrid');
  grid.innerHTML = allParticipants.map(p => {
    const slots = Array.from({ length: p.team_slots }, () =>
      `<div class="arena-slot empty"></div>`).join('');
    return `<div class="arena-p-card" id="arenaP_${p.id}">
      ${renderAvatar(p.avatar_type, null, 40)}
      <div class="arena-p-name">${esc(p.nickname)}</div>
      <div class="arena-p-teams" id="arenaTeams_${p.id}">${slots}</div>
    </div>`;
  }).join('');

  if (isAdmin) {
    const btn = document.getElementById('reopenBtn');
    btn.style.display = 'inline-flex';
    btn.onclick = handleReopen;
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function playReveal(allocation, participants) {
  return new Promise(resolve => {
    const participant = participants.find(p => p.id === allocation.participant_id);
    const tla = normTeamCode(allocation.team_code);
    const colors = getFlagColors(tla);
    const primary = colors.primary || '#25d8d8';

    if (drawCurrentParticipantId !== allocation.participant_id) {
      if (drawCurrentParticipantId) {
        const prev = document.getElementById(`arenaP_${drawCurrentParticipantId}`);
        prev?.classList.remove('active');
        prev?.classList.add('done');
      }
      drawCurrentParticipantId = allocation.participant_id;
      const card = document.getElementById(`arenaP_${drawCurrentParticipantId}`);
      card?.classList.add('active');
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    document.getElementById('arenaCurrentLabel').textContent =
      `${participant?.nickname || '?'} is picking…`;

    const reelWrap = document.getElementById('drawReelWrap');
    const reelFlag = document.getElementById('drawReelFlag');
    const reelName = document.getElementById('drawReelName');
    reelWrap.classList.remove('locked');
    reelWrap.style.removeProperty('--reel-color');
    reelWrap.style.removeProperty('--reel-glow');

    const allTLAs = WC_2026_TEAMS;
    const steps = [
      { until: 700,  gap: 55  },
      { until: 1200, gap: 110 },
      { until: 1650, gap: 200 },
      { until: 1950, gap: 360 },
      { until: 2150, gap: 580 },
    ];

    let stepIdx = 0;
    const t0 = Date.now();

    function tick() {
      const elapsed = Date.now() - t0;
      while (stepIdx < steps.length - 1 && elapsed >= steps[stepIdx].until) stepIdx++;

      if (elapsed >= 2150) {
        reelFlag.textContent = teamFlagEmoji(tla);
        reelName.textContent = (allocation.team_name || tla).toUpperCase();
        reelWrap.style.setProperty('--reel-color', primary);
        reelWrap.style.setProperty('--reel-glow', hexToRgba(primary, 0.4));
        reelWrap.classList.add('locked');

        drawDone++;
        document.getElementById('drawProgressNum').textContent = drawDone;

        setTimeout(() => {
          const teamsEl = document.getElementById(`arenaTeams_${allocation.participant_id}`);
          const emptySlot = teamsEl?.querySelector('.arena-slot.empty');
          if (emptySlot) {
            emptySlot.classList.replace('empty', 'filled');
            emptySlot.style.borderColor = hexToRgba(primary, 0.55);
            emptySlot.innerHTML =
              `<span class="slot-flag">${teamFlagEmoji(tla)}</span>`
              + `<span class="slot-name">${esc(allocation.team_name || tla)}</span>`;
          }
          resolve();
        }, 750);
        return;
      }

      const randTla = allTLAs[Math.floor(Math.random() * allTLAs.length)];
      reelFlag.textContent = teamFlagEmoji(randTla);
      reelName.textContent = (getFlagColors(randTla).name || randTla).toUpperCase();
      setTimeout(tick, steps[stepIdx].gap);
    }

    tick();
  });
}

async function consumeRevealQueue() {
  if (drawRevealing) return;
  drawRevealing = true;
  while (drawRevealQueue.length > 0) {
    const { allocation, participants } = drawRevealQueue.shift();
    await playReveal(allocation, participants);
  }
  drawRevealing = false;
  if (drawDone >= 48) {
    if (drawCurrentParticipantId) {
      document.getElementById(`arenaP_${drawCurrentParticipantId}`)?.classList.remove('active');
      document.getElementById(`arenaP_${drawCurrentParticipantId}`)?.classList.add('done');
    }
    document.getElementById('arenaCurrentLabel').textContent = '🏆 All teams drawn!';
    document.getElementById('drawReelFlag').textContent = '🏆';
    document.getElementById('drawReelName').textContent = 'COMPLETE';
    setTimeout(renderBracketState, 2800);
  }
}

function revealDrawCard(allocation, participants) {
  drawRevealQueue.push({ allocation, participants });
  if (!drawRevealing) consumeRevealQueue();
}

// ── Admin: run draw ───────────────────────────────────────────────────────────
async function handleStartDraw() {
  const btn = document.getElementById('startDrawBtn');
  const spinner = document.getElementById('drawSpinner');
  btn.disabled = true; spinner.classList.add('show');

  try {
    await startDraw(code, adminToken);

    let teams = [];
    try { teams = await getTeams(); } catch (_) {}

    if (teams.length === 0) {
      teams = WC_2026_TEAMS.map(code => {
        const c = getFlagColors(code);
        return { tla: code, name: c.name, shortName: c.name };
      });
    }

    const trimmedSlots = buildSlotsGrouped(allParticipants);
    const teamPool = shuffleTeams(teams.slice(0, 48));

    for (let i = 0; i < teamPool.length; i++) {
      const t = teamPool[i];
      const tla = normTeamCode(t.tla || t.id || '');
      const name = t.shortName || t.name || tla;
      await insertAllocation(tournament.id, trimmedSlots[i], tla, name, i);
      await new Promise(r => setTimeout(r, 200));
    }

    await completeDraw(code, adminToken);

  } catch (err) {
    showToast('Draw failed: ' + err.message);
    btn.disabled = false; spinner.classList.remove('show');
  }
}

// ── Remove participant (admin) ────────────────────────────────────────────────
window.handleRemove = async function(participantId) {
  if (!confirm('Remove this participant?')) return;
  try {
    await removeParticipant(code, adminToken, participantId);
    allParticipants = allParticipants.filter(p => p.id !== participantId);
    refreshWaitingRoom();
    showToast('Participant removed.');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
};

// ── STATE 4: Live bracket ─────────────────────────────────────────────────────
function renderBracketState() {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  document.getElementById('stateBracket').classList.add('active');
  document.getElementById('bracketTourneyName').textContent = tournament.name;

  if (isAdmin) {
    const reopenEl = document.getElementById('reopenBtn');
    reopenEl.style.display = 'inline-flex';
    reopenEl.onclick = handleReopen;
  }

  if (myParticipantId) {
    const myTeams = allAllocations.filter(a => a.participant_id === myParticipantId);
    if (myTeams.length > 0) {
      const panel = document.getElementById('myTeamsPanel');
      const cards = document.getElementById('myTeamCards');
      panel.style.display = 'block';
      cards.innerHTML = myTeams.map(a => {
        const c = getFlagColors(a.team_code);
        return `<div class="my-team-card" style="border-color:${c.primary}">
          ${teamFlagEmoji(a.team_code)} ${esc(a.team_name)}
        </div>`;
      }).join('');
    }
  }

  loadBracketData();
}

function saveGroupCache(standings) {
  if (!standings || !standings.length) return;
  const map = {};
  for (const g of standings) {
    const letter = (g.group || '').replace(/^GROUP_/i, '').replace(/^Group /i, '');
    for (const row of g.table || []) {
      const tla = normTeamCode(row.team?.tla || '');
      if (tla && letter) map[tla] = letter;
    }
  }
  if (Object.keys(map).length) localStorage.setItem('wc26_groups', JSON.stringify(map));
}

function loadGroupCache() {
  try { return JSON.parse(localStorage.getItem('wc26_groups') || 'null'); }
  catch { return null; }
}

function buildSyntheticStandings() {
  // Prefer API-sourced group cache; fall back to hardcoded WC 2026 groups.
  const cache = loadGroupCache();
  const groupMap = cache || (() => {
    const m = {};
    for (const [letter, tlas] of Object.entries(WC_2026_GROUPS))
      for (const tla of tlas) m[tla] = letter;
    return m;
  })();

  const groups = {};
  for (const [tla, letter] of Object.entries(groupMap)) {
    const alloc = allAllocations.find(a => normTeamCode(a.team_code) === tla);
    if (!alloc) continue;
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push({
      team: { tla, shortName: alloc.team_name || tla, name: alloc.team_name || tla, crest: null },
      playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
    });
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, table]) => ({
      group: `Group ${letter}`,
      table: table.sort((a, b) => a.team.shortName.localeCompare(b.team.shortName)),
    }));
}

async function loadBracketData() {
  try {
    const data = await getAllMatchData();
    allTeams = data.teams;
    if (data.standings.length) saveGroupCache(data.standings);
    renderBracketFull(data);

    startPolling(freshData => {
      if (freshData.standings.length) saveGroupCache(freshData.standings);
      renderBracketFull(freshData);
      const live = hasLiveMatch({ matches: freshData.matches });
      document.getElementById('liveIndicator').style.display = live ? 'inline' : 'none';
      document.getElementById('bracketLiveTag').style.display  = live ? 'inline' : 'none';
      document.getElementById('apiUpdateTime').textContent =
        'Last updated: ' + new Date().toLocaleTimeString();
    });
  } catch (err) {
    const standings = buildSyntheticStandings();
    renderBracketFull({ teams: [], matches: [], standings });
    document.getElementById('apiUpdateTime').textContent =
      'Showing group positions — scores will update once matches start.';
  }
}

// ── Bracket tree rendering ────────────────────────────────────────────────────

function renderGroupMini(group, allocMap) {
  const groupName = (group.group || group.stage || '').replace(/^GROUP_/i, 'Group ');
  const hasStats = (group.table || []).some(r => r.playedGames > 0);
  const rows = (group.table || []).map((entry, idx) => {
    const t = entry.team;
    const tla = normTeamCode(t.tla || '');
    const alloc = allocMap[tla];
    const qualified = hasStats && idx < 2;
    const flag = t.crest
      ? `<img src="${t.crest}" alt="" loading="lazy" style="width:14px;height:10px;object-fit:cover;border-radius:1px;flex-shrink:0">`
      : `<span style="flex-shrink:0">${teamFlagEmoji(tla)}</span>`;
    const owner = alloc?.participants
      ? `<div class="b-owner">
          ${renderAvatar(alloc.participants.avatar_type, tla, 28)}
          <span class="b-owner-name">${esc(alloc.participants.nickname)}</span>
        </div>` : '';
    const pts = hasStats ? `<span class="b-team-pts">${entry.points}p</span>` : '';
    return `<div class="b-team-row${qualified ? ' qualified' : ''}">
      ${flag}
      <span class="b-team-name">${esc(t.shortName || t.name || tla)}</span>
      ${owner}${pts}
    </div>`;
  }).join('');
  return `<div class="b-group-card"><div class="b-group-head">${esc(groupName)}</div>${rows}</div>`;
}

function renderBracketMatch(match, allocMap) {
  if (!match) {
    return `<div class="b-match">
      <div class="b-match-team"><span class="b-match-name muted" style="color:var(--muted)">TBD</span></div>
      <div class="b-match-team"><span class="b-match-name muted" style="color:var(--muted)">TBD</span></div>
    </div>`;
  }
  const score = getScore(match);
  const statusCls = matchStatusClass(match);
  const liveBadge = statusCls === 'live'
    ? `<div style="padding:2px 6px 0;text-align:right"><span class="live-badge" style="font-size:0.58rem;padding:1px 4px"><span class="live-dot"></span>LIVE</span></div>` : '';

  function teamRow(team, scoreVal, isHome) {
    if (!team) return `<div class="b-match-team"><span class="b-match-name" style="color:var(--muted)">TBD</span></div>`;
    const tla = normTeamCode(team.tla || '');
    const alloc = allocMap[tla];
    const isMine = alloc?.participant_id === myParticipantId;
    const won = score.home !== null && score.away !== null &&
      ((isHome && score.home > score.away) || (!isHome && score.away > score.home));
    const flag = team.crest
      ? `<img src="${team.crest}" alt="" style="width:14px;height:10px;object-fit:cover;border-radius:1px;flex-shrink:0">`
      : `<span style="flex-shrink:0">${teamFlagEmoji(tla)}</span>`;
    const owner = alloc?.participants
      ? `<div class="b-owner">
          ${renderAvatar(alloc.participants.avatar_type, tla, 22)}
          <span class="b-owner-name">${esc(alloc.participants.nickname)}</span>
        </div>` : '';
    return `<div class="b-match-team${won ? ' winner' : ''}${isMine ? ' mine' : ''}">
      ${flag}
      <span class="b-match-name">${esc(team.shortName || team.name || tla)}</span>
      ${owner}
      <span class="b-match-score">${scoreVal !== null ? scoreVal : '–'}</span>
    </div>`;
  }
  return `<div class="b-match ${statusCls}">
    ${liveBadge}
    ${teamRow(match.homeTeam, score.home, true)}
    ${teamRow(match.awayTeam, score.away, false)}
  </div>`;
}

function renderBracketColumn(id, label, matches, allocMap, emptySlots) {
  const el = document.getElementById(id);
  if (!el) return;
  const cards = matches.length
    ? matches.map(m => renderBracketMatch(m, allocMap))
    : Array.from({ length: emptySlots }, () => renderBracketMatch(null, allocMap));
  el.innerHTML = `<div class="b-round-label">${esc(label)}</div>` + cards.join('');
}

function renderParticipantMini(allocs) {
  const byPid = {};
  for (const a of allocs) {
    if (!byPid[a.participant_id]) byPid[a.participant_id] = { p: a.participants, teams: [] };
    byPid[a.participant_id].teams.push(a);
  }
  return Object.values(byPid).map(({ p, teams }) => {
    if (!p) return '';
    const av = renderAvatar(p.avatar_type, teams[0]?.team_code || null, 24);
    const pills = teams.map(t => {
      const c = getFlagColors(t.team_code);
      return `<span class="team-pill" style="background:${c.primary};color:${c.secondary||'#fff'};font-size:0.65rem;padding:2px 6px">${teamFlagEmoji(t.team_code)} ${esc(t.team_name)}</span>`;
    }).join('');
    return `<div class="b-group-card" style="padding:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${av}<span style="font-weight:700;font-size:0.8rem">${esc(p.nickname)}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${pills}</div>
    </div>`;
  }).join('');
}

function renderBracketFull(data) {
  const allocMap = buildAllocMap();
  const standings = data.standings || [];
  const matches   = data.matches   || [];

  // Groups: first 6 = left (A–F), rest = right (G–L)
  const leftGroups  = standings.slice(0, 6);
  const rightGroups = standings.slice(6);

  const bGL = document.getElementById('bGroupsLeft');
  const bGR = document.getElementById('bGroupsRight');
  if (bGL) bGL.innerHTML = leftGroups.length
    ? leftGroups.map(g => renderGroupMini(g, allocMap)).join('')
    : renderParticipantMini(allAllocations);
  if (bGR) bGR.innerHTML = rightGroups.map(g => renderGroupMini(g, allocMap)).join('');

  // Knockout rounds split into left/right halves
  const r32 = matches.filter(m => m.stage === 'ROUND_OF_32');
  const r16 = matches.filter(m => m.stage === 'ROUND_OF_16');
  const qf  = matches.filter(m => m.stage === 'QUARTER_FINALS');
  const sf  = matches.filter(m => m.stage === 'SEMI_FINALS');
  const final3rd = matches.find(m => m.stage === 'THIRD_PLACE');
  const finalM   = matches.find(m => m.stage === 'FINAL');

  renderBracketColumn('bR32Left',  'Round of 32',    r32.slice(0, 8),  allocMap, 8);
  renderBracketColumn('bR16Left',  'Round of 16',    r16.slice(0, 4),  allocMap, 4);
  renderBracketColumn('bQFLeft',   'Quarter-Finals', qf.slice(0, 2),   allocMap, 2);
  renderBracketColumn('bSFLeft',   'Semi-Finals',    sf.slice(0, 1),   allocMap, 1);

  const bF = document.getElementById('bFinalCenter');
  if (bF) {
    const thirdHtml = final3rd
      ? `<div class="b-round-label" style="margin-top:8px">3rd Place</div>${renderBracketMatch(final3rd, allocMap)}`
      : '';
    bF.innerHTML = `<div class="b-round-label" style="color:var(--gold)">🏆 Final</div>
      <div class="b-final-card">${renderBracketMatch(finalM || null, allocMap).replace('class="b-match', 'class="b-match b-final-inner')}</div>
      ${thirdHtml}`;
  }

  renderBracketColumn('bSFRight',  'Semi-Finals',    sf.slice(1, 2),   allocMap, 1);
  renderBracketColumn('bQFRight',  'Quarter-Finals', qf.slice(2, 4),   allocMap, 2);
  renderBracketColumn('bR16Right', 'Round of 16',    r16.slice(4, 8),  allocMap, 4);
  renderBracketColumn('bR32Right', 'Round of 32',    r32.slice(8, 16), allocMap, 8);

  const live = hasLiveMatch({ matches });
  document.getElementById('liveIndicator').style.display = live ? 'inline' : 'none';
  document.getElementById('bracketLiveTag').style.display = live ? 'inline' : 'none';
  if (live) document.getElementById('apiUpdateTime').textContent = 'Updating live...';
}

function renderGroupStage(standings, allocMap) {
  const grid = document.getElementById('groupsGrid');
  if (!standings || standings.length === 0) {
    if (!allAllocations.length) {
      grid.innerHTML = '<p class="muted" style="padding:16px">Group stage data not yet available.</p>';
      return;
    }
    // No API / no cache — show draw results grouped by participant
    const byPid = {};
    for (const a of allAllocations) {
      if (!byPid[a.participant_id]) byPid[a.participant_id] = { p: a.participants, teams: [] };
      byPid[a.participant_id].teams.push(a);
    }
    grid.innerHTML = Object.values(byPid).map(({ p, teams }) => {
      if (!p) return '';
      const av = renderAvatar(p.avatar_type, teams[0]?.team_code || null, 40);
      const pills = teams.map(t => {
        const c = getFlagColors(t.team_code);
        return `<span class="team-pill" style="background:${c.primary};color:${c.secondary||'#fff'}">${teamFlagEmoji(t.team_code)} ${esc(t.team_name)}</span>`;
      }).join('');
      return `<div class="group-card" style="padding:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          ${av}<span style="font-weight:700;font-family:var(--font-body)">${esc(p.nickname)}</span>
        </div>
        <div class="p-teams">${pills}</div>
      </div>`;
    }).join('');
    return;
  }

  grid.innerHTML = standings.map(group => {
    const groupName = group.group || group.stage || '';
    const hasStats = (group.table || []).some(r => r.playedGames > 0);
    const rows = (group.table || []).map((entry, idx) => {
      const t   = entry.team;
      const tla = normTeamCode(t.tla || '');
      const alloc = allocMap[tla];
      const qualified = hasStats && idx < 2;
      const flag = t.crest
        ? `<img class="team-flag-img" src="${t.crest}" alt="${esc(t.shortName || t.name)}" loading="lazy">`
        : `<span>${teamFlagEmoji(tla)}</span>`;
      const ownerChip = alloc?.participants
        ? `<div class="team-owner-chip">
            ${renderAvatar(alloc.participants.avatar_type, tla, 24)}
            <span class="team-owner-label">${esc(alloc.participants.nickname)}</span>
          </div>` : '';
      return `<tr class="${qualified ? 'qualified' : ''}">
        <td><div class="team-name-cell">${flag}<div class="team-name-owner"><span>${esc(t.shortName || t.name || tla)}</span>${ownerChip}</div></div></td>
        <td>${entry.playedGames}</td>
        <td>${entry.won}</td>
        <td>${entry.draw}</td>
        <td>${entry.lost}</td>
        <td>${entry.goalsFor}:${entry.goalsAgainst}</td>
        <td><strong>${entry.points}</strong></td>
      </tr>`;
    }).join('');

    return `<div class="group-card">
      <div class="group-card-head">${esc(groupName)}</div>
      <table class="group-table">
        <thead><tr>
          <th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');
}

function renderKnockoutRound(containerId, matches, allocMap) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (matches.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:20px">Matches not yet scheduled.</p>';
    return;
  }
  container.innerHTML = matches.map(m => renderKoMatch(m, allocMap)).join('');
}

function renderKoMatch(match, allocMap) {
  const home = match.homeTeam;
  const away = match.awayTeam;
  const score = getScore(match);
  const statusCls = matchStatusClass(match);
  const liveBadge = statusCls === 'live' ? '<span class="live-badge" style="font-size:0.65rem;padding:1px 5px"><span class="live-dot"></span>LIVE</span>' : '';

  function teamRow(team, scoreVal, isHome) {
    if (!team) return `<div class="ko-team"><span class="ko-team-name muted">TBD</span></div>`;
    const tla = normTeamCode(team.tla || '');
    const alloc = allocMap[tla];
    const isMine = alloc?.participant_id === myParticipantId;
    const winner = score.home !== null && score.away !== null &&
      ((isHome && score.home > score.away) || (!isHome && score.away > score.home));
    const flag = team.crest
      ? `<img class="team-flag-img" src="${team.crest}" alt="" style="width:16px;height:11px">`
      : teamFlagEmoji(tla);
    const ownerTag = alloc?.participants
      ? `<div class="ko-owner">
          ${renderAvatar(alloc.participants.avatar_type, tla, 36)}
          <span class="ko-owner-name">${esc(alloc.participants.nickname)}</span>
        </div>` : '';
    return `<div class="ko-team ${winner ? 'winner' : ''} ${isMine ? 'mine' : ''}">
      <span style="margin-right:4px">${flag}</span>
      <span class="ko-team-name">${esc(team.shortName || team.name || tla)}</span>
      ${ownerTag}
      <span class="ko-score">${scoreVal !== null ? scoreVal : '–'}</span>
    </div>`;
  }

  return `<div class="ko-match-wrap">
    <div class="ko-match ${statusCls}">
      ${liveBadge ? `<div style="padding:4px 10px 0;text-align:right">${liveBadge}</div>` : ''}
      ${teamRow(home, score.home, true)}
      ${teamRow(away, score.away, false)}
    </div>
  </div>`;
}

function renderFinalMatch(finalMatch, thirdPlaceMatch, allocMap) {
  const el = document.getElementById('finalMatch');
  let html = '';
  if (thirdPlaceMatch) {
    html += `<h3 style="margin-bottom:12px;color:var(--muted)">Third-Place Play-off</h3>`;
    html += renderKoMatch(thirdPlaceMatch, allocMap);
    html += '<br>';
  }
  html += `<h3 style="margin-bottom:12px;color:var(--gold)">🏆 Final</h3>`;
  html += finalMatch ? renderKoMatch(finalMatch, allocMap) : '<p class="muted">Final not yet scheduled.</p>';
  el.innerHTML = html;
}

// ── Real-time handlers ────────────────────────────────────────────────────────
function onTournamentUpdate(updated) {
  tournament = { ...tournament, ...updated };
  if (updated.status === 'drawing') {
    renderDrawState();
  } else if (updated.status === 'live') {
    renderBracketState();
  }
}

function onParticipantJoin(newP) {
  if (!allParticipants.find(p => p.id === newP.id)) allParticipants.push(newP);
  if (tournament.status === 'open') refreshWaitingRoom();
}

function onParticipantLeave(oldP) {
  allParticipants = allParticipants.filter(p => p.id !== oldP.id);
  if (tournament.status === 'open') refreshWaitingRoom();
}

function onAllocation(alloc) {
  const p = allParticipants.find(x => x.id === alloc.participant_id);
  if (p && !alloc.participants) alloc.participants = p;
  allAllocations.push(alloc);
  if (tournament.status === 'drawing') revealDrawCard(alloc, allParticipants);
}

// ── Show error state ──────────────────────────────────────────────────────────
function showNotFound(errMsg) {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  const nf = document.getElementById('stateNotFound');
  nf.classList.add('active');
  if (errMsg) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:0.8rem;color:var(--muted);margin-top:12px;word-break:break-all;max-width:400px;margin-left:auto;margin-right:auto';
    p.textContent = String(errMsg);
    nf.querySelector('.not-found').appendChild(p);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
function setLoadingStatus(msg) {
  const el = document.getElementById('loadingStatus');
  if (el) el.textContent = msg;
}

async function init() {
  setLoadingStatus('Starting…');

  // Show a clear error if Supabase isn't configured (e.g. missing GitHub Secrets)
  if (!db) {
    showNotFound(
      typeof CONFIG !== 'undefined' && !CONFIG.SUPABASE_URL
        ? 'Database not configured — SUPABASE_URL is missing from GitHub Secrets.'
        : 'Failed to connect to database. Please refresh the page.'
    );
    return;
  }

  if (!code) {
    showNotFound(null);
    return;
  }

  if (adminToken) {
    isAdmin = true;
    document.getElementById('adminBar').style.display = 'flex';
  }

  // Fetch tournament — allow up to 60s for Supabase to wake from pause
  setLoadingStatus('Looking up tournament…');
  // After 10s without a response, warn the user the database is starting up
  const wakeMsg = setTimeout(() => {
    setLoadingStatus('Database is starting up — this can take up to 60s on first visit…');
  }, 10_000);

  try {
    tournament = await withTimeout(getTournamentByCode(code), 60_000);
    clearTimeout(wakeMsg);
  } catch (err) {
    clearTimeout(wakeMsg);
    console.error('getTournamentByCode failed:', err);
    showNotFound(err?.message || String(err));
    return;
  }

  setLoadingStatus('Loading participants…');
  try {
    myParticipantId = loadSession(code);
    if (!myParticipantId && pidParam) {
      myParticipantId = pidParam;
      saveSession(code, pidParam);
    }

    [allParticipants, allAllocations] = await withTimeout(Promise.all([
      getParticipants(tournament.id),
      getAllocations(tournament.id),
    ]), 30_000);

    allAllocations = allAllocations.map(a => ({
      ...a,
      participants: a.participants || allParticipants.find(p => p.id === a.participant_id),
    }));

    subscribeToTournament(tournament.id, {
      onTournamentUpdate,
      onParticipantJoin,
      onParticipantLeave,
      onAllocation,
    });

    if (tournament.status === 'live') {
      renderBracketState();
    } else if (tournament.status === 'drawing') {
      if (allAllocations.length >= 48) {
        renderBracketState();
      } else {
        renderDrawState();
        for (const a of allAllocations) revealDrawCard(a, allParticipants);
      }
    } else {
      document.getElementById('adminBar').style.display = isAdmin ? 'flex' : 'none';
      if (myParticipantId && allParticipants.find(p => p.id === myParticipantId)) {
        renderWaitingState();
      } else {
        renderJoinState();
      }
    }
  } catch (err) {
    console.error('sweepstake init error:', err);
    showNotFound('Error: ' + (err?.message || String(err)));
  }
}

init();
