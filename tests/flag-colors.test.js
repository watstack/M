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

  it('FLAG_COLORS has more than 48 entries — fallback draw slices first 48', () => {
    // The draw fallback in sweepstake.html does .slice(0, 48) on FLAG_COLORS entries.
    // If the map has 82+ entries the last teams are silently excluded from that fallback.
    // This test documents the count so any changes are visible.
    const allCodes = [
      'ENG','GER','FRA','ESP','NED','POR','BEL','ITA','POL','SUI',
      'CRO','DEN','AUT','SRB','TUR','SCO','HUN','SVN',
      'BRA','ARG','COL','URU','CHI','ECU','VEN','PAR','BOL','PER',
      'MAR','SEN','CMR','NGA','GHA','EGY','CIV','TUN','RSA','COD','MLI','AGO','ZAM','ALG','BEN','MRT','COM',
      'JPN','KOR','AUS','IRN','KSA','QAT','UZB','IRQ','JOR','UAE','OMA','BHR','KUW','CHN','TJK','KGZ','PAL','BAN','IND','THA','IDN','PHI',
      'USA','MEX','CAN','HON','PAN','CRC','JAM','GUA','TRI','CUB','SLV','NCA',
      'NZL','FIJ','PNG',
    ];
    // Every code in the map should return its own entry (not the fallback)
    for (const code of allCodes) {
      const c = ctx.getFlagColors(code);
      expect(c.primary, `${code} should not return fallback grey`).not.toBe('#888888');
    }
    // Document: total entries exceeds 48
    expect(allCodes.length).toBeGreaterThan(48);
  });
});
