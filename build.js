#!/usr/bin/env node
// Generates js/config.js from Vercel environment variables at build time.
// For local dev: copy js/config.example.js → js/config.js and fill in values.

import { writeFileSync, readFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createContext, runInContext } from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Derive the server-side (CommonJS) fixtures module from the browser sources of
// truth (js/wc2026-fixtures.js + js/flag-colors.js) so the two never drift.
// Non-fatal: api/_lib/fixtures.js is committed, so a failure here must never
// break the build (which would also drop js/config.js below).
try {
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  createContext(sandbox);
  // Extract the code→name map from FLAG_COLORS (lexical const → expose explicitly).
  const flagSrc = readFileSync(join(__dirname, 'js', 'flag-colors.js'), 'utf8');
  runInContext(flagSrc + '\n;this.__FC = FLAG_COLORS;', sandbox);
  const CODE_NAMES = {};
  for (const [code, v] of Object.entries(sandbox.__FC || {})) {
    if (v && v.name) CODE_NAMES[code] = v.name;
  }
  // Build the fixtures array.
  const browserSrc = readFileSync(join(__dirname, 'js', 'wc2026-fixtures.js'), 'utf8');
  runInContext(browserSrc, sandbox);
  const { WC2026_FIXTURES, BRACKET_FEED } = sandbox.module.exports;
  const out = `// AUTO-GENERATED from js/wc2026-fixtures.js + js/flag-colors.js by build.js — do not edit.\n` +
    `// Server-side copy of the static WC 2026 fixture scaffold for api/ functions.\n\n` +
    `module.exports = ${JSON.stringify({ WC2026_FIXTURES, BRACKET_FEED, CODE_NAMES }, null, 2)};\n`;
  writeFileSync(join(__dirname, 'api', '_lib', 'fixtures.js'), out, 'utf8');
  console.log(`✓ api/_lib/fixtures.js generated (${WC2026_FIXTURES.length} fixtures, ${Object.keys(CODE_NAMES).length} names)`);
} catch (e) {
  console.warn('⚠  api/_lib/fixtures.js generation skipped (using committed copy):', e.message);
}

const url   = process.env.SUPABASE_URL        || '';
const key   = process.env.SUPABASE_ANON_KEY   || '';
const token = process.env.FOOTBALL_API_TOKEN  || '';

if (!url || !key) {
  console.warn('⚠  SUPABASE_URL or SUPABASE_ANON_KEY not set — js/config.js will have empty values.');
}

const content = `// Auto-generated at build time by build.js — do not edit manually.
const CONFIG = {
  SUPABASE_URL: '${url}',
  SUPABASE_ANON_KEY: '${key}',
  FOOTBALL_API_TOKEN: '${token}',
};
`;

writeFileSync(join(__dirname, 'js', 'config.js'), content, 'utf8');
console.log('✓ js/config.js written');

// Vendor the Supabase UMD bundle so the app has no runtime CDN dependency.
const vendorDir = join(__dirname, 'js', 'vendor');
mkdirSync(vendorDir, { recursive: true });
const supabaseSrc = join(__dirname, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
writeFileSync(join(vendorDir, 'supabase.js'), readFileSync(supabaseSrc));
console.log('✓ js/vendor/supabase.js written');

// Inject PWA tags (manifest, apple meta, icons, SW registration) into every HTML
// page — idempotent, so re-runs never duplicate. Keeps installability DRY and
// auto-covers any future page without editing each file by hand.
// Relative hrefs so the app installs under any base path — works at the site
// root (Vercel) and under a subpath (GitHub Pages serves this repo at /M/).
const PWA_HEAD = `  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#140a18">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Kickoff">
  <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
  <link rel="icon" href="assets/icons/favicon.png">
`;
// Self-healing: strip any previously-injected block (absolute or relative) then
// re-inject the current one, so re-runs never duplicate and old paths migrate.
function injectPwaTags(html) {
  html = html.replace(
    /[ \t]*<link rel="manifest"[^>]*>[\s\S]*?<link rel="icon" href="[^"]*assets\/icons\/favicon\.png">\n?/,
    ''
  );
  html = html.replace(/[ \t]*<script src="[^"]*js\/pwa\.js[^"]*"><\/script>\n?/, '');
  if (html.includes('</head>')) html = html.replace('</head>', `${PWA_HEAD}</head>`);
  if (html.includes('</body>')) html = html.replace('</body>', `<script src="js/pwa.js"></script>\n</body>`);
  return html;
}

// Cache-bust all local JS script tags in HTML files by appending ?v=<commit>.
// This forces browsers to fetch fresh scripts after every deploy.
const v = (process.env.GITHUB_RUN_ID || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString()).slice(0, 8);
for (const file of readdirSync(__dirname).filter(f => f.endsWith('.html'))) {
  const path = join(__dirname, file);
  const updated = injectPwaTags(readFileSync(path, 'utf8'))
    .replace(/(<script src="(?:js\/[^"]+\.js))(?:\?v=[^"]*)?(")/g, `$1?v=${v}$2`)
    .replace(/(<meta name="build" content=")[^"]*(")/g, `$1${v}$2`);
  writeFileSync(path, updated, 'utf8');
}
console.log(`✓ HTML PWA tags injected + script tags cache-busted with v=${v}`);
