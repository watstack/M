import { describe, it, expect } from 'vitest';
import { loadFiles, makeSupabaseMock } from './helpers/vmLoader.js';

const sbMock = makeSupabaseMock();
const ctx = loadFiles(['js/supabase.js'], {
  window: { supabase: { createClient: () => sbMock } },
  crypto: { randomUUID: () => 'test-uuid' },
});

describe('sanitizeNickname', () => {
  it('strips XSS: script tag collapses to null', () => {
    expect(ctx.sanitizeNickname('<script>alert(1)</script>')).toBeNull();
  });

  it('strips XSS: img onerror collapses to null', () => {
    expect(ctx.sanitizeNickname('<img onerror=alert(1)>')).toBeNull();
  });

  it('strips ampersand and passes', () => {
    expect(ctx.sanitizeNickname('Alice&Bob')).toBe('AliceBob');
  });

  it('truncates to 20 chars', () => {
    expect(ctx.sanitizeNickname('A'.repeat(25))).toBe('A'.repeat(20));
  });

  it('rejects single-char input (< 2)', () => {
    expect(ctx.sanitizeNickname('A')).toBeNull();
  });

  it('accepts exactly 2 chars', () => {
    expect(ctx.sanitizeNickname('Al')).toBe('Al');
  });

  it('rejects empty string', () => {
    expect(ctx.sanitizeNickname('')).toBeNull();
  });

  it('apostrophe is stripped before regex check (known behaviour — dead code in regex)', () => {
    // The replace strips ' before the /^[\w\s\-'.]+$/ regex tests for it.
    // O'Brien → OBrien (not null). This test documents current behaviour.
    expect(ctx.sanitizeNickname("O'Brien")).toBe('OBrien');
  });

  it('accepts alphanumeric with spaces and hyphens', () => {
    expect(ctx.sanitizeNickname('Alex W')).toBe('Alex W');
    expect(ctx.sanitizeNickname('Top-Dog')).toBe('Top-Dog');
  });

  it('rejects special characters not in allowed set', () => {
    expect(ctx.sanitizeNickname('user@email')).toBeNull();
    expect(ctx.sanitizeNickname('hello!')).toBeNull();
  });
});

describe('generateCode', () => {
  it('produces 6-char codes with no ambiguous characters', () => {
    const EXCLUDED = new Set(['O', '0', 'I', '1']);
    for (let i = 0; i < 10_000; i++) {
      const code = ctx.generateCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      for (const ch of code) {
        expect(EXCLUDED.has(ch)).toBe(false);
      }
    }
  });

  it('generates unique codes (no trivial collision in 1000 samples)', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => ctx.generateCode()));
    expect(codes.size).toBeGreaterThan(990);
  });
});

describe('totalSlots', () => {
  it('sums team_slots across all participants', () => {
    const participants = [
      { team_slots: 3 },
      { team_slots: 2 },
      { team_slots: 1 },
    ];
    expect(ctx.totalSlots(participants)).toBe(6);
  });

  it('returns 0 for empty array', () => {
    expect(ctx.totalSlots([])).toBe(0);
  });
});
