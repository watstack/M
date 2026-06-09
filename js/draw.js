// Pure draw algorithm — no DOM, no Supabase, no network.
// Extracted so it can be unit-tested independently of sweepstake.html.

/**
 * Build the ordered participant-ID slot array for the draw.
 * Each participant appears once per team_slot they claimed.
 * If total slots < 48, pad randomly from existing entries.
 * If total slots > 48, trim to 48.
 * Returns [] when participants is empty (no infinite loop).
 */
function buildSlots(participants) {
  const slots = [];
  for (const p of participants) {
    for (let i = 0; i < p.team_slots; i++) slots.push(p.id);
  }
  while (slots.length < 48 && slots.length > 0) {
    slots.push(slots[Math.floor(Math.random() * slots.length)]);
  }
  return slots.slice(0, 48);
}

/**
 * Like buildSlots but groups all slots for each participant together,
 * in a randomised participant order. This gives the thunderdome draw its
 * participant-by-participant presentation: every team for person A is
 * revealed before moving on to person B.
 */
function buildSlotsGrouped(participants) {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const slots = [];
  for (const p of shuffled) {
    for (let i = 0; i < p.team_slots; i++) slots.push(p.id);
  }
  while (slots.length < 48 && slots.length > 0) {
    slots.push(slots[Math.floor(Math.random() * slots.length)]);
  }
  return slots.slice(0, 48);
}

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
