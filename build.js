#!/usr/bin/env node
// Generates js/config.js from Vercel environment variables at build time.
// For local dev: copy js/config.example.js → js/config.js and fill in values.

import { writeFileSync } from 'fs';
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
