#!/usr/bin/env node
// Generates js/config.js from Vercel environment variables at build time.
// For local dev: copy js/config.example.js → js/config.js and fill in values.

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url  = process.env.SUPABASE_URL      || '';
const key  = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('⚠  SUPABASE_URL or SUPABASE_ANON_KEY not set — js/config.js will have empty values.');
}

const content = `// Auto-generated at build time by build.js — do not edit manually.
const CONFIG = {
  SUPABASE_URL: '${url}',
  SUPABASE_ANON_KEY: '${key}',
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
