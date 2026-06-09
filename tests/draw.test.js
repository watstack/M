import { describe, it, expect } from 'vitest';
import { loadFiles } from './helpers/vmLoader.js';

const ctx = loadFiles(['js/draw.js']);

describe('buildSlots', () => {
  it('pads to exactly 48 when participants have fewer total slots', () => {
    const participants = [
      { id: 'alice', team_slots: 2 },
      { id: 'bob', team_slots: 1 },
    ];
    const slots = ctx.buildSlots(participants);
    expect(slots).toHaveLength(48);
    expect(slots.every(id => id === 'alice' || id === 'bob')).toBe(true);
  });

  it('returns [] without infinite loop when participants is empty', () => {
    const slots = ctx.buildSlots([]);
    expect(slots).toEqual([]);
  });

  it('trims to 48 when participants have more than 48 total slots', () => {
    const participants = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      team_slots: 5,
    }));
    const slots = ctx.buildSlots(participants);
    expect(slots).toHaveLength(48);
  });

  it('distributes proportionally when padding', () => {
    const participants = [
      { id: 'alice', team_slots: 2 },
      { id: 'bob', team_slots: 1 },
    ];
    // Run 10 times, alice should appear roughly twice as often as bob
    for (let i = 0; i < 10; i++) {
      const slots = ctx.buildSlots(participants);
      const aliceCount = slots.filter(id => id === 'alice').length;
      const bobCount = slots.filter(id => id === 'bob').length;
      expect(aliceCount + bobCount).toBe(48);
      expect(aliceCount).toBeGreaterThan(0);
      expect(bobCount).toBeGreaterThan(0);
    }
  });
});

describe('buildSlotsRoundRobin', () => {
  it('returns [] for empty input', () => {
    expect(ctx.buildSlotsRoundRobin([])).toEqual([]);
    expect(ctx.buildSlotsRoundRobin(null)).toEqual([]);
  });

  it('total length is always 48', () => {
    const participants = [
      { id: 'alice', team_slots: 3 },
      { id: 'bob',   team_slots: 2 },
      { id: 'carol', team_slots: 1 },
    ];
    for (let i = 0; i < 10; i++) {
      expect(ctx.buildSlotsRoundRobin(participants)).toHaveLength(48);
    }
  });

  it('each participant receives exactly their team_slots in the earned portion', () => {
    const participants = [
      { id: 'alice', team_slots: 4 },
      { id: 'bob',   team_slots: 2 },
      { id: 'carol', team_slots: 1 },
    ];
    const total = 7; // 4+2+1
    for (let i = 0; i < 10; i++) {
      const slots = ctx.buildSlotsRoundRobin(participants);
      const earned = slots.slice(0, total);
      expect(earned.filter(id => id === 'alice').length).toBe(4);
      expect(earned.filter(id => id === 'bob').length).toBe(2);
      expect(earned.filter(id => id === 'carol').length).toBe(1);
    }
  });

  it('spare teams cycle equally — no participant gets 2 spare before all have 1', () => {
    const participants = [
      { id: 'alice', team_slots: 4 },
      { id: 'bob',   team_slots: 2 },
      { id: 'carol', team_slots: 1 },
    ];
    const total = 7; // earned slots
    for (let i = 0; i < 20; i++) {
      const slots = ctx.buildSlotsRoundRobin(participants);
      const spare = slots.slice(total);
      // Count spare teams per participant per "round" of 3
      const n = participants.length;
      for (let round = 0; round + n <= spare.length; round += n) {
        const roundSlice = spare.slice(round, round + n);
        const counts = {};
        for (const id of roundSlice) counts[id] = (counts[id] || 0) + 1;
        // In each full round of n spare slots, each participant appears exactly once
        expect(Object.keys(counts).length).toBe(n);
        for (const id of Object.keys(counts)) expect(counts[id]).toBe(1);
      }
    }
  });
});

describe('shuffleTeams', () => {
  it('returns all 48 teams with no duplicates', () => {
    const teams = Array.from({ length: 48 }, (_, i) => ({ tla: `T${i}`, name: `Team ${i}` }));
    const shuffled = ctx.shuffleTeams(teams);
    expect(shuffled).toHaveLength(48);
    expect(new Set(shuffled.map(t => t.tla)).size).toBe(48);
  });

  it('does not mutate the input array', () => {
    const teams = Array.from({ length: 48 }, (_, i) => ({ tla: `T${i}` }));
    const original = teams.map(t => t.tla);
    ctx.shuffleTeams(teams);
    expect(teams.map(t => t.tla)).toEqual(original);
  });

  it('produces a non-trivial shuffle (not always same order)', () => {
    const teams = Array.from({ length: 48 }, (_, i) => ({ tla: `T${i}` }));
    let differentCount = 0;
    for (let i = 0; i < 100; i++) {
      const shuffled = ctx.shuffleTeams(teams);
      if (shuffled.some((t, j) => t.tla !== teams[j].tla)) differentCount++;
    }
    expect(differentCount).toBeGreaterThan(90);
  });
});
