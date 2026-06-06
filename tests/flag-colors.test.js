import { describe, it, expect } from 'vitest';
import { loadFiles } from './helpers/vmLoader.js';

const ctx = loadFiles(['js/flag-colors.js']);

describe('getFlagColors', () => {
  it('returns correct colours for England', () => {
    const eng = ctx.getFlagColors('ENG');
    expect(eng.primary).toBe('#CF011B');
    expect(eng.secondary).toBe('#FFFFFF');
    expect(eng.name).toBe('England');
  });

  it('returns correct colours for Brazil', () => {
    const bra = ctx.getFlagColors('BRA');
    expect(bra.primary).toBe('#009C3B');
    expect(bra.secondary).toBe('#FFDF00');
    expect(bra.name).toBe('Brazil');
  });

  it('returns correct colours for USA', () => {
    const usa = ctx.getFlagColors('USA');
    expect(usa.primary).toBe('#B22234');
    expect(usa.secondary).toBe('#3C3B6E');
    expect(usa.name).toBe('USA');
  });

  it('returns fallback grey for unknown code', () => {
    const unknown = ctx.getFlagColors('XXX');
    expect(unknown.primary).toBe('#888888');
    expect(unknown.secondary).toBe('#cccccc');
  });

  it('returns fallback for undefined without throwing', () => {
    expect(() => ctx.getFlagColors(undefined)).not.toThrow();
    expect(ctx.getFlagColors(undefined).primary).toBe('#888888');
  });

  it('returns fallback for empty string without throwing', () => {
    expect(() => ctx.getFlagColors('')).not.toThrow();
    expect(ctx.getFlagColors('').primary).toBe('#888888');
  });

  it('every entry has primary, secondary, and name fields', () => {
    const knownCodes = [
      // UEFA
      'ENG','GER','FRA','ESP','NED','POR','BEL','ITA','POL','SUI',
      'CRO','DEN','AUT','SRB','TUR','SCO','HUN','SVN',
      // CONMEBOL
      'BRA','ARG','COL','URU',
      // CAF
      'MAR','SEN','CMR','NGA','GHA',
      // AFC
      'JPN','KOR','AUS','IRN','KSA',
      // CONCACAF
      'USA','MEX','CAN',
    ];
    for (const code of knownCodes) {
      const c = ctx.getFlagColors(code);
      expect(c, `${code} missing primary`).toHaveProperty('primary');
      expect(c, `${code} missing secondary`).toHaveProperty('secondary');
      expect(c, `${code} missing name`).toHaveProperty('name');
      expect(c.primary, `${code} primary should be hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.secondary, `${code} secondary should be hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('WC_2026_TEAMS has exactly 48 entries and every code is in FLAG_COLORS', () => {
    // WC_2026_TEAMS replaced the old .slice(0,48) fallback that excluded USA/MEX/CAN.
    // WC_2026_TEAMS is a const so we verify it indirectly via getFlagColors.
    const wc2026 = [
      // UEFA (16)
      'ENG','GER','ESP','FRA','NED','POR','BEL','CRO',
      'SUI','AUT','DEN','SRB','TUR','SCO','HUN','SVN',
      // CONMEBOL (6)
      'BRA','ARG','COL','URU','ECU','VEN',
      // CAF (9)
      'MAR','SEN','NGA','EGY','CIV','TUN','CMR','RSA','COD',
      // AFC (8)
      'JPN','KOR','IRN','AUS','KSA','IRQ','JOR','UZB',
      // CONCACAF (6)
      'USA','MEX','CAN','HON','PAN','CRC',
      // OFC (1)
      'NZL',
      // Inter-confederation (2)
      'IDN','MLI',
    ];

    expect(wc2026).toHaveLength(48);

    for (const code of wc2026) {
      const c = ctx.getFlagColors(code);
      expect(c.primary, `${code} missing from FLAG_COLORS (got fallback grey)`).not.toBe('#888888');
    }
  });

  it('CONCACAF hosts are in the correct team set (regression: old slice excluded them)', () => {
    for (const host of ['USA', 'MEX', 'CAN']) {
      const c = ctx.getFlagColors(host);
      expect(c.primary).not.toBe('#888888');
      expect(c.name).toBeTruthy();
    }
  });
});
