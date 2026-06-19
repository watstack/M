#!/usr/bin/env node
// Generates the Kickoff app icons from a hand-authored 16-bit pixel-art castle.
// Pure Node (zlib only) — no native deps, no network, no rasterizer needed.
// Re-run with: node assets/icons/gen-icons.mjs
//
// The castle riffs on assets/landing-castle.svg: crenellated towers + a glowing
// gate arch over a sunset, in the brand sunset palette on the #140a18 dusk sky.

import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));

// ── Palette ───────────────────────────────────────────────────────────────
const P = {
  '.': '#140a18', // dusk sky (brand --dark) — also used as transparent-equiv bg
  a: '#241033', // sky top
  b: '#3a1547', // sky upper
  c: '#7a2350', // sky dusk
  d: '#c44a2e', // sky horizon glow
  s: '#ffe79a', // sun core
  u: '#ffc24d', // sun mid
  o: '#ff8a2e', // sun outer
  K: '#1c1528', // stone shadow
  S: '#2f2742', // stone
  H: '#463a5e', // stone highlight
  r: '#5b4d7d', // battlement top edge
  g: '#ffb24d', // gate glow
  G: '#ffe0a0', // gate bright
  w: '#ffd36b', // window glow
  f: '#ff3b5c', // flag
  p: '#9a8bbf', // flag pole
};

const N = 32; // base grid is 32x32

function hexToRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// ── Build the 32x32 grid ────────────────────────────────────────────────────
function buildGrid() {
  const g = Array.from({ length: N }, () => Array(N).fill('.'));
  const set = (x, y, ch) => { if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = ch; };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };

  // Sky gradient bands
  rect(0, 0, N - 1, 6, 'a');
  rect(0, 7, N - 1, 12, 'b');
  rect(0, 13, N - 1, 18, 'c');
  rect(0, 19, N - 1, 23, 'd');
  rect(0, 24, N - 1, N - 1, 'd');

  // Sun, centred behind the keep (3 concentric bands), drawn before the castle
  const cx = 16, cy = 14;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - cx + 0.5, dy = (y - cy + 0.5) * 1.05;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4.2) set(x, y, 's');
    else if (dist < 6.0) set(x, y, 'u');
    else if (dist < 7.6) set(x, y, 'o');
  }

  // ── Castle silhouette (drawn over the sun) ──
  // Left & right towers
  const tower = (x0) => {
    rect(x0, 15, x0 + 4, N - 1, 'S');
    rect(x0, 15, x0, N - 1, 'K');         // left shadow column
    rect(x0 + 4, 15, x0 + 4, N - 1, 'H'); // right highlight column
    // merlons (battlements): keep, gap, keep, gap, keep across 5 cols
    rect(x0, 13, x0, 14, 'S'); set(x0, 13, 'r');
    rect(x0 + 2, 13, x0 + 2, 14, 'S'); set(x0 + 2, 13, 'r');
    rect(x0 + 4, 13, x0 + 4, 14, 'S'); set(x0 + 4, 13, 'r');
    // window
    set(x0 + 2, 20, 'w'); set(x0 + 2, 21, 'w');
  };
  tower(3);
  tower(25);

  // Central keep (taller, wider)
  rect(11, 11, 20, N - 1, 'S');
  rect(11, 11, 11, N - 1, 'K');
  rect(20, 11, 20, N - 1, 'H');
  // keep merlons across 10 cols (11..20): solid every other pair
  for (let x = 11; x <= 20; x += 2) { rect(x, 9, x, 10, 'S'); set(x, 9, 'r'); }

  // Gate — glowing arch at the base of the keep
  rect(14, 23, 17, N - 1, 'g');
  rect(15, 22, 16, 22, 'g');      // arch top
  set(14, 23, 'S'); set(17, 23, 'S'); // round the arch shoulders
  rect(15, 25, 16, N - 1, 'G');   // bright centre
  set(15, 22, 'G');

  // Keep windows
  set(13, 15, 'w'); set(13, 16, 'w');
  set(18, 15, 'w'); set(18, 16, 'w');

  // Flagpole + pennant on the keep
  rect(15, 4, 15, 8, 'p');
  rect(16, 4, 18, 4, 'f');
  rect(16, 5, 17, 5, 'f');

  return g;
}

const GRID = buildGrid();

// ── PNG encoder (truecolour + alpha, 8-bit) ─────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Render the grid into an RGBA buffer at `size` px using crisp floor-mapping.
// `pad` (in grid cells) insets the art for maskable safe-zone; bg fills the rest.
function render(size, { pad = 0, bg = '.' } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const [br, bgc, bb] = hexToRGB(P[bg]);
  const span = N + pad * 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const gx = Math.floor((px * span) / size) - pad;
      const gy = Math.floor((py * span) / size) - pad;
      let ch = bg;
      if (gx >= 0 && gx < N && gy >= 0 && gy < N) ch = GRID[gy][gx];
      const [r, g, b] = hexToRGB(P[ch] || P['.']);
      const i = (py * size + px) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      if (ch === bg && bg === '.') { /* keep opaque dusk bg */ }
    }
  }
  // soft-unused bg refs (kept for clarity)
  void br; void bgc; void bb;
  return rgba;
}

function writePNG(name, size, opts) {
  const png = encodePNG(render(size, opts), size, size);
  writeFileSync(join(DIR, name), png);
  console.log(`✓ ${name} (${size}x${size})`);
}

// ── SVG source (scalable, same look) ────────────────────────────────────────
function writeSVG() {
  let rects = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = GRID[y][x];
    if (ch === '.') continue;
    rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${P[ch]}"/>`;
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
    `<rect width="${N}" height="${N}" fill="${P['.']}"/>${rects}</svg>\n`;
  writeFileSync(join(DIR, 'icon.svg'), svg);
  console.log('✓ icon.svg');
}

// ── Emit all assets ─────────────────────────────────────────────────────────
writePNG('icon-192.png', 192);
writePNG('icon-512.png', 512);
writePNG('icon-maskable-512.png', 512, { pad: 4 }); // safe-zone padding
writePNG('apple-touch-icon.png', 180);
writePNG('favicon.png', 32);
writeSVG();

// ASCII preview to stderr for quick visual sanity.
if (process.argv.includes('--preview')) {
  const shade = { '.': ' ', a: '·', b: '·', c: ':', d: '▒', s: '@', u: '#', o: '*', K: '▓', S: '█', H: '▚', r: '▀', g: '+', G: 'o', w: '"', f: 'P', p: '|' };
  console.error('\n' + GRID.map(row => row.map(c => shade[c] || '?').join('')).join('\n') + '\n');
}
