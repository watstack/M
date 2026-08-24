export interface Swatch {
  id: string;
  name: string;
  kind: 'color' | 'pattern';
  hex?: string;
  category: 'Paint' | 'Timber' | 'Stone';
}

const PAINT_SWATCHES: Swatch[] = [
  { id: 'paint-cloud-white', name: 'Cloud White', kind: 'color', hex: '#f2f0eb', category: 'Paint' },
  { id: 'paint-charcoal', name: 'Charcoal', kind: 'color', hex: '#2b2b2e', category: 'Paint' },
  { id: 'paint-sage', name: 'Sage', kind: 'color', hex: '#a3ad93', category: 'Paint' },
  { id: 'paint-terracotta', name: 'Terracotta', kind: 'color', hex: '#c1683c', category: 'Paint' },
  { id: 'paint-navy', name: 'Navy', kind: 'color', hex: '#1f2a44', category: 'Paint' },
];

const PATTERN_SWATCHES: Swatch[] = [
  { id: 'timber-oak', name: 'Oak', kind: 'pattern', category: 'Timber' },
  { id: 'timber-walnut', name: 'Walnut', kind: 'pattern', category: 'Timber' },
  { id: 'stone-carrara', name: 'Carrara Marble', kind: 'pattern', category: 'Stone' },
  { id: 'stone-slate', name: 'Slate', kind: 'pattern', category: 'Stone' },
];

export const SWATCHES: Swatch[] = [...PAINT_SWATCHES, ...PATTERN_SWATCHES];

export function getSwatch(swatchId: string): Swatch | undefined {
  return SWATCHES.find((s) => s.id === swatchId);
}

const TIMBER_TONES: Record<string, [string, string]> = {
  'timber-oak': ['#c9a066', '#a9814d'],
  'timber-walnut': ['#5b3a29', '#3f281c'],
};

const STONE_TONES: Record<string, [string, string]> = {
  'stone-carrara': ['#eceae6', '#d7d3cc'],
  'stone-slate': ['#5a6068', '#42474d'],
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTimberTile(base: string, dark: string): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(1);
  for (let y = 0; y < size; y += 3) {
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.15 + rand() * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, y + rand() * 4);
    ctx.bezierCurveTo(size * 0.33, y + rand() * 6 - 3, size * 0.66, y + rand() * 6 - 3, size, y + rand() * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function buildStoneTile(base: string, dark: string): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(7);
  ctx.fillStyle = dark;
  for (let i = 0; i < 300; i++) {
    ctx.globalAlpha = rand() * 0.12;
    const r = rand() * 6 + 1;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

const patternCache = new Map<string, HTMLCanvasElement>();

function getPatternTile(swatchId: string): HTMLCanvasElement {
  const cached = patternCache.get(swatchId);
  if (cached) return cached;
  let tile: HTMLCanvasElement;
  if (TIMBER_TONES[swatchId]) {
    const [base, dark] = TIMBER_TONES[swatchId];
    tile = buildTimberTile(base, dark);
  } else if (STONE_TONES[swatchId]) {
    const [base, dark] = STONE_TONES[swatchId];
    tile = buildStoneTile(base, dark);
  } else {
    tile = buildStoneTile('#cccccc', '#999999');
  }
  patternCache.set(swatchId, tile);
  return tile;
}

/** Resolves a swatch to a fillStyle usable directly with a 2D canvas context. */
export function getSwatchFillStyle(
  ctx: CanvasRenderingContext2D,
  swatch: Swatch,
): string | CanvasPattern {
  if (swatch.kind === 'color' && swatch.hex) return swatch.hex;
  const tile = getPatternTile(swatch.id);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return '#999999';
  return pattern;
}
