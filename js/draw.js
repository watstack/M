// Pure draw algorithm — no DOM, no Supabase, no network.
// Extracted so it can be unit-tested independently of sweepstake.html.

/**
 * Round-robin allocation: one team per participant per pass, skipping
 * participants who have already received all their requested slots.
 * Participants are shuffled once to set a random rotation order.
 * Pads to 48 by cycling equally through all participants so spare
 * teams are distributed fairly regardless of each player's slot count.
 */
function buildSlotsRoundRobin(participants) {
  if (!participants || participants.length === 0) return [];
  const order = [...participants].sort(() => Math.random() - 0.5);
  const rem   = order.map(p => ({ id: p.id, left: Math.max(0, p.team_slots || 0) }));
  const slots = [];
  while (rem.some(r => r.left > 0)) {
    for (const r of rem) {
      if (r.left > 0) { slots.push(r.id); r.left--; }
    }
  }
  if (slots.length > 0 && slots.length < 48) {
    let si = 0;
    while (slots.length < 48) {
      slots.push(order[si % order.length].id);
      si++;
    }
  }
  return slots.slice(0, 48);
}

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 */
function shuffleTeams(teams) {
  const pool = teams.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
