import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// A syntax error anywhere in an inline <script> makes the browser discard the
// whole block — on sweepstake.html that means init() never runs and the page
// hangs on the loading screen. Compile every inline block to catch this in CI.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = readdirSync(root).filter(f => f.endsWith('.html'));

function inlineScripts(html) {
  const blocks = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim()) blocks.push(m[1]);
  }
  return blocks;
}

describe('inline <script> blocks parse without syntax errors', () => {
  for (const file of htmlFiles) {
    it(file, () => {
      const html = readFileSync(join(root, file), 'utf8');
      for (const src of inlineScripts(html)) {
        // vm.Script compiles with classic-script semantics without executing
        expect(() => new vm.Script(src, { filename: file })).not.toThrow();
      }
    });
  }
});
