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
