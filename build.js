#!/usr/bin/env node
// Generates js/config.js from Vercel environment variables at build time.
// For local dev: copy js/config.example.js → js/config.js and fill in values.

import { writeFileSync, readFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// Cache-bust all local JS script tags in HTML files by appending ?v=<commit>.
// This forces browsers to fetch fresh scripts after every deploy.
const v = (process.env.GITHUB_RUN_ID || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString()).slice(0, 8);
for (const file of readdirSync(__dirname).filter(f => f.endsWith('.html'))) {
  const path = join(__dirname, file);
  const updated = readFileSync(path, 'utf8')
    .replace(/(<script src="(?:js\/[^"]+\.js))(?:\?v=[^"]*)?(")/g, `$1?v=${v}$2`)
    .replace(/(<meta name="build" content=")[^"]*(")/g, `$1${v}$2`);
  writeFileSync(path, updated, 'utf8');
}
console.log(`✓ HTML script tags cache-busted with v=${v}`);
